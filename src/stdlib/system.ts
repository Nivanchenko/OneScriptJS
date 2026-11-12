import type { BslObject } from '../runtime/object';
import { isBslObject } from '../runtime/object';
import type { GlobalContext } from '../runtime/context';
import { BslEnumValue } from '../runtime/enum';
import type { Value } from '../runtime/values';
import { toNumber, toStringValue } from '../runtime/values';
import { BslMap } from './collections/map';
import { BslArray } from './collections/array';

/**
 * Доступ к системному окружению без импорта `node:*` (чтобы не ломать браузерную сборку).
 * В Node используется глобальный `process`, в браузере — безопасные заглушки.
 */
interface NodeProcess {
  env: Record<string, string | undefined>;
  platform: string;
  arch: string;
  argv: string[];
  pid: number;
  uptime: () => number;
}

function getProcess(): NodeProcess | undefined {
  return (globalThis as { process?: NodeProcess }).process;
}

function env(): Record<string, string | undefined> {
  return getProcess()?.env ?? {};
}

function platformName(): 'win32' | 'darwin' | 'linux' | 'unknown' {
  const p = getProcess()?.platform;
  if (p === 'win32' || p === 'darwin' || p === 'linux') return p;
  return 'unknown';
}

function is64Bit(): boolean {
  const arch = getProcess()?.arch;
  if (arch) return arch === 'x64' || arch === 'arm64' || arch === 'ppc64' || arch === 's390x';
  const nav = (globalThis as { navigator?: { userAgent?: string } }).navigator;
  return /WOW64|Win64|x64|arm64/i.test(nav?.userAgent ?? '');
}

function platformType(): string {
  const p = platformName();
  const x64 = is64Bit();
  switch (p) {
    case 'win32':
      return x64 ? 'Windows_x86_64' : 'Windows_x86';
    case 'darwin':
      return x64 ? 'MacOS_x86_64' : 'MacOS_x86';
    case 'linux':
      return x64 ? 'Linux_x86_64' : 'Linux_x86';
    default:
      return 'Unknown';
  }
}

function userHome(): string {
  const e = env();
  return e['HOME'] ?? e['USERPROFILE'] ?? '';
}

function userName(): string {
  const e = env();
  return e['USER'] ?? e['USERNAME'] ?? '';
}

function joinPath(...parts: string[]): string {
  const sep = platformName() === 'win32' ? '\\' : '/';
  return parts.filter((p) => p !== '').join(sep);
}

/** Путь специальной папки по имени значения `СпециальнаяПапка`. */
function specialFolderPath(folder: string): string {
  const home = userHome();
  const e = env();
  const appData = e['APPDATA'];
  const localAppData = e['LOCALAPPDATA'];
  switch (folder) {
    case 'МоиДокументы':
      return appData ? joinPath(home, 'Documents') : joinPath(home, 'Documents');
    case 'ДанныеПриложений':
      return appData ?? joinPath(home, '.config');
    case 'ЛокальныйКаталогДанныхПриложений':
      return localAppData ?? joinPath(home, '.local', 'share');
    case 'РабочийСтол':
    case 'КаталогРабочийСтол':
      return joinPath(home, 'Desktop');
    case 'МояМузыка':
      return joinPath(home, 'Music');
    case 'МоиРисунки':
      return joinPath(home, 'Pictures');
    case 'Шаблоны':
    case 'ОбщиеШаблоны':
      return joinPath(home, 'Templates');
    case 'МоиВидеозаписи':
      return joinPath(home, 'Videos');
    case 'ПрофильПользователя':
      return home;
    case 'ОбщийКаталогДанныхПриложения':
      return platformName() === 'win32' ? (e['ProgramData'] ?? 'C:\\ProgramData') : '/usr/share';
    default:
      return home;
  }
}

/** `СистемнаяИнформация` — сведения о системе и окружении. */
export class BslSystemInfo implements BslObject {
  readonly typeName = 'СистемнаяИнформация';

