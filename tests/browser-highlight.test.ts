import { describe, expect, it } from 'vitest';
import { highlight } from '../src/browser/highlight';

/** Текст из HTML подсветки: снимает span и разэкранирует HTML. */
function plain(html: string): string {
  return html
    .replace(/<\/?span[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

describe('подсветка кода BSL', () => {
  it('раскрашивает ключевые слова, строки и комментарии', () => {
    const html = highlight('// комментарий\nЕсли Истина Тогда\n  Сообщить("Привет");\nКонецЕсли;');

    expect(html).toContain('<span class="комментарий">// комментарий</span>');
    expect(html).toContain('<span class="ключевое">Если</span>');
    expect(html).toContain('<span class="ключевое">Тогда</span>');
    expect(html).toContain('<span class="ключевое">КонецЕсли</span>');
    expect(html).toContain('<span class="строка">"Привет"</span>');
    expect(html).toContain('<span class="литерал">Истина</span>');
  });

  it('раскрашивает числа, даты и директивы препроцессора', () => {
    const html = highlight('А = 42; Б = \'20260101\'; #Использовать "Модуль.osjs"');

    expect(html).toContain('<span class="число">42</span>');
    expect(html).toContain('<span class="дата">\'20260101\'</span>');
    expect(html).toContain('<span class="препроцессор">#Использовать "Модуль.osjs"</span>');
  });

  it('экранирует HTML из исходника', () => {
    const html = highlight('Строка = "<тег> & ещё";');

    expect(html).not.toContain('<тег>');
    expect(html).toContain('&lt;тег&gt; &amp; ещё');
  });

  it('не искажает исходный текст (round-trip)', () => {
    const source =
      '// пример\nПроцедура Тест(Знач А)\n  Если А > 10 Тогда\n    Сообщить("А = " + А);\n  КонецЕсли;\nКонецПроцедуры\n';
    expect(plain(highlight(source))).toBe(source);
  });

  it('не падает на незавершённом коде', () => {
    expect(() => highlight('Если Истина Тогда\n  Сообщить("не закрыто')).not.toThrow();
    expect(plain(highlight('Если Истина Тогда\n  Сообщить("не закрыто'))).toBe(
      'Если Истина Тогда\n  Сообщить("не закрыто',
    );
  });

  it('доступна из браузерной точки входа как window.OneScript.highlight', async () => {
    const browserEntry = await import('../src/browser/onescript');
    expect(typeof browserEntry.highlight).toBe('function');
  });
});
