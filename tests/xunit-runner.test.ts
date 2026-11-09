import { describe, expect, it } from 'vitest';
import { runTests } from '../src/testing/runner';
import { createGlobalContext } from '../src/stdlib/global-context';

// Реальное содержимое reference/OneScript/tests/values-test.os (без комментариев-заголовка).
const VALUES_TEST = `
Перем юТест;

Функция ПолучитьСписокТестов(ЮнитТестирование) Экспорт
	юТест = ЮнитТестирование;
	ВсеТесты = Новый Массив;
	ВсеТесты.Добавить("ТестДолжен_ПроверитьРавенствоNull");
	Возврат ВсеТесты;
КонецФункции

Процедура ТестДолжен_ПроверитьРавенствоNull() Экспорт
	А = Null;
	Б = Null;
	юТест.Проверить(А = Б и Б = Null и А = Null);
КонецПроцедуры
`;

// Несколько тестов, включая умышленно падающий.
const MULTI_TEST = `
Перем юТест;

Функция ПолучитьСписокТестов(ЮнитТестирование) Экспорт
	юТест = ЮнитТестирование;
	ВсеТесты = Новый Массив;
	ВсеТесты.Добавить("ТестПроходит");
	ВсеТесты.Добавить("ТестПадает");
	Возврат ВсеТесты;
КонецФункции

Процедура ТестПроходит() Экспорт
	юТест.ПроверитьРавенство(4, Pow(2, 2), "Pow");
КонецПроцедуры

Процедура ТестПадает() Экспорт
	юТест.ПроверитьРавенство(1, 2, "неверно");
КонецПроцедуры
`;

describe('xUnit-раннер', () => {
  it('прогоняет values-test.os (реальный файл)', () => {
    const results = runTests(VALUES_TEST, createGlobalContext());
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ name: 'ТестДолжен_ПроверитьРавенствоNull', passed: true });
  });

  it('различает прошедшие и упавшие тесты', () => {
    const results = runTests(MULTI_TEST, createGlobalContext());
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ name: 'ТестПроходит', passed: true });
    expect(results[1]).toMatchObject({ name: 'ТестПадает', passed: false });
    expect(results[1]?.error).toContain('ПроверитьРавенство');
  });
});
