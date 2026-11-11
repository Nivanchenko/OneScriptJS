import { CompletionItemKind, MarkupKind } from 'vscode-languageserver';
import type { CompletionItem, Position } from 'vscode-languageserver';
import type { Analysis, MethodSymbol } from './analysis';
import {
  allEnums,
  allFunctions,
  allGlobals,
  allTypes,
  typeMembers,
} from './api-catalog';
import type { ApiEnum, ApiFunction, ApiMethod, ApiProperty, ApiType } from './api-catalog';
import { inferMemberType } from './inference';
import {
  isInsideTrivia,
  lastSignificantBefore,
  previousSignificant,
  tokenAt,
} from './positions';
import {
  enumMarkdown,
  functionSignature,
  methodSignature,
  propertySignature,
  typeMarkdown,
} from './signatures';
import { TokenType } from '../lexer/token';
import * as keywords from '../parser/keywords';

/** Предел из contracts/lsp-server.md: не более 500 items на ответ. */
export const MAX_COMPLETION_ITEMS = 500;

const KEYWORD_GROUPS: readonly ReadonlySet<string>[] = Object.entries(keywords)
  .filter(([name]) => name.startsWith('KW_'))
  .map(([, group]) => group);

function documentation(value: string): { kind: MarkupKind; value: string } {
  return { kind: MarkupKind.Markdown, value };
}

function item(
  label: string,
  kind: CompletionItemKind,
  detail: string,
  documentationValue: string,
  sortText: string,
  aliases: readonly string[] = [],
): CompletionItem {
  return {
    label,
    kind,
    detail,
    documentation: documentation(documentationValue),
    sortText,
    filterText: [label, ...aliases].join(' '),
  };
}

function sortKey(group: number, label: string): string {
  return `${group}_${label.toLowerCase()}`;
}

function keywordLabel(keyword: string): string {
  return keyword.slice(0, 1).toUpperCase() + keyword.slice(1);
}

function addItem(items: Map<string, CompletionItem>, candidate: CompletionItem): void {
  const key = candidate.label.toLowerCase();
  if (!items.has(key)) items.set(key, candidate);
}

function localMethodDetail(method: MethodSymbol): string {
  const kind = method.isFunction ? 'Функция' : 'Процедура';
  return `${kind} ${method.name}(${method.params.join(', ')})`;
}

function addLocals(items: Map<string, CompletionItem>, analysis: Analysis): void {
  for (const method of analysis.symbols.methods) {
    addItem(
      items,
      item(
        method.name,
        method.isFunction ? CompletionItemKind.Function : CompletionItemKind.Method,
        localMethodDetail(method),
        'Локальный метод документа.',
        sortKey(0, method.name),
      ),
    );
    for (const param of method.params) {
      addItem(
        items,
        item(
          param,
          CompletionItemKind.Variable,
          `Параметр ${method.name}`,
          `Параметр метода «${method.name}».`,
          sortKey(0, param),
        ),
      );
    }
  }
  for (const variable of analysis.symbols.moduleVars) {
    addItem(
      items,
      item(
        variable.name,
        CompletionItemKind.Variable,
        'Переменная',
        'Переменная документа.',
        sortKey(0, variable.name),
      ),
    );
  }
  // Локальные переменные методов есть в symbols.knownNames; регистр букв
  // восстанавливаем по токену, иначе в списке были бы имена в нижнем регистре.
  for (const token of analysis.tokens) {
    if (token.type !== TokenType.Identifier) continue;
    const lower = token.lexeme.toLowerCase();
    if (!analysis.symbols.knownNames.has(lower)) continue;
    addItem(
      items,
      item(token.lexeme, CompletionItemKind.Variable, 'Переменная', 'Переменная документа.', sortKey(0, token.lexeme)),
    );
  }
}

function addFunction(items: Map<string, CompletionItem>, fn: ApiFunction): void {
  const detail = functionSignature(fn);
  addItem(
    items,
    item(fn.ru, CompletionItemKind.Function, detail, fn.description, sortKey(1, fn.ru), fn.en === undefined ? [] : [fn.en]),
  );
  if (fn.en !== undefined) {
    addItem(
      items,
      item(fn.en, CompletionItemKind.Function, detail, fn.description, sortKey(1, fn.en), [fn.ru]),
    );
  }
}

function addType(items: Map<string, CompletionItem>, type: ApiType): void {
  const detail = `Тип ${type.ru}`;
  const markdown = typeMarkdown(type);
  addItem(
    items,
    item(type.ru, CompletionItemKind.Class, detail, markdown, sortKey(1, type.ru), type.en === undefined ? [] : [type.en]),
  );
  if (type.en !== undefined) {
    addItem(items, item(type.en, CompletionItemKind.Class, detail, markdown, sortKey(1, type.en), [type.ru]));
  }
}

function addEnum(items: Map<string, CompletionItem>, enumInfo: ApiEnum): void {
  const markdown = enumMarkdown(enumInfo);
  addItem(
    items,
    item(
      enumInfo.ru,
      CompletionItemKind.Enum,
      'Перечисление',
      markdown,
      sortKey(1, enumInfo.ru),
      enumInfo.en === undefined ? [] : [enumInfo.en],
    ),
  );
  if (enumInfo.en !== undefined) {
    addItem(
      items,
      item(enumInfo.en, CompletionItemKind.Enum, 'Перечисление', markdown, sortKey(1, enumInfo.en), [enumInfo.ru]),
    );
  }
}

