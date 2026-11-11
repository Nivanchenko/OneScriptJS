import { describe, expect, it } from 'vitest';
import { CompletionItemKind } from 'vscode-languageserver';
import type { CompletionItem, Hover, Position } from 'vscode-languageserver';
import { analyze } from '../src/lsp/analysis';
import { completionItems } from '../src/lsp/completion';
import { hoverAt } from '../src/lsp/hover';
import { inferMemberType } from '../src/lsp/inference';

/** Позиция LSP (0-based) по смещению в исходнике. */
function positionAtOffset(source: string, offset: number): Position {
  const lines = source.slice(0, offset).split('\n');
  return { line: lines.length - 1, character: lines[lines.length - 1]?.length ?? 0 };
}

/** Начало первого вхождения фрагмента. */
function positionAt(source: string, snippet: string): Position {
  const index = source.indexOf(snippet);
  if (index < 0) throw new Error(`Не найден фрагмент: ${snippet}`);
  return positionAtOffset(source, index);
}

/** Конец первого вхождения фрагмента. */
function positionAfter(source: string, snippet: string): Position {
  const index = source.indexOf(snippet);
  if (index < 0) throw new Error(`Не найден фрагмент: ${snippet}`);
  return positionAtOffset(source, index + snippet.length);
}

function labels(items: CompletionItem[]): string[] {
  return items.map((item) => item.label);
}

function documentationText(item: CompletionItem | undefined): string {
  const documentation = item?.documentation;
  if (documentation === undefined) return '';
  return typeof documentation === 'string' ? documentation : documentation.value;
}

/** Markdown-текст hover; тест падает, если hover не пришёл. */
function markdown(hover: Hover | null): string {
  if (hover === null) throw new Error('Ожидался hover, получен null');
  const contents = hover.contents;
  if (typeof contents === 'string') return contents;
  if (Array.isArray(contents)) {
    return contents
      .map((part) => (typeof part === 'string' ? part : part.value))
      .join('\n');
  }
  return contents.value;
}

describe('completion (US3)', () => {
  it('по префиксу «Сооб» предлагает «Сообщить» и «Message» с сигнатурой и описанием', () => {
    const source = 'Сооб';
    const items = completionItems(analyze(source), positionAfter(source, 'Сооб'));
    const message = items.find((item) => item.label === 'Сообщить');
    const alias = items.find((item) => item.label === 'Message');

    expect(message).toBeDefined();
    expect(alias).toBeDefined();
    expect(message?.kind).toBe(CompletionItemKind.Function);
    expect(message?.detail ?? '').toContain('Сообщить(');
    expect(message?.detail ?? '').toContain('Текст?: Любое');
    expect(documentationText(message)).toContain('Выводит текст');
    expect(alias?.detail).toBe(message?.detail);
    expect(documentationText(alias)).toContain('Выводит текст');
    expect(items.length).toBeLessThanOrEqual(500);
  });

  it('после «М.» предлагает методы типа «Массив» и фильтрует их по префиксу', () => {
    const source = 'М = Новый Массив;\nМ.';
    const items = completionItems(analyze(source), positionAfter(source, 'М.'));
    const add = items.find((item) => item.label === 'Добавить');

    expect(add).toBeDefined();
    expect(add?.kind).toBe(CompletionItemKind.Method);
    expect(add?.detail ?? '').toContain('Добавить(');
    expect(add?.detail ?? '').toContain('Значение');
    expect(labels(items)).toContain('Количество');
    expect(labels(items)).not.toContain('Сообщить');
    expect(labels(items)).not.toContain('Массив');

    const filtered = completionItems(analyze('М = Новый Массив;\nМ.Доб'), positionAfter('М = Новый Массив;\nМ.Доб', 'М.Доб'));
    expect(labels(filtered)).toContain('Добавить');
    expect(labels(filtered)).not.toContain('Удалить');
  });

  it('не предлагает подсказок в строке и комментарии', () => {
    const stringSource = 'Сообщить("Сооб");';
    expect(completionItems(analyze(stringSource), positionAfter(stringSource, '"Сооб'))).toEqual([]);

    const commentSource = '// Сооб';
    expect(completionItems(analyze(commentSource), positionAfter(commentSource, '// Сооб'))).toEqual([]);
  });

  it('предлагает локальные методы, параметры и переменные', () => {
    const methodSource = 'Процедура Обработать()\nКонецПроцедуры\nОбраб\n';
    const methodItems = completionItems(analyze(methodSource), positionAfter(methodSource, 'Обраб'));
    expect(labels(methodItems)).toContain('Обработать');

    const paramSource = 'Процедура Обработать(Параметр)\n  Пар\nКонецПроцедуры\n';
    const paramItems = completionItems(analyze(paramSource), positionAfter(paramSource, '  Пар'));
    expect(labels(paramItems)).toContain('Параметр');

    const localSource = 'Процедура Обработать()\n  Перем Значение;\n  Знач\nКонецПроцедуры\n';
    const localItems = completionItems(analyze(localSource), positionAfter(localSource, '  Знач'));
    expect(labels(localItems)).toContain('Значение');
  });

  it('для неоднозначного типа не предлагает членов объекта', () => {
    const source = 'М = Новый Неизвестный;\nМ.';
    expect(completionItems(analyze(source), positionAfter(source, 'М.'))).toEqual([]);
  });
});

