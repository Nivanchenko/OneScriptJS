import type {
  ApiAccess,
  ApiEnum,
  ApiFunction,
  ApiMethod,
  ApiParam,
  ApiProperty,
  ApiType,
} from './api-catalog';

/** Сигнатура параметра: `Имя?: Тип`, `Имя…: Тип`. */
function paramText(param: ApiParam): string {
  return `${param.name}${param.optional ? '?' : ''}${param.variadic ? '…' : ''}: ${param.type}`;
}

export function functionSignature(fn: ApiFunction): string {
  return `${fn.ru}(${fn.params.map(paramText).join(', ')})`;
}

export function methodSignature(method: ApiMethod): string {
  return `${method.ru}(${method.params.map(paramText).join(', ')})`;
}

export function propertySignature(property: ApiProperty): string {
  return `${property.ru}: ${property.type}`;
}

function accessText(access: ApiAccess): string {
  switch (access) {
    case 'read':
      return 'чтение';
    case 'write':
      return 'запись';
    case 'readwrite':
      return 'чтение и запись';
  }
}

/** Markdown-описание функции для hover. */
export function functionMarkdown(fn: ApiFunction): string {
  const title = fn.en === undefined ? fn.ru : `${fn.ru} / ${fn.en}`;
  const lines = [
    `**${title}**`,
    '',
    '```bsl',
    functionSignature(fn),
    '```',
    '',
    fn.description,
    '',
    `- Возвращает: ${fn.returns ?? '—'}`,
    `- Раздел: ${fn.section}`,
  ];
  if (fn.env !== undefined) {
    lines.push(`- Среда: ${fn.env === 'node' ? 'Node.js' : 'браузер'}`);
  }
  return lines.join('\n');
}

/** Markdown-описание метода stdlib для hover. */
export function methodMarkdown(owner: string, method: ApiMethod): string {
  const title = method.en === undefined ? `${owner}.${method.ru}` : `${owner}.${method.ru} / ${method.en}`;
  return [
    `**${title}**`,
    '',
    '```bsl',
    methodSignature(method),
    '```',
    '',
    method.description,
    '',
    `- Тип: ${owner}`,
    `- Возвращает: ${method.returns ?? '—'}`,
  ].join('\n');
}

/** Markdown-описание свойства stdlib для hover. */
export function propertyMarkdown(owner: string, property: ApiProperty): string {
  const title =
    property.en === undefined ? `${owner}.${property.ru}` : `${owner}.${property.ru} / ${property.en}`;
  return [
    `**${title}**`,
    '',
    '```bsl',
    propertySignature(property),
    '```',
    '',
    property.description,
    '',
    `- Тип: ${owner}`,
    `- Доступ: ${accessText(property.access)}`,
  ].join('\n');
}

/** Markdown-описание типа stdlib для hover. */
export function typeMarkdown(type: ApiType): string {
  const title = type.en === undefined ? type.ru : `${type.ru} / ${type.en}`;
  const lines = [
    `**${title}**`,
    '',
    'Тип стандартной библиотеки.',
    `- Методов: ${type.methods.length}`,
    `- Свойств: ${type.properties.length}`,
  ];
  if (type.constructible) lines.push(`- Создание: Новый ${type.ru}`);
  return lines.join('\n');
}

/** Markdown-описание перечисления stdlib для hover. */
export function enumMarkdown(enumInfo: ApiEnum): string {
  const title = enumInfo.en === undefined ? enumInfo.ru : `${enumInfo.ru} / ${enumInfo.en}`;
  return [
    `**${title}**`,
    '',
    'Перечисление стандартной библиотеки.',
    `- Значения: ${enumInfo.values.map((value) => value.ru).join(', ')}`,
  ].join('\n');
}
