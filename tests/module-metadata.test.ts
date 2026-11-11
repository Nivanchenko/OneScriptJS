import { describe, expect, it } from 'vitest';
import { tokenize } from '../src/lexer/lexer';
import { preprocess } from '../src/parser/preprocessor';
import { parse } from '../src/parser/parser';
import { Interpreter } from '../src/runtime/interpreter';
import { createGlobalContext } from '../src/stdlib/global-context';

const SOURCE = `
Перем Экспортная Экспорт;
Перем Внутренняя;
Перем Пустая Экспорт;

Процедура ПриСозданииОбъекта(Обязательный, Необязательный = "по умолчанию")
КонецПроцедуры

Функция Сложить(А, Б) Экспорт
  Возврат А + Б;
КонецФункции

Процедура Скрытая()
КонецПроцедуры

Экспортная = 1;
`;

function makeInterpreter(): Interpreter {
  const interpreter = new Interpreter(createGlobalContext());
  interpreter.run(parse(preprocess(tokenize(SOURCE))));
  return interpreter;
}

describe('метаданные экспорта интерпретатора', () => {
  it('видит экспортные переменные, но не внутренние', () => {
    const interpreter = makeInterpreter();
    expect(interpreter.hasExportedVar('Экспортная')).toBe(true);
    expect(interpreter.hasExportedVar('Внутренняя')).toBe(false);
    expect(interpreter.getExportedVar('Экспортная')).toBe(1);
    expect(interpreter.getExportedVar('Пустая')).toBeUndefined();
  });

  it('разрешает запись экспортной переменной и запрещает внутренней', () => {
    const interpreter = makeInterpreter();
    interpreter.setExportedVar('Экспортная', 5);
    expect(interpreter.getExportedVar('Экспортная')).toBe(5);
    expect(() => interpreter.setExportedVar('Внутренняя', 5)).toThrow('Свойство');
    expect(() => interpreter.getExportedVar('НетТакой')).toThrow('Свойство');
  });

  it('различает экспортные и скрытые методы', () => {
    const interpreter = makeInterpreter();
    expect(interpreter.hasExportedMethod('Сложить')).toBe(true);
    expect(interpreter.hasExportedMethod('Скрытая')).toBe(false);
    expect(interpreter.callExportedMethod('Сложить', [1, 2])).toBe(3);
    expect(() => interpreter.callExportedMethod('Скрытая', [])).toThrow('Метод');
  });

  it('находит конструктор с параметрами', () => {
    const interpreter = makeInterpreter();
    expect(interpreter.hasConstructor()).toBe(true);
    expect(interpreter.getConstructor()?.params.map((p) => p.name)).toEqual([
      'Обязательный',
      'Необязательный',
    ]);
  });
});

describe('реестр имён GlobalContext', () => {
  it('различает занятые и свободные имена', () => {
    const ctx = createGlobalContext();
    expect(ctx.hasGlobal('Ожидаем')).toBe(true);
    expect(ctx.hasGlobal('НетТакого')).toBe(false);
    expect(ctx.hasType('Массив')).toBe(true);
    expect(ctx.hasType('НетТакого')).toBe(false);
  });
});
