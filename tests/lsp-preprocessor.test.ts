import { describe, expect, it } from 'vitest';
import { tokenize } from '../src/lexer/lexer';
import { TokenType } from '../src/lexer/token';
import { preprocessScript } from '../src/parser/preprocessor';
import type { PreprocessDiagnostic } from '../src/parser/preprocessor';

function directiveToken(source: string) {
  const token = tokenize(source).find((t) => t.type === TokenType.Preprocessor);
  if (token === undefined) throw new Error('в источнике нет директивы');
  return token;
}

describe('препроцессор: поведение движка по умолчанию', () => {
  it('бросает на #Использовать после кода', () => {
    expect(() => preprocessScript(tokenize('X = 1;\n#Использовать "a.os"'))).toThrow(
      'должна быть расположена в начале модуля',
    );
  });

  it('бросает на незакрытой строке пути', () => {
    expect(() => preprocessScript(tokenize('#Использовать "a.os'))).toThrow(
      'Незакрытая строка в директиве #Использовать',
    );
  });

  it('бросает на пустом пути', () => {
    expect(() => preprocessScript(tokenize('#Использовать ""'))).toThrow(
      'Пустой путь в директиве #Использовать',
    );
  });
});

describe('препроцессор: толерантный режим', () => {
  it('#Использовать после кода — ошибка с диапазоном директивы, импорт сохранён', () => {
    const source = 'X = 1;\n#Использовать "a.os"';
    const token = directiveToken(source);
    const errors: PreprocessDiagnostic[] = [];

    const { imports } = preprocessScript(tokenize(source), { errors });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      message: 'Директива #Использовать должна быть расположена в начале модуля',
      line: token.line,
      column: token.column,
      endLine: token.endLine,
      endColumn: token.endColumn,
    });
    expect(imports).toEqual([{ path: 'a.os', line: 2 }]);
  });

  it('незакрытая строка пути не теряет следующие импорты', () => {
    const source = '#Использовать "broken\n#Использовать "b.os"';
    const brokenToken = directiveToken(source);
    const errors: PreprocessDiagnostic[] = [];

    const { imports } = preprocessScript(tokenize(source), { errors });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      message: 'Незакрытая строка в директиве #Использовать',
      line: brokenToken.line,
      column: brokenToken.column,
      endLine: brokenToken.endLine,
      endColumn: brokenToken.endColumn,
    });
    expect(imports).toEqual([{ path: 'b.os', line: 2 }]);
  });

  it('пустой путь — ошибка, валидные директивы обрабатываются дальше', () => {
    const source = '#Использовать ""\n#Использовать "a.os"';
    const errors: PreprocessDiagnostic[] = [];

    const { imports } = preprocessScript(tokenize(source), { errors });

    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toBe('Пустой путь в директиве #Использовать');
    expect(imports).toEqual([{ path: 'a.os', line: 2 }]);
  });

  it('на валидных директивах ошибок нет', () => {
    const errors: PreprocessDiagnostic[] = [];

    const result = preprocessScript(
      tokenize('#Область Импорты\n#Использовать "a.os"\n#КонецОбласти\nX = 1;'),
      { errors },
    );

    expect(errors).toEqual([]);
    expect(result.imports).toEqual([{ path: 'a.os', line: 2 }]);
  });
});
