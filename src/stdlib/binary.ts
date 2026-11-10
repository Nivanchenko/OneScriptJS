import type { BslObject } from '../runtime/object';
import { isBslObject } from '../runtime/object';
import type { GlobalContext } from '../runtime/context';
import { BslEnumValue } from '../runtime/enum';
import type { Value } from '../runtime/values';
import { toNumber } from '../runtime/values';
import { BslArray } from './collections/array';

// --- утилиты кодирования ---

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function base64ToBytes(str: string): Uint8Array {
  try {
    const bin = atob(str.replace(/\s+/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return new Uint8Array(0);
  }
}

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out.toUpperCase();
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Hex-строка → байты: не-hex символы пропускаются, нечётная длина — ошибка. */
function hexStringToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/[^0-9A-Fa-f]/g, '');
  if (clean.length % 2 === 1) throw new Error('Неверный формат шестнадцатеричной строки');
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  return bytes;
}

/** Hex-байты → байты: не-hex пропускаются, нечётный хвост игнорируется. */
function hexBytesToBytes(hex: Uint8Array): Uint8Array {
  let s = '';
  for (const b of hex) {
    const c = String.fromCharCode(b);
    if (/[0-9A-Fa-f]/.test(c)) s += c;
  }
  const even = s.length - (s.length % 2);
  const bytes = new Uint8Array(even / 2);
  for (let i = 0; i < even; i += 2) bytes[i / 2] = parseInt(s.slice(i, i + 2), 16);
  return bytes;
}

function resolveEncoding(value: Value | undefined): string {
  if (value === undefined || value === null) return 'utf-8';
  if (isBslObject(value) && value instanceof BslEnumValue) {
    switch (value.name) {
      case 'UTF16':
        return 'utf-16le';
      case 'UTF8БезBOM':
      case 'UTF8NoBOM':
      case 'UTF8':
      case 'Системная':
        return 'utf-8';
      case 'ANSI':
        return 'windows-1251';
      case 'OEM':
        return 'cp866';
      default:
        return 'utf-8';
    }
  }
  const s = String(value).toLowerCase();
  switch (s) {
    case 'utf-16':
    case 'utf16':
      return 'utf-16le';
    case 'utf-16le':
      return 'utf-16le';
    case 'utf-16be':
      return 'utf-16be';
    case 'utf-8':
    case 'utf8':
      return 'utf-8';
    case 'windows-1251':
    case 'cp1251':
      return 'windows-1251';
    case 'cp866':
    case 'ibm866':
      return 'cp866';
    default:
      return s;
  }
}

function encode(str: string, value: Value | undefined, addBOM: boolean): Uint8Array {
  const enc = resolveEncoding(value);
  // UTF8БезBOM никогда не добавляет BOM, даже если addBOM=Истина.
  const noBom =
    isBslObject(value) && value instanceof BslEnumValue && (value.name === 'UTF8БезBOM' || value.name === 'UTF8NoBOM');
  if (enc === 'utf-16' || enc === 'utf-16le') {
    const bytes = new Uint8Array(str.length * 2 + (addBOM ? 2 : 0));
    let off = 0;
    if (addBOM) {
      bytes[0] = 0xff;
      bytes[1] = 0xfe;
      off = 2;
    }
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      bytes[off + i * 2] = c & 0xff;
      bytes[off + i * 2 + 1] = (c >> 8) & 0xff;
    }
    return bytes;
  }
  if (enc === 'utf-8') {
    const bytes = new TextEncoder().encode(str);
    return addBOM && !noBom ? concat(new Uint8Array([0xef, 0xbb, 0xbf]), bytes) : bytes;
  }
  // ANSI/OEM и пр.: латиница/ASCII совпадает с кодовой страницей
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i) & 0xff;
  return bytes;
}

