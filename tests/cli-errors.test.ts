import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from '../src/node/cli';
import type { CliIo } from '../src/node/cli';

interface CapturedIo {
  io: CliIo;
  out: string[];
  err: string[];
}

function makeIo(stdin?: () => Promise<string>): CapturedIo {
  const out: string[] = [];
  const err: string[] = [];
  const io: CliIo = {
    out: (text) => out.push(text),
    err: (text) => err.push(text),
    ...(stdin === undefined ? {} : { stdin }),
  };
  return { io, out, err };
}

const tempDirs: string[] = [];

function makeTempDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'osjs-cli-'));
  tempDirs.push(dir);
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  return dir;
}

describe('CLI: ошибки исполнения (US1)', () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('печатает модуль:строку, описание и стек; код возврата 1', async () => {
    const dir = makeTempDir({
      'bad.osjs': [
        'Процедура Внутренняя()',
        '  Результат = 1 / 0;',
        'КонецПроцедуры',
        '',
        'Внутренняя();',
      ].join('\n'),
    });
    const file = join(dir, 'bad.osjs');
    const { io, err, out } = makeIo();

    const code = await runCli([file], io);

    expect(code).toBe(1);
    expect(out).toEqual([]);
    const stderr = err.join('\n');
    expect(stderr).toContain(`${file}:2: Деление на ноль`);
    expect(stderr).toContain('Стек вызовов:');
    expect(stderr).toContain('Внутренняя');
    expect(stderr).toContain(`<модуль> (${file}:5)`);
  });

  it('скрипт из stdin получает модуль <stdin>', async () => {
    const { io, err } = makeIo(async () => 'А = 1 / 0;');

    const code = await runCli([], io);

    expect(code).toBe(1);
    expect(err.join('\n')).toContain('<stdin>:1: Деление на ноль');
  });

  it('ошибка в импортированном модуле показывает путь модуля', async () => {
    const dir = makeTempDir({
      'main.osjs': '#Использовать "lib.osjs"\n\nlib.Вызвать();\n',
      'lib.osjs': 'Процедура Вызвать() Экспорт\n  А = 1 / 0;\nКонецПроцедуры\n',
    });
    const main = join(dir, 'main.osjs');
    const lib = join(dir, 'lib.osjs');
    const { io, err } = makeIo();

    const code = await runCli([main], io);

    expect(code).toBe(1);
    const stderr = err.join('\n');
    expect(stderr).toContain(`${lib}:2: Деление на ноль`);
    expect(stderr).toContain(`(${main}:3)`);
  });

  it('успешный скрипт — код 0, stderr пуст', async () => {
    const dir = makeTempDir({ 'ok.osjs': 'А = 1 + 2;' });
    const { io, err } = makeIo();

    expect(await runCli([join(dir, 'ok.osjs')], io)).toBe(0);
    expect(err).toEqual([]);
  });

  it('--help и --version не меняются', async () => {
    const help = makeIo();
    expect(await runCli(['--help'], help.io)).toBe(0);
    expect(help.out.join('\n')).toContain('oscript');

    const version = makeIo();
    expect(await runCli(['-v'], version.io)).toBe(0);
    expect(version.out.join('\n')).not.toBe('');
  });

  it('без файла и без stdin — справка и код 2', async () => {
    const { io, err } = makeIo();
    expect(await runCli([], io)).toBe(2);
    expect(err.join('\n')).toContain('Использование');
  });
});
