import { DiagnosticSeverity } from 'vscode-languageserver';
import type { Diagnostic, Range } from 'vscode-languageserver';
import { tokenizeTolerant } from '../lexer/lexer';
import { TokenType } from '../lexer/token';
import type { Token } from '../lexer/token';
import { preprocessScript } from '../parser/preprocessor';
import type { ImportDirective, PreprocessDiagnostic, PreprocessResult } from '../parser/preprocessor';
import { parseTolerant } from '../parser/parser';
import type { ParseTolerantResult } from '../parser/parser';
import type { Program, Statement } from '../ast/nodes';
import { semanticDiagnostics } from './diagnostics';

export const OSJS_SOURCE = 'osjs';
/** Защита от «тысячи ошибок» в промежуточном состоянии набора. */
export const MAX_DIAGNOSTICS = 200;

export type SymbolKind = 'method' | 'variable' | 'parameter';

export interface SymbolInfo {
  name: string;
  kind: SymbolKind;
  range: Range;
}

export interface MethodSymbol extends SymbolInfo {
  kind: 'method';
  params: string[];
  isFunction: boolean;
  isAsync: boolean;
  exported: boolean;
}

export interface ImportedModule {
  path: string;
  moduleName: string;
  line: number;
}

export interface SymbolTables {
  methods: MethodSymbol[];
  moduleVars: SymbolInfo[];
  /** Объявления параметров и переменных внутри методов (для `definition`). */
  locals: SymbolInfo[];
  importedModules: ImportedModule[];
  /** Нижний регистр: методы, переменные модуля, параметры и локальные имена. */
  knownNames: Set<string>;
}

export interface Analysis {
  /** Все токены, включая trivia (комментарии/директивы) — сырьё для semantic tokens. */
  tokens: Token[];
  trivia: Token[];
  imports: ImportDirective[];
  program: Program;
  diagnostics: Diagnostic[];
  symbols: SymbolTables;
}

/** Позиции движка 1-based → LSP-диапазон 0-based (UTF-16). */
function toRange(span: { line: number; column: number; endLine: number; endColumn: number }): Range {
  const start = { line: Math.max(0, span.line - 1), character: Math.max(0, span.column - 1) };
  const end = {
    line: Math.max(0, span.endLine - 1),
    character: Math.max(0, span.endColumn - 1),
  };
  if (end.line === start.line && end.character <= start.character) {
    end.character = start.character + 1;
  }
  return { start, end };
}

function tokenRange(token: Token): Range {
  return {
    start: { line: Math.max(0, token.line - 1), character: Math.max(0, token.column - 1) },
    end: { line: Math.max(0, token.endLine - 1), character: Math.max(0, token.endColumn - 1) },
  };
}

