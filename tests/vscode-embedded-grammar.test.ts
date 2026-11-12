import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  embeddedGrammarPath,
  scopesAt,
  tokenizeHtml,
  type HtmlTokenLine,
} from './helpers/textmate-vscode';

const fixture = readFileSync(new URL('./fixtures/vscode/embedded.html', import.meta.url), 'utf8').replace(
  /\r\n/g,
  '\n',
);
const lines = fixture.split('\n');
const tokenized = tokenizeHtml(lines);

/** Все scopes токена, содержащего `needle` в 1-based строке `line`. */
function scopesAtText(line: number, needle: string, occurrence = 0): readonly string[] {
  const text = lines[line - 1] ?? '';
  let index = -1;
  for (let n = 0; n <= occurrence; n++) index = text.indexOf(needle, index + 1);
  expect(index, `«${needle}» не найдено в строке ${line}`).toBeGreaterThanOrEqual(0);
  return scopesAt(tokenized[line - 1]!, index);
}

/** Есть ли на 1-based строке хоть один BSL-токен/регион (для негативных проверок). */
function hasOsjsScope(line: number): boolean {
  return (tokenized[line - 1]?.tokens ?? []).some((token) =>
    token.scopes.some((scope) => scope.endsWith('.osjs') || scope === 'meta.embedded.block.osjs'),
  );
}

function tokenizeSnippet(text: readonly string[]): HtmlTokenLine[] {
  return tokenizeHtml(text);
}