function addCatalogs(items: Map<string, CompletionItem>): void {
  for (const fn of allFunctions()) addFunction(items, fn);
  for (const type of allTypes()) addType(items, type);
  for (const enumInfo of allEnums()) addEnum(items, enumInfo);
  for (const global of allGlobals()) {
    addItem(
      items,
      item(
        global,
        CompletionItemKind.Variable,
        'Глобальный объект',
        `Глобальный объект движка «${global}».`,
        sortKey(1, global),
      ),
    );
  }
}

function addKeywords(items: Map<string, CompletionItem>): void {
  for (const group of KEYWORD_GROUPS) {
    const labels = [...group].map(keywordLabel);
    for (const label of labels) {
      addItem(
        items,
        item(
          label,
          CompletionItemKind.Keyword,
          'Ключевое слово',
          'Ключевое слово языка.',
          sortKey(2, label),
          labels.filter((candidate) => candidate !== label),
        ),
      );
    }
  }
  for (const operator of keywords.COMPARISON_OPS) {
    addItem(
      items,
      item(operator, CompletionItemKind.Operator, 'Оператор сравнения', 'Оператор сравнения.', sortKey(3, operator)),
    );
  }
}

function memberItem(
  label: string,
  kind: CompletionItemKind,
  detail: string,
  documentationValue: string,
  aliases: readonly string[] = [],
): CompletionItem {
  return item(label, kind, detail, documentationValue, sortKey(0, label), aliases);
}

function addMethodMember(items: Map<string, CompletionItem>, method: ApiMethod): void {
  const detail = methodSignature(method);
  addItem(
    items,
    memberItem(method.ru, CompletionItemKind.Method, detail, method.description, method.en === undefined ? [] : [method.en]),
  );
  if (method.en !== undefined) {
    addItem(
      items,
      memberItem(method.en, CompletionItemKind.Method, detail, method.description, [method.ru]),
    );
  }
}

function addPropertyMember(items: Map<string, CompletionItem>, property: ApiProperty): void {
  const detail = propertySignature(property);
  addItem(
    items,
    memberItem(
      property.ru,
      CompletionItemKind.Property,
      detail,
      property.description,
      property.en === undefined ? [] : [property.en],
    ),
  );
  if (property.en !== undefined) {
    addItem(
      items,
      memberItem(property.en, CompletionItemKind.Property, detail, property.description, [property.ru]),
    );
  }
}

function prefixAt(analysis: Analysis, position: Position): string {
  const token = tokenAt(analysis, position);
  if (token === undefined || token.type !== TokenType.Identifier) return '';
  const offset = position.character - (token.column - 1);
  return token.lexeme.slice(0, Math.max(0, offset));
}

interface MemberContext {
  prefix: string;
}

/** Контекст «объект + точка»: курсор сразу после точки или после набранного имени. */
function memberContext(analysis: Analysis, position: Position): MemberContext | undefined {
  const last = lastSignificantBefore(analysis, position);
  if (last === undefined) return undefined;
  if (last.token.type === TokenType.Operator && last.token.lexeme === '.') {
    return last.token.endLine - 1 === position.line ? { prefix: '' } : undefined;
  }
  if (last.token.type !== TokenType.Identifier) return undefined;
  const before = previousSignificant(analysis, last.index);
  if (before?.token.type !== TokenType.Operator || before.token.lexeme !== '.') return undefined;
  if (before.token.endLine - 1 !== position.line) return undefined;
  return { prefix: prefixAt(analysis, position) };
}

function matchesPrefix(candidate: CompletionItem, prefixLower: string): boolean {
  const text = candidate.filterText ?? candidate.label;
  return text
    .toLowerCase()
    .split(' ')
    .some((alias) => alias.startsWith(prefixLower));
}

function finalize(items: Iterable<CompletionItem>, prefix: string): CompletionItem[] {
  const prefixLower = prefix.toLowerCase();
  return [...items]
    .filter((candidate) => matchesPrefix(candidate, prefixLower))
    .sort((a, b) => {
      const left = a.sortText ?? '';
      const right = b.sortText ?? '';
      return left < right ? -1 : left > right ? 1 : 0;
    })
    .slice(0, MAX_COMPLETION_ITEMS);
}

/** Автодополнение `.osjs`; внутри строк/комментариев — пусто (FR-008, SC-006). */
export function completionItems(analysis: Analysis, position: Position): CompletionItem[] {
  if (isInsideTrivia(analysis, position)) return [];

  const member = memberContext(analysis, position);
  if (member !== undefined) {
    const inferred = inferMemberType(analysis, position);
    if (inferred.kind !== 'known') return [];
    const members = typeMembers(inferred.name);
    if (members === undefined) return [];
    const items = new Map<string, CompletionItem>();
    for (const method of members.methods) addMethodMember(items, method);
    for (const property of members.properties) addPropertyMember(items, property);
    return finalize(items.values(), member.prefix);
  }

  const items = new Map<string, CompletionItem>();
  addLocals(items, analysis);
  addCatalogs(items);
  addKeywords(items);
  return finalize(items.values(), prefixAt(analysis, position));
}