function syntaxDiagnostic(
  code: string,
  message: string,
  span: { line: number; column: number; endLine: number; endColumn: number },
): Diagnostic {
  return {
    range: toRange(span),
    severity: DiagnosticSeverity.Error,
    code,
    source: OSJS_SOURCE,
    message,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Имя модуля из пути — как `nameFromPath` загрузчика (файл без последнего расширения). */
function moduleNameFromPath(path: string): string {
  const base = path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1);
  let decoded = base;
  try {
    decoded = decodeURIComponent(base);
  } catch {
    // не URL-кодирование — оставляем как есть
  }
  const dot = decoded.lastIndexOf('.');
  return dot > 0 ? decoded.slice(0, dot) : decoded;
}

/** Запасной разбор импортов, если препроцессор упал: только `#Использовать "<путь>"`. */
function fallbackImports(tokens: Token[]): ImportDirective[] {
  const imports: ImportDirective[] = [];
  for (const token of tokens) {
    if (token.type !== TokenType.Preprocessor) continue;
    const match = /^#\s*использовать\s+"([^"]+)"/i.exec(token.lexeme);
    if (match?.[1] !== undefined) imports.push({ path: match[1], line: token.line });
  }
  return imports;
}

function asPos(value: unknown): { line: number; column: number } {
  if (typeof value === 'object' && value !== null) {
    const pos = value as { line?: unknown; column?: unknown };
    if (typeof pos.line === 'number' && typeof pos.column === 'number') {
      return { line: pos.line, column: pos.column };
    }
  }
  return { line: 1, column: 1 };
}

/** Диапазон имени: первое совпадающее имя после позиции объявления. */
function findNameRange(tokens: Token[], name: string, from: { line: number; column: number }): Range {
  const lower = name.toLowerCase();
  for (const token of tokens) {
    if (token.type !== TokenType.Identifier) continue;
    const after = token.line > from.line || (token.line === from.line && token.column >= from.column);
    if (after && token.lexeme.toLowerCase() === lower) return tokenRange(token);
  }
  const start = { line: Math.max(0, from.line - 1), character: Math.max(0, from.column - 1) };
  return { start, end: { line: start.line, character: start.character + name.length } };
}

/** Собирает имена, которым что-то присвоено внутри узла (перем, присваивания, счётчики циклов). */
function collectNames(
  root: unknown,
  sink: (name: string, from: { line: number; column: number }, declared: boolean) => void,
): void {
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (node === null || typeof node !== 'object') return;
    const record = node as { kind?: unknown; pos?: unknown } & Record<string, unknown>;
    if (typeof record.kind === 'string') {
      if (record.kind === 'VariableDeclaration') {
        for (const name of (record.names as string[] | undefined) ?? []) {
          sink(name, asPos(record.pos), true);
        }
      } else if (record.kind === 'Assignment') {
        const target = record.target as { kind?: unknown; name?: unknown; pos?: unknown } | undefined;
        if (target?.kind === 'Identifier' && typeof target.name === 'string') {
          sink(target.name, asPos(target.pos), false);
        }
      } else if (record.kind === 'ForLoop' || record.kind === 'ForEachLoop') {
        if (typeof record.variable === 'string') sink(record.variable, asPos(record.pos), true);
      }
    }
    for (const [key, value] of Object.entries(record)) {
      if (key === 'pos' || key === 'kind') continue;
      visit(value);
    }
  };
  visit(root);
}

function buildSymbols(program: Program, tokens: Token[], imports: ImportDirective[]): SymbolTables {
  const methods: MethodSymbol[] = [];
  const moduleVars: SymbolInfo[] = [];
  const locals: SymbolInfo[] = [];
  const knownNames = new Set<string>();
  const addKnown = (name: string): void => {
    knownNames.add(name.toLowerCase());
  };
  const addVar = (name: string, range: Range): void => {
    moduleVars.push({ name, kind: 'variable', range });
    addKnown(name);
  };

  // Модульные `Перем` — раньше методов: по ним отличаем модульную переменную от локальной.
  const moduleVarNames = new Set<string>();
  for (const statement of program.body) {
    if (statement.kind !== 'VariableDeclaration') continue;
    for (const name of statement.names) moduleVarNames.add(name.toLowerCase());
  }

  for (const statement of program.body) {
    if (statement.kind === 'MethodDeclaration') {
      const range = findNameRange(tokens, statement.name, statement.pos);
      methods.push({
        kind: 'method',
        name: statement.name,
        range,
        params: statement.params.map((param) => param.name),
        isFunction: statement.isFunction,
        isAsync: statement.isAsync,
        exported: statement.exported,
      });
      addKnown(statement.name);
      for (const param of statement.params) {
        addKnown(param.name);
        locals.push({
          name: param.name,
          kind: 'parameter',
          range: findNameRange(tokens, param.name, statement.pos),
        });
      }
      collectNames(statement, (name, from, declared) => {
        addKnown(name);
        // Присваивание модульной переменной — не новое локальное объявление.
        if (declared || !moduleVarNames.has(name.toLowerCase())) {
          locals.push({ name, kind: 'variable', range: findNameRange(tokens, name, from) });
        }
      });
      continue;
    }
    if (statement.kind === 'VariableDeclaration') {
      for (const name of statement.names) addVar(name, findNameRange(tokens, name, statement.pos));
      continue;
    }
    collectNames(statement as Statement, (name, from) => addVar(name, findNameRange(tokens, name, from)));
  }

  const importedModules: ImportedModule[] = imports.map((directive) => ({
    path: directive.path,
    moduleName: moduleNameFromPath(directive.path),
    line: directive.line,
  }));
  for (const imported of importedModules) addKnown(imported.moduleName);

  return { methods, moduleVars, locals, importedModules, knownNames };
}

