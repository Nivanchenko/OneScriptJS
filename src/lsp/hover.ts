import { MarkupKind } from 'vscode-languageserver';
import type { Hover, Position } from 'vscode-languageserver';
import type { Analysis, MethodSymbol } from './analysis';
import { findEnum, findFunction, findType, typeMembers } from './api-catalog';
import { inferMemberType, methodAt } from './inference';
import { isInsideTrivia, previousSignificant, tokenAt, tokenRange } from './positions';
import {
  enumMarkdown,
  functionMarkdown,
  methodMarkdown,
  propertyMarkdown,
  typeMarkdown,
} from './signatures';
import { TokenType } from '../lexer/token';
import { KW_ASYNC, KW_AWAIT } from '../parser/keywords';

const ASYNC_MARKDOWN = [
  '**Асинх**',
  '',
  'Контекстное слово диалекта: объявляет асинхронную процедуру или функцию.',
  'Вне объявления метода это обычный идентификатор.',
].join('\n');

const AWAIT_MARKDOWN = [
  '**Ждать**',
  '',
  'Контекстное слово диалекта: приостанавливает выполнение до завершения',
  'асинхронной операции. Допустимо только внутри «Асинх»-метода.',
].join('\n');

function hover(value: string, range: ReturnType<typeof tokenRange>): Hover {
  return { contents: { kind: MarkupKind.Markdown, value }, range };
}

function localMethodMarkdown(method: MethodSymbol): string {
  const kind = method.isFunction ? 'Функция' : 'Процедура';
  const asyncPrefix = method.isAsync ? 'Асинх ' : '';
  const exportSuffix = method.exported ? ' Экспорт' : '';
  return [
    `**${method.name}**`,
    '',
    '```bsl',
    `${asyncPrefix}${kind} ${method.name}(${method.params.join(', ')})${exportSuffix}`,
    '```',
    '',
    'Локальный метод документа.',
    `- Параметры: ${method.params.length > 0 ? method.params.join(', ') : '—'}`,
  ].join('\n');
}

function memberMarkdown(analysis: Analysis, position: Position, name: string): string | undefined {
  const inferred = inferMemberType(analysis, position);
  if (inferred.kind !== 'known') return undefined;
  const members = typeMembers(inferred.name);
  if (members === undefined) return undefined;
  const lower = name.toLowerCase();
  const method = members.methods.find(
    (candidate) => candidate.ru.toLowerCase() === lower || candidate.en?.toLowerCase() === lower,
  );
  if (method !== undefined) return methodMarkdown(inferred.name, method);
  const property = members.properties.find(
    (candidate) => candidate.ru.toLowerCase() === lower || candidate.en?.toLowerCase() === lower,
  );
  return property === undefined ? undefined : propertyMarkdown(inferred.name, property);
}

/** Hover `.osjs`; в строках/комментариях и для неизвестных имён — null (FR-009). */
export function hoverAt(analysis: Analysis, position: Position): Hover | null {
  if (isInsideTrivia(analysis, position)) return null;
  const token = tokenAt(analysis, position);
  if (token === undefined || token.type !== TokenType.Identifier) return null;
  const range = tokenRange(token);
  const lower = token.lexeme.toLowerCase();

  if (KW_ASYNC.has(lower)) return hover(ASYNC_MARKDOWN, range);
  if (KW_AWAIT.has(lower)) return hover(AWAIT_MARKDOWN, range);

  const index = analysis.tokens.indexOf(token);
  const previous = index < 0 ? undefined : previousSignificant(analysis, index);
  if (previous?.token.type === TokenType.Operator && previous.token.lexeme === '.') {
    const member = memberMarkdown(analysis, position, token.lexeme);
    if (member !== undefined) return hover(member, range);
  }

  const method = analysis.symbols.methods.find(
    (candidate) => candidate.name.toLowerCase() === lower,
  );
  if (method !== undefined) return hover(localMethodMarkdown(method), range);

  const container = methodAt(analysis, position);
  if (container?.params.some((param) => param.name.toLowerCase() === lower)) {
    return hover(`**${token.lexeme}**\n\nПараметр метода «${container.name}».`, range);
  }

  if (analysis.symbols.knownNames.has(lower)) {
    return hover(`**${token.lexeme}**\n\nПеременная документа.`, range);
  }

  const fn = findFunction(token.lexeme);
  if (fn !== undefined) return hover(functionMarkdown(fn), range);

  const type = findType(token.lexeme);
  if (type !== undefined) return hover(typeMarkdown(type), range);

  const enumInfo = findEnum(token.lexeme);
  if (enumInfo !== undefined) return hover(enumMarkdown(enumInfo), range);

  return null;
}
