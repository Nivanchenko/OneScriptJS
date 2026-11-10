import { afterEach, describe, expect, it, vi } from 'vitest';
import { run } from '../src/runtime/runner';
import { createGlobalContext } from '../src/stdlib/global-context';

function exec(source: string): unknown[] {
  const logs: unknown[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logs.push(...args);
  });
  try {
    run(source, createGlobalContext());
  } finally {
    spy.mockRestore();
  }
  return logs;
}

describe('asserts: Ожидаем', () => {
  afterEach(() => vi.restoreAllMocks());

  it('Что(x).Равно(x) проходит, Равно(y) бросает', () => {
    expect(exec('Ожидаем.Что(1).Равно(1); сообщить("ок");')).toEqual(['ок']);
    expect(() => exec('Ожидаем.Что(1).Равно(2);')).toThrow(/ожидалось '2', получено '1'/);
  });

  it('поддерживает сравнения Больше/Меньше/БольшеИлиРавно/МеньшеИлиРавно', () => {
    expect(exec('Ожидаем.Что(3).Больше(2); Ожидаем.Что(2).Меньше(3); Ожидаем.Что(2).БольшеИлиРавно(2); Ожидаем.Что(2).МеньшеИлиРавно(2); сообщить("ок");')).toEqual(['ок']);
    expect(() => exec('Ожидаем.Что(1).Больше(2);')).toThrow();
  });

  it('ЭтоИстина/ЭтоЛожь', () => {
    expect(exec('Ожидаем.Что(Истина).ЭтоИстина(); Ожидаем.Что(Ложь).ЭтоЛожь(); сообщить("ок");')).toEqual(['ок']);
    expect(() => exec('Ожидаем.Что(Ложь).ЭтоИстина();')).toThrow(/ожидалась истина/);
  });

  it('ЭтоНе() инвертирует следующую проверку', () => {
    expect(exec('Ожидаем.Что(1).ЭтоНе().Равно(2); сообщить("ок");')).toEqual(['ок']);
    expect(() => exec('Ожидаем.Что(1).ЭтоНе().Равно(1);')).toThrow();
  });

  it('ИмеетДлину и Содержит', () => {
    expect(exec('М = Новый Массив; М.Добавить("a"); М.Добавить("b"); Ожидаем.Что(М).ИмеетДлину(2); Ожидаем.Что("abc").Содержит("b"); сообщить("ок");')).toEqual(['ок']);
    expect(() => exec('Ожидаем.Что("abc").Содержит("z");')).toThrow();
  });

  it('Существует проверяет Неопределено', () => {
    expect(exec('Ожидаем.Что(1).Существует(); сообщить("ок");')).toEqual(['ок']);
    expect(() => exec('Ожидаем.Что(Неопределено).Существует();')).toThrow();
  });

  it('передаёт сообщение об ошибке в текст исключения', () => {
    expect(() => exec('Ожидаем.Что(1, "мой текст").Равно(2);')).toThrow(/мой текст/);
  });
});