function decode(bytes: Uint8Array, value: Value | undefined): string {
  let enc = resolveEncoding(value);
  let start = 0;
  // BOM переопределяет кодировку только для кодировок с преамбулой (UTF-8/16/32).
  const bomCapable = ['utf-8', 'utf-16le', 'utf-16be', 'utf-32', 'utf-32le'].includes(enc);
  if (bomCapable) {
    if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xfe && bytes[2] === 0x00 && bytes[3] === 0x00) {
      enc = 'utf-32le';
      start = 4;
    } else if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      enc = 'utf-8';
      start = 3;
    } else if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
      enc = 'utf-16le';
      start = 2;
    } else if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      enc = 'utf-16be';
      start = 2;
    }
  }
  const slice = bytes.subarray(start);
  if (enc === 'utf-32le' || enc === 'utf-32') {
    let out = '';
    for (let i = 0; i + 3 < slice.length; i += 4) {
      out += String.fromCharCode(slice[i]! | (slice[i + 1]! << 8) | (slice[i + 2]! << 16) | (slice[i + 3]! << 24));
    }
    return out;
  }
  try {
    return new TextDecoder(enc).decode(slice);
  } catch {
    return new TextDecoder('utf-8').decode(slice);
  }
}

// --- типы ---

/** `БуферДвоичныхДанных` — изменяемый буфер байтов. */
export class BslBinaryDataBuffer implements BslObject {
  readonly typeName = 'БуферДвоичныхДанных';
  bytes: Uint8Array;
  private readOnly = false;
  byteOrder: 'LittleEndian' | 'BigEndian' = 'LittleEndian';

  constructor(size: number) {
    this.bytes = new Uint8Array(size);
  }

  static fromBytes(bytes: Uint8Array): BslBinaryDataBuffer {
    const buf = new BslBinaryDataBuffer(0);
    buf.bytes = bytes;
    return buf;
  }

  private ensureWritable(): void {
    if (this.readOnly) throw new Error('Буфер предназначен только для чтения');
  }

  getProp(name: string): Value {
    switch (name.toLowerCase()) {
      case 'размер':
      case 'size':
        return this.bytes.length;
      case 'толькочтение':
      case 'readonly':
        return this.readOnly;
      case 'порядокбайтов':
      case 'byteorder':
        return new BslEnumValue('ПорядокБайтов', this.byteOrder);
      default:
        throw new Error(`Свойство '${name}' не найдено у типа БуферДвоичныхДанных`);
    }
  }

  setProp(name: string, value: Value): void {
    if (name.toLowerCase() === 'порядокбайтов' || name.toLowerCase() === 'byteorder') {
      if (isBslObject(value) && value instanceof BslEnumValue) {
        this.byteOrder = value.name === 'BigEndian' ? 'BigEndian' : 'LittleEndian';
        return;
      }
    }
    throw new Error(`Свойство '${name}' не найдено у типа БуферДвоичныхДанных`);
  }

  getIndex(index: Value): Value {
    return this.bytes[toNumber(index)]!;
  }

  equals(other: BslObject): boolean {
    if (!(other instanceof BslBinaryDataBuffer)) return false;
    return bytesEqual(this.bytes, other.bytes);
  }

  setIndex(index: Value, value: Value): void {
    this.ensureWritable();
    const v = toNumber(value);
    if (v < 0 || v > 255) throw new Error('Неверное значение аргумента');
    this.bytes[toNumber(index)] = v;
  }