function finalize(diagnostics: Diagnostic[]): Diagnostic[] {
  const sorted = [...diagnostics].sort(
    (a, b) =>
      a.range.start.line - b.range.start.line ||
      a.range.start.character - b.range.start.character,
  );
  const seen = new Set<string>();
  const result: Diagnostic[] = [];
  for (const diagnostic of sorted) {
    const key = `${String(diagnostic.code)}:${diagnostic.range.start.line}:${diagnostic.range.start.character}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(diagnostic);
    if (result.length >= MAX_DIAGNOSTICS) break;
  }
  return result;
}

/**
 * Полный анализ `.osjs`-документа: толерантные лексер/препроцессор/парсер, символы,
 * синтаксические и (только при успешном разборе) семантические диагностики.
 */
export function analyze(source: string): Analysis {
  const lexed = tokenizeTolerant(source, { includeTrivia: true });
  const diagnostics: Diagnostic[] = lexed.errors.map((error) =>
    syntaxDiagnostic('OSJS1001', `Лексическая ошибка: ${error.message}`, error),
  );

  // Комментарии — trivia для подсветки, а не токены языка: парсер их не ожидает.
  const programTokens = lexed.tokens.filter((token) => token.type !== TokenType.Comment);
  const preprocessErrors: PreprocessDiagnostic[] = [];
  let preprocessed: PreprocessResult;
  try {
    preprocessed = preprocessScript(programTokens, { errors: preprocessErrors });
  } catch (error) {
    preprocessed = { tokens: programTokens, imports: [] };
    preprocessErrors.push({
      message: errorMessage(error),
      line: 1,
      column: 1,
      endLine: 1,
      endColumn: 1,
    });
  }
  for (const error of preprocessErrors) {
    diagnostics.push(syntaxDiagnostic('OSJS1002', `Ошибка директивы: ${error.message}`, error));
  }

  let parsed: ParseTolerantResult;
  try {
    parsed = parseTolerant(preprocessed.tokens);
  } catch (error) {
    parsed = {
      program: { kind: 'Program', pos: { line: 1, column: 1 }, body: [] },
      errors: [
        { message: errorMessage(error), line: 1, column: 1, endLine: 1, endColumn: 1 },
      ],
    };
  }
  for (const error of parsed.errors) {
    diagnostics.push(syntaxDiagnostic('OSJS2001', error.message, error));
  }

  const imports =
    preprocessed.imports.length > 0 ? preprocessed.imports : fallbackImports(lexed.tokens);
  const symbols = buildSymbols(parsed.program, lexed.tokens, imports);

  // Семантика — только на целом AST: на частичном выводы дали бы ложные срабатывания.
  if (diagnostics.length === 0) {
    diagnostics.push(...semanticDiagnostics(parsed.program, symbols, imports, lexed.tokens));
  }

  return {
    tokens: lexed.tokens,
    trivia: lexed.tokens.filter(
      (token) => token.type === TokenType.Comment || token.type === TokenType.Preprocessor,
    ),
    imports,
    program: parsed.program,
    diagnostics: finalize(diagnostics),
    symbols,
  };
}
