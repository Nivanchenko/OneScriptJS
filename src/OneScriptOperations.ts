const Op = {
  // Переменные
    PUSH: 'PUSH',
    LOAD: 'LOAD',
    STORE: 'STORE',
    DECLARE: 'DECLARE',
  // Математика
    ADD: 'ADD',
    SUB: 'SUB',
    MUL: 'MUL',
    DIV: 'DIV',
    MOD: 'MOD',
  // Сравнение
    EQ: 'EQ',   // =
    NE: 'NE',   // <>
    LT: 'LT',   // <
    LE: 'LE',   // <=
    GT: 'GT',   // >
    GE: 'GE',   // >=
  // Логические
    AND: 'AND',
    OR: 'OR',
    NOT: 'NOT',
    NEG: 'NEG',
  // Условия
    JUMP_IF_FALSE: 'JUMP_IF_FALSE',
    JUMP: 'JUMP',
    LABEL: 'LABEL',
  // Циклы
    BREAK: 'BREAK',
    CONTINUE: 'CONTINUE',
    FOR_INIT: 'FOR_INIT',
    FOR_CONDITION: 'FOR_CONDITION',
    FOR_INCREMENT: 'FOR_INCREMENT',
    FOR_END: 'FOR_END',
  // Функции
    CALL: 'CALL',
    RET: 'RET',
    BEGIN_FUNC: 'BEGIN_FUNC',
    END_FUNC: 'END_FUNC',
                
} as const;

export type Op = typeof Op[keyof typeof Op];
export { Op };
