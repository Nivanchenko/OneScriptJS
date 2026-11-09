export const TokenType = {
  Identifier: 'Identifier',
  Number: 'Number',
  String: 'String',
  Date: 'Date',
  Boolean: 'Boolean',
  Undefined: 'Undefined',
  Null: 'Null',
  Operator: 'Operator',
  EndOfStatement: 'EndOfStatement',
  Preprocessor: 'Preprocessor',
  EndOfFile: 'EndOfFile',
} as const;

export type TokenType = (typeof TokenType)[keyof typeof TokenType];

/** Распарсенное значение литерала (String/Number/Date/Boolean). */
export type LiteralValue = string | number | boolean;

export interface Token {
  readonly type: TokenType;
  /** Точный фрагмент исходника. */
  readonly lexeme: string;
  /** Распарсенное значение для литералов; у остальных отсутствует. */
  readonly value?: LiteralValue;
  /** Номер строки, с 1. */
  readonly line: number;
  /** Номер колонки, с 1. */
  readonly column: number;
}
