import { describe, expect, it } from 'vitest';
import { tokenize } from '../src/lexer/lexer';
import { parse } from '../src/parser/parser';
import { Interpreter } from '../src/runtime/interpreter';
import type { RuntimeEnvironment } from '../src/runtime/context';
import { toStringValue } from '../src/runtime/values';

/** Выполняет исходник и собирает вывод фиктивного Сообщить. */
function run(source: string): string[] {
  const messages: string[] = [];
  const env: RuntimeEnvironment = {
    call(name, args) {
      if (name.toLowerCase() === 'сообщить' || name.toLowerCase() === 'message') {
        messages.push(toStringValue(args[0] ?? ''));
        return undefined;
      }
      throw new Error(`Неизвестная функция: ${name}`);
    },
    construct(typeName) {
      throw new Error(`Тип '${typeName}' не найден`);
    },
  };
  new Interpreter(env).run(parse(tokenize(source)));
  return messages;
}

describe('интерпретатор', () => {
  it('выполняет приёмочный пример (переменные + вложенные если + сообщить)', () => {
    const messages = run(
      'имя = "Никита";\n' +
        'фамилия = "Иванченко";\n' +
        'возраст = 38;\n' +
        'сообщить("Привет, ты указал: " + имя + ", " + фамилия);\n' +
        'если (возраст > 18) тогда\n' +
        '  если (возраст > 30) тогда\n' +
        '    сообщить("возраст больше 30");\n' +
        '  конецесли;\n' +
        '  сообщить("Добро пожаловать, " + имя + " твой возраст " + возраст);\n' +
        'конецесли;',
    );
    expect(messages).toEqual([
      'Привет, ты указал: Никита, Иванченко',
      'возраст больше 30',
      'Добро пожаловать, Никита твой возраст 38',
    ]);
  });

  it('пропускает ветку если при ложном условии', () => {
    expect(run('x = 5; если (x > 10) тогда сообщить("да"); конецесли; сообщить("конец");')).toEqual([
      'конец',
    ]);
  });

  it('вычисляет арифметику и сравнения', () => {
    expect(run('сообщить(1 + 2 * 3); сообщить(10 > 5); сообщить(10 = 10); сообщить(10 <> 5);')).toEqual([
      '7',
      'Истина',
      'Истина',
      'Истина',
    ]);
  });

  it('вычисляет и/или/не', () => {
    expect(run('сообщить(Истина и Истина); сообщить(Истина или Ложь); сообщить(не Ложь);')).toEqual([
      'Истина',
      'Истина',
      'Истина',
    ]);
  });

  it('читает переменные; незаданные — Неопределено', () => {
    expect(run('x = 5; сообщить(x); сообщить(y);')).toEqual(['5', '']);
  });

  it('короткое замыкание И', () => {
    expect(run('сообщить(Ложь и НеизвестнаяФункция());')).toEqual(['Ложь']);
  });
});