  callMethod(name: string, args: Value[]): Value {
    switch (name.toLowerCase()) {
      case 'получить':
      case 'get':
        return this.bytes[toNumber(args[0])]!;
      case 'установить':
      case 'set':
        this.setIndex(args[0]!, args[1]!);
        return undefined;
      case 'записать':
      case 'write': {
        this.ensureWritable();
        const pos = toNumber(args[0]);
        const src = args[1];
        if (!(isBslObject(src) && src instanceof BslBinaryDataBuffer)) throw new Error('Неверный тип аргумента');
        const number = args[2] === undefined ? 0 : toNumber(args[2]);
        const count = number === 0 ? src.bytes.length : number;
        this.bytes.set(src.bytes.subarray(0, count), pos);
        return undefined;
      }
      case 'прочитать':
      case 'read': {
        const pos = toNumber(args[0]);
        const number = toNumber(args[1]);
        return BslBinaryDataBuffer.fromBytes(this.bytes.slice(pos, pos + number));
      }
      case 'перевернуть':
      case 'reverse':
        return BslBinaryDataBuffer.fromBytes(new Uint8Array([...this.bytes].reverse()));
      case 'скопировать':
      case 'copy':
        return BslBinaryDataBuffer.fromBytes(new Uint8Array(this.bytes));
      case 'соединить':
      case 'concat': {
        const arr = args[0];
        if (!(isBslObject(arr) && arr instanceof BslArray)) throw new Error('Неверный тип аргумента');
        let total = 0;
        const parts: Uint8Array[] = [];
        for (const b of arr.iterate()) {
          if (!(isBslObject(b) && b instanceof BslBinaryDataBuffer)) throw new Error('Неверный тип аргумента');
          parts.push(b.bytes);
          total += b.bytes.length;
        }
        const out = new Uint8Array(total);
        let off = 0;
        for (const p of parts) {
          out.set(p, off);
          off += p.length;
        }
        return BslBinaryDataBuffer.fromBytes(out);
      }
      case 'установитьтолькочтение':
      case 'setreadonly':
        this.readOnly = true;
        return undefined;
      case 'записатьцелое16':
      case 'writeint16':
        this.writeInt(args[0]!, args[1]!, 2);
        return undefined;
      case 'записатьцелое32':
      case 'writeint32':
        this.writeInt(args[0]!, args[1]!, 4);
        return undefined;
      case 'записатьцелое64':
      case 'writeint64':
        this.writeInt(args[0]!, args[1]!, 8);
        return undefined;
      case 'прочитатьцелое16':
      case 'readint16':
        return this.readInt(args[0]!, 2);
      case 'прочитатьцелое32':
      case 'readint32':
        return this.readInt(args[0]!, 4);
      case 'прочитатьцелое64':
      case 'readint64':
        return this.readInt(args[0]!, 8);
      case 'записатьпобитовоеи':
      case 'writebitwiseand':
        this.writeBitwise(args[0]!, args[1]!, args[2], (a, b) => a & b);
        return undefined;
      case 'записатьпобитовоеили':
      case 'writebitwiseor':
        this.writeBitwise(args[0]!, args[1]!, args[2], (a, b) => a | b);
        return undefined;
      case 'записатьпобитовоеисключительноеили':
      case 'writebitwisexor':
        this.writeBitwise(args[0]!, args[1]!, args[2], (a, b) => a ^ b);
        return undefined;
      case 'записатьпобитовоеине':
      case 'writebitwiseandnot':
        this.writeBitwise(args[0]!, args[1]!, args[2], (a, b) => a & ~b);
        return undefined;
      default:
        throw new Error(`Метод '${name}' не найден у типа БуферДвоичныхДанных`);
    }
  }

  private writeInt(pos: Value, value: Value, size: number): void {
    this.ensureWritable();
    const p = toNumber(pos);
    const v = toNumber(value);
    const little = this.byteOrder === 'LittleEndian';
    for (let i = 0; i < size; i++) {
      const shift = little ? i * 8 : (size - 1 - i) * 8;
      this.bytes[p + i] = (Math.floor(v / 2 ** shift)) & 0xff;
    }
  }

  private readInt(pos: Value, size: number): number {
    const p = toNumber(pos);
    const little = this.byteOrder === 'LittleEndian';
    let result = 0;
    for (let i = 0; i < size; i++) {
      const shift = little ? i * 8 : (size - 1 - i) * 8;
      result += this.bytes[p + i]! * 2 ** shift;
    }
    return result;
  }

  private writeBitwise(pos: Value, buffer: Value, number: Value | undefined, op: (a: number, b: number) => number): void {
    this.ensureWritable();
    const p = toNumber(pos);
    if (!(isBslObject(buffer) && buffer instanceof BslBinaryDataBuffer)) throw new Error('Неверный тип аргумента');
    const count = number === undefined ? 0 : toNumber(number);
    const n = count === 0 ? buffer.bytes.length : count;
    for (let i = 0; i < n; i++) this.bytes[p + i] = op(this.bytes[p + i]!, buffer.bytes[i]!) & 0xff;
  }
}

/** `ДвоичныеДанные` — неизменяемые двоичные данные. */
export class BslBinaryData implements BslObject {
  readonly typeName = 'ДвоичныеДанные';
  readonly bytes: Uint8Array;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  callMethod(name: string): Value {
    switch (name.toLowerCase()) {
      case 'размер':
      case 'size':
        return this.bytes.length;
      default:
        throw new Error(`Метод '${name}' не найден у типа ДвоичныеДанные`);
    }
  }

  equals(other: BslObject): boolean {
    if (!(other instanceof BslBinaryData)) return false;
    return bytesEqual(this.bytes, other.bytes);
  }

