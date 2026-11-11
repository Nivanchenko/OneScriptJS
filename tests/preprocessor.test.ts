import { afterEach, describe, expect, it, vi } from 'vitest';
import { run } from '../src/runtime/runner';
import { createGlobalContext } from '../src/stdlib/global-context';
import { tokenize } from '../src/lexer/lexer';
import { preprocessScript } from '../src/parser/preprocessor';

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

describe('препроцессор', () => {
  afterEach(() => vi.restoreAllMocks());

  it('#Если Истина включает код', () => {
    expect(exec('#Если Истина Тогда\nсообщить("да");\n#КонецЕсли')).toEqual(['да']);
  });

  it('#Если Ложь — берётся Иначе', () => {
    expect(exec('#Если Ложь Тогда\nсообщить("нет");\n#Иначе\nсообщить("да");\n#КонецЕсли')).toEqual(['да']);
  });

  it('#ИначеЕсли выбирает ветку', () => {
    expect(
      exec('#Если Ложь Тогда\nсообщить("1");\n#ИначеЕсли Истина Тогда\nсообщить("2");\n#Иначе\nсообщить("3");\n#КонецЕсли'),
    ).toEqual(['2']);
  });

  it('#Область/#КонецОбласти игнорируются', () => {
    expect(exec('#Область Раздел\nсообщить("работает");\n#КонецОбласти')).toEqual(['работает']);
  });

  it('#Использовать игнорируется', () => {
    expect(exec('#Использовать asserts\nсообщить("работает");')).toEqual(['работает']);
  });

  describe('извлечение импортов', () => {
    const imports = (source: string) => preprocessScript(tokenize(source)).imports;

    it('собирает путь в кавычках и номер строки', () => {
      expect(imports('сообщить("до");\n#Использовать "lib/Модуль.os"')).toEqual([
        { path: 'lib/Модуль.os', line: 2 },
      ]);
    });

    it('понимает английский алиас #Use', () => {
      expect(imports('#Use "lib/Module.os"')).toEqual([{ path: 'lib/Module.os', line: 1 }]);
    });

    it('отбрасывает хвостовой комментарий', () => {
      expect(imports('#Использовать "a.os" // нужен модуль')).toEqual([{ path: 'a.os', line: 1 }]);
    });

    it('поддерживает экранированную кавычку ""', () => {
      expect(imports('#Использовать "a""b.os"')).toEqual([{ path: 'a"b.os', line: 1 }]);
    });

    it('не считает импортом имя без кавычек', () => {
      expect(imports('#Использовать asserts')).toEqual([]);
    });

    it('не собирает директиву в неактивной ветке #Если', () => {
      expect(imports('#Если Ложь Тогда\n#Использовать "a.os"\n#КонецЕсли')).toEqual([]);
    });

    it('собирает директиву в активной ветке #Если', () => {
      expect(imports('#Если Истина Тогда\n#Использовать "a.os"\n#КонецЕсли')).toEqual([
        { path: 'a.os', line: 2 },
      ]);
    });

    it('запрещает пустой путь', () => {
      expect(() => imports('#Использовать ""')).toThrow('Пустой путь в директиве #Использовать');
    });
  });
});
