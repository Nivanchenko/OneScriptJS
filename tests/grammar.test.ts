import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as languageKeywords from '../src/parser/keywords';
import { scopeAt, tokenizeLines } from './helpers/textmate';

const readJson = (relative: string): unknown =>
  JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8').replace(/^\uFEFF/, ''));

interface GrammarPattern {
  name?: string;
  match?: string;
  begin?: string;
  include?: string;
  patterns?: GrammarPattern[];
  beginCaptures?: Record<string, { name?: string }>;
  endCaptures?: Record<string, { name?: string }>;
}

interface Grammar {
  displayName?: string;
  name?: string;
  scopeName?: string;
  fileTypes?: string[];
  uuid?: string;
  patterns: GrammarPattern[];
  repository: Record<string, { patterns: GrammarPattern[] }>;
}

interface LanguageConfiguration {
  comments?: { lineComment?: string; blockComment?: [string, string] };
  brackets?: string[][];
  autoClosingPairs?: Array<{ open: string; close: string; notIn?: string[] }>;
  surroundingPairs?: string[][];
  folding?: { markers?: { start?: string; end?: string } };
  wordPattern?: string;
}

const grammar = readJson('../editors/osjs/osjs.tmLanguage.json') as Grammar;
const configuration = readJson('../editors/osjs/language-configuration.json') as LanguageConfiguration;
const languages = readJson('../editors/osjs/languages.json') as {
  schemaVersion?: number;
  languages: Array<Record<string, unknown>>;
};

const fixture = readFileSync(new URL('./fixtures/osjs/grammar.osjs', import.meta.url), 'utf8').replace(
  /\r\n/g,
  '\n',
);
const fixtureLines = fixture.split('\n');
const tokenized = tokenizeLines(fixtureLines);

/** Собирает все scope-имена из паттернов грамматики (без корневых метаданных). */
function collectScopes(node: unknown): string[] {
  if (node === null || typeof node !== 'object') return [];
  const scopes: string[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (key === 'name' && typeof value === 'string') scopes.push(value);
    else if (key !== 'displayName') scopes.push(...collectScopes(value));
  }
  return scopes;
}

const scopes = collectScopes({ patterns: grammar.patterns, repository: grammar.repository });

function collectIncludes(node: unknown): string[] {
  if (node === null || typeof node !== 'object') return [];
  const includes: string[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (key === 'include' && typeof value === 'string') includes.push(value);
    else includes.push(...collectIncludes(value));
  }
  return includes;
}