describe('вывод типов для «Член.» (US3)', () => {
  it('выводит тип из «Новый Тип»', () => {
    const source = 'М = Новый Массив;\nМ.';
    expect(inferMemberType(analyze(source), positionAfter(source, 'М.'))).toEqual({
      kind: 'known',
      name: 'Массив',
    });
  });

  it('выводит тип из строковой формы «Новый("Тип")»', () => {
    const source = 'М = Новый("Массив");\nМ.';
    expect(inferMemberType(analyze(source), positionAfter(source, 'М.'))).toEqual({
      kind: 'known',
      name: 'Массив',
    });
  });

  it('выводит тип из однократного присваивания в области метода', () => {
    const source = 'Функция Создать()\n  Лок = Новый Массив;\n  Лок.Добавить(1);\n  Возврат Лок;\nКонецФункции\n';
    expect(inferMemberType(analyze(source), positionAfter(source, '  Лок.'))).toEqual({
      kind: 'known',
      name: 'Массив',
    });
  });

  it('выводит тип из прямого вызова stdlib-функции с единственным типом возврата', () => {
    const source = 'А = СтрРазделить("a,b", ",");\nА.';
    expect(inferMemberType(analyze(source), positionAfter(source, 'А.'))).toEqual({
      kind: 'known',
      name: 'Массив',
    });
  });

  it('не выводит тип при повторном присваивании', () => {
    const source = 'М = Новый Массив;\nМ = Новый Структура;\nМ.';
    expect(inferMemberType(analyze(source), positionAfter(source, 'М.'))).toEqual({ kind: 'unknown' });
  });

  it('не выводит тип параметра метода и неизвестного конструктора', () => {
    const paramSource = 'Функция Создать(Пар)\n  Пар.Добавить(1);\nКонецФункции\n';
    expect(inferMemberType(analyze(paramSource), positionAfter(paramSource, '  Пар.'))).toEqual({
      kind: 'unknown',
    });

    const unknownSource = 'М = Новый Неизвестный;\nМ.';
    expect(inferMemberType(analyze(unknownSource), positionAfter(unknownSource, 'М.'))).toEqual({
      kind: 'unknown',
    });
  });

  it('не выводит тип при нескольких типах возврата stdlib-функции', () => {
    const source = 'А = ПолучитьПеременнуюСреды("X");\nА.';
    expect(inferMemberType(analyze(source), positionAfter(source, 'А.'))).toEqual({ kind: 'unknown' });
  });
});

describe('hover (US3)', () => {
  it('на stdlib-функции показывает сигнатуру и описание из справочника', () => {
    const source = 'Сообщить("Привет");';
    const hover = hoverAt(analyze(source), positionAt(source, 'Сообщить'));
    const text = markdown(hover);

    expect(text).toContain('Сообщить');
    expect(text).toContain('Текст?: Любое');
    expect(text).toContain('Выводит текст');
    expect(hover?.range).toEqual({
      start: { line: 0, character: 0 },
      end: { line: 0, character: 8 },
    });
  });

  it('на типе stdlib показывает имя и пометку типа', () => {
    const source = 'М = Новый Массив;';
    const text = markdown(hoverAt(analyze(source), positionAt(source, 'Массив')));
    expect(text).toContain('Массив');
    expect(text).toContain('Тип');
  });

  it('на локальном методе, параметре и переменной показывает локальный символ', () => {
    const source = 'Процедура Обработать(Параметр)\n  Перем Значение;\n  Значение = 1;\nКонецПроцедуры\n';

    const methodText = markdown(hoverAt(analyze(source), positionAt(source, 'Обработать')));
    expect(methodText).toContain('Обработать');
    expect(methodText).toContain('Параметр');
    expect(methodText).toContain('Процедура');

    const paramText = markdown(hoverAt(analyze(source), positionAt(source, 'Параметр')));
    expect(paramText).toContain('Параметр');

    const variableText = markdown(hoverAt(analyze(source), positionAt(source, 'Значение')));
    expect(variableText).toContain('Значение');
  });

  it('поясняет контекстные слова «Асинх» и «Ждать»', () => {
    const source = 'Асинх Функция Загрузить()\n  Ждать Приостановить(1);\nКонецФункции\n';
    const analysis = analyze(source);
    expect(markdown(hoverAt(analysis, positionAt(source, 'Асинх')))).toContain('Асинх');
    expect(markdown(hoverAt(analysis, positionAt(source, 'Ждать')))).toContain('Ждать');
  });

  it('на методе и свойстве stdlib показывает описание', () => {
    const methodSource = 'С = Новый СписокЗначений;\nС.Добавить(1);';
    const methodText = markdown(hoverAt(analyze(methodSource), positionAt(methodSource, 'Добавить')));
    expect(methodText).toContain('Добавить');
    expect(methodText).toContain('Добавляет');

    const propertySource = 'С = Новый СписокЗначений;\nС.ТипЗначения';
    const propertyText = markdown(hoverAt(analyze(propertySource), positionAt(propertySource, 'ТипЗначения')));
    expect(propertyText).toContain('ТипЗначения');
    expect(propertyText).toContain('описание типов');
  });

  it('в строке и комментарии hover отсутствует', () => {
    const stringSource = 'Сообщить("Сооб");';
    expect(hoverAt(analyze(stringSource), positionAfter(stringSource, '"Сооб'))).toBeNull();

    const commentSource = '// Сообщить';
    expect(hoverAt(analyze(commentSource), positionAt(commentSource, '// Сообщить'))).toBeNull();
  });
});
