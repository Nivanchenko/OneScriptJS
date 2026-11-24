import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UrlMap } from '../src/node/debug/url-map';

/**
 * Маппинг URL источника движка ↔ файл рабочей области для браузерного attach.
 * Контракт — specs/021-debugger/data-model.md §4, research F10.
 */

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'osjs-url-map-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function makeFile(relativePath: string, text = 'сообщить("ok");\n'): string {
  const path = join(root, relativePath);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, text);
  return path;
}

describe('UrlMap: URL → файл', () => {
  it('берёт origin+pathname без query/hash и декодирует percent-encoding', () => {
    const file = makeFile('examples/привет.osjs');
    const map = new UrlMap({ webRoot: root });
    const url = 'http://localhost:5173/examples/%D0%BF%D1%80%D0%B8%D0%B2%D0%B5%D1%82.osjs?x=1#y';
    expect(map.toFilePath(url)).toBe(file);
  });

  it('маппит file:// на путь файла', () => {
    const file = makeFile('lib/module.osjs');
    const map = new UrlMap({ webRoot: root });
    expect(map.toFilePath(pathToFileURL(file).href)).toBe(file);
  });

  it('усекает первые сегменты dev-base вида /OneScriptJS/', () => {
    const devRoot = join(root, 'OneScriptJS');
    const file = join(devRoot, 'examples', 'app.osjs');
    mkdirSync(join(devRoot, 'examples'), { recursive: true });
    writeFileSync(file, 'сообщить("dev");\n');
    const map = new UrlMap({ webRoot: devRoot });
    expect(map.toFilePath('http://localhost:5173/OneScriptJS/examples/app.osjs')).toBe(file);
  });

  it('не маппит чужой URL без локального файла: источник виртуальный', () => {
    const map = new UrlMap({ webRoot: root });
    expect(map.toFilePath('https://cdn.example.com/lib/x.osjs')).toBeUndefined();
  });

  it('игнорирует origin: localhost и 127.0.0.1 дают один файл', () => {
    const file = makeFile('examples/app.osjs');
    const map = new UrlMap({ webRoot: root });
    expect(map.toFilePath('http://localhost:5173/examples/app.osjs')).toBe(file);
    expect(map.toFilePath('http://127.0.0.1:4173/examples/app.osjs')).toBe(file);
  });

  it('кэширует результат на сессию (повторный запрос не читает диск)', () => {
    const file = makeFile('examples/app.osjs');
    const map = new UrlMap({ webRoot: root });
    const url = 'http://localhost:5173/examples/app.osjs';
    expect(map.toFilePath(url)).toBe(file);
    unlinkSync(file);
    expect(map.toFilePath(url)).toBe(file);
  });
});

describe('UrlMap: файл → URL', () => {
  it('строит URL от baseURI через path.relative, без ручного кодирования', () => {
    const file = join(root, 'examples', 'app.osjs');
    const map = new UrlMap({ webRoot: root, baseURI: 'http://localhost:5173/' });
    expect(map.toSourceId(file)).toBe('http://localhost:5173/examples/app.osjs');
  });

  it('кодирует кириллицу так же, как URL', () => {
    const file = join(root, 'examples', 'привет.osjs');
    const map = new UrlMap({ webRoot: root, baseURI: 'http://localhost:5173/' });
    expect(map.toSourceId(file)).toBe(
      'http://localhost:5173/examples/%D0%BF%D1%80%D0%B8%D0%B2%D0%B5%D1%82.osjs',
    );
  });

  it('учитывает dev-base в baseURI', () => {
    const file = join(root, 'examples', 'app.osjs');
    const map = new UrlMap({
      webRoot: root,
      baseURI: 'http://localhost:5173/OneScriptJS/',
    });
    expect(map.toSourceId(file)).toBe('http://localhost:5173/OneScriptJS/examples/app.osjs');
  });

  it('файл вне webRoot — не источник страницы', () => {
    const outside = join(tmpdir(), 'osjs-outside.osjs');
    const map = new UrlMap({ webRoot: root, baseURI: 'http://localhost:5173/' });
    expect(map.toSourceId(outside)).toBeUndefined();
  });

  it('без baseURI обратный маппинг недоступен', () => {
    const file = join(root, 'app.osjs');
    const map = new UrlMap({ webRoot: root });
    expect(map.toSourceId(file)).toBeUndefined();
    map.setBaseURI('http://localhost:5173/');
    expect(map.toSourceId(file)).toBe('http://localhost:5173/app.osjs');
  });
});
