import { API_CATALOG } from './generated/api-catalog';

export type ApiEnv = 'node' | 'browser';
export type ApiAccess = 'read' | 'write' | 'readwrite';

export interface ApiParam {
  name: string;
  type: string;
  optional: boolean;
  variadic: boolean;
}

export interface ApiFunction {
  ru: string;
  en?: string;
  params: ApiParam[];
  returns: string | null;
  description: string;
  section: string;
  env?: ApiEnv;
  /** false — арность неизвестна (встроенные операторы языка), проверки не выполняются. */
  arityKnown?: boolean;
}

export interface ApiMethod {
  ru: string;
  en?: string;
  params: ApiParam[];
  returns: string | null;
  description: string;
}

export interface ApiProperty {
  ru: string;
  en?: string;
  type: string;
  access: ApiAccess;
  description: string;
}

export interface ApiType {
  ru: string;
  en?: string;
  constructible: boolean;
  methods: ApiMethod[];
  properties: ApiProperty[];
}

export interface ApiEnumValue {
  ru: string;
  en?: string;
  meaning: string;
}

export interface ApiEnum {
  ru: string;
  en?: string;
  values: ApiEnumValue[];
}

export interface ApiCatalog {
  schemaVersion: number;
  generatedFrom: string;
  functions: ApiFunction[];
  types: ApiType[];
  enums: ApiEnum[];
  globals: string[];
}

/** Каталог — сгенерирован из docs/reference.md (см. contracts/api-catalog.md). */
export const catalog: ApiCatalog = API_CATALOG as unknown as ApiCatalog;

const functionIndex = new Map<string, ApiFunction>();
for (const fn of catalog.functions) {
  functionIndex.set(fn.ru.toLowerCase(), fn);
  if (fn.en) functionIndex.set(fn.en.toLowerCase(), fn);
}

const typeIndex = new Map<string, ApiType>();
for (const type of catalog.types) {
  typeIndex.set(type.ru.toLowerCase(), type);
  if (type.en) typeIndex.set(type.en.toLowerCase(), type);
}

const enumIndex = new Map<string, ApiEnum>();
for (const e of catalog.enums) {
  enumIndex.set(e.ru.toLowerCase(), e);
  if (e.en) enumIndex.set(e.en.toLowerCase(), e);
}

const globalSet = new Set<string>(catalog.globals.map((name) => name.toLowerCase()));
const knownGlobals = new Set<string>([
  ...functionIndex.keys(),
  ...typeIndex.keys(),
  ...enumIndex.keys(),
  ...globalSet,
]);

/** Глобальная функция по русскому или английскому имени (регистронезависимо). */
export function findFunction(name: string): ApiFunction | undefined {
  return functionIndex.get(name.toLowerCase());
}

/** Тип (объект) по русскому или английскому имени. */
export function findType(name: string): ApiType | undefined {
  return typeIndex.get(name.toLowerCase());
}

/** Перечисление по русскому или английскому имени. */
export function findEnum(name: string): ApiEnum | undefined {
  return enumIndex.get(name.toLowerCase());
}

/** Все имена, которые разрешены как глобальные (функции, типы, перечисления, глобалы). */
export function knownGlobalNames(): ReadonlySet<string> {
  return knownGlobals;
}

/** Диапазон числа аргументов функции; `max = Infinity` — variadic. */
export function arity(fn: ApiFunction): { min: number; max: number } {
  if (fn.arityKnown === false) return { min: 0, max: Number.POSITIVE_INFINITY };
  let min = 0;
  let max = 0;
  for (const param of fn.params) {
    if (param.variadic) return { min, max: Number.POSITIVE_INFINITY };
    max += 1;
    if (!param.optional) min += 1;
  }
  return { min, max };
}

/** Методы и свойства типа для completion после точки. */
export function typeMembers(name: string): { methods: ApiMethod[]; properties: ApiProperty[] } | undefined {
  const type = findType(name);
  return type ? { methods: type.methods, properties: type.properties } : undefined;
}

/** Все функции каталога (для completion без префикса). */
export function allFunctions(): ApiFunction[] {
  return catalog.functions;
}

/** Все типы каталога. */
export function allTypes(): ApiType[] {
  return catalog.types;
}

/** Все перечисления каталога. */
export function allEnums(): ApiEnum[] {
  return catalog.enums;
}

/** Глобальные объекты (Ожидаем, ФоновыеЗадания, …). */
export function allGlobals(): string[] {
  return catalog.globals;
}
