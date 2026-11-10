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

describe('ДеревоЗначений', () => {
  afterEach(() => vi.restoreAllMocks());

  it('строит иерархию строк и считает уровень', () => {
    expect(
      exec('Д = Новый ДеревоЗначений; Д.Колонки.Добавить("Имя"); Р = Д.Строки.Добавить(); Р.Имя = "родитель"; С = Р.Строки.Добавить(); С.Имя = "ребёнок"; сообщить(Д.Строки.Количество()); сообщить(Р.Уровень()); сообщить(С.Уровень()); сообщить(С.Родитель.Имя);'),
    ).toEqual(['1', '0', '1', 'родитель']);
  });

  it('Итог с учётом вложенных строк', () => {
    expect(
      exec('Д = Новый ДеревоЗначений; Д.Колонки.Добавить("Сумма"); Р = Д.Строки.Добавить(); Р.Сумма = 5; С = Р.Строки.Добавить(); С.Сумма = 7; сообщить(Д.Строки.Итог("Сумма")); сообщить(Д.Строки.Итог("Сумма", Истина));'),
    ).toEqual(['5', '12']);
  });

  it('Скопировать делает глубокую копию', () => {
    expect(
      exec('Д = Новый ДеревоЗначений; Д.Колонки.Добавить("Имя"); Д.Строки.Добавить().Имя = "а"; К = Д.Скопировать(); К.Строки[0].Имя = "б"; сообщить(Д.Строки[0].Имя); сообщить(К.Строки[0].Имя);'),
    ).toEqual(['а', 'б']);
  });
});