  getProp(name: string): Value {
    throw new Error(`Свойство '${name}' не найдено у типа ДвоичныеДанные`);
  }

  setProp(name: string): void {
    throw new Error(`Свойство '${name}' недоступно для записи`);
  }

  getIndex(): Value {
    throw new Error('Индексация недоступна для типа ДвоичныеДанные');
  }

  setIndex(): void {
    throw new Error('Индексация недоступна для типа ДвоичныеДанные');
  }
}

/** Регистрирует типы и глобальные функции работы с двоичными данными. */
export function registerBinaryFunctions(ctx: GlobalContext): void {
  ctx.registerType('БуферДвоичныхДанных', (args) => new BslBinaryDataBuffer(toNumber(args[0] ?? 0)));
  ctx.registerType('BinaryDataBuffer', (args) => new BslBinaryDataBuffer(toNumber(args[0] ?? 0)));

  const buf = (v: Value): BslBinaryDataBuffer => {
    if (!(isBslObject(v) && v instanceof BslBinaryDataBuffer)) throw new Error('Неверный тип аргумента');
    return v;
  };
  const data = (v: Value): BslBinaryData => {
    if (!(isBslObject(v) && v instanceof BslBinaryData)) throw new Error('Неверный тип аргумента');
    return v;
  };

  ctx.registerAlias('ПолучитьБуферДвоичныхДанныхИзСтроки', 'GetBinaryDataBufferFromString', (args) =>
    BslBinaryDataBuffer.fromBytes(encode(String(args[0] ?? ''), args[1], args[2] === true)),
  );
  ctx.registerAlias('ПолучитьСтрокуИзБуфераДвоичныхДанных', 'GetStringFromBinaryDataBuffer', (args) =>
    decode(buf(args[0]!).bytes, args[1]),
  );
  ctx.registerAlias('ПолучитьДвоичныеДанныеИзСтроки', 'GetBinaryDataFromString', (args) =>
    new BslBinaryData(encode(String(args[0] ?? ''), args[1], args[2] === true)),
  );
  ctx.registerAlias('ПолучитьСтрокуИзДвоичныхДанных', 'GetStringFromBinaryData', (args) =>
    decode(data(args[0]!).bytes, args[1]),
  );

  ctx.registerAlias('ПолучитьБуферДвоичныхДанныхИзHexСтроки', 'GetBinaryDataBufferFromHexString', (args) =>
    BslBinaryDataBuffer.fromBytes(hexStringToBytes(String(args[0] ?? ''))),
  );
  ctx.registerAlias('ПолучитьHexСтрокуИзБуфераДвоичныхДанных', 'GetHexStringFromBinaryDataBuffer', (args) =>
    bytesToHex(buf(args[0]!).bytes),
  );
  ctx.registerAlias('ПолучитьДвоичныеДанныеИзHexСтроки', 'GetBinaryDataFromHexString', (args) =>
    new BslBinaryData(hexStringToBytes(String(args[0] ?? ''))),
  );
  ctx.registerAlias('ПолучитьHexСтрокуИзДвоичныхДанных', 'GetHexStringFromBinaryData', (args) =>
    bytesToHex(data(args[0]!).bytes),
  );

  ctx.registerAlias('ПолучитьБуферДвоичныхДанныхИзBase64Строки', 'GetBinaryDataBufferFromBase64String', (args) =>
    BslBinaryDataBuffer.fromBytes(base64ToBytes(String(args[0] ?? ''))),
  );
  ctx.registerAlias('ПолучитьBase64СтрокуИзБуфераДвоичныхДанных', 'GetBase64StringFromBinaryDataBuffer', (args) =>
    bytesToBase64(buf(args[0]!).bytes),
  );
  ctx.registerAlias('ПолучитьДвоичныеДанныеИзBase64Строки', 'GetBinaryDataFromBase64String', (args) =>
    new BslBinaryData(base64ToBytes(String(args[0] ?? ''))),
  );
  ctx.registerAlias('ПолучитьBase64СтрокуИзДвоичныхДанных', 'GetBase64StringFromBinaryData', (args) =>
    bytesToBase64(data(args[0]!).bytes),
  );

  ctx.registerAlias('ПолучитьБуферДвоичныхДанныхИзHexБуфераДвоичныхДанных', 'GetBinaryDataBufferFromHexBinaryDataBuffer', (args) =>
    BslBinaryDataBuffer.fromBytes(hexBytesToBytes(buf(args[0]!).bytes)),
  );
  ctx.registerAlias('ПолучитьHexБуферДвоичныхДанныхИзБуфераДвоичныхДанных', 'GetHexBinaryDataBufferFromBinaryDataBuffer', (args) => {
    const b = buf(args[0]!);
    return BslBinaryDataBuffer.fromBytes(encode(bytesToHex(b.bytes), 'UTF8БезBOM', false));
  });
  ctx.registerAlias('ПолучитьДвоичныеДанныеИзHexДвоичныхДанных', 'GetBinaryDataFromHexBinaryData', (args) =>
    new BslBinaryData(hexBytesToBytes(data(args[0]!).bytes)),
  );
  ctx.registerAlias('ПолучитьHexДвоичныеДанныеИзДвоичныхДанных', 'GetHexBinaryDataFromBinaryData', (args) => {
    const d = data(args[0]!);
    return new BslBinaryData(encode(bytesToHex(d.bytes), 'UTF8БезBOM', false));
  });

  ctx.registerAlias('ПолучитьБуферДвоичныхДанныхИзBase64БуфераДвоичныхДанных', 'GetBinaryDataBufferFromBase64BinaryDataBuffer', (args) =>
    BslBinaryDataBuffer.fromBytes(base64ToBytes(decode(buf(args[0]!).bytes, undefined))),
  );
  ctx.registerAlias('ПолучитьBase64БуферДвоичныхДанныхИзБуфераДвоичныхДанных', 'GetBase64BinaryDataBufferFromBinaryDataBuffer', (args) => {
    const b = buf(args[0]!);
    return BslBinaryDataBuffer.fromBytes(encode(bytesToBase64(b.bytes), 'UTF8БезBOM', false));
  });

  ctx.registerAlias('ПолучитьДвоичныеДанныеИзBase64ДвоичныхДанных', 'GetBinaryDataFromBase64BinaryData', (args) =>
    new BslBinaryData(base64ToBytes(decode(data(args[0]!).bytes, undefined))),
  );
  ctx.registerAlias('ПолучитьBase64ДвоичныеДанныеИзДвоичныхДанных', 'GetBase64BinaryDataFromBinaryData', (args) => {
    const d = data(args[0]!);
    return new BslBinaryData(encode(bytesToBase64(d.bytes), 'UTF8БезBOM', false));
  });

  ctx.registerAlias('ПолучитьБуферДвоичныхДанныхИзДвоичныхДанных', 'GetBinaryDataBufferFromBinaryData', (args) =>
    BslBinaryDataBuffer.fromBytes(new Uint8Array(data(args[0]!).bytes)),
  );
  ctx.registerAlias('ПолучитьДвоичныеДанныеИзБуфераДвоичныхДанных', 'GetBinaryDataFromBinaryDataBuffer', (args) =>
    new BslBinaryData(new Uint8Array(buf(args[0]!).bytes)),
  );

  ctx.registerAlias('СоединитьДвоичныеДанные', 'ConcatBinaryData', (args) => {
    const arr = args[0];
    if (!(isBslObject(arr) && arr instanceof BslArray)) throw new Error('Неверный тип аргумента');
    let total = 0;
    const parts: Uint8Array[] = [];
    for (const d of arr.iterate()) {
      if (!(isBslObject(d) && d instanceof BslBinaryData)) throw new Error('Неверный тип аргумента');
      parts.push(d.bytes);
      total += d.bytes.length;
    }
    const out = new Uint8Array(total);
    let off = 0;
    for (const p of parts) {
      out.set(p, off);
      off += p.length;
    }
    return new BslBinaryData(out);
  });

  ctx.registerAlias('РазделитьДвоичныеДанные', 'SplitBinaryData', (args) => {
    const d = data(args[0]!);
    const size = toNumber(args[1]);
    if (size <= 0) throw new Error('Неверное значение аргумента номер 2');
    const arr = new BslArray([]);
    for (let i = 0; i < d.bytes.length; i += size) {
      arr.callMethod('Добавить', [new BslBinaryData(d.bytes.slice(i, i + size))]);
    }
    return arr;
  });
}