describe('TextMate-грамматика .osjs', () => {
  describe('метаданные (контракт language-artifacts)', () => {
    it('объявляет root scope source.osjs, osjs и только .osjs', () => {
      expect(grammar.scopeName).toBe('source.osjs');
      expect(grammar.name).toBe('osjs');
      expect(grammar.displayName).toBe('osjs');
      expect(grammar.fileTypes).toEqual(['osjs']);
      expect(grammar.fileTypes).not.toContain('bsl');
      expect(grammar.fileTypes).not.toContain('os');
      expect(Object.hasOwn(grammar, 'uuid')).toBe(false);
    });

    it('не оставляет чужих scope-суффиксов и платформенных support.*', () => {
      expect(scopes.length).toBeGreaterThan(20);
      for (const scope of scopes) {
        expect(scope, scope).toMatch(/\.osjs$/);
        expect(scope, scope).not.toContain('.bsl');
        expect(scope, scope).not.toContain('.sdbl');
        expect(scope, scope).not.toMatch(/\bsupport\./);
      }
      expect(scopes).toContain('storage.modifier.async.osjs');
      expect(scopes).toContain('keyword.operator.word.await.osjs');
      expect(scopes).toContain('keyword.other.new.osjs');
    });

    it('не содержит висячих #include', () => {
      const includes = collectIncludes(grammar);
      expect(includes.length).toBeGreaterThan(0);
      for (const include of includes) {
        expect(include, include).toMatch(/^#/);
        expect(grammar.repository, include).toHaveProperty(include.slice(1));
      }
    });

    it('не содержит SDBL, неподдерживаемых директив и спец-аннотаций платформы', () => {
      expect(grammar.repository).not.toHaveProperty('query');
      const text = JSON.stringify(grammar);
      expect(text).not.toContain('#query');
      expect(text).not.toContain('source.sdbl');
      for (const forbidden of [
        '#native',
        '#stack',
        '#Вставка',
        '#КонецВставки',
        '#Удаление',
        '#КонецУдаления',
        '&НаКлиенте',
        '&НаСервере',
      ]) {
        expect(text, forbidden).not.toContain(forbidden);
      }
      const stringRule = grammar.repository.basic?.patterns.find(
        (p) => p.name === 'string.quoted.double.osjs',
      );
      expect(stringRule?.patterns ?? []).not.toContainEqual(
        expect.objectContaining({ name: 'comment.line.double-slash.osjs' }),
      );
    });

    it('ставит диалект до meta.var-single-variable и добавляет ключевые слова движка', () => {
      const patterns = grammar.patterns;
      const indexOf = (name: string) => patterns.findIndex((p) => p.name === name);
      expect(indexOf('storage.modifier.async.osjs')).toBeGreaterThan(0);
      expect(indexOf('storage.modifier.async.osjs')).toBeLessThan(
        indexOf('meta.var-single-variable.osjs'),
      );
      expect(indexOf('keyword.operator.word.await.osjs')).toBeLessThan(
        indexOf('meta.var-single-variable.osjs'),
      );
      const keywordText = patterns.map((p) => p.match ?? '').join('\n');
      for (const word of [
        'Перейти|Goto',
        'Выполнить|Execute',
        'ДобавитьОбработчик|AddHandler',
        'УдалитьОбработчик|RemoveHandler',
      ]) {
        expect(keywordText, word).toContain(word);
      }
    });
  });

  describe('scope на фикстуре', () => {
    const cases: Array<{ line: number; column: number; scope: string; note: string }> = [
      { line: 1, column: 3, scope: 'comment.line.double-slash.osjs', note: 'комментарий //' },
      { line: 2, column: 0, scope: 'keyword.other.section.osjs', note: '#Область' },
      { line: 2, column: 9, scope: 'entity.name.section.osjs', note: 'имя области' },
      { line: 3, column: 0, scope: 'keyword.other.preprocessor.osjs', note: '#Если' },
      { line: 4, column: 0, scope: 'keyword.control.import.osjs', note: '#Использовать' },
      { line: 6, column: 0, scope: 'storage.type.annotation.osjs', note: '&Аннотация' },
      { line: 7, column: 0, scope: 'storage.modifier.async.osjs', note: 'Асинх' },
      { line: 7, column: 6, scope: 'storage.type.osjs', note: 'Функция' },
      { line: 7, column: 14, scope: 'entity.name.function.osjs', note: 'имя метода' },
      { line: 7, column: 19, scope: 'storage.modifier.osjs', note: 'Знач' },
      { line: 7, column: 24, scope: 'variable.parameter.osjs', note: 'параметр' },
      { line: 7, column: 34, scope: 'storage.modifier.osjs', note: 'Экспорт' },
      { line: 8, column: 4, scope: 'storage.type.var.osjs', note: 'Перем' },
      { line: 8, column: 10, scope: 'variable.osjs', note: 'переменная' },
      { line: 8, column: 17, scope: 'keyword.operator.osjs', note: 'запятая' },
      { line: 9, column: 4, scope: 'keyword.control.conditional.osjs', note: 'Если' },
      { line: 9, column: 20, scope: 'constant.language.osjs', note: 'Истина' },
      { line: 9, column: 27, scope: 'keyword.control.conditional.osjs', note: 'Тогда' },
      { line: 10, column: 16, scope: 'punctuation.bracket.begin.osjs', note: '(' },
      { line: 10, column: 17, scope: 'string.quoted.double.osjs', note: 'строка' },
      { line: 11, column: 4, scope: 'keyword.control.conditional.osjs', note: 'ИначеЕсли' },
      { line: 11, column: 25, scope: 'constant.language.osjs', note: 'Ложь' },
      { line: 12, column: 17, scope: 'string.quoted.double.osjs', note: 'начало многострочной' },
      { line: 13, column: 8, scope: 'string.quoted.double.osjs', note: 'многострочная |' },
      { line: 14, column: 8, scope: 'string.quoted.double.osjs', note: 'конец многострочной' },
      { line: 15, column: 4, scope: 'keyword.control.conditional.osjs', note: 'Иначе' },
      { line: 16, column: 32, scope: 'constant.character.escape.osjs', note: '""' },
      { line: 17, column: 4, scope: 'keyword.control.conditional.osjs', note: 'КонецЕсли' },
      { line: 18, column: 18, scope: 'keyword.operator.logical.osjs', note: 'И' },
      { line: 18, column: 25, scope: 'keyword.operator.logical.osjs', note: 'Или' },
      { line: 18, column: 29, scope: 'keyword.operator.logical.osjs', note: 'Не' },
      { line: 19, column: 18, scope: 'constant.language.osjs', note: 'True' },
      { line: 19, column: 23, scope: 'keyword.operator.logical.osjs', note: 'And' },
      { line: 19, column: 36, scope: 'keyword.operator.logical.osjs', note: 'Not' },
      { line: 20, column: 4, scope: 'keyword.control.repeat.osjs', note: 'Для Каждого' },
      { line: 20, column: 24, scope: 'keyword.control.repeat.osjs', note: 'Из' },
      { line: 20, column: 34, scope: 'keyword.control.repeat.osjs', note: 'Цикл' },
      { line: 21, column: 8, scope: 'keyword.control.repeat.osjs', note: 'Пока' },
      { line: 21, column: 21, scope: 'keyword.operator.comparison.osjs', note: '<' },
      { line: 21, column: 23, scope: 'constant.numeric.osjs', note: '10' },
      { line: 22, column: 30, scope: 'keyword.operator.arithmetic.osjs', note: '+' },
      { line: 22, column: 32, scope: 'constant.numeric.osjs', note: '1' },
      { line: 22, column: 35, scope: 'comment.line.double-slash.osjs', note: 'хвостовой //' },
      { line: 23, column: 8, scope: 'keyword.control.repeat.osjs', note: 'КонецЦикла' },
      { line: 24, column: 8, scope: 'keyword.control.osjs', note: 'Продолжить' },
      { line: 26, column: 4, scope: 'keyword.control.exception.osjs', note: 'Попытка' },
      { line: 27, column: 8, scope: 'keyword.control.exception.osjs', note: 'ВызватьИсключение' },
      { line: 28, column: 4, scope: 'keyword.control.exception.osjs', note: 'Исключение' },
      { line: 29, column: 8, scope: 'keyword.control.osjs', note: 'Выполнить' },
      { line: 30, column: 4, scope: 'keyword.control.exception.osjs', note: 'КонецПопытки' },
      { line: 31, column: 13, scope: 'keyword.other.new.osjs', note: 'Новый' },
      { line: 32, column: 11, scope: 'constant.other.date.osjs', note: 'дата' },
      { line: 33, column: 12, scope: 'constant.numeric.osjs', note: 'число 42.5' },
      { line: 34, column: 12, scope: 'constant.language.osjs', note: 'Неопределено' },
      { line: 35, column: 4, scope: 'keyword.operator.word.await.osjs', note: 'Ждать' },
      { line: 36, column: 4, scope: 'keyword.control.osjs', note: 'ДобавитьОбработчик' },
      { line: 37, column: 4, scope: 'keyword.control.osjs', note: 'УдалитьОбработчик' },
      { line: 38, column: 4, scope: 'keyword.control.osjs', note: 'Goto' },
      { line: 39, column: 4, scope: 'keyword.control.osjs', note: 'Execute' },
      { line: 40, column: 4, scope: 'storage.modifier.async.osjs', note: 'Async' },
      { line: 40, column: 10, scope: 'storage.type.osjs', note: 'Function' },
      { line: 40, column: 27, scope: 'storage.modifier.osjs', note: 'Val' },
      { line: 40, column: 38, scope: 'storage.modifier.osjs', note: 'Export' },
      { line: 41, column: 8, scope: 'keyword.operator.word.await.osjs', note: 'Await' },
      { line: 42, column: 8, scope: 'keyword.control.osjs', note: 'AddHandler' },
      { line: 43, column: 8, scope: 'keyword.control.osjs', note: 'RemoveHandler' },
      { line: 44, column: 4, scope: 'storage.type.osjs', note: 'EndFunction' },
      { line: 45, column: 4, scope: 'keyword.control.osjs', note: 'Перейти' },
      { line: 46, column: 12, scope: 'constant.language.osjs', note: 'Неопределено (EN-ветка)' },
      { line: 47, column: 0, scope: 'storage.type.osjs', note: 'КонецФункции' },
      { line: 49, column: 0, scope: 'storage.type.annotation.osjs', note: '&СПараметрами' },
      { line: 49, column: 14, scope: 'variable.annotation.osjs', note: 'параметр аннотации' },
      { line: 50, column: 0, scope: 'storage.type.osjs', note: 'Процедура' },
      { line: 50, column: 10, scope: 'entity.name.function.osjs', note: 'имя процедуры' },
      { line: 51, column: 0, scope: 'storage.type.osjs', note: 'КонецПроцедуры' },
      { line: 53, column: 0, scope: 'keyword.other.preprocessor.osjs', note: '#Иначе' },
      { line: 54, column: 0, scope: 'keyword.other.preprocessor.osjs', note: '#КонецЕсли' },
      { line: 55, column: 0, scope: 'keyword.other.section.osjs', note: '#КонецОбласти' },
    ];

    it.each(cases)('строка $line, столбец $column — $note', ({ line, column, scope }) => {
      const tokenLine = tokenized[line - 1];
      expect(tokenLine, `нет строки ${line}`).toBeDefined();
      expect(scopeAt(tokenLine!, column)).toBe(scope);
    });

    it('покрывает не менее 20 конструкций FR-002', () => {
      expect(new Set(cases.map((c) => c.note)).size).toBeGreaterThanOrEqual(20);
    });
  });

  describe('languages.json', () => {
    it('описывает только osjs/.osjs и ссылается на существующие артефакты', () => {
      expect(languages.schemaVersion).toBe(1);
      expect(languages.languages).toHaveLength(1);
      const [language] = languages.languages;
      expect(language).toBeDefined();
      expect(language!.id).toBe('osjs');
      expect(language!.aliases).toEqual(expect.arrayContaining(['OneScriptJS', 'OSJS']));
      expect(language!.extensions).toEqual(['.osjs']);
      expect(language!.scopeName).toBe(grammar.scopeName);
      expect(language!.grammar).toBe('osjs.tmLanguage.json');
      expect(language!.configuration).toBe('language-configuration.json');

      const serialized = JSON.stringify(languages);
      expect(serialized).not.toMatch(/"os"\s*[:,]/);
      expect(serialized).not.toMatch(/"bsl"\s*[:,]/);
      for (const path of [language!.grammar, language!.configuration]) {
        expect(existsSync(fileURLToPath(new URL(`../editors/osjs/${String(path)}`, import.meta.url)))).toBe(
          true,
        );
      }
    });
  });

  describe('language-configuration.json', () => {
    it('содержит обязательные поля поведения редактора', () => {
      expect(configuration.comments?.lineComment).toBe('//');
      expect(configuration.brackets).toEqual(
        expect.arrayContaining([
          ['(', ')'],
          ['[', ']'],
        ]),
      );
      expect(configuration.autoClosingPairs).toEqual(
        expect.arrayContaining([
          { open: '(', close: ')' },
          { open: '[', close: ']' },
          { open: '"', close: '"', notIn: ['string', 'comment'] },
        ]),
      );
      expect(configuration.surroundingPairs).toEqual(
        expect.arrayContaining([
          ['(', ')'],
          ['[', ']'],
          ['"', '"'],
        ]),
      );
    });

    it('задаёт ровно одну пару folding.markers на #Область/#Если', () => {
      const markers = configuration.folding?.markers;
      expect(markers).toBeDefined();
      expect(Object.keys(markers!)).toEqual(['start', 'end']);
      const start = new RegExp(markers!.start!);
      const end = new RegExp(markers!.end!);
      expect(start.test('#Область Демонстрация')).toBe(true);
      expect(start.test('#Если Сервер Тогда')).toBe(true);
      expect(end.test('#КонецОбласти')).toBe(true);
      expect(end.test('#КонецЕсли')).toBe(true);
      expect(start.test('// #Область')).toBe(false);
    });

    it('wordPattern — переносимый regex без \\p{L}, матчит кириллицу', () => {
      const wordPattern = configuration.wordPattern;
      expect(wordPattern).toBeDefined();
      expect(wordPattern).not.toContain('\\p{');
      const regex = new RegExp(wordPattern!);
      expect(regex.test('Сообщить')).toBe(true);
      expect(regex.test('Ёлка')).toBe(true);
      expect(regex.test('Данные_1')).toBe(true);
      expect(regex.test('123')).toBe(false);
    });
  });

  describe('анти-drift: наборы KW_*/DIR_* → подсветка', () => {
    // Единый источник — src/parser/keywords.ts (его же используют парсер и препроцессор).
    const sets = new Map<string, Set<string>>(
      Object.entries(languageKeywords)
        .filter(([name, value]) => /^(KW_|DIR_)/.test(name) && value instanceof Set)
        .map(([name, value]) => [name, value as Set<string>]),
    );

    const statementFor = (word: string): string => {
      const lower = word.toLowerCase();
      if (lower === 'перем' || lower === 'var') return `${word} Икс;`;
      if (lower === 'процедура' || lower === 'procedure') return `${word} Тест()`;
      if (lower === 'функция' || lower === 'function') return `${word} Тест()`;
      if (lower === 'знач' || lower === 'val') return `Процедура Тест(${word} Параметр)`;
      if (lower === 'каждого' || lower === 'each') {
        return `Для ${word} Элемент Из Массив Цикл КонецЦикла;`;
      }
      if (lower === 'экспорт' || lower === 'export') return `Перем Икс ${word};`;
      return `${word};`;
    };

    it('наборы читаются из src/parser/keywords.ts', () => {
      expect([...sets.keys()]).toContain('KW_IF');
      expect([...sets.keys()]).toContain('DIR_IF');
      expect(sets.get('KW_IF')?.size).toBeGreaterThan(0);
    });

    it('каждое ключевое слово KW_* получает keyword/storage-scope', () => {
      const failures: string[] = [];
      for (const [name, words] of sets) {
        if (!name.startsWith('KW_')) continue;
        for (const word of words) {
          const line = statementFor(word);
          const column = line.toLowerCase().indexOf(word.toLowerCase());
          const scope = scopeAt(tokenizeLines([line])[0]!, column);
          const highlighted =
            scope !== undefined &&
            (scope.startsWith('keyword.') || scope.startsWith('storage.'));
          if (!highlighted) failures.push(`${name}/${word}: ${line} -> ${scope ?? '<none>'}`);
        }
      }
      expect(failures).toEqual([]);
    });

    it('каждая директива DIR_* получает scope директивы', () => {
      const failures: string[] = [];
      for (const [name, words] of sets) {
        if (!name.startsWith('DIR_')) continue;
        for (const word of words) {
          const line = `#${word};`;
          const scope = scopeAt(tokenizeLines([line])[0]!, 0);
          if (scope === undefined) failures.push(`${name}/${word}: ${line} -> <none>`);
        }
      }
      expect(failures).toEqual([]);
    });
  });
});
