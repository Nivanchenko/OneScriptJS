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

/**
 * Препроцессор: убирает директивы `#Область`/`#КонецОбласти`/`#Использовать`
 * (no-op) и выполняет условную компиляцию `#Если`/`#ИначеЕсли`/`#Иначе`/`#КонецЕсли`.
 */
export function preprocess(tokens: Token[]): Token[] {
  const result: Token[] = [];
  const stack: CondCtx[] = [];
  const isEmitting = (): boolean => stack.every((c) => c.thisActive);

  for (const token of tokens) {
    if (token.type === TokenType.EndOfFile) {
      result.push(token);
      continue;
    }

    if (token.type === TokenType.Preprocessor) {
      const { directive, rest } = parseDirective(token.lexeme);

      if (DIR_REGION.has(directive) || DIR_ENDREGION.has(directive) || DIR_USE.has(directive)) {
        // no-op
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

    if (isEmitting()) result.push(token);
  }

  return result;
}

function parseDirective(lexeme: string): { directive: string; rest: string } {
  const body = lexeme.slice(1).trim();
  const sp = body.search(/\s/);
  const directive = (sp === -1 ? body : body.slice(0, sp)).toLowerCase();
  const rest = sp === -1 ? '' : body.slice(sp + 1).trim();
  return { directive, rest };
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
