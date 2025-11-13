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
  // Условия
    JUMP_IF_FALSE: 'JUMP_IF_FALSE', 
    JUMP: 'JUMP',                   
    LABEL: 'LABEL',   
                
} as const;

export type Op = typeof Op[keyof typeof Op];
export { Op };
