/**
 * Словари ключевых слов и директив языка BSL.
 * Единый источник для парсера, препроцессора и редакторных инструментов
 * (анти-drift: `tests/grammar.test.ts` сверяет эти наборы с грамматикой).
 */

// Ключевые слова распознаются регистронезависимо (RU/EN).
export const KW_IF = new Set(['если', 'if']);
export const KW_THEN = new Set(['тогда', 'then']);
export const KW_ENDIF = new Set(['конецесли', 'endif']);
export const KW_ELSIF = new Set(['иначеесли', 'elsif']);
export const KW_ELSE = new Set(['иначе', 'else']);
export const KW_AND = new Set(['и', 'and']);
export const KW_OR = new Set(['или', 'or']);
export const KW_NOT = new Set(['не', 'not']);
export const KW_PROCEDURE = new Set(['процедура', 'procedure']);
export const KW_FUNCTION = new Set(['функция', 'function']);
export const KW_ENDPROCEDURE = new Set(['конецпроцедуры', 'endprocedure']);
export const KW_ENDFUNCTION = new Set(['конецфункции', 'endfunction']);
export const KW_RETURN = new Set(['возврат', 'return']);
export const KW_VAR = new Set(['перем', 'var']);
export const KW_EXPORT = new Set(['экспорт', 'export']);
export const KW_VALUE = new Set(['знач', 'val']);
export const KW_FOR = new Set(['для', 'for']);
export const KW_EACH = new Set(['каждого', 'each']);
export const KW_IN = new Set(['из', 'in']);
export const KW_TO = new Set(['по', 'to']);
export const KW_WHILE = new Set(['пока', 'while']);
export const KW_LOOP = new Set(['цикл', 'do']);
export const KW_ENDLOOP = new Set(['конеццикла', 'enddo']);
export const KW_BREAK = new Set(['прервать', 'break']);
export const KW_CONTINUE = new Set(['продолжить', 'continue']);
export const KW_TRY = new Set(['попытка', 'try']);
export const KW_EXCEPT = new Set(['исключение', 'except']);
export const KW_ENDTRY = new Set(['конецпопытки', 'endtry']);
export const KW_RAISE = new Set(['вызватьисключение', 'raise']);
export const KW_NEW = new Set(['новый', 'new']);
export const KW_GOTO = new Set(['перейти', 'goto']);
export const KW_EXECUTE = new Set(['выполнить', 'execute']);
export const KW_ADD_HANDLER = new Set(['добавитьобработчик', 'addhandler']);
export const KW_REMOVE_HANDLER = new Set(['удалитьобработчик', 'removehandler']);
export const KW_ASYNC = new Set(['асинх', 'async']);
export const KW_AWAIT = new Set(['ждать', 'await']);

// Ключевые слова конца блока: завершают оператор без ';'.
export const END_OF_BLOCK = new Set([
  'конецесли', 'endif',
  'конецпроцедуры', 'endprocedure',
  'конецфункции', 'endfunction',
  'иначе', 'else',
  'иначеесли', 'elsif',
  'конеццикла', 'enddo',
  'конецпопытки', 'endtry',
  'исключение', 'except',
]);

export const COMPARISON_OPS = new Set(['=', '<>', '<', '>', '<=', '>=']);

// Директивы препроцессора распознаются регистронезависимо (RU/EN).
export const DIR_IF = new Set(['если', 'if']);
export const DIR_ELSIF = new Set(['иначеесли', 'elsif']);
export const DIR_ELSE = new Set(['иначе', 'else']);
export const DIR_ENDIF = new Set(['конецесли', 'endif']);
export const DIR_REGION = new Set(['область', 'region']);
export const DIR_ENDREGION = new Set(['конецобласти', 'endregion']);
export const DIR_USE = new Set(['использовать', 'use']);
