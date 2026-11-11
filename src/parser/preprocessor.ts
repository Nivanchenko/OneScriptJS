import { tokenize } from '../lexer/lexer';
import { TokenType } from '../lexer/token';
import type { Token } from '../lexer/token';
import { parse } from './parser';
import type { CallExpression, Expression, ExpressionStatement } from '../ast/nodes';
import { Interpreter } from '../runtime/interpreter';
import { toBoolean } from '../runtime/values';
import type { Value } from '../runtime/values';

// Директивы распознаются регистронезависимо (RU/EN).
const DIR_IF = new Set(['если', 'if']);
const DIR_ELSIF = new Set(['иначеесли', 'elsif']);
const DIR_ELSE = new Set(['иначе', 'else']);
const DIR_ENDIF = new Set(['конецесли', 'endif']);
const DIR_REGION = new Set(['область', 'region']);
const DIR_ENDREGION = new Set(['конецобласти', 'endregion']);
const DIR_USE = new Set(['использовать', 'use']);

interface CondCtx {
  parentActive: boolean;
  thisActive: boolean;
  elseDone: boolean;
}

/** Импорт файла из директивы `#Использовать "<путь>"`. */
export interface ImportDirective {
  path: string;
  line: number;
}

export interface PreprocessResult {
  tokens: Token[];
  imports: ImportDirective[];
}

/**
 * Препроцессор: убирает директивы `#Область`/`#КонецОбласти`/`#Использовать`
 * и выполняет условную компиляцию `#Если`/`#ИначеЕсли`/`#Иначе`/`#КонецЕсли`.
 */
export function preprocess(tokens: Token[]): Token[] {
  return preprocessScript(tokens).tokens;
}

/**
 * То же, что `preprocess`, но дополнительно возвращает импорты файлов —
 * только из активных веток `#Если`.
 */
export function preprocessScript(tokens: Token[]): PreprocessResult {
  const result: Token[] = [];
  const imports: ImportDirective[] = [];
  const stack: CondCtx[] = [];
  const isEmitting = (): boolean => stack.every((c) => c.thisActive);
  // В эталоне #Использовать — аннотация модуля: она допустима только до кода.
  let sawCode = false;

  for (const token of tokens) {
    if (token.type === TokenType.EndOfFile) {
      result.push(token);
      continue;
    }

    if (token.type === TokenType.Preprocessor) {
      const { directive, rest } = parseDirective(token.lexeme);

      if (DIR_REGION.has(directive) || DIR_ENDREGION.has(directive)) {
        // no-op
      } else if (DIR_USE.has(directive)) {
        if (isEmitting()) {
          if (sawCode) {
            throw new Error(
              `Директива #Использовать должна быть расположена в начале модуля (строка ${token.line})`,
            );
          }
          const path = parseImportPath(rest, token.line);
          if (path !== undefined) imports.push({ path, line: token.line });
        }
      } else if (DIR_IF.has(directive)) {
        const parentActive = isEmitting();
        const active = parentActive && toBoolean(evalCondition(rest));
        stack.push({ parentActive, thisActive: active, elseDone: active });
      } else if (DIR_ELSIF.has(directive)) {
        const top = stack[stack.length - 1];
        if (top) {
          top.thisActive = top.parentActive && !top.elseDone && toBoolean(evalCondition(rest));
          top.elseDone = top.elseDone || top.thisActive;
        }
      } else if (DIR_ELSE.has(directive)) {
        const top = stack[stack.length - 1];
        if (top) {
          top.thisActive = top.parentActive && !top.elseDone;
          top.elseDone = true;
        }
      } else if (DIR_ENDIF.has(directive)) {
        stack.pop();
      }
      // любая директива не попадает в результат
      continue;
    }

    if (isEmitting()) {
      result.push(token);
      sawCode = true;
    }
  }

  return { tokens: result, imports };
}

function parseDirective(lexeme: string): { directive: string; rest: string } {
  const body = lexeme.slice(1).trim();
  const sp = body.search(/\s/);
  const directive = (sp === -1 ? body : body.slice(0, sp)).toLowerCase();
  const rest = sp === -1 ? '' : body.slice(sp + 1).trim();
  return { directive, rest };
}

/**
 * Путь из строки в кавычках; `undefined` — директива без кавычек (имя библиотеки,
 * исторически no-op). Хвостовой `//`-комментарий после закрывающей кавычки игнорируется.
 */
function parseImportPath(rest: string, line: number): string | undefined {
  const text = rest.trim();
  if (!text.startsWith('"')) return undefined;

  let path = '';
  let i = 1;
  for (;;) {
    if (i >= text.length) {
      throw new Error(`Незакрытая строка в директиве #Использовать (строка ${line})`);
    }
    const ch = text[i]!;
    if (ch === '"') {
      if (text[i + 1] === '"') {
        path += '"';
        i += 2;
        continue;
      }
      break;
    }
    path += ch;
    i += 1;
  }

  if (path === '') {
    throw new Error(`Пустой путь в директиве #Использовать (строка ${line})`);
  }
  return path;
}

function evalCondition(rest: string): Value {
  const noComment = rest.split('//')[0]!.trim();
  const noThen = noComment.replace(/\s+(тогда|then)\s*$/i, '').trim();
  if (!noThen) return false;
  const program = parse(tokenize(`сообщить(${noThen});`));
  const stmt = program.body[0] as ExpressionStatement;
  const call = stmt.expression as CallExpression;
  return Interpreter.evaluate(call.args[0]!);
}