describe('инъекция text/osjs в text.html.basic (грамматический спайк)', () => {
  describe('содержимое text/osjs-блока — BSL', () => {
    it('каждый токен блока размечен meta.embedded.block.osjs', () => {
      for (const line of [10, 11, 12, 13, 14, 15, 16, 17, 18]) {
        expect(hasOsjsScope(line), `строка ${line}`).toBe(true);
      }
    });

    it.each<[number, string, string, string]>([
      [10, '//', 'comment.line.double-slash.osjs', 'комментарий //'],
      [11, '#Область', 'keyword.other.section.osjs', 'директива #Область'],
      [11, 'Демонстрация', 'entity.name.section.osjs', 'имя области'],
      [12, 'Процедура', 'storage.type.osjs', 'Процедура'],
      [12, 'Тест', 'entity.name.function.osjs', 'имя процедуры'],
      [12, 'Знач', 'storage.modifier.osjs', 'Знач'],
      [12, 'Параметр', 'variable.parameter.osjs', 'параметр'],
      [13, '(', 'punctuation.bracket.begin.osjs', 'скобка'],
      [13, 'Привет', 'string.quoted.double.osjs', 'строка'],
      [14, 'Если', 'keyword.control.conditional.osjs', 'Если'],
      [14, '>', 'keyword.operator.comparison.osjs', 'сравнение >'],
      [14, '10', 'constant.numeric.osjs', 'число'],
      [14, 'Тогда', 'keyword.control.conditional.osjs', 'Тогда'],
      [16, 'КонецЕсли', 'keyword.control.conditional.osjs', 'КонецЕсли'],
      [18, '#КонецОбласти', 'keyword.other.section.osjs', 'конец области'],
      [28, 'Перем', 'storage.type.var.osjs', 'Перем (блок в верхнем регистре)'],
      [28, 'Счётчик', 'variable.osjs', 'переменная'],
      [29, 'Счётчик', 'variable.assignment.osjs', 'присваивание'],
      [29, '=', 'keyword.operator.assignment.osjs', 'оператор ='],
      [29, '1', 'constant.numeric.osjs', 'число в присваивании'],
    ])('строка %i: %s → %s (%s)', (line, needle, scope) => {
      expect(scopesAtText(line, needle)).toContain(scope);
    });

    it('многострочные конструкции продолжаются через строки', () => {
      expect(scopesAtText(13, 'Сообщить')).toContain('meta.embedded.block.osjs');
      expect(scopesAtText(13, 'Привет')).toContain('string.quoted.double.osjs');
      expect(scopesAtText(17, 'КонецПроцедуры')).toContain('storage.type.osjs');
    });
  });

  describe('HTML вне и вокруг блоков не меняется', () => {
    it('открывающий тег блока остаётся HTML-тегом', () => {
      expect(scopesAtText(9, '<')).toContain('meta.tag.metadata.script.start.html');
      expect(scopesAtText(9, '<')).toContain('punctuation.definition.tag.begin.html');
      expect(scopesAtText(9, 'script')).toContain('entity.name.tag.html');
      expect(scopesAtText(9, 'type')).toContain('entity.other.attribute-name.html');
      expect(scopesAtText(9, 'text/osjs')).toContain('string.quoted.double.html');
      expect(scopesAtText(9, '>')).toContain('punctuation.definition.tag.end.html');
      expect(hasOsjsScope(9)).toBe(false);
    });

    it.each<[number, string, string, string]>([
      [8, 'h1', 'meta.tag.structure.h1.start.html', 'заголовок'],
      [24, 'p', 'meta.tag.structure.p.start.html', 'параграф'],
      [31, 'pre', 'meta.tag.structure.pre.start.html', 'pre'],
      [32, 'body', 'meta.tag.structure.body.end.html', 'закрывающий body'],
      [33, 'html', 'meta.tag.structure.html.end.html', 'закрывающий html'],
    ])('строка %i: <%s> — базовые HTML-scopes (%s)', (line, needle, scope) => {
      expect(scopesAtText(line, needle)).toContain(scope);
      expect(hasOsjsScope(line)).toBe(false);
    });
  });

  describe('другие script и HTML-комментарии не затрагиваются', () => {
    it('text/javascript — JS-scopes, без BSL', () => {
      expect(scopesAtText(21, 'const')).toContain('source.js');
      expect(scopesAtText(22, 'console')).toContain('source.js');
      expect(hasOsjsScope(21)).toBe(false);
      expect(hasOsjsScope(22)).toBe(false);
    });

    it.each<[string, string[], string]>([
      ['text/javascript', ['<script type="text/javascript">', '  const x = 1;', '</script>'], 'const'],
      ['module', ['<script type="module">', '  export const x = 1;', '</script>'], 'export'],
      ['пустой type', ['<script type="">', '  var x = 1;', '</script>'], 'var'],
      ['без type', ['<script>', '  var x = 1;', '</script>'], 'var'],
      ['другой неизвестный type', ['<script type="application/json">', '  {"a":1}', '</script>'], '{'],
    ])('%s: содержимое не получает BSL', (_name, snippet, needle) => {
      const result = tokenizeSnippet(snippet);
      const text = snippet[1]!;
      const column = text.indexOf(needle);
      expect(column).toBeGreaterThanOrEqual(0);
      const scopes = scopesAt(result[1]!, column);
      expect(scopes).toContain('meta.embedded.block.html');
      expect(scopes.some((scope) => scope.endsWith('.osjs'))).toBe(false);
      expect(scopes).not.toContain('meta.embedded.block.osjs');
    });

    it('блок внутри HTML-комментария не активирует инъекцию', () => {
      expect(scopesAtText(25, '<!--')).toContain('comment.block.html');
      const inner = scopesAtText(25, '<script');
      expect(inner).toContain('comment.block.html');
      expect(inner).not.toContain('meta.embedded.block.osjs');
      expect(inner.some((scope) => scope.endsWith('.osjs'))).toBe(false);
      expect(hasOsjsScope(25)).toBe(false);
    });

    it('text/osjs-подобная строка внутри JS не активирует инъекцию', () => {
      const snippet = ['<script type="text/javascript">', '  const tpl = \'<script type="text/osjs">\';', '</script>'];
      const result = tokenizeSnippet(snippet);
      const column = snippet[1]!.indexOf('<script');
      const scopes = scopesAt(result[1]!, column);
      expect(scopes).toContain('source.js');
      expect(scopes).not.toContain('meta.embedded.block.osjs');
    });
  });

  describe('варианты записи блока', () => {
    it('inline-блок на одной строке получает BSL', () => {
      expect(scopesAtText(26, 'Сообщить')).toContain('meta.embedded.block.osjs');
      expect(scopesAtText(26, 'inline')).toContain('string.quoted.double.osjs');
      expect(scopesAtText(26, '(')).toContain('punctuation.bracket.begin.osjs');
      expect(scopesAtText(26, '>')).toContain('punctuation.definition.tag.end.html');
    });

    it('тег и type в верхнем регистре распознаются', () => {
      expect(scopesAtText(27, 'TYPE')).toContain('entity.other.attribute-name.html');
      expect(scopesAtText(28, 'Перем')).toContain('storage.type.var.osjs');
      expect(scopesAtText(29, '=')).toContain('keyword.operator.assignment.osjs');
    });

    it('несколько блоков в одном документе обрабатываются независимо', () => {
      for (const line of [10, 11, 12, 13, 14, 15, 16, 17, 18, 26, 28, 29]) {
        expect(hasOsjsScope(line), `строка ${line}`).toBe(true);
      }
      for (const line of [21, 22, 25, 31, 32, 33]) {
        expect(hasOsjsScope(line), `строка ${line}`).toBe(false);
      }
    });

    it('незакрытый блок остаётся BSL до конца файла', () => {
      const snippet = ['<script type="text/osjs">', '  Перем Незакрытый;', '  Если Истина Тогда'];
      const result = tokenizeSnippet(snippet);
      expect(scopesAt(result[1]!, snippet[1]!.indexOf('Перем'))).toContain('storage.type.var.osjs');
      const last = scopesAt(result[2]!, snippet[2]!.indexOf('Если'));
      expect(last).toContain('meta.embedded.block.osjs');
      expect(last).toContain('keyword.control.conditional.osjs');
    });

    it('пробелы вокруг = в type не мешают распознаванию', () => {
      const snippet = ['<script type = "text/osjs">', '  Перем Икс;', '</script>'];
      const result = tokenizeSnippet(snippet);
      expect(scopesAt(result[1]!, snippet[1]!.indexOf('Перем'))).toContain('storage.type.var.osjs');
    });

    it('дополнительные атрибуты до/после type не мешают распознаванию', () => {
      const snippet = ['<script data-x="1" type="text/osjs" defer>', '  Перем Икс;', '</script>'];
      const result = tokenizeSnippet(snippet);
      expect(scopesAt(result[1]!, snippet[1]!.indexOf('Перем'))).toContain('storage.type.var.osjs');
    });
  });

  describe('контракт файла инъекционной грамматики', () => {
    const grammar = JSON.parse(readFileSync(embeddedGrammarPath, 'utf8')) as {
      scopeName?: string;
      injectionSelector?: string;
      patterns?: Array<{
        begin?: string;
        end?: string;
        contentName?: string;
        patterns?: Array<{ include?: string }>;
      }>;
      repository?: unknown;
      fileTypes?: unknown;
    };

    it('объявляет уникальный scopeName, селектор и contentName', () => {
      expect(grammar.scopeName).toBe('osjs.embedded.injection');
      expect(grammar.injectionSelector).toBe(
        'L:text.html.basic - (comment.block, meta.embedded)',
      );
      expect(grammar.patterns).toHaveLength(1);
      expect(grammar.patterns?.[0]?.contentName).toBe('meta.embedded.block.osjs');
    });

    it('begin — script с type text/osjs, end — </script>', () => {
      const rule = grammar.patterns?.[0];
      expect(rule?.begin).toContain('<');
      expect(rule?.begin).toContain('script');
      expect(rule?.begin).toContain('type');
      expect(rule?.begin).toContain('text/osjs');
      expect(rule?.end).toContain('</');
      expect(rule?.end).toContain('script');
    });

    it('включает source.osjs и не копирует правила BSL', () => {
      const includes = JSON.stringify(grammar).match(/"include":"[^"]+"/g) ?? [];
      expect(includes.some((item) => item.includes('source.osjs'))).toBe(true);
      const serialized = JSON.stringify(grammar);
      expect(serialized).not.toMatch(/"(keyword|string|storage|constant|comment|entity|variable)\.[^"]*\.osjs"/);
      expect(serialized).not.toContain('#basic');
      expect(serialized).not.toContain('#miscellaneous');
    });

    it('не заявляет .html своим языком и не задаёт fileTypes', () => {
      expect(grammar.fileTypes).toBeUndefined();
      expect(JSON.stringify(grammar)).not.toContain('"language"');
    });
  });
});