  getProp(name: string): Value {
    switch (name.toLowerCase()) {
      case 'имякомпьютера':
      case 'machinename':
        return env()['COMPUTERNAME'] ?? env()['HOSTNAME'] ?? '';
      case 'версияос':
      case 'osversion':
        return `${platformName()} ${getProcess()?.arch ?? ''}`.trim();
      case 'полнаякоманднаястрока':
      case 'fullcommandline':
        return (getProcess()?.argv ?? []).join(' ');
      case 'имяядра':
      case 'kernelname':
        switch (platformName()) {
          case 'win32':
            return 'WindowsNT';
          case 'darwin':
            return 'Darwin';
          case 'linux':
            return 'Linux';
          default:
            return 'Unknown';
        }
      case 'версия':
      case 'version':
        return '0.1.1';
      case 'типплатформы':
      case 'platformtype':
        return new BslEnumValue('ТипПлатформы', platformType());
      case 'пользовательос':
      case 'osuser':
        return userName();
      case 'это64битнаяоперационнаясистема':
        return is64Bit();
      case 'количествопроцессоров':
      case 'processorcount': {
        const hw = (globalThis as { navigator?: { hardwareConcurrency?: number } }).navigator?.hardwareConcurrency;
        return hw ?? toNumber(env()['NUMBER_OF_PROCESSORS'] ?? 1);
      }
      case 'размерсистемнойстраницы':
      case 'systempagesize':
        return 4096;
      case 'времяработысмоментазагрузки':
      case 'tickcount': {
        const proc = getProcess();
        return proc ? Math.round(proc.uptime() * 1000) : Math.round(performance.now());
      }
      case 'именалогическихдисков': {
        const arr = new BslArray([]);
        if (platformName() === 'win32') {
          for (const d of ['C:\\', 'D:\\']) arr.callMethod('Добавить', [d]);
        } else {
          arr.callMethod('Добавить', ['/']);
        }
        return arr;
      }
      default:
        throw new Error(`Свойство '${name}' не найдено у типа СистемнаяИнформация`);
    }
  }

  setProp(name: string): void {
    throw new Error(`Свойство '${name}' недоступно для записи`);
  }

  getIndex(): Value {
    throw new Error('Индексация недоступна для типа СистемнаяИнформация');
  }

  setIndex(): void {
    throw new Error('Индексация недоступна для типа СистемнаяИнформация');
  }

  callMethod(name: string, args: Value[]): Value {
    switch (name.toLowerCase()) {
      case 'получитьпутьпапки':
      case 'getfolderpath': {
        const folder = args[0];
        if (!(isBslObject(folder) && folder instanceof BslEnumValue)) throw new Error('Неверный тип аргумента');
        return specialFolderPath(folder.name);
      }
      case 'переменныесреды':
      case 'environmentvariables':
        return environmentVariables();
      case 'получитьпеременнуюсреды':
      case 'getenvironmentvariable':
        return getEnvironmentVariable(String(args[0] ?? ''));
      case 'установитьпеременнуюсреды':
      case 'setenvironmentvariable':
        setEnvironmentVariable(String(args[0] ?? ''), args[1]);
        return undefined;
      default:
        throw new Error(`Метод '${name}' не найден у типа СистемнаяИнформация`);
    }
  }
}

function environmentVariables(): BslMap {
  const map = new BslMap([]);
  for (const [k, v] of Object.entries(env())) {
    if (v !== undefined) map.callMethod('Вставить', [k, v]);
  }
  return map;
}

function getEnvironmentVariable(name: string): Value {
  const value = env()[name];
  return value === undefined ? undefined : value;
}

function setEnvironmentVariable(name: string, value: Value): void {
  const proc = getProcess();
  if (!proc) return; // в браузере переменных среды нет
  if (value === undefined || value === null) delete proc.env[name];
  else proc.env[name] = toStringValue(value);
}

/** Регистрирует `СистемнаяИнформация` и функции работы с переменными среды. */
export function registerSystemFunctions(ctx: GlobalContext): void {
  ctx.registerType('СистемнаяИнформация', () => new BslSystemInfo());
  ctx.registerType('SystemInfo', () => new BslSystemInfo());

  ctx.registerAlias('ПеременныеСреды', 'EnvironmentVariables', () => environmentVariables());
  ctx.registerAlias('ПолучитьПеременнуюСреды', 'GetEnvironmentVariable', (args) =>
    getEnvironmentVariable(String(args[0] ?? '')),
  );
  ctx.registerAlias('УстановитьПеременнуюСреды', 'SetEnvironmentVariable', (args) => {
    setEnvironmentVariable(String(args[0] ?? ''), args[1]);
    return undefined;
  });
}
