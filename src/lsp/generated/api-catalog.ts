// Сгенерировано scripts/build-api-catalog.mjs из docs/reference.md. Не редактировать вручную.
// Перегенерация: pnpm build:catalog

export const API_CATALOG = {
  "schemaVersion": 1,
  "generatedFrom": "docs/reference.md",
  "functions": [
    {
      "ru": "Сообщить",
      "en": "Message",
      "params": [
        {
          "name": "Текст",
          "type": "Любое",
          "optional": true,
          "variadic": false
        },
        {
          "name": "Статус",
          "type": "СтатусСообщения",
          "optional": true,
          "variadic": false
        }
      ],
      "returns": null,
      "description": "Выводит текст в консоль; уровень задаёт статус.",
      "section": "Вывод, пауза и базовые значения"
    },
    {
      "ru": "Новый",
      "en": "New",
      "params": [
        {
          "name": "Тип",
          "type": "Строка | Тип",
          "optional": false,
          "variadic": false
        },
        {
          "name": "Аргументы",
          "type": "Любое",
          "optional": false,
          "variadic": true
        }
      ],
      "returns": "Объект",
      "description": "Динамический конструктор зарегистрированного типа.",
      "section": "Вывод, пауза и базовые значения"
    },
    {
      "ru": "Приостановить",
      "en": "Sleep",
      "params": [
        {
          "name": "Миллисекунды",
          "type": "Число",
          "optional": true,
          "variadic": false
        }
      ],
      "returns": null,
      "description": "Кооперативная пауза текущего логического потока.",
      "section": "Вывод, пауза и базовые значения"
    },
    {
      "ru": "КраткоеПредставлениеОшибки",
      "en": "BriefErrorDescription",
      "params": [
        {
          "name": "Ошибка",
          "type": "ИнформацияОбОшибке | Любое",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "Строка",
      "description": "Краткое описание ошибки.",
      "section": "Вывод, пауза и базовые значения"
    },
    {
      "ru": "ПодробноеПредставлениеОшибки",
      "en": "DetailErrorDescription",
      "params": [
        {
          "name": "Ошибка",
          "type": "ИнформацияОбОшибке | Любое",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "Строка",
      "description": "Подробное описание ошибки.",
      "section": "Вывод, пауза и базовые значения"
    },
    {
      "ru": "Строка",
      "en": "String",
      "params": [
        {
          "name": "Значение",
          "type": "Любое",
          "optional": true,
          "variadic": false
        }
      ],
      "returns": "Строка",
      "description": "Строковое представление значения; без аргумента — пустая строка.",
      "section": "Строки"
    },
    {
      "ru": "Число",
      "en": "Number",
      "params": [
        {
          "name": "Значение",
          "type": "Любое",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "Число",
      "description": "Приведение к числу: булево → 0/1, `Null`/`Неопределено`/пустая строка → 0, строка — через `Number`.",
      "section": "Строки"
    },
    {
      "ru": "СтрДлина",
      "en": "StrLen",
      "params": [
        {
          "name": "Строка",
          "type": "Строка",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "Число",
      "description": "Длина строки.",
      "section": "Строки"
    },
    {
      "ru": "ВРег",
      "en": "Upper",
      "params": [
        {
          "name": "Строка",
          "type": "Строка",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "Строка",
      "description": "Верхний регистр.",
      "section": "Строки"
    },
    {
      "ru": "НРег",
      "en": "Lower",
      "params": [
        {
          "name": "Строка",
          "type": "Строка",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "Строка",
      "description": "Нижний регистр.",
      "section": "Строки"
    },
    {
      "ru": "СокрЛП",
      "en": "TrimAll",
      "params": [
        {
          "name": "Строка",
          "type": "Строка",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "Строка",
      "description": "Убирает пробельные символы с обоих концов.",
      "section": "Строки"
    },
    {
      "ru": "СокрЛ",
      "en": "TrimL",
      "params": [
        {
          "name": "Строка",
          "type": "Строка",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "Строка",
      "description": "Убирает пробельные символы слева.",
      "section": "Строки"
    },
    {
      "ru": "СокрП",
      "en": "TrimR",
      "params": [
        {
          "name": "Строка",
          "type": "Строка",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "Строка",
      "description": "Убирает пробельные символы справа.",
      "section": "Строки"
    },
    {
      "ru": "ПустаяСтрока",
      "en": "IsBlankString",
      "params": [
        {
          "name": "Строка",
          "type": "Строка",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "Булево",
      "description": "Истина, если строка пуста или состоит из пробельных символов.",
      "section": "Строки"
    },
    {
      "ru": "Лев",
      "en": "Left",
      "params": [
        {
          "name": "Строка",
          "type": "Строка",
          "optional": false,
          "variadic": false
        },
        {
          "name": "Длина",
          "type": "Число",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "Строка",
      "description": "Первые `Длина` символов.",
      "section": "Строки"
    },
    {
      "ru": "Прав",
      "en": "Right",
      "params": [
        {
          "name": "Строка",
          "type": "Строка",
          "optional": false,
          "variadic": false
        },
        {
          "name": "Длина",
          "type": "Число",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "Строка",
      "description": "Последние `Длина` символов.",
      "section": "Строки"
    },
    {
      "ru": "Сред",
      "en": "Mid",
      "params": [
        {
          "name": "Строка",
          "type": "Строка",
          "optional": false,
          "variadic": false
        },
        {
          "name": "Позиция",
          "type": "Число",
          "optional": false,
          "variadic": false
        },
        {
          "name": "Длина",
          "type": "Число",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "Строка",
      "description": "Подстрока с позиции `Позиция` (с 1) длиной `Длина`.",
      "section": "Строки"
    },
    {
      "ru": "Найти",
      "en": "Find",
      "params": [
        {
          "name": "Строка",
          "type": "Строка",
          "optional": false,
          "variadic": false
        },
        {
          "name": "Подстрока",
          "type": "Строка",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "Число",
      "description": "Позиция первого вхождения (с 1) или 0.",
      "section": "Строки"
    },
    {
      "ru": "СтрЗаменить",
      "en": "StrReplace",
      "params": [
        {
          "name": "Строка",
          "type": "Строка",
          "optional": false,
          "variadic": false
        },
        {
          "name": "Поиск",
          "type": "Строка",
          "optional": false,
          "variadic": false
        },
        {
          "name": "Замена",
          "type": "Строка",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "Строка",
      "description": "Замена всех вхождений.",
      "section": "Строки"
    },
    {
      "ru": "СтрЧислоВхождений",
      "en": "StrOccurrenceCount",
      "params": [
        {
          "name": "Строка",
          "type": "Строка",
          "optional": false,
          "variadic": false
        },
        {
          "name": "Подстрока",
          "type": "Строка",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "Число",
      "description": "Число вхождений; пустая подстрока → 0.",
      "section": "Строки"
    },
    {
      "ru": "СтрНачинаетсяС",
      "en": "StrStartsWith",
      "params": [
        {
          "name": "Строка",
          "type": "Строка",
          "optional": false,
          "variadic": false
        },
        {
          "name": "Начало",
          "type": "Строка",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "Булево",
      "description": "Начинается ли строка с указанной подстроки.",
      "section": "Строки"
    },
    {
      "ru": "СтрЗаканчиваетсяНа",
      "en": "StrEndsWith",
      "params": [
        {
          "name": "Строка",
          "type": "Строка",
          "optional": false,
          "variadic": false
        },
        {
          "name": "Конец",
          "type": "Строка",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "Булево",
      "description": "Заканчивается ли строка указанной подстрокой.",
      "section": "Строки"
    },
    {
      "ru": "СтрРазделить",
      "en": "StrSplit",
      "params": [
        {
          "name": "Строка",
          "type": "Строка",
          "optional": false,
          "variadic": false
        },
        {
          "name": "Разделитель",
          "type": "Строка",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "Массив",
      "description": "Делит строку на `Массив`; пустой разделитель — по символам.",
      "section": "Строки"
    },
    {
      "ru": "СтрСоединить",
      "en": "StrJoin",
      "params": [
        {
          "name": "Строки",
          "type": "Массив",
          "optional": false,
          "variadic": false
        },
        {
          "name": "Разделитель",
          "type": "Строка",
          "optional": true,
          "variadic": false
        }
      ],
      "returns": "Строка",
      "description": "Соединяет элементы массива через разделитель (по умолчанию пустой).",
      "section": "Строки"
    },
    {
      "ru": "Символ",
      "en": "Char",
      "params": [
        {
          "name": "Код",
          "type": "Число",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "Строка",
      "description": "Символ по коду UTF-16.",
      "section": "Строки"
    },
    {
      "ru": "КодСимвола",
      "en": "CharCode",
      "params": [
        {
          "name": "Строка",
          "type": "Строка",
          "optional": false,
          "variadic": false
        },
        {
          "name": "Позиция",
          "type": "Число",
          "optional": true,
          "variadic": false
        }
      ],
      "returns": "Число",
      "description": "Код символа в позиции (с 1, по умолчанию 1).",
      "section": "Строки"
    },
    {
      "ru": "НСтр",
      "en": "NStr",
      "params": [
        {
          "name": "Строка",
          "type": "Строка",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "Строка",
      "description": "Извлекает текст `ru='…'` из строки локализации.",
      "section": "Строки"
    },
    {
      "ru": "ТРег",
      "en": "Title",
      "params": [
        {
          "name": "Строка",
          "type": "Строка",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "Строка",
      "description": "Первая буква каждого слова заглавная, остальные строчные.",
      "section": "Строки"
    },
    {
      "ru": "СтрЧислоСтрок",
      "en": "StrLineCount",
      "params": [
        {
          "name": "Строка",
          "type": "Строка",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "Число",
      "description": "Число строк (разделитель — LF).",
      "section": "Строки"
    },
    {
      "ru": "СтрПолучитьСтроку",
      "en": "StrGetLine",
      "params": [
        {
          "name": "Строка",
          "type": "Строка",
          "optional": false,
          "variadic": false
        },
        {
          "name": "НомерСтроки",
          "type": "Число",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "Строка",
      "description": "Строка по номеру (с 1).",
      "section": "Строки"
    },
    {
      "ru": "СтрНайти",
      "en": "StrFind",
      "params": [
        {
          "name": "Строка",
          "type": "Строка",
          "optional": false,
          "variadic": false
        },
        {
          "name": "Подстрока",
          "type": "Строка",
          "optional": false,
          "variadic": false
        },
        {
          "name": "Направление",
          "type": "НаправлениеПоиска",
          "optional": true,
          "variadic": false
        },
        {
          "name": "НачальнаяПозиция",
          "type": "Число",
          "optional": true,
          "variadic": false
        },
        {
          "name": "НомерВхождения",
          "type": "Число",
          "optional": true,
          "variadic": false
        }
      ],
      "returns": "Число",
      "description": "Позиция N-го вхождения (с 1) или 0; умеет искать с конца.",
      "section": "Строки"
    },
    {
      "ru": "СтрШаблон",
      "en": "StrTemplate",
      "params": [
        {
          "name": "Шаблон",
          "type": "Строка",
          "optional": false,
          "variadic": false
        },
        {
          "name": "Значение1",
          "type": "Любое",
          "optional": false,
          "variadic": true
        }
      ],
      "returns": "Строка",
      "description": "Подставляет аргументы вместо `%1`, `%2`, …",
      "section": "Строки"
    },
    {
      "ru": "Мин",
      "en": "Min",
      "params": [
        {
          "name": "Значения",
          "type": "Число",
          "optional": false,
          "variadic": true
        }
      ],
      "returns": "Число",
      "description": "Минимум аргументов.",
      "section": "Числа, математика и даты"
    },
    {
      "ru": "Макс",
      "en": "Max",
      "params": [
        {
          "name": "Значения",
          "type": "Число",
          "optional": false,
          "variadic": true
        }
      ],
      "returns": "Число",
      "description": "Максимум аргументов.",
      "section": "Числа, математика и даты"
    },
    {
      "ru": "Окр",
      "en": "Round",
      "params": [
        {
          "name": "Число",
          "type": "Число",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "Число",
      "description": "Округление до целого.",
      "section": "Числа, математика и даты"
    },
    {
      "ru": "Цел",
      "en": "Int",
      "params": [
        {
          "name": "Число",
          "type": "Число",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "Число",
      "description": "Отбрасывание дробной части (к нулю).",
      "section": "Числа, математика и даты"
    },
    {
      "ru": "Pow",
      "params": [
        {
          "name": "Основание",
          "type": "Число",
          "optional": false,
          "variadic": false
        },
        {
          "name": "Степень",
          "type": "Число",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "Число",
      "description": "Возведение в степень с decimal-точностью 1С.",
      "section": "Числа, математика и даты"
    },
    {
      "ru": "ТекущаяДата",
      "en": "CurrentDate",
      "params": [],
      "returns": "Дата",
      "description": "Текущий момент.",
      "section": "Числа, математика и даты"
    },
    {
      "ru": "ТекущаяУниверсальнаяДата",
      "en": "CurrentUniversalDate",
      "params": [],
      "returns": "Дата",
      "description": "Текущий момент (реализация совпадает с `ТекущаяДата`).",
      "section": "Числа, математика и даты"
    },
    {
      "ru": "Дата",
      "en": "Date",
      "params": [
        {
          "name": "Год",
          "type": "Число",
          "optional": true,
          "variadic": false
        },
        {
          "name": "Месяц",
          "type": "Число",
          "optional": true,
          "variadic": false
        },
        {
          "name": "День",
          "type": "Число",
          "optional": true,
          "variadic": false
        },
        {
          "name": "Час",
          "type": "Число",
          "optional": true,
          "variadic": false
        },
        {
          "name": "Минута",
          "type": "Число",
          "optional": true,
          "variadic": false
        },
        {
          "name": "Секунда",
          "type": "Число",
          "optional": true,
          "variadic": false
        }
      ],
      "returns": "Дата",
      "description": "Конструирует дату из числовых компонент.",
      "section": "Числа, математика и даты"
    },
    {
      "ru": "Формат",
      "en": "Format",
      "params": [
        {
          "name": "Значение",
          "type": "Любое",
          "optional": false,
          "variadic": false
        },
        {
          "name": "ФорматнаяСтрока",
          "type": "Строка",
          "optional": true,
          "variadic": false
        }
      ],
      "returns": "Строка",
      "description": "Форматирует число, дату или булево по форматной строке.",
      "section": "Формат"
    },
    {
      "ru": "ЗаписатьJSON",
      "en": "WriteJSON",
      "params": [
        {
          "name": "Значение",
          "type": "Любое",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "Строка",
      "description": "Сериализует значение в JSON-строку.",
      "section": "JSON"
    },
    {
      "ru": "ПрочитатьJSON",
      "en": "ReadJSON",
      "params": [
        {
          "name": "Строка",
          "type": "Строка",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "Любое",
      "description": "Разбирает JSON-строку в значение.",
      "section": "JSON"
    },
    {
      "ru": "ПобитовоеИ",
      "en": "BitAnd",
      "params": [
        {
          "name": "Значение1",
          "type": "Число",
          "optional": false,
          "variadic": false
        },
        {
          "name": "Значение2",
          "type": "Число",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "Число",
      "description": "Поразрядное И.",
      "section": "Битовые операции"
    },
    {
      "ru": "ПобитовоеИли",
      "en": "BitOr",
      "params": [
        {
          "name": "Значение1",
          "type": "Число",
          "optional": false,
          "variadic": false
        },
        {
          "name": "Значение2",
          "type": "Число",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "Число",
      "description": "Поразрядное ИЛИ.",
      "section": "Битовые операции"
    },
    {
      "ru": "ПобитовоеНе",
      "en": "BitNot",
      "params": [
        {
          "name": "Значение",
          "type": "Число",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "Число",
      "description": "Поразрядное НЕ.",
      "section": "Битовые операции"
    },
    {
      "ru": "ПобитовоеИНе",
      "en": "BitAndNot",
      "params": [
        {
          "name": "Значение1",
          "type": "Число",
          "optional": false,
          "variadic": false
        },
        {
          "name": "Значение2",
          "type": "Число",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "Число",
      "description": "`Значение1` И НЕ `Значение2`.",
      "section": "Битовые операции"
    },
    {
      "ru": "ПобитовоеИсключительноеИли",
      "en": "BitXor",
      "params": [
        {
          "name": "Значение1",
          "type": "Число",
          "optional": false,
          "variadic": false
        },
        {
          "name": "Значение2",
          "type": "Число",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "Число",
      "description": "Поразрядное исключающее ИЛИ.",
      "section": "Битовые операции"
    },
    {
      "ru": "ПобитовыйСдвигВлево",
      "en": "BitShiftLeft",
      "params": [
        {
          "name": "Значение",
          "type": "Число",
          "optional": false,
          "variadic": false
        },
        {
          "name": "Смещение",
          "type": "Число",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "Число",
      "description": "Сдвиг влево на `Смещение` бит.",
      "section": "Битовые операции"
    },
    {
      "ru": "ПобитовыйСдвигВправо",
      "en": "BitShiftRight",
      "params": [
        {
          "name": "Значение",
          "type": "Число",
          "optional": false,
          "variadic": false
        },
        {
          "name": "Смещение",
          "type": "Число",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "Число",
      "description": "Сдвиг вправо на `Смещение` бит.",
      "section": "Битовые операции"
    },
    {
      "ru": "ПроверитьБит",
      "en": "CheckBit",
      "params": [
        {
          "name": "Значение",
          "type": "Число",
          "optional": false,
          "variadic": false
        },
        {
          "name": "НомерБита",
          "type": "Число",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "Булево",
      "description": "Установлен ли бит с номером `НомерБита`.",
      "section": "Битовые операции"
    },
    {
      "ru": "УстановитьБит",
      "en": "SetBit",
      "params": [
        {
          "name": "Значение",
          "type": "Число",
          "optional": false,
          "variadic": false
        },
        {
          "name": "НомерБита",
          "type": "Число",
          "optional": false,
          "variadic": false
        },
        {
          "name": "Бит",
          "type": "Число",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "Число",
      "description": "Устанавливает бит при `Бит=1`, иначе сбрасывает.",
      "section": "Битовые операции"
    },
    {
      "ru": "ПроверитьПоБитовойМаске",
      "en": "CheckByBitMask",
      "params": [
        {
          "name": "Значение",
          "type": "Число",
          "optional": false,
          "variadic": false
        },
        {
          "name": "Маска",
          "type": "Число",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "Булево",
      "description": "Все биты маски установлены в значении.",
      "section": "Битовые операции"
    },
    {
      "ru": "Тип",
      "en": "Type",
      "params": [
        {
          "name": "ИмяТипа",
          "type": "Строка | Тип",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "Тип",
      "description": "Создаёт значение типа по имени.",
      "section": "Типы значений"
    },
    {
      "ru": "ТипЗнч",
      "en": "TypeOf",
      "params": [
        {
          "name": "Значение",
          "type": "Любое",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "Тип",
      "description": "Возвращает тип значения.",
      "section": "Типы значений"
    },
    {
      "ru": "ПолучитьБуферДвоичныхДанныхИзСтроки",
      "en": "GetBinaryDataBufferFromString",
      "params": [
        {
          "name": "Текст",
          "type": "Строка",
          "optional": false,
          "variadic": false
        },
        {
          "name": "Кодировка",
          "type": "КодировкаТекста | Строка",
          "optional": true,
          "variadic": false
        },
        {
          "name": "ДобавлятьBOM",
          "type": "Булево",
          "optional": true,
          "variadic": false
        }
      ],
      "returns": "БуферДвоичныхДанных",
      "description": "Кодирует строку в байты; BOM добавляется только при `ДобавлятьBOM = Истина`",
      "section": "Двоичные данные и кодировки"
    },
    {
      "ru": "ПолучитьСтрокуИзБуфераДвоичныхДанных",
      "en": "GetStringFromBinaryDataBuffer",
      "params": [
        {
          "name": "Буфер",
          "type": "БуферДвоичныхДанных",
          "optional": false,
          "variadic": false
        },
        {
          "name": "Кодировка",
          "type": "КодировкаТекста | Строка",
          "optional": true,
          "variadic": false
        }
      ],
      "returns": "Строка",
      "description": "Декодирует байты буфера; BOM распознаётся автоматически",
      "section": "Двоичные данные и кодировки"
    },
    {
      "ru": "ПолучитьДвоичныеДанныеИзСтроки",
      "en": "GetBinaryDataFromString",
      "params": [
        {
          "name": "Текст",
          "type": "Строка",
          "optional": false,
          "variadic": false
        },
        {
          "name": "Кодировка",
          "type": "КодировкаТекста | Строка",
          "optional": true,
          "variadic": false
        },
        {
          "name": "ДобавлятьBOM",
          "type": "Булево",
          "optional": true,
          "variadic": false
        }
      ],
      "returns": "ДвоичныеДанные",
      "description": "Кодирует строку в `ДвоичныеДанные`; правила BOM те же, что у буфера",
      "section": "Двоичные данные и кодировки"
    },
    {
      "ru": "ПолучитьСтрокуИзДвоичныхДанных",
      "en": "GetStringFromBinaryData",
      "params": [
        {
          "name": "Данные",
          "type": "ДвоичныеДанные",
          "optional": false,
          "variadic": false
        },
        {
          "name": "Кодировка",
          "type": "КодировкаТекста | Строка",
          "optional": true,
          "variadic": false
        }
      ],
      "returns": "Строка",
      "description": "Декодирует двоичные данные в строку",
      "section": "Двоичные данные и кодировки"
    },
    {
      "ru": "ПолучитьБуферДвоичныхДанныхИзHexСтроки",
      "en": "GetBinaryDataBufferFromHexString",
      "params": [
        {
          "name": "HexСтрока",
          "type": "Строка",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "БуферДвоичныхДанных",
      "description": "Разбирает Hex-текст; символы не из Hex-алфавита пропускаются, нечётная длина — ошибка",
      "section": "Двоичные данные и кодировки"
    },
    {
      "ru": "ПолучитьHexСтрокуИзБуфераДвоичныхДанных",
      "en": "GetHexStringFromBinaryDataBuffer",
      "params": [
        {
          "name": "Буфер",
          "type": "БуферДвоичныхДанных",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "Строка",
      "description": "Hex-представление в верхнем регистре",
      "section": "Двоичные данные и кодировки"
    },
    {
      "ru": "ПолучитьДвоичныеДанныеИзHexСтроки",
      "en": "GetBinaryDataFromHexString",
      "params": [
        {
          "name": "HexСтрока",
          "type": "Строка",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "ДвоичныеДанные",
      "description": "Hex-текст → двоичные данные",
      "section": "Двоичные данные и кодировки"
    },
    {
      "ru": "ПолучитьHexСтрокуИзДвоичныхДанных",
      "en": "GetHexStringFromBinaryData",
      "params": [
        {
          "name": "Данные",
          "type": "ДвоичныеДанные",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "Строка",
      "description": "Двоичные данные → Hex-строка (верхний регистр)",
      "section": "Двоичные данные и кодировки"
    },
    {
      "ru": "ПолучитьБуферДвоичныхДанныхИзBase64Строки",
      "en": "GetBinaryDataBufferFromBase64String",
      "params": [
        {
          "name": "Base64Строка",
          "type": "Строка",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "БуферДвоичныхДанных",
      "description": "Разбирает Base64; пробельные символы игнорируются, неверные данные дают пустой буфер",
      "section": "Двоичные данные и кодировки"
    },
    {
      "ru": "ПолучитьBase64СтрокуИзБуфераДвоичныхДанных",
      "en": "GetBase64StringFromBinaryDataBuffer",
      "params": [
        {
          "name": "Буфер",
          "type": "БуферДвоичныхДанных",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "Строка",
      "description": "Base64-представление байтов",
      "section": "Двоичные данные и кодировки"
    },
    {
      "ru": "ПолучитьДвоичныеДанныеИзBase64Строки",
      "en": "GetBinaryDataFromBase64String",
      "params": [
        {
          "name": "Base64Строка",
          "type": "Строка",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "ДвоичныеДанные",
      "description": "Base64 → двоичные данные",
      "section": "Двоичные данные и кодировки"
    },
    {
      "ru": "ПолучитьBase64СтрокуИзДвоичныхДанных",
      "en": "GetBase64StringFromBinaryData",
      "params": [
        {
          "name": "Данные",
          "type": "ДвоичныеДанные",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "Строка",
      "description": "Двоичные данные → Base64-строка",
      "section": "Двоичные данные и кодировки"
    },
    {
      "ru": "ПолучитьБуферДвоичныхДанныхИзHexБуфераДвоичныхДанных",
      "en": "GetBinaryDataBufferFromHexBinaryDataBuffer",
      "params": [
        {
          "name": "Буфер",
          "type": "БуферДвоичныхДанных",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "БуферДвоичныхДанных",
      "description": "Байты буфера трактуются как ASCII Hex-текст; байты не из Hex-алфавита пропускаются, нечётный хвост отбрасывается",
      "section": "Двоичные данные и кодировки"
    },
    {
      "ru": "ПолучитьHexБуферДвоичныхДанныхИзБуфераДвоичныхДанных",
      "en": "GetHexBinaryDataBufferFromBinaryDataBuffer",
      "params": [
        {
          "name": "Буфер",
          "type": "БуферДвоичныхДанных",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "БуферДвоичныхДанных",
      "description": "Hex-текст (верхний регистр) в байтах UTF-8 без BOM",
      "section": "Двоичные данные и кодировки"
    },
    {
      "ru": "ПолучитьДвоичныеДанныеИзHexДвоичныхДанных",
      "en": "GetBinaryDataFromHexBinaryData",
      "params": [
        {
          "name": "Данные",
          "type": "ДвоичныеДанные",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "ДвоичныеДанные",
      "description": "ASCII Hex-текст из данных → байты",
      "section": "Двоичные данные и кодировки"
    },
    {
      "ru": "ПолучитьHexДвоичныеДанныеИзДвоичныхДанных",
      "en": "GetHexBinaryDataFromBinaryData",
      "params": [
        {
          "name": "Данные",
          "type": "ДвоичныеДанные",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "ДвоичныеДанные",
      "description": "Hex-текст (верхний регистр) в байтах UTF-8 без BOM",
      "section": "Двоичные данные и кодировки"
    },
    {
      "ru": "ПолучитьБуферДвоичныхДанныхИзBase64БуфераДвоичныхДанных",
      "en": "GetBinaryDataBufferFromBase64BinaryDataBuffer",
      "params": [
        {
          "name": "Буфер",
          "type": "БуферДвоичныхДанных",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "БуферДвоичныхДанных",
      "description": "Байты буфера трактуются как Base64-текст UTF-8 и декодируются",
      "section": "Двоичные данные и кодировки"
    },
    {
      "ru": "ПолучитьBase64БуферДвоичныхДанныхИзБуфераДвоичныхДанных",
      "en": "GetBase64BinaryDataBufferFromBinaryDataBuffer",
      "params": [
        {
          "name": "Буфер",
          "type": "БуферДвоичныхДанных",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "БуферДвоичныхДанных",
      "description": "Base64-текст в байтах UTF-8 без BOM",
      "section": "Двоичные данные и кодировки"
    },
    {
      "ru": "ПолучитьДвоичныеДанныеИзBase64ДвоичныхДанных",
      "en": "GetBinaryDataFromBase64BinaryData",
      "params": [
        {
          "name": "Данные",
          "type": "ДвоичныеДанные",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "ДвоичныеДанные",
      "description": "Base64-текст из данных → байты",
      "section": "Двоичные данные и кодировки"
    },
    {
      "ru": "ПолучитьBase64ДвоичныеДанныеИзДвоичныхДанных",
      "en": "GetBase64BinaryDataFromBinaryData",
      "params": [
        {
          "name": "Данные",
          "type": "ДвоичныеДанные",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "ДвоичныеДанные",
      "description": "Base64-текст в байтах UTF-8 без BOM",
      "section": "Двоичные данные и кодировки"
    },
    {
      "ru": "ПолучитьБуферДвоичныхДанныхИзДвоичныхДанных",
      "en": "GetBinaryDataBufferFromBinaryData",
      "params": [
        {
          "name": "Данные",
          "type": "ДвоичныеДанные",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "БуферДвоичныхДанных",
      "description": "Копия байтов в изменяемый буфер",
      "section": "Двоичные данные и кодировки"
    },
    {
      "ru": "ПолучитьДвоичныеДанныеИзБуфераДвоичныхДанных",
      "en": "GetBinaryDataFromBinaryDataBuffer",
      "params": [
        {
          "name": "Буфер",
          "type": "БуферДвоичныхДанных",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "ДвоичныеДанные",
      "description": "Копия байтов буфера в неизменяемые данные",
      "section": "Двоичные данные и кодировки"
    },
    {
      "ru": "СоединитьДвоичныеДанные",
      "en": "ConcatBinaryData",
      "params": [
        {
          "name": "Части",
          "type": "Массив",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "ДвоичныеДанные",
      "description": "Конкатенация массива элементов `ДвоичныеДанные` (другой тип элемента — ошибка)",
      "section": "Двоичные данные и кодировки"
    },
    {
      "ru": "РазделитьДвоичныеДанные",
      "en": "SplitBinaryData",
      "params": [
        {
          "name": "Данные",
          "type": "ДвоичныеДанные",
          "optional": false,
          "variadic": false
        },
        {
          "name": "РазмерЧасти",
          "type": "Число",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "Массив",
      "description": "Делит данные на части указанного размера (последняя может быть короче); `РазмерЧасти <= 0` — ошибка",
      "section": "Двоичные данные и кодировки"
    },
    {
      "ru": "ОбъединитьПути",
      "en": "PathCombine",
      "params": [
        {
          "name": "Часть",
          "type": "Строка",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "Строка",
      "description": "Склеивает части пути через `node:path.join`: пустые части игнорируются, `..` нормализуется; без аргументов — `\".\"`",
      "section": "Файлы (только Node)",
      "env": "node"
    },
    {
      "ru": "ЧтениеТекста",
      "en": "ReadText",
      "params": [
        {
          "name": "Путь",
          "type": "Строка",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "Строка",
      "description": "Читает файл целиком как UTF-8; BOM не удаляется (остаётся символом `U+FEFF`)",
      "section": "Файлы (только Node)",
      "env": "node"
    },
    {
      "ru": "ЗаписьТекста",
      "en": "WriteText",
      "params": [
        {
          "name": "Путь",
          "type": "Строка",
          "optional": false,
          "variadic": false
        },
        {
          "name": "Текст",
          "type": "Строка",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": null,
      "description": "Записывает строку в UTF-8 без BOM, перезаписывая файл; каталог должен существовать",
      "section": "Файлы (только Node)",
      "env": "node"
    },
    {
      "ru": "ЗагрузитьСценарий",
      "en": "LoadScript",
      "params": [
        {
          "name": "Путь",
          "type": "Строка",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "Сценарий",
      "description": "Читает файл, снимает BOM, исполняет тело и возвращает объект `Сценарий`",
      "section": "Файлы (только Node)",
      "env": "node"
    },
    {
      "ru": "ЗагрузитьСценарийИзСтроки",
      "en": "LoadScriptFromString",
      "params": [
        {
          "name": "Исходник",
          "type": "Строка",
          "optional": false,
          "variadic": false
        },
        {
          "name": "Имя",
          "type": "Строка",
          "optional": true,
          "variadic": false
        }
      ],
      "returns": "Сценарий",
      "description": "Разбирает и исполняет исходник в новом сценарии; `Имя` задаёт путь сценария и базу разрешения его импортов (пустая строка = не задано)",
      "section": "Функции загрузки сценариев"
    },
    {
      "ru": "ТекущийСценарий",
      "en": "CurrentScript",
      "params": [],
      "returns": "Сценарий",
      "description": "Текущий исполняемый сценарий: внутри тела или метода загруженного сценария — он сам, иначе сценарий, запущенный через `run()`/CLI",
      "section": "Функции загрузки сценариев"
    },
    {
      "ru": "СтартовыйСценарий",
      "en": "StartupScript",
      "params": [],
      "returns": "Сценарий",
      "description": "Сценарий, переданный в `run()`/CLI; не меняется при загрузке других сценариев",
      "section": "Функции загрузки сценариев"
    },
    {
      "ru": "Выполнить",
      "en": "Execute",
      "params": [],
      "returns": null,
      "description": "Исполняет операторы из строки в текущей области видимости",
      "section": "Встроенные функции языка",
      "arityKnown": false
    },
    {
      "ru": "Вычислить",
      "en": "Eval",
      "params": [],
      "returns": "Любое",
      "description": "Вычисляет выражение в текущей области видимости",
      "section": "Встроенные функции языка",
      "arityKnown": false
    },
    {
      "ru": "ВызватьИсключение",
      "en": "Raise",
      "params": [],
      "returns": null,
      "description": "Бросает исключение; без аргумента перевыбрасывает текущее",
      "section": "Встроенные функции языка",
      "arityKnown": false
    },
    {
      "ru": "ОписаниеОшибки",
      "en": "ErrorDescription",
      "params": [],
      "returns": "Строка",
      "description": "Текст текущего исключения; вне блока `Исключение` — `\"\"`",
      "section": "Встроенные функции языка",
      "arityKnown": false
    },
    {
      "ru": "ИнформацияОбОшибке",
      "en": "ErrorInfo",
      "params": [],
      "returns": "ИнформацияОбОшибке",
      "description": "Объект сведений о текущем исключении",
      "section": "Встроенные функции языка",
      "arityKnown": false
    },
    {
      "ru": "ВызватьСобытие",
      "en": "RaiseEvent",
      "params": [],
      "returns": null,
      "description": "Вызывает подписчиков события на объекте текущего модуля",
      "section": "Встроенные функции языка",
      "arityKnown": false
    },
    {
      "ru": "ДобавитьОбработчик",
      "en": "AddHandler",
      "params": [],
      "returns": null,
      "description": "Подписывает обработчик на событие",
      "section": "Встроенные функции языка",
      "arityKnown": false
    },
    {
      "ru": "УдалитьОбработчик",
      "en": "RemoveHandler",
      "params": [],
      "returns": null,
      "description": "Отписывает обработчик от события",
      "section": "Встроенные функции языка",
      "arityKnown": false
    },
    {
      "ru": "ЭтотОбъект",
      "en": "ThisObject",
      "params": [],
      "returns": "Объект",
      "description": "Объект текущего модуля (для подписки и объектной формы обработчика)",
      "section": "Встроенные функции языка",
      "arityKnown": false
    },
    {
      "ru": "ПеременныеСреды",
      "en": "EnvironmentVariables",
      "params": [],
      "returns": "Соответствие",
      "description": "Снимок переменных среды процесса: ключи и строковые значения",
      "section": "Система и окружение"
    },
    {
      "ru": "ПолучитьПеременнуюСреды",
      "en": "GetEnvironmentVariable",
      "params": [
        {
          "name": "Имя",
          "type": "Строка",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": "Строка | Неопределено",
      "description": "Значение переменной или `Неопределено`, если её нет",
      "section": "Система и окружение"
    },
    {
      "ru": "УстановитьПеременнуюСреды",
      "en": "SetEnvironmentVariable",
      "params": [
        {
          "name": "Имя",
          "type": "Строка",
          "optional": false,
          "variadic": false
        },
        {
          "name": "Значение",
          "type": "Любое",
          "optional": false,
          "variadic": false
        }
      ],
      "returns": null,
      "description": "Задаёт переменную (значение приводится к строке); `Неопределено`/`Null` удаляют её",
      "section": "Система и окружение"
    }
  ],
  "types": [
    {
      "ru": "Массив",
      "en": "Array",
      "constructible": true,
      "methods": [
        {
          "ru": "Добавить",
          "en": "Add",
          "params": [
            {
              "name": "Значение",
              "type": "Произвольный",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Добавляет элемент в конец"
        },
        {
          "ru": "Удалить",
          "en": "Delete",
          "params": [
            {
              "name": "Индекс",
              "type": "Число",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Удаляет элемент по индексу, остальные сдвигаются"
        },
        {
          "ru": "Очистить",
          "en": "Clear",
          "params": [],
          "returns": null,
          "description": "Удаляет все элементы"
        },
        {
          "ru": "Найти",
          "en": "Find",
          "params": [
            {
              "name": "Значение",
              "type": "Произвольный",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": "Число, Неопределено",
          "description": "Индекс первого элемента, равного значению; `Неопределено`, если элемент не найден"
        },
        {
          "ru": "Количество",
          "en": "Count",
          "params": [],
          "returns": "Число",
          "description": "Текущее число элементов"
        },
        {
          "ru": "ВГраница",
          "en": "UBound",
          "params": [],
          "returns": "Число",
          "description": "Верхняя граница индексов, `Количество() - 1`; у пустого массива `-1`"
        }
      ],
      "properties": []
    },
    {
      "ru": "ФиксированныйМассив",
      "en": "FixedArray",
      "constructible": true,
      "methods": [
        {
          "ru": "Добавить",
          "en": "Add",
          "params": [
            {
              "name": "Значение",
              "type": "Произвольный",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Только чтение: бросает ошибку"
        },
        {
          "ru": "Удалить",
          "en": "Delete",
          "params": [
            {
              "name": "Индекс",
              "type": "Число",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Только чтение: бросает ошибку"
        },
        {
          "ru": "Очистить",
          "en": "Clear",
          "params": [],
          "returns": null,
          "description": "Только чтение: бросает ошибку"
        },
        {
          "ru": "Найти",
          "en": "Find",
          "params": [
            {
              "name": "Значение",
              "type": "Произвольный",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": "Число, Неопределено",
          "description": "Как у массива"
        },
        {
          "ru": "Количество",
          "en": "Count",
          "params": [],
          "returns": "Число",
          "description": "Как у массива"
        },
        {
          "ru": "ВГраница",
          "en": "UBound",
          "params": [],
          "returns": "Число",
          "description": "Как у массива"
        }
      ],
      "properties": []
    },
    {
      "ru": "Структура",
      "en": "Structure",
      "constructible": true,
      "methods": [
        {
          "ru": "Вставить",
          "en": "Insert",
          "params": [
            {
              "name": "Ключ",
              "type": "Строка",
              "optional": false,
              "variadic": false
            },
            {
              "name": "Значение",
              "type": "Произвольный",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Добавляет пару или заменяет значение существующего ключа"
        },
        {
          "ru": "Свойство",
          "en": "Property",
          "params": [
            {
              "name": "Ключ",
              "type": "Строка",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": "Булево",
          "description": "`Истина`, если ключ есть"
        },
        {
          "ru": "Удалить",
          "en": "Delete",
          "params": [
            {
              "name": "Ключ",
              "type": "Строка",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Удаляет ключ, если он есть"
        },
        {
          "ru": "Очистить",
          "en": "Clear",
          "params": [],
          "returns": null,
          "description": "Удаляет все ключи"
        },
        {
          "ru": "Количество",
          "en": "Count",
          "params": [],
          "returns": "Число",
          "description": "Число ключей"
        }
      ],
      "properties": []
    },
    {
      "ru": "ФиксированнаяСтруктура",
      "en": "FixedStructure",
      "constructible": true,
      "methods": [
        {
          "ru": "Вставить",
          "en": "Insert",
          "params": [
            {
              "name": "Ключ",
              "type": "Строка",
              "optional": false,
              "variadic": false
            },
            {
              "name": "Значение",
              "type": "Произвольный",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Только чтение: бросает ошибку"
        },
        {
          "ru": "Свойство",
          "en": "Property",
          "params": [
            {
              "name": "Ключ",
              "type": "Строка",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": "Булево",
          "description": "`Истина`, если ключ есть"
        },
        {
          "ru": "Удалить",
          "en": "Delete",
          "params": [
            {
              "name": "Ключ",
              "type": "Строка",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Только чтение: бросает ошибку"
        },
        {
          "ru": "Очистить",
          "en": "Clear",
          "params": [],
          "returns": null,
          "description": "Только чтение: бросает ошибку"
        },
        {
          "ru": "Количество",
          "en": "Count",
          "params": [],
          "returns": "Число",
          "description": "Число ключей"
        }
      ],
      "properties": []
    },
    {
      "ru": "Соответствие",
      "en": "Map",
      "constructible": true,
      "methods": [
        {
          "ru": "Вставить",
          "en": "Insert",
          "params": [
            {
              "name": "Ключ",
              "type": "Произвольный",
              "optional": false,
              "variadic": false
            },
            {
              "name": "Значение",
              "type": "Произвольный",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Добавляет пару или заменяет значение существующего ключа"
        },
        {
          "ru": "Получить",
          "en": "Get",
          "params": [
            {
              "name": "Ключ",
              "type": "Произвольный",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": "Произвольный, Неопределено",
          "description": "Значение по ключу; `Неопределено`, если ключа нет"
        },
        {
          "ru": "Удалить",
          "en": "Delete",
          "params": [
            {
              "name": "Ключ",
              "type": "Произвольный",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Удаляет пару, если ключ есть"
        },
        {
          "ru": "Количество",
          "en": "Count",
          "params": [],
          "returns": "Число",
          "description": "Число пар"
        }
      ],
      "properties": []
    },
    {
      "ru": "ФиксированноеСоответствие",
      "en": "FixedMap",
      "constructible": true,
      "methods": [
        {
          "ru": "Вставить",
          "en": "Insert",
          "params": [
            {
              "name": "Ключ",
              "type": "Произвольный",
              "optional": false,
              "variadic": false
            },
            {
              "name": "Значение",
              "type": "Произвольный",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Только чтение: бросает ошибку"
        },
        {
          "ru": "Получить",
          "en": "Get",
          "params": [
            {
              "name": "Ключ",
              "type": "Произвольный",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": "Произвольный, Неопределено",
          "description": "Как у обычного соответствия"
        },
        {
          "ru": "Удалить",
          "en": "Delete",
          "params": [
            {
              "name": "Ключ",
              "type": "Произвольный",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Только чтение: бросает ошибку"
        },
        {
          "ru": "Количество",
          "en": "Count",
          "params": [],
          "returns": "Число",
          "description": "Число пар"
        }
      ],
      "properties": []
    },
    {
      "ru": "СписокЗначений",
      "en": "ValueList",
      "constructible": true,
      "methods": [
        {
          "ru": "Добавить",
          "en": "Add",
          "params": [
            {
              "name": "Значение",
              "type": "Произвольный",
              "optional": true,
              "variadic": false
            },
            {
              "name": "Представление",
              "type": "Строка",
              "optional": true,
              "variadic": false
            },
            {
              "name": "Пометка",
              "type": "Булево",
              "optional": true,
              "variadic": false
            },
            {
              "name": "Картинка",
              "type": "Произвольный",
              "optional": true,
              "variadic": false
            }
          ],
          "returns": "ЭлементСпискаЗначений",
          "description": "Добавляет элемент в конец"
        },
        {
          "ru": "Вставить",
          "en": "Insert",
          "params": [
            {
              "name": "Индекс",
              "type": "Число",
              "optional": false,
              "variadic": false
            },
            {
              "name": "Значение",
              "type": "Произвольный",
              "optional": true,
              "variadic": false
            },
            {
              "name": "Представление",
              "type": "Строка",
              "optional": true,
              "variadic": false
            },
            {
              "name": "Пометка",
              "type": "Булево",
              "optional": true,
              "variadic": false
            },
            {
              "name": "Картинка",
              "type": "Произвольный",
              "optional": true,
              "variadic": false
            }
          ],
          "returns": "ЭлементСпискаЗначений",
          "description": "Вставляет элемент в позицию `0…Количество()`"
        },
        {
          "ru": "Удалить",
          "en": "Delete",
          "params": [
            {
              "name": "Индекс",
              "type": "Число` или `Элемент: ЭлементСпискаЗначений",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Удаляет элемент"
        },
        {
          "ru": "Индекс",
          "en": "IndexOf",
          "params": [
            {
              "name": "Элемент",
              "type": "ЭлементСпискаЗначений",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": "Число",
          "description": "Позиция элемента; `-1`, если элемент не из этого списка"
        },
        {
          "ru": "Количество",
          "en": "Count",
          "params": [],
          "returns": "Число",
          "description": "Число элементов"
        },
        {
          "ru": "ВГраница",
          "en": "UBound",
          "params": [],
          "returns": "Число",
          "description": "Верхняя граница индексов; у пустого списка `-1`"
        },
        {
          "ru": "Получить",
          "en": "Get",
          "params": [
            {
              "name": "Индекс",
              "type": "Число",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": "ЭлементСпискаЗначений",
          "description": "Элемент по индексу; выход за границы — ошибка"
        },
        {
          "ru": "НайтиПоЗначению",
          "en": "FindByValue",
          "params": [
            {
              "name": "Значение",
              "type": "Произвольный",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": "ЭлементСпискаЗначений, Неопределено",
          "description": "Первый элемент с равным значением"
        },
        {
          "ru": "Сдвинуть",
          "en": "Move",
          "params": [
            {
              "name": "Индекс",
              "type": "Число` или `Элемент: ЭлементСпискаЗначений",
              "optional": false,
              "variadic": false
            },
            {
              "name": "Смещение",
              "type": "Число",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Сдвигает элемент на указанное число позиций; выход за диапазон — ошибка"
        },
        {
          "ru": "СортироватьПоЗначению",
          "en": "SortByValue",
          "params": [
            {
              "name": "Направление",
              "type": "НаправлениеСортировки",
              "optional": true,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Сортирует по значениям; по умолчанию по возрастанию"
        },
        {
          "ru": "СортироватьПоПредставлению",
          "en": "SortByPresentation",
          "params": [
            {
              "name": "Направление",
              "type": "НаправлениеСортировки",
              "optional": true,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Сортирует по представлениям; по умолчанию по возрастанию"
        },
        {
          "ru": "ВыгрузитьЗначения",
          "en": "UnloadValues",
          "params": [],
          "returns": "Массив",
          "description": "Новый массив значений элементов"
        },
        {
          "ru": "ЗагрузитьЗначения",
          "en": "LoadValues",
          "params": [
            {
              "name": "Массив",
              "type": "Массив",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Заменяет содержимое значениями массива"
        },
        {
          "ru": "Очистить",
          "en": "Clear",
          "params": [],
          "returns": null,
          "description": "Удаляет все элементы"
        },
        {
          "ru": "Скопировать",
          "en": "Copy",
          "params": [],
          "returns": "СписокЗначений",
          "description": "Копия списка (значение, представление, пометка, картинка)"
        },
        {
          "ru": "ПолучитьИдентификатор",
          "en": "GetID",
          "params": [],
          "returns": "Число",
          "description": "Уникальный идентификатор элемента в пределах списка; не меняется при сдвиге и удалении других элементов"
        }
      ],
      "properties": [
        {
          "ru": "ТипЗначения",
          "en": "ValueType",
          "type": "Произвольный",
          "access": "readwrite",
          "description": "Тип (описание типов) значений элементов; в реализации хранится как есть и не проверяется"
        },
        {
          "ru": "ДоступныеЗначения",
          "en": "AvailableValues",
          "type": "Произвольный",
          "access": "readwrite",
          "description": "Ограничение допустимых значений; в реализации хранится как есть и не проверяется"
        },
        {
          "ru": "Значение",
          "en": "Value",
          "type": "Произвольный",
          "access": "readwrite",
          "description": "Значение элемента"
        },
        {
          "ru": "Представление",
          "en": "Presentation",
          "type": "Строка",
          "access": "readwrite",
          "description": "Строковое представление; по умолчанию пустая строка"
        },
        {
          "ru": "Пометка",
          "en": "Check",
          "type": "Булево",
          "access": "readwrite",
          "description": "Пометка элемента; по умолчанию `Ложь`"
        },
        {
          "ru": "Картинка",
          "en": "Picture",
          "type": "Произвольный",
          "access": "readwrite",
          "description": "Картинка элемента; по умолчанию `Неопределено`"
        }
      ]
    },
    {
      "ru": "ТаблицаЗначений",
      "en": "ValueTable",
      "constructible": true,
      "methods": [
        {
          "ru": "Добавить",
          "en": "Add",
          "params": [],
          "returns": "СтрокаТаблицыЗначений",
          "description": "Добавляет строку в конец"
        },
        {
          "ru": "Вставить",
          "en": "Insert",
          "params": [
            {
              "name": "Индекс",
              "type": "Число",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": "СтрокаТаблицыЗначений",
          "description": "Вставляет строку в позицию; индекс вне диапазона — строка добавляется в конец"
        },
        {
          "ru": "Удалить",
          "en": "Delete",
          "params": [
            {
              "name": "Индекс",
              "type": "Число` или `Строка: СтрокаТаблицыЗначений",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Удаляет строку"
        },
        {
          "ru": "Индекс",
          "en": "IndexOf",
          "params": [
            {
              "name": "Строка",
              "type": "СтрокаТаблицыЗначений",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": "Число",
          "description": "Позиция строки; `-1`, если строки нет в таблице"
        },
        {
          "ru": "Количество",
          "en": "Count",
          "params": [],
          "returns": "Число",
          "description": "Число строк"
        },
        {
          "ru": "Получить",
          "en": "Get",
          "params": [
            {
              "name": "Индекс",
              "type": "Число",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": "СтрокаТаблицыЗначений",
          "description": "Строка по индексу"
        },
        {
          "ru": "Очистить",
          "en": "Clear",
          "params": [],
          "returns": null,
          "description": "Удаляет все строки; структура колонок не меняется"
        },
        {
          "ru": "Сдвинуть",
          "en": "Move",
          "params": [
            {
              "name": "Индекс",
              "type": "Число` или `Строка: СтрокаТаблицыЗначений",
              "optional": false,
              "variadic": false
            },
            {
              "name": "Смещение",
              "type": "Число",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Сдвигает строку; выход за диапазон — ошибка"
        },
        {
          "ru": "ВыгрузитьКолонку",
          "en": "UnloadColumn",
          "params": [
            {
              "name": "Колонка",
              "type": "КолонкаТаблицыЗначений` или `Имя: Строка` или `Индекс: Число",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": "Массив",
          "description": "Значения колонки по строкам"
        },
        {
          "ru": "ЗагрузитьКолонку",
          "en": "LoadColumn",
          "params": [
            {
              "name": "Массив",
              "type": "Массив",
              "optional": false,
              "variadic": false
            },
            {
              "name": "Колонка",
              "type": "КолонкаТаблицыЗначений` или `Имя: Строка` или `Индекс: Число",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Устанавливает значения по строкам; недостающие элементы массива — `Неопределено`"
        },
        {
          "ru": "ЗаполнитьЗначения",
          "en": "FillValues",
          "params": [
            {
              "name": "Значение",
              "type": "Произвольный",
              "optional": false,
              "variadic": false
            },
            {
              "name": "Колонки",
              "type": "Строка",
              "optional": true,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Заполняет указанные колонки (через запятую); пусто или не указано — все колонки"
        },
        {
          "ru": "Итог",
          "en": "Total",
          "params": [
            {
              "name": "Колонка",
              "type": "КолонкаТаблицыЗначений` или `Имя: Строка` или `Индекс: Число",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": "Число",
          "description": "Сумма числовых значений колонки; нечисловые игнорируются, для пустой колонки `0`"
        },
        {
          "ru": "Найти",
          "en": "Find",
          "params": [
            {
              "name": "Значение",
              "type": "Произвольный",
              "optional": false,
              "variadic": false
            },
            {
              "name": "Колонки",
              "type": "Строка",
              "optional": true,
              "variadic": false
            }
          ],
          "returns": "СтрокаТаблицыЗначений, Неопределено",
          "description": "Первая строка, где в одной из указанных колонок значение равно искомому"
        },
        {
          "ru": "НайтиСтроки",
          "en": "FindRows",
          "params": [
            {
              "name": "Отбор",
              "type": "Структура",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": "Массив",
          "description": "Строки, у которых значения колонок совпадают с ключами структуры"
        },
        {
          "ru": "Сортировать",
          "en": "Sort",
          "params": [
            {
              "name": "Правила",
              "type": "Строка",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Сортирует по правилам `Колонка [Возр или Убыв], …`; по возрастанию по умолчанию"
        },
        {
          "ru": "Свернуть",
          "en": "GroupBy",
          "params": [
            {
              "name": "Группировки",
              "type": "Строка",
              "optional": false,
              "variadic": false
            },
            {
              "name": "Суммируемые",
              "type": "Строка",
              "optional": true,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Группирует строки по колонкам и суммирует числовые значения суммируемых; прочие колонки удаляются"
        },
        {
          "ru": "СкопироватьКолонки",
          "en": "CopyColumns",
          "params": [
            {
              "name": "Колонки",
              "type": "Строка",
              "optional": true,
              "variadic": false
            }
          ],
          "returns": "ТаблицаЗначений",
          "description": "Новая таблица с копиями указанных колонок, без строк"
        },
        {
          "ru": "Скопировать",
          "en": "Copy",
          "params": [
            {
              "name": "Строки",
              "type": "Массив` (строк этой таблицы) или `Строки?: Структура",
              "optional": true,
              "variadic": false
            },
            {
              "name": "Колонки",
              "type": "Строка",
              "optional": true,
              "variadic": false
            }
          ],
          "returns": "ТаблицаЗначений",
          "description": "Копия указанных строк и колонок; без аргументов — полная копия"
        },
        {
          "ru": "Добавить",
          "en": "Add",
          "params": [
            {
              "name": "Имя",
              "type": "Строка",
              "optional": false,
              "variadic": false
            },
            {
              "name": "ТипЗначения",
              "type": "Произвольный",
              "optional": true,
              "variadic": false
            },
            {
              "name": "Заголовок",
              "type": "Строка",
              "optional": true,
              "variadic": false
            },
            {
              "name": "Ширина",
              "type": "Число",
              "optional": true,
              "variadic": false
            }
          ],
          "returns": "КолонкаТаблицыЗначений",
          "description": "Добавляет колонку; заголовок по умолчанию равен имени, ширина — `0`"
        },
        {
          "ru": "Вставить",
          "en": "Insert",
          "params": [
            {
              "name": "Индекс",
              "type": "Число",
              "optional": false,
              "variadic": false
            },
            {
              "name": "Имя",
              "type": "Строка",
              "optional": false,
              "variadic": false
            },
            {
              "name": "ТипЗначения",
              "type": "Произвольный",
              "optional": true,
              "variadic": false
            },
            {
              "name": "Заголовок",
              "type": "Строка",
              "optional": true,
              "variadic": false
            },
            {
              "name": "Ширина",
              "type": "Число",
              "optional": true,
              "variadic": false
            }
          ],
          "returns": "КолонкаТаблицыЗначений",
          "description": "Вставляет колонку в позицию"
        },
        {
          "ru": "Удалить",
          "en": "Delete",
          "params": [
            {
              "name": "Колонка",
              "type": "КолонкаТаблицыЗначений` или `Имя: Строка` или `Индекс: Число",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Удаляет колонку; её значения удаляются из строк и индексов"
        },
        {
          "ru": "Индекс",
          "en": "IndexOf",
          "params": [
            {
              "name": "Колонка",
              "type": "КолонкаТаблицыЗначений",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": "Число",
          "description": "Позиция колонки; `-1`, если колонки нет в таблице"
        },
        {
          "ru": "Количество",
          "en": "Count",
          "params": [],
          "returns": "Число",
          "description": "Число колонок"
        },
        {
          "ru": "Найти",
          "en": "Find",
          "params": [
            {
              "name": "Имя",
              "type": "Строка",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": "КолонкаТаблицыЗначений, Неопределено",
          "description": "Колонка по имени"
        },
        {
          "ru": "Получить",
          "en": "Get",
          "params": [
            {
              "name": "Индекс",
              "type": "Число",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": "КолонкаТаблицыЗначений",
          "description": "Колонка по индексу"
        },
        {
          "ru": "Сдвинуть",
          "en": "Move",
          "params": [
            {
              "name": "Колонка",
              "type": "КолонкаТаблицыЗначений` или `Имя: Строка` или `Индекс: Число",
              "optional": false,
              "variadic": false
            },
            {
              "name": "Смещение",
              "type": "Число",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Сдвигает колонку; позиция зацикливается по модулю"
        },
        {
          "ru": "Очистить",
          "en": "Clear",
          "params": [],
          "returns": null,
          "description": "Удаляет все колонки и их значения"
        },
        {
          "ru": "Получить",
          "en": "Get",
          "params": [
            {
              "name": "Колонка",
              "type": "КолонкаТаблицыЗначений` или `Имя: Строка` или `Индекс: Число",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": "Произвольный",
          "description": "Значение колонки"
        },
        {
          "ru": "Установить",
          "en": "Set",
          "params": [
            {
              "name": "Колонка",
              "type": "КолонкаТаблицыЗначений` или `Имя: Строка` или `Индекс: Число",
              "optional": false,
              "variadic": false
            },
            {
              "name": "Значение",
              "type": "Произвольный",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Устанавливает значение колонки"
        },
        {
          "ru": "Владелец",
          "en": "Owner",
          "params": [],
          "returns": "ТаблицаЗначений",
          "description": "Таблица-владелец"
        },
        {
          "ru": "Количество",
          "en": "Count",
          "params": [],
          "returns": "Число",
          "description": "Число колонок таблицы"
        },
        {
          "ru": "Добавить",
          "en": "Add",
          "params": [
            {
              "name": "ИменаКолонок",
              "type": "Строка",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": "ИндексКоллекции",
          "description": "Создаёт индекс по колонкам (имена через запятую; все должны существовать)"
        },
        {
          "ru": "Удалить",
          "en": "Delete",
          "params": [
            {
              "name": "Индекс",
              "type": "Число` или `Индекс: ИндексКоллекции",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Удаляет индекс"
        },
        {
          "ru": "Количество",
          "en": "Count",
          "params": [],
          "returns": "Число",
          "description": "Число индексов"
        },
        {
          "ru": "Очистить",
          "en": "Clear",
          "params": [],
          "returns": null,
          "description": "Удаляет все индексы"
        }
      ],
      "properties": [
        {
          "ru": "Колонки",
          "en": "Columns",
          "type": "КоллекцияКолонокТаблицыЗначений",
          "access": "read",
          "description": "Коллекция колонок"
        },
        {
          "ru": "Индексы",
          "en": "Indexes",
          "type": "ИндексыКоллекции",
          "access": "read",
          "description": "Коллекция индексов (описаний индексируемых колонок)"
        },
        {
          "ru": "Имя",
          "en": "Name",
          "type": "Строка",
          "access": "readwrite",
          "description": "Имя колонки (регистронезависимо при поиске)"
        },
        {
          "ru": "Заголовок",
          "en": "Title",
          "type": "Строка",
          "access": "readwrite",
          "description": "Заголовок; по умолчанию равен имени"
        },
        {
          "ru": "ТипЗначения",
          "en": "ValueType",
          "type": "Произвольный",
          "access": "read",
          "description": "Тип (описание типов) значений; только чтение"
        },
        {
          "ru": "Ширина",
          "en": "Width",
          "type": "Число",
          "access": "readwrite",
          "description": "Ширина колонки; по умолчанию `0`"
        }
      ]
    },
    {
      "ru": "ДеревоЗначений",
      "en": "ValueTree",
      "constructible": true,
      "methods": [
        {
          "ru": "Скопировать",
          "en": "Copy",
          "params": [],
          "returns": "ДеревоЗначений",
          "description": "Глубокая копия: колонки и все узлы дерева"
        },
        {
          "ru": "Получить",
          "en": "Get",
          "params": [
            {
              "name": "Колонка",
              "type": "КолонкаТаблицыЗначений` или `Имя: Строка` или `Индекс: Число",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": "Произвольный",
          "description": "Значение колонки"
        },
        {
          "ru": "Установить",
          "en": "Set",
          "params": [
            {
              "name": "Колонка",
              "type": "КолонкаТаблицыЗначений` или `Имя: Строка` или `Индекс: Число",
              "optional": false,
              "variadic": false
            },
            {
              "name": "Значение",
              "type": "Произвольный",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Устанавливает значение колонки"
        },
        {
          "ru": "Владелец",
          "en": "Owner",
          "params": [],
          "returns": "ДеревоЗначений",
          "description": "Дерево-владелец"
        },
        {
          "ru": "Уровень",
          "en": "Level",
          "params": [],
          "returns": "Число",
          "description": "Уровень строки: `0` у корневых, далее +1 на каждый подузел"
        },
        {
          "ru": "Добавить",
          "en": "Add",
          "params": [],
          "returns": "СтрокаДереваЗначений",
          "description": "Добавляет строку в конец"
        },
        {
          "ru": "Вставить",
          "en": "Insert",
          "params": [
            {
              "name": "Индекс",
              "type": "Число",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": "СтрокаДереваЗначений",
          "description": "Вставляет строку в позицию"
        },
        {
          "ru": "Удалить",
          "en": "Delete",
          "params": [
            {
              "name": "Индекс",
              "type": "Число` или `Строка: СтрокаДереваЗначений",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Удаляет строку вместе с подузлами"
        },
        {
          "ru": "Индекс",
          "en": "IndexOf",
          "params": [
            {
              "name": "Строка",
              "type": "СтрокаДереваЗначений",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": "Число",
          "description": "Позиция строки; `-1`, если строки нет в коллекции"
        },
        {
          "ru": "Количество",
          "en": "Count",
          "params": [],
          "returns": "Число",
          "description": "Число строк в коллекции"
        },
        {
          "ru": "Получить",
          "en": "Get",
          "params": [
            {
              "name": "Индекс",
              "type": "Число",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": "СтрокаДереваЗначений",
          "description": "Строка по индексу"
        },
        {
          "ru": "Очистить",
          "en": "Clear",
          "params": [],
          "returns": null,
          "description": "Удаляет все строки коллекции"
        },
        {
          "ru": "Владелец",
          "en": "Owner",
          "params": [],
          "returns": "ДеревоЗначений",
          "description": "Дерево-владелец"
        },
        {
          "ru": "Сдвинуть",
          "en": "Move",
          "params": [
            {
              "name": "Индекс",
              "type": "Число` или `Строка: СтрокаДереваЗначений",
              "optional": false,
              "variadic": false
            },
            {
              "name": "Смещение",
              "type": "Число",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Сдвигает строку; позиция зацикливается по модулю"
        },
        {
          "ru": "ВыгрузитьКолонку",
          "en": "UnloadColumn",
          "params": [
            {
              "name": "Колонка",
              "type": "КолонкаТаблицыЗначений` или `Имя: Строка` или `Индекс: Число",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": "Массив",
          "description": "Значения колонки по строкам коллекции"
        },
        {
          "ru": "ЗагрузитьКолонку",
          "en": "LoadColumn",
          "params": [
            {
              "name": "Массив",
              "type": "Массив",
              "optional": false,
              "variadic": false
            },
            {
              "name": "Колонка",
              "type": "КолонкаТаблицыЗначений` или `Имя: Строка` или `Индекс: Число",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Устанавливает значения по строкам; недостающие элементы массива — `Неопределено`"
        },
        {
          "ru": "Итог",
          "en": "Total",
          "params": [
            {
              "name": "Колонка",
              "type": "КолонкаТаблицыЗначений` или `Имя: Строка` или `Индекс: Число",
              "optional": false,
              "variadic": false
            },
            {
              "name": "ВключатьПодузлы",
              "type": "Булево",
              "optional": true,
              "variadic": false
            }
          ],
          "returns": "Число",
          "description": "Сумма числовых значений; при `ВключатьПодузлы = Истина` — рекурсивно по всем подузлам"
        },
        {
          "ru": "Найти",
          "en": "Find",
          "params": [
            {
              "name": "Значение",
              "type": "Произвольный",
              "optional": false,
              "variadic": false
            },
            {
              "name": "Колонки",
              "type": "Строка",
              "optional": true,
              "variadic": false
            },
            {
              "name": "ВключатьПодузлы",
              "type": "Булево",
              "optional": true,
              "variadic": false
            }
          ],
          "returns": "СтрокаДереваЗначений, Неопределено",
          "description": "Первая строка с равным значением; при `ВключатьПодузлы = Истина` — рекурсивно"
        },
        {
          "ru": "НайтиСтроки",
          "en": "FindRows",
          "params": [
            {
              "name": "Отбор",
              "type": "Структура",
              "optional": false,
              "variadic": false
            },
            {
              "name": "ВключатьПодузлы",
              "type": "Булево",
              "optional": true,
              "variadic": false
            }
          ],
          "returns": "Массив",
          "description": "Строки, у которых значения колонок совпадают с ключами структуры; при `ВключатьПодузлы = Истина` — рекурсивно"
        },
        {
          "ru": "Сортировать",
          "en": "Sort",
          "params": [
            {
              "name": "Правила",
              "type": "Строка",
              "optional": false,
              "variadic": false
            },
            {
              "name": "СортироватьПодузлы",
              "type": "Булево",
              "optional": true,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Сортирует по правилам `Колонка [Возр или Убыв], …`; при `СортироватьПодузлы = Истина` — рекурсивно"
        }
      ],
      "properties": [
        {
          "ru": "Колонки",
          "en": "Columns",
          "type": "КоллекцияКолонокТаблицыЗначений",
          "access": "read",
          "description": "Коллекция колонок (тот же тип, что у таблицы значений)"
        },
        {
          "ru": "Строки",
          "en": "Rows",
          "type": "КоллекцияСтрокДереваЗначений",
          "access": "read",
          "description": "Корневые строки дерева"
        },
        {
          "ru": "Родитель",
          "en": "Parent",
          "type": "СтрокаДереваЗначений, Неопределено",
          "access": "read",
          "description": "Родительская строка; у корневой — `Неопределено`"
        },
        {
          "ru": "Строки",
          "en": "Rows",
          "type": "КоллекцияСтрокДереваЗначений",
          "access": "read",
          "description": "Подчинённые строки"
        },
        {
          "ru": "Родитель",
          "en": "Parent",
          "type": "СтрокаДереваЗначений, Неопределено",
          "access": "read",
          "description": "Строка-владелец коллекции; у корневой коллекции — `Неопределено`"
        }
      ]
    },
    {
      "ru": "БуферДвоичныхДанных",
      "en": "BinaryDataBuffer",
      "constructible": true,
      "methods": [
        {
          "ru": "Получить",
          "en": "Get",
          "params": [
            {
              "name": "Индекс",
              "type": "Число",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": "Число",
          "description": "Байт по индексу (0–255)"
        },
        {
          "ru": "Установить",
          "en": "Set",
          "params": [
            {
              "name": "Индекс",
              "type": "Число",
              "optional": false,
              "variadic": false
            },
            {
              "name": "Значение",
              "type": "Число",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Записывает байт; значение вне 0–255 — исключение"
        },
        {
          "ru": "Записать",
          "en": "Write",
          "params": [
            {
              "name": "Позиция",
              "type": "Число",
              "optional": false,
              "variadic": false
            },
            {
              "name": "Буфер",
              "type": "БуферДвоичныхДанных",
              "optional": false,
              "variadic": false
            },
            {
              "name": "Количество",
              "type": "Число",
              "optional": true,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Копирует в позицию `Позиция` первые `Количество` байт из буфера; `0` — весь буфер"
        },
        {
          "ru": "Прочитать",
          "en": "Read",
          "params": [
            {
              "name": "Позиция",
              "type": "Число",
              "optional": false,
              "variadic": false
            },
            {
              "name": "Количество",
              "type": "Число",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": "БуферДвоичныхДанных",
          "description": "Новый буфер из `Количество` байт начиная с `Позиция`"
        },
        {
          "ru": "Перевернуть",
          "en": "Reverse",
          "params": [],
          "returns": "БуферДвоичныхДанных",
          "description": "Новый буфер с байтами в обратном порядке"
        },
        {
          "ru": "Скопировать",
          "en": "Copy",
          "params": [],
          "returns": "БуферДвоичныхДанных",
          "description": "Независимая копия буфера"
        },
        {
          "ru": "Соединить",
          "en": "Concat",
          "params": [
            {
              "name": "Буферы",
              "type": "Массив",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": "БуферДвоичныхДанных",
          "description": "Новый буфер — конкатенация элементов массива"
        },
        {
          "ru": "УстановитьТолькоЧтение",
          "en": "SetReadOnly",
          "params": [],
          "returns": null,
          "description": "Переводит буфер в режим только для чтения"
        },
        {
          "ru": "ЗаписатьЦелое16",
          "en": "WriteInt16",
          "params": [
            {
              "name": "Позиция",
              "type": "Число",
              "optional": false,
              "variadic": false
            },
            {
              "name": "Значение",
              "type": "Число",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Записывает 2 байта целого"
        },
        {
          "ru": "ЗаписатьЦелое32",
          "en": "WriteInt32",
          "params": [
            {
              "name": "Позиция",
              "type": "Число",
              "optional": false,
              "variadic": false
            },
            {
              "name": "Значение",
              "type": "Число",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Записывает 4 байта целого"
        },
        {
          "ru": "ЗаписатьЦелое64",
          "en": "WriteInt64",
          "params": [
            {
              "name": "Позиция",
              "type": "Число",
              "optional": false,
              "variadic": false
            },
            {
              "name": "Значение",
              "type": "Число",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Записывает 8 байт целого"
        },
        {
          "ru": "ПрочитатьЦелое16",
          "en": "ReadInt16",
          "params": [
            {
              "name": "Позиция",
              "type": "Число",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": "Число",
          "description": "Читает беззнаковое целое из 2 байт"
        },
        {
          "ru": "ПрочитатьЦелое32",
          "en": "ReadInt32",
          "params": [
            {
              "name": "Позиция",
              "type": "Число",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": "Число",
          "description": "Читает беззнаковое целое из 4 байт"
        },
        {
          "ru": "ПрочитатьЦелое64",
          "en": "ReadInt64",
          "params": [
            {
              "name": "Позиция",
              "type": "Число",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": "Число",
          "description": "Читает беззнаковое целое из 8 байт"
        },
        {
          "ru": "ЗаписатьПобитовоеИ",
          "en": "WriteBitwiseAnd",
          "params": [
            {
              "name": "Позиция",
              "type": "Число",
              "optional": false,
              "variadic": false
            },
            {
              "name": "Буфер",
              "type": "БуферДвоичныхДанных",
              "optional": false,
              "variadic": false
            },
            {
              "name": "Количество",
              "type": "Число",
              "optional": true,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Побайтовое И с буфером"
        },
        {
          "ru": "ЗаписатьПобитовоеИли",
          "en": "WriteBitwiseOr",
          "params": [
            {
              "name": "Позиция",
              "type": "Число",
              "optional": false,
              "variadic": false
            },
            {
              "name": "Буфер",
              "type": "БуферДвоичныхДанных",
              "optional": false,
              "variadic": false
            },
            {
              "name": "Количество",
              "type": "Число",
              "optional": true,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Побайтовое ИЛИ с буфером"
        },
        {
          "ru": "ЗаписатьПобитовоеИсключительноеИли",
          "en": "WriteBitwiseXor",
          "params": [
            {
              "name": "Позиция",
              "type": "Число",
              "optional": false,
              "variadic": false
            },
            {
              "name": "Буфер",
              "type": "БуферДвоичныхДанных",
              "optional": false,
              "variadic": false
            },
            {
              "name": "Количество",
              "type": "Число",
              "optional": true,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Побайтовое исключающее ИЛИ с буфером"
        },
        {
          "ru": "ЗаписатьПобитовоеИНе",
          "en": "WriteBitwiseAndNot",
          "params": [
            {
              "name": "Позиция",
              "type": "Число",
              "optional": false,
              "variadic": false
            },
            {
              "name": "Буфер",
              "type": "БуферДвоичныхДанных",
              "optional": false,
              "variadic": false
            },
            {
              "name": "Количество",
              "type": "Число",
              "optional": true,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Побайтовое И с инвертированным буфером (И-НЕ)"
        }
      ],
      "properties": [
        {
          "ru": "Размер",
          "en": "Size",
          "type": "Число",
          "access": "read",
          "description": "Количество байт в буфере"
        },
        {
          "ru": "ТолькоЧтение",
          "en": "ReadOnly",
          "type": "Булево",
          "access": "read",
          "description": "`Истина`, если буфер переведён в режим только для чтения"
        },
        {
          "ru": "ПорядокБайтов",
          "en": "ByteOrder",
          "type": "ПорядокБайтов",
          "access": "readwrite",
          "description": "Порядок байтов для `ПрочитатьЦелое*`/`ЗаписатьЦелое*`; по умолчанию `LittleEndian`"
        }
      ]
    },
    {
      "ru": "ДвоичныеДанные",
      "constructible": false,
      "methods": [
        {
          "ru": "Размер",
          "en": "Size",
          "params": [],
          "returns": "Число",
          "description": "Количество байт"
        }
      ],
      "properties": []
    },
    {
      "ru": "Сценарий",
      "constructible": false,
      "methods": [],
      "properties": [
        {
          "ru": "Источник",
          "en": "Source",
          "type": "Строка",
          "access": "read",
          "description": "Путь, переданный при запуске/загрузке; `\"\"`, если путь неизвестен"
        },
        {
          "ru": "Каталог",
          "en": "Directory",
          "type": "Строка",
          "access": "read",
          "description": "Каталог из `Источник`; `\"\"`, если пути нет"
        },
        {
          "ru": "Имя",
          "en": "Name",
          "type": "Строка",
          "access": "read",
          "description": "Имя файла из `Источник`; `\"\"`, если пути нет"
        }
      ]
    },
    {
      "ru": "ИнформацияОбОшибке",
      "en": "ErrorInfo",
      "constructible": false,
      "methods": [],
      "properties": [
        {
          "ru": "Описание",
          "en": "Description",
          "type": "Строка",
          "access": "read",
          "description": "Текст текущего исключения"
        },
        {
          "ru": "ПодробноеОписаниеОшибки",
          "en": "DetailErrorDescription",
          "type": "Строка",
          "access": "read",
          "description": "То же значение, что и `Описание` (отдельного стека нет)"
        },
        {
          "ru": "Причина",
          "en": "Cause",
          "type": "Null",
          "access": "read",
          "description": "Всегда `Null`: вложенные причины не поддерживаются"
        }
      ]
    },
    {
      "ru": "СистемнаяИнформация",
      "en": "SystemInfo",
      "constructible": true,
      "methods": [
        {
          "ru": "ПолучитьПутьПапки",
          "en": "GetFolderPath",
          "params": [
            {
              "name": "Папка",
              "type": "СпециальнаяПапка",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": "Строка",
          "description": "Путь специальной папки (см. [СпециальнаяПапка](#специальнаяпапка--specialfolder))"
        },
        {
          "ru": "ПеременныеСреды",
          "en": "EnvironmentVariables",
          "params": [],
          "returns": "Соответствие",
          "description": "Снимок переменных среды процесса"
        },
        {
          "ru": "ПолучитьПеременнуюСреды",
          "en": "GetEnvironmentVariable",
          "params": [
            {
              "name": "Имя",
              "type": "Строка",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": "Строка | Неопределено",
          "description": "Значение переменной или `Неопределено`"
        },
        {
          "ru": "УстановитьПеременнуюСреды",
          "en": "SetEnvironmentVariable",
          "params": [
            {
              "name": "Имя",
              "type": "Строка",
              "optional": false,
              "variadic": false
            },
            {
              "name": "Значение",
              "type": "Любое",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Задаёт переменную (`Неопределено`/`Null` удаляют её)"
        }
      ],
      "properties": [
        {
          "ru": "ИмяКомпьютера",
          "en": "MachineName",
          "type": "Строка",
          "access": "read",
          "description": "Имя компьютера из переменных среды; может быть пустой строкой"
        },
        {
          "ru": "ВерсияОС",
          "en": "OSVersion",
          "type": "Строка",
          "access": "read",
          "description": "Платформа и архитектура, например `darwin arm64`"
        },
        {
          "ru": "ПолнаяКоманднаяСтрока",
          "en": "FullCommandLine",
          "type": "Строка",
          "access": "read",
          "description": "Командная строка процесса через пробел"
        },
        {
          "ru": "ИмяЯдра",
          "en": "KernelName",
          "type": "Строка",
          "access": "read",
          "description": "`WindowsNT`, `Darwin`, `Linux` или `Unknown`"
        },
        {
          "ru": "Версия",
          "en": "Version",
          "type": "Строка",
          "access": "read",
          "description": "Версия движка (в текущей сборке — `0.1.0`)"
        },
        {
          "ru": "ТипПлатформы",
          "en": "PlatformType",
          "type": "ТипПлатформы",
          "access": "read",
          "description": "Тип платформы (см. [ТипПлатформы](#типплатформы--platformtype))"
        },
        {
          "ru": "ПользовательОС",
          "en": "OSUser",
          "type": "Строка",
          "access": "read",
          "description": "Имя пользователя из переменных среды"
        },
        {
          "ru": "Это64БитнаяОперационнаяСистема",
          "type": "Булево",
          "access": "read",
          "description": "Признак 64-битной ОС (английского алиаса нет)"
        },
        {
          "ru": "КоличествоПроцессоров",
          "en": "ProcessorCount",
          "type": "Число",
          "access": "read",
          "description": "Число процессоров (в браузере — `navigator.hardwareConcurrency`)"
        },
        {
          "ru": "РазмерСистемнойСтраницы",
          "en": "SystemPageSize",
          "type": "Число",
          "access": "read",
          "description": "Размер страницы памяти; в реализации — 4096"
        },
        {
          "ru": "ВремяРаботыСМоментаЗагрузки",
          "en": "TickCount",
          "type": "Число",
          "access": "read",
          "description": "Время работы системы в миллисекундах"
        },
        {
          "ru": "ИменаЛогическихДисков",
          "type": "Массив",
          "access": "read",
          "description": "Пути корней дисков (английского алиаса нет)"
        }
      ]
    },
    {
      "ru": "РегулярноеВыражение",
      "en": "Regex",
      "constructible": true,
      "methods": [
        {
          "ru": "Совпадает",
          "en": "IsMatch",
          "params": [
            {
              "name": "ВходнаяСтрока",
              "type": "Строка",
              "optional": false,
              "variadic": false
            },
            {
              "name": "НачальнаяПозиция",
              "type": "Число",
              "optional": true,
              "variadic": false
            }
          ],
          "returns": "Булево",
          "description": "Есть ли хотя бы одно совпадение"
        },
        {
          "ru": "НайтиСовпадения",
          "en": "Matches",
          "params": [
            {
              "name": "ВходнаяСтрока",
              "type": "Строка",
              "optional": false,
              "variadic": false
            },
            {
              "name": "НачальнаяПозиция",
              "type": "Число",
              "optional": true,
              "variadic": false
            }
          ],
          "returns": "КоллекцияСовпаденийРегулярногоВыражения",
          "description": "Все совпадения начиная с позиции"
        },
        {
          "ru": "Разделить",
          "en": "Split",
          "params": [
            {
              "name": "ВходнаяСтрока",
              "type": "Строка",
              "optional": false,
              "variadic": false
            },
            {
              "name": "Количество",
              "type": "Число",
              "optional": true,
              "variadic": false
            },
            {
              "name": "НачальнаяПозиция",
              "type": "Число",
              "optional": true,
              "variadic": false
            }
          ],
          "returns": "Массив",
          "description": "Делит строку по совпадениям-разделителям"
        },
        {
          "ru": "Заменить",
          "en": "Replace",
          "params": [
            {
              "name": "ВходнаяСтрока",
              "type": "Строка",
              "optional": false,
              "variadic": false
            },
            {
              "name": "Замена",
              "type": "Строка",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": "Строка",
          "description": "Заменяет все совпадения"
        }
      ],
      "properties": [
        {
          "ru": "ИгнорироватьРегистр",
          "en": "IgnoreCase",
          "type": "Булево",
          "access": "readwrite",
          "description": "Игнорировать регистр; по умолчанию `Истина`"
        },
        {
          "ru": "Многострочный",
          "en": "Multiline",
          "type": "Булево",
          "access": "readwrite",
          "description": "Многострочный режим (`^`/`$` на границах строк); по умолчанию `Истина`"
        }
      ]
    },
    {
      "ru": "СовпадениеРегулярногоВыражения",
      "constructible": false,
      "methods": [],
      "properties": [
        {
          "ru": "Значение",
          "en": "Value",
          "type": "Строка",
          "access": "read",
          "description": "Текст совпадения (группа 0)"
        },
        {
          "ru": "Индекс",
          "en": "Index",
          "type": "Число",
          "access": "read",
          "description": "Позиция совпадения в исходной строке (с 0)"
        },
        {
          "ru": "Длина",
          "en": "Length",
          "type": "Число",
          "access": "read",
          "description": "Длина совпадения"
        },
        {
          "ru": "Группы",
          "en": "Groups",
          "type": "КоллекцияГруппРегулярногоВыражения",
          "access": "read",
          "description": "Группы совпадения, включая нулевую"
        }
      ]
    },
    {
      "ru": "ГруппаРегулярногоВыражения",
      "constructible": false,
      "methods": [],
      "properties": [
        {
          "ru": "Значение",
          "en": "Value",
          "type": "Строка",
          "access": "read",
          "description": "Текст группы (`\"\"`, если группа не участвовала)"
        },
        {
          "ru": "Индекс",
          "en": "Index",
          "type": "Число",
          "access": "read",
          "description": "Позиция группы в исходной строке (с 0)"
        },
        {
          "ru": "Длина",
          "en": "Length",
          "type": "Число",
          "access": "read",
          "description": "Длина группы"
        },
        {
          "ru": "Имя",
          "en": "Name",
          "type": "Строка",
          "access": "read",
          "description": "Имя группы; для безымянной — её номер строкой (`\"1\"`, `\"2\"`, …), для нулевой — `\"0\"`"
        }
      ]
    },
    {
      "ru": "КоллекцияСовпаденийРегулярногоВыражения",
      "constructible": false,
      "methods": [
        {
          "ru": "Количество",
          "en": "Count",
          "params": [],
          "returns": "Число",
          "description": "Число совпадений"
        }
      ],
      "properties": []
    },
    {
      "ru": "КоллекцияГруппРегулярногоВыражения",
      "constructible": false,
      "methods": [
        {
          "ru": "Количество",
          "en": "Count",
          "params": [],
          "returns": "Число",
          "description": "Число групп, включая нулевую"
        },
        {
          "ru": "ПоИмени",
          "en": "FromName",
          "params": [
            {
              "name": "Имя",
              "type": "Строка",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": "ГруппаРегулярногоВыражения",
          "description": "Группа по имени; неизвестное имя — исключение"
        }
      ],
      "properties": []
    },
    {
      "ru": "ГенераторСлучайныхЧисел",
      "en": "RandomNumberGenerator",
      "constructible": true,
      "methods": [
        {
          "ru": "СлучайноеЧисло",
          "en": "RandomNumber",
          "params": [
            {
              "name": "Минимум",
              "type": "Число",
              "optional": true,
              "variadic": false
            },
            {
              "name": "Максимум",
              "type": "Число",
              "optional": true,
              "variadic": false
            }
          ],
          "returns": "Число",
          "description": "Целое в диапазоне `[Минимум, Максимум]` включительно"
        }
      ],
      "properties": []
    },
    {
      "ru": "HTTPСоединение",
      "en": "HTTPConnection",
      "constructible": true,
      "methods": [
        {
          "ru": "Получить",
          "en": "Get",
          "params": [
            {
              "name": "Запрос",
              "type": "HTTPЗапрос",
              "optional": false,
              "variadic": false
            },
            {
              "name": "ИмяФайлаОтвета",
              "type": "Строка",
              "optional": true,
              "variadic": false
            }
          ],
          "returns": "HTTPОтвет",
          "description": "Запрос `GET`"
        },
        {
          "ru": "ОтправитьДляОбработки",
          "en": "Post",
          "params": [
            {
              "name": "Запрос",
              "type": "HTTPЗапрос",
              "optional": false,
              "variadic": false
            },
            {
              "name": "ИмяФайлаОтвета",
              "type": "Строка",
              "optional": true,
              "variadic": false
            }
          ],
          "returns": "HTTPОтвет",
          "description": "Запрос `POST`"
        },
        {
          "ru": "Записать",
          "en": "Put",
          "params": [
            {
              "name": "Запрос",
              "type": "HTTPЗапрос",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": "HTTPОтвет",
          "description": "Запрос `PUT`"
        },
        {
          "ru": "Удалить",
          "en": "Delete",
          "params": [
            {
              "name": "Запрос",
              "type": "HTTPЗапрос",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": "HTTPОтвет",
          "description": "Запрос `DELETE`"
        },
        {
          "ru": "Изменить",
          "en": "Patch",
          "params": [
            {
              "name": "Запрос",
              "type": "HTTPЗапрос",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": "HTTPОтвет",
          "description": "Запрос `PATCH`"
        },
        {
          "ru": "ПолучитьЗаголовки",
          "en": "Head",
          "params": [
            {
              "name": "Запрос",
              "type": "HTTPЗапрос",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": "HTTPОтвет",
          "description": "Запрос `HEAD`; тело не возвращается"
        },
        {
          "ru": "ВызватьHTTPМетод",
          "en": "CallHTTPMethod",
          "params": [
            {
              "name": "Метод",
              "type": "Строка",
              "optional": false,
              "variadic": false
            },
            {
              "name": "Запрос",
              "type": "HTTPЗапрос",
              "optional": false,
              "variadic": false
            },
            {
              "name": "ИмяФайлаОтвета",
              "type": "Строка",
              "optional": true,
              "variadic": false
            }
          ],
          "returns": "HTTPОтвет",
          "description": "Произвольный метод; имя приводится к верхнему регистру"
        }
      ],
      "properties": [
        {
          "ru": "Сервер",
          "en": "Host",
          "type": "Строка",
          "access": "read",
          "description": "Хост из адреса соединения (без пути и порта)"
        },
        {
          "ru": "Порт",
          "en": "Port",
          "type": "Число",
          "access": "read",
          "description": "Эффективный порт: из аргумента, иначе из адреса, иначе 80/443"
        },
        {
          "ru": "Пользователь",
          "en": "User",
          "type": "Строка",
          "access": "read",
          "description": "Имя для basic-auth; по умолчанию `\"\"`"
        },
        {
          "ru": "Пароль",
          "en": "Password",
          "type": "Строка",
          "access": "read",
          "description": "Пароль для basic-auth; по умолчанию `\"\"`"
        },
        {
          "ru": "Прокси",
          "en": "Proxy",
          "type": "Неопределено",
          "access": "read",
          "description": "Прокси не поддерживается, всегда `Неопределено`"
        },
        {
          "ru": "Таймаут",
          "en": "Timeout",
          "type": "Число",
          "access": "read",
          "description": "Таймаут запроса в секундах; `0` — без ограничения"
        },
        {
          "ru": "РазрешитьАвтоматическоеПеренаправление",
          "en": "AllowAutoRedirect",
          "type": "Булево",
          "access": "readwrite",
          "description": "Следовать редиректам; по умолчанию `Истина`"
        },
        {
          "ru": "ИспользоватьАутентификациюОС",
          "en": "UseOSAuthentication",
          "type": "Булево",
          "access": "read",
          "description": "Принимается, но транспортом не используется"
        }
      ]
    },
    {
      "ru": "HTTPЗапрос",
      "en": "HTTPRequest",
      "constructible": true,
      "methods": [
        {
          "ru": "УстановитьТелоИзСтроки",
          "en": "SetBodyFromString",
          "params": [
            {
              "name": "Текст",
              "type": "Строка",
              "optional": false,
              "variadic": false
            },
            {
              "name": "Кодировка",
              "type": "КодировкаТекста | Строка",
              "optional": true,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Кодирует строку в тело; по умолчанию UTF-8 без BOM"
        },
        {
          "ru": "ПолучитьТелоКакСтроку",
          "en": "GetBodyAsString",
          "params": [],
          "returns": "Строка | Неопределено",
          "description": "Тело как текст (UTF-8, BOM распознаётся)"
        },
        {
          "ru": "УстановитьТелоИзДвоичныхДанных",
          "en": "SetBodyFromBinaryData",
          "params": [
            {
              "name": "Данные",
              "type": "ДвоичныеДанные",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Тело из двоичных данных"
        },
        {
          "ru": "ПолучитьТелоКакДвоичныеДанные",
          "en": "GetBodyAsBinaryData",
          "params": [],
          "returns": "ДвоичныеДанные | Неопределено",
          "description": "Тело как `ДвоичныеДанные`"
        }
      ],
      "properties": [
        {
          "ru": "АдресРесурса",
          "en": "ResourceAddress",
          "type": "Строка",
          "access": "readwrite",
          "description": "Абсолютный URL или путь относительно адреса соединения"
        },
        {
          "ru": "Заголовки",
          "en": "Headers",
          "type": "Соответствие",
          "access": "readwrite",
          "description": "Заголовки запроса; ключи сравниваются с учётом регистра"
        }
      ]
    },
    {
      "ru": "HTTPОтвет",
      "en": "HTTPResponse",
      "constructible": false,
      "methods": [
        {
          "ru": "ПолучитьТелоКакСтроку",
          "en": "GetBodyAsString",
          "params": [
            {
              "name": "Кодировка",
              "type": "КодировкаТекста | Строка",
              "optional": true,
              "variadic": false
            }
          ],
          "returns": "Строка | Неопределено",
          "description": "Тело как текст; по умолчанию кодировка из `Content-Type`"
        },
        {
          "ru": "ПолучитьТелоКакДвоичныеДанные",
          "en": "GetBodyAsBinaryData",
          "params": [],
          "returns": "ДвоичныеДанные | Неопределено",
          "description": "Тело как `ДвоичныеДанные`"
        },
        {
          "ru": "Закрыть",
          "en": "Close",
          "params": [],
          "returns": null,
          "description": "Освобождает тело ответа; идемпотентно"
        }
      ],
      "properties": [
        {
          "ru": "КодСостояния",
          "en": "StatusCode",
          "type": "Число",
          "access": "read",
          "description": "HTTP-статус ответа"
        },
        {
          "ru": "Заголовки",
          "en": "Headers",
          "type": "Соответствие",
          "access": "read",
          "description": "Заголовки ответа; содержимое `Соответствия` изменяемо"
        }
      ]
    },
    {
      "ru": "ФоновыеЗадания",
      "en": "BackgroundJobs",
      "constructible": false,
      "methods": [
        {
          "ru": "Выполнить",
          "en": "Execute",
          "params": [
            {
              "name": "Объект",
              "type": "Объект",
              "optional": false,
              "variadic": false
            },
            {
              "name": "ИмяМетода",
              "type": "Строка",
              "optional": false,
              "variadic": false
            },
            {
              "name": "Параметры",
              "type": "Массив",
              "optional": true,
              "variadic": false
            },
            {
              "name": "Длительное",
              "type": "Булево",
              "optional": true,
              "variadic": false
            }
          ],
          "returns": "ФоновоеЗадание",
          "description": "Запускает метод объекта в фоновом задании"
        },
        {
          "ru": "Очистить",
          "en": "Clear",
          "params": [],
          "returns": null,
          "description": "Очищает реестр заданий"
        },
        {
          "ru": "ОжидатьВсе",
          "en": "WaitAll",
          "params": [
            {
              "name": "Задания",
              "type": "Массив",
              "optional": false,
              "variadic": false
            },
            {
              "name": "Таймаут",
              "type": "Число",
              "optional": true,
              "variadic": false
            }
          ],
          "returns": "Булево",
          "description": "Ждёт завершения всех заданий из массива"
        },
        {
          "ru": "ОжидатьЛюбое",
          "en": "WaitAny",
          "params": [
            {
              "name": "Задания",
              "type": "Массив",
              "optional": false,
              "variadic": false
            },
            {
              "name": "Таймаут",
              "type": "Число",
              "optional": true,
              "variadic": false
            }
          ],
          "returns": "Число",
          "description": "Ждёт первое завершившееся задание"
        },
        {
          "ru": "ОжидатьЗавершенияЗадач",
          "en": "WaitCompletionOfTasks",
          "params": [],
          "returns": null,
          "description": "Ждёт все задания реестра; при аварийном — исключение"
        },
        {
          "ru": "ПолучитьФоновыеЗадания",
          "en": "GetBackgroundJobs",
          "params": [
            {
              "name": "Фильтр",
              "type": "Структура",
              "optional": true,
              "variadic": false
            }
          ],
          "returns": "Массив",
          "description": "Снимок заданий, возможно с фильтром"
        },
        {
          "ru": "ПолучитьТекущее",
          "en": "GetCurrent",
          "params": [],
          "returns": "ФоновоеЗадание | Неопределено",
          "description": "Текущее задание (внутри задания)"
        }
      ],
      "properties": []
    },
    {
      "ru": "ФоновоеЗадание",
      "constructible": false,
      "methods": [
        {
          "ru": "ОжидатьЗавершения",
          "en": "Wait",
          "params": [
            {
              "name": "Таймаут",
              "type": "Число",
              "optional": true,
              "variadic": false
            }
          ],
          "returns": "Булево",
          "description": "`Истина` — задание завершено, `Ложь` — таймаут"
        }
      ],
      "properties": [
        {
          "ru": "УникальныйИдентификатор",
          "en": "UUID",
          "type": "УникальныйИдентификатор",
          "access": "read",
          "description": "Уникальный идентификатор задания"
        },
        {
          "ru": "ИмяМетода",
          "en": "MethodName",
          "type": "Строка",
          "access": "read",
          "description": "Имя запущенного метода"
        },
        {
          "ru": "Объект",
          "en": "Object",
          "type": "Объект",
          "access": "read",
          "description": "Объект, которому принадлежит метод"
        },
        {
          "ru": "Состояние",
          "en": "State",
          "type": "[СостояниеФоновогоЗадания](#перечисления)",
          "access": "read",
          "description": "`НеВыполнялось`, `Активно`, `Завершено`, `ЗавершеноАварийно`"
        },
        {
          "ru": "Параметры",
          "en": "Parameters",
          "type": "Массив | Неопределено",
          "access": "read",
          "description": "Копия массива аргументов на момент запуска"
        },
        {
          "ru": "Результат",
          "en": "Result",
          "type": "Любое",
          "access": "read",
          "description": "Значение, возвращённое методом; `Неопределено` до завершения"
        },
        {
          "ru": "ИнформацияОбОшибке",
          "en": "ExceptionInfo",
          "type": "ИнформацияОбОшибке | Неопределено",
          "access": "read",
          "description": "Ошибка аварийного завершения"
        }
      ]
    },
    {
      "ru": "Документ",
      "en": "Document",
      "constructible": false,
      "methods": [
        {
          "ru": "ПолучитьЭлемент",
          "en": "GetElementById",
          "params": [
            {
              "name": "Идентификатор",
              "type": "Строка",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": "ЭлементDOM | Неопределено",
          "description": "Элемент по `id`"
        },
        {
          "ru": "СоздатьЭлемент",
          "en": "CreateElement",
          "params": [
            {
              "name": "ИмяТега",
              "type": "Строка",
              "optional": true,
              "variadic": false
            }
          ],
          "returns": "ЭлементDOM",
          "description": "Новый несмонтированный элемент; без аргумента — `div`"
        },
        {
          "ru": "Запросить",
          "en": "QuerySelector",
          "params": [
            {
              "name": "Селектор",
              "type": "Строка",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": "ЭлементDOM | Неопределено",
          "description": "Первый элемент по CSS-селектору"
        },
        {
          "ru": "ЗапроситьВсе",
          "en": "QuerySelectorAll",
          "params": [
            {
              "name": "Селектор",
              "type": "Строка",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": "Массив",
          "description": "Все элементы по CSS-селектору"
        }
      ],
      "properties": [
        {
          "ru": "ТелоКорпуса",
          "en": "Body",
          "type": "ЭлементDOM | Неопределено",
          "access": "read",
          "description": "Элемент `<body>`"
        },
        {
          "ru": "Заголовок",
          "en": "Title",
          "type": "Строка",
          "access": "readwrite",
          "description": "Заголовок документа (`document.title`)"
        }
      ]
    },
    {
      "ru": "ЭлементDOM",
      "constructible": false,
      "methods": [
        {
          "ru": "УстановитьАтрибут",
          "en": "SetAttribute",
          "params": [
            {
              "name": "Имя",
              "type": "Строка",
              "optional": false,
              "variadic": false
            },
            {
              "name": "Значение",
              "type": "Строка",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Устанавливает атрибут"
        },
        {
          "ru": "ПолучитьАтрибут",
          "en": "GetAttribute",
          "params": [
            {
              "name": "Имя",
              "type": "Строка",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": "Строка | Неопределено",
          "description": "Значение атрибута; нет атрибута — `Неопределено`"
        },
        {
          "ru": "УдалитьАтрибут",
          "en": "RemoveAttribute",
          "params": [
            {
              "name": "Имя",
              "type": "Строка",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Удаляет атрибут"
        },
        {
          "ru": "ДобавитьВ",
          "en": "AppendTo",
          "params": [
            {
              "name": "Родитель",
              "type": "ЭлементDOM",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Вставляет элемент в конец родителя (переносит узел)"
        },
        {
          "ru": "Добавить",
          "en": "Append",
          "params": [
            {
              "name": "Ребёнок",
              "type": "ЭлементDOM",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Добавляет дочерний элемент (переносит узел)"
        },
        {
          "ru": "Удалить",
          "en": "Remove",
          "params": [],
          "returns": null,
          "description": "Удаляет элемент из документа"
        },
        {
          "ru": "ДобавитьКласс",
          "en": "AddClass",
          "params": [
            {
              "name": "Класс",
              "type": "Строка",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Добавляет CSS-класс"
        },
        {
          "ru": "УбратьКласс",
          "en": "RemoveClass",
          "params": [
            {
              "name": "Класс",
              "type": "Строка",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Удаляет CSS-класс"
        },
        {
          "ru": "ЕстьКласс",
          "en": "HasClass",
          "params": [
            {
              "name": "Класс",
              "type": "Строка",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": "Булево",
          "description": "Проверяет наличие CSS-класса"
        },
        {
          "ru": "НаСобытие",
          "en": "OnEvent",
          "params": [
            {
              "name": "Событие",
              "type": "Строка",
              "optional": false,
              "variadic": false
            },
            {
              "name": "Код",
              "type": "Строка",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Подписка на DOM-событие; код исполняется в области модуля"
        },
        {
          "ru": "СнятьСобытие",
          "en": "OffEvent",
          "params": [
            {
              "name": "Событие",
              "type": "Строка",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Снимает обработчик DOM-события"
        },
        {
          "ru": "Запросить",
          "en": "QuerySelector",
          "params": [
            {
              "name": "Селектор",
              "type": "Строка",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": "ЭлементDOM | Неопределено",
          "description": "Первый потомок по CSS-селектору"
        }
      ],
      "properties": [
        {
          "ru": "Текст",
          "en": "Text",
          "type": "Строка",
          "access": "readwrite",
          "description": "Текстовое содержимое (`textContent`)"
        },
        {
          "ru": "HTML",
          "en": "InnerHTML",
          "type": "Строка",
          "access": "readwrite",
          "description": "HTML-содержимое (`innerHTML`)"
        },
        {
          "ru": "Значение",
          "en": "Value",
          "type": "Строка",
          "access": "readwrite",
          "description": "Значение поля ввода; у прочих элементов — пустая строка"
        },
        {
          "ru": "Идентификатор",
          "en": "Id",
          "type": "Строка",
          "access": "readwrite",
          "description": "Атрибут `id`"
        },
        {
          "ru": "Класс",
          "en": "ClassName",
          "type": "Строка",
          "access": "readwrite",
          "description": "Атрибут `class`"
        },
        {
          "ru": "ИмяТега",
          "en": "TagName",
          "type": "Строка",
          "access": "read",
          "description": "Имя тега в нижнем регистре"
        },
        {
          "ru": "Стиль",
          "en": "Style",
          "type": "СтильDOM",
          "access": "read",
          "description": "Обёртка над `element.style`"
        },
        {
          "ru": "Родитель",
          "en": "Parent",
          "type": "ЭлементDOM | Неопределено",
          "access": "read",
          "description": "Родительский элемент"
        },
        {
          "ru": "Дети",
          "en": "Children",
          "type": "Массив",
          "access": "read",
          "description": "Дочерние элементы (без текстовых узлов)"
        }
      ]
    },
    {
      "ru": "СобытиеDOM",
      "constructible": false,
      "methods": [
        {
          "ru": "Отменить",
          "en": "PreventDefault",
          "params": [],
          "returns": null,
          "description": "Отменяет действие по умолчанию"
        },
        {
          "ru": "ОстановитьРаспространение",
          "params": [],
          "returns": null,
          "description": "Останавливает всплытие события"
        }
      ],
      "properties": [
        {
          "ru": "Тип",
          "en": "Type",
          "type": "Строка",
          "access": "read",
          "description": "Тип DOM-события (`click`, `input`, …)"
        },
        {
          "ru": "Цель",
          "en": "Target",
          "type": "ЭлементDOM | Неопределено",
          "access": "read",
          "description": "Элемент-источник события (`event.target`)"
        },
        {
          "ru": "Отменено",
          "en": "DefaultPrevented",
          "type": "Булево",
          "access": "read",
          "description": "Отменено ли действие по умолчанию"
        }
      ]
    },
    {
      "ru": "СтильDOM",
      "constructible": false,
      "methods": [
        {
          "ru": "Установить",
          "en": "Set",
          "params": [
            {
              "name": "Свойство",
              "type": "Строка",
              "optional": false,
              "variadic": false
            },
            {
              "name": "Значение",
              "type": "Строка",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Устанавливает CSS-свойство (`style.setProperty`)"
        },
        {
          "ru": "Получить",
          "en": "Get",
          "params": [
            {
              "name": "Свойство",
              "type": "Строка",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": "Строка",
          "description": "Значение CSS-свойства; не задано — пустая строка"
        },
        {
          "ru": "Удалить",
          "en": "Remove",
          "params": [
            {
              "name": "Свойство",
              "type": "Строка",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Удаляет CSS-свойство (`style.removeProperty`)"
        }
      ],
      "properties": []
    },
    {
      "ru": "ЮнитТестирование",
      "constructible": false,
      "methods": [
        {
          "ru": "ПодробныеОписанияОшибок",
          "en": "ShowDetailedErrors",
          "params": [
            {
              "name": "Использовать",
              "type": "Булево",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Запоминает флаг подробных сообщений"
        },
        {
          "ru": "ТестПровален",
          "en": "Fail",
          "params": [
            {
              "name": "Описание",
              "type": "Строка",
              "optional": true,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Проваливает тест исключением «Тест провален…»"
        },
        {
          "ru": "ИмяВременногоФайла",
          "en": "TempFileName",
          "params": [
            {
              "name": "Расширение",
              "type": "Строка",
              "optional": true,
              "variadic": false
            }
          ],
          "returns": "Строка",
          "description": "Имя временного файла в каталоге `TMPDIR`/`TEMP`/`TMP`; по умолчанию расширение `tmp`"
        },
        {
          "ru": "ПроверитьРавенство",
          "en": "AssertEquals",
          "params": [
            {
              "name": "Ожидаемое",
              "type": "Любое",
              "optional": false,
              "variadic": false
            },
            {
              "name": "Фактическое",
              "type": "Любое",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Проверяет равенство"
        },
        {
          "ru": "ПроверитьНеравенство",
          "en": "AssertNotEquals",
          "params": [
            {
              "name": "Ожидаемое",
              "type": "Любое",
              "optional": false,
              "variadic": false
            },
            {
              "name": "Фактическое",
              "type": "Любое",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Проверяет неравенство"
        },
        {
          "ru": "Проверить",
          "en": "Assert",
          "params": [
            {
              "name": "Условие",
              "type": "Булево",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Проверяет истинность условия"
        },
        {
          "ru": "ПроверитьИстина",
          "en": "ПроверитьИстину",
          "params": [
            {
              "name": "Значение",
              "type": "Булево",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Проверяет, что значение истинно"
        },
        {
          "ru": "ПроверитьЛожь",
          "en": "AssertFalse",
          "params": [
            {
              "name": "Значение",
              "type": "Булево",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Проверяет, что значение ложно"
        },
        {
          "ru": "ПроверитьЗаполнено",
          "params": [
            {
              "name": "Значение",
              "type": "Любое",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Проверяет, что значение приводится к `Истина`"
        },
        {
          "ru": "ПроверитьБольше",
          "params": [
            {
              "name": "Большее",
              "type": "Число",
              "optional": false,
              "variadic": false
            },
            {
              "name": "Меньшее",
              "type": "Число",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Первый аргумент должен быть больше второго"
        },
        {
          "ru": "ПроверитьМеньше",
          "params": [
            {
              "name": "Меньшее",
              "type": "Число",
              "optional": false,
              "variadic": false
            },
            {
              "name": "Большее",
              "type": "Число",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Первый аргумент должен быть меньше второго"
        },
        {
          "ru": "ПроверитьВхождение",
          "params": [
            {
              "name": "Строка",
              "type": "Строка",
              "optional": false,
              "variadic": false
            },
            {
              "name": "Подстрока",
              "type": "Строка",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Проверяет вхождение подстроки"
        },
        {
          "ru": "ПроверитьТип",
          "params": [
            {
              "name": "Значение",
              "type": "Любое",
              "optional": false,
              "variadic": false
            },
            {
              "name": "ОжидаемыйТип",
              "type": "Тип | Строка",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Сверяет `ТипЗнч` значения"
        }
      ],
      "properties": []
    },
    {
      "ru": "Ожидаем",
      "en": "Expect",
      "constructible": false,
      "methods": [
        {
          "ru": "Что",
          "en": "What",
          "params": [
            {
              "name": "Значение",
              "type": "Любое",
              "optional": false,
              "variadic": false
            },
            {
              "name": "Текст",
              "type": "Строка",
              "optional": true,
              "variadic": false
            }
          ],
          "returns": "Ожидание",
          "description": "Начинает цепочку проверок; `Текст` попадает в сообщение об ошибке"
        }
      ],
      "properties": []
    },
    {
      "ru": "Ожидание",
      "constructible": false,
      "methods": [
        {
          "ru": "Равно",
          "en": "Equals",
          "params": [
            {
              "name": "Ожидаемое",
              "type": "Любое",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Значения равны"
        },
        {
          "ru": "НеРавно",
          "en": "NotEquals",
          "params": [
            {
              "name": "Ожидаемое",
              "type": "Любое",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Значения не равны"
        },
        {
          "ru": "Больше",
          "en": "Greater",
          "params": [
            {
              "name": "Ожидаемое",
              "type": "Любое",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Фактическое больше"
        },
        {
          "ru": "Меньше",
          "en": "Less",
          "params": [
            {
              "name": "Ожидаемое",
              "type": "Любое",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Фактическое меньше"
        },
        {
          "ru": "БольшеИлиРавно",
          "en": "GreaterOrEqual",
          "params": [
            {
              "name": "Ожидаемое",
              "type": "Любое",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Фактическое не меньше"
        },
        {
          "ru": "МеньшеИлиРавно",
          "en": "LessOrEqual",
          "params": [
            {
              "name": "Ожидаемое",
              "type": "Любое",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Фактическое не больше"
        },
        {
          "ru": "ЭтоИстина",
          "en": "IsTrue",
          "params": [],
          "returns": null,
          "description": "Фактическое истинно"
        },
        {
          "ru": "ЭтоЛожь",
          "en": "IsFalse",
          "params": [],
          "returns": null,
          "description": "Фактическое ложно"
        },
        {
          "ru": "ЭтоНе",
          "en": "Not",
          "params": [],
          "returns": "Ожидание",
          "description": "Инвертирует следующую проверку цепочки"
        },
        {
          "ru": "ИмеетДлину",
          "en": "HasLength",
          "params": [
            {
              "name": "Длина",
              "type": "Число",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Длина строки или коллекции"
        },
        {
          "ru": "Существует",
          "en": "Exists",
          "params": [],
          "returns": null,
          "description": "Значение не `Неопределено` и не `Null`"
        },
        {
          "ru": "Содержит",
          "en": "Contains",
          "params": [
            {
              "name": "Подстрока",
              "type": "Строка",
              "optional": false,
              "variadic": false
            }
          ],
          "returns": null,
          "description": "Строковое представление содержит подстроку"
        }
      ],
      "properties": []
    },
    {
      "ru": "УникальныйИдентификатор",
      "en": "UUID",
      "constructible": true,
      "methods": [],
      "properties": []
    }
  ],
  "enums": [
    {
      "ru": "НаправлениеПоиска",
      "en": "SearchDirection",
      "values": [
        {
          "ru": "СНачала",
          "en": "FromBegin",
          "meaning": "Искать с начала строки (первое вхождение) — по умолчанию"
        },
        {
          "ru": "СКонца",
          "en": "FromEnd",
          "meaning": "Искать с конца строки (последнее вхождение)"
        }
      ]
    },
    {
      "ru": "СтатусСообщения",
      "en": "MessageStatus",
      "values": [
        {
          "ru": "БезСтатуса",
          "en": "WithoutStatus",
          "meaning": "Без статуса"
        },
        {
          "ru": "Обычное",
          "en": "Ordinary",
          "meaning": "Обычное сообщение"
        },
        {
          "ru": "Информация",
          "en": "Information",
          "meaning": "Информационное сообщение"
        },
        {
          "ru": "Внимание",
          "en": "Attention",
          "meaning": "Предупреждение"
        },
        {
          "ru": "Важное",
          "en": "Important",
          "meaning": "Важное сообщение"
        },
        {
          "ru": "ОченьВажное",
          "en": "VeryImportant",
          "meaning": "Очень важное сообщение"
        }
      ]
    },
    {
      "ru": "ХешФункция",
      "en": "HashFunction",
      "values": [
        {
          "ru": "MD5",
          "en": "MD5",
          "meaning": "MD5"
        },
        {
          "ru": "SHA1",
          "en": "SHA1",
          "meaning": "SHA-1"
        },
        {
          "ru": "SHA256",
          "en": "SHA256",
          "meaning": "SHA-256"
        },
        {
          "ru": "SHA384",
          "en": "SHA384",
          "meaning": "SHA-384"
        },
        {
          "ru": "SHA512",
          "en": "SHA512",
          "meaning": "SHA-512"
        },
        {
          "ru": "CRC32",
          "en": "CRC32",
          "meaning": "CRC32"
        }
      ]
    },
    {
      "ru": "ЦветКонсоли",
      "en": "ConsoleColor",
      "values": [
        {
          "ru": "Черный",
          "en": "Black",
          "meaning": "Чёрный"
        },
        {
          "ru": "ТемноСиний",
          "en": "DarkBlue",
          "meaning": "Тёмно-синий"
        },
        {
          "ru": "ТемноЗеленый",
          "en": "DarkGreen",
          "meaning": "Тёмно-зелёный"
        },
        {
          "ru": "ТемноБирюзовый",
          "en": "DarkCyan",
          "meaning": "Тёмно-бирюзовый"
        },
        {
          "ru": "ТемноКрасный",
          "en": "DarkRed",
          "meaning": "Тёмно-красный"
        },
        {
          "ru": "ТемноМалиновый",
          "en": "DarkMagenta",
          "meaning": "Тёмно-малиновый"
        },
        {
          "ru": "ТемноЖелтый",
          "en": "DarkYellow",
          "meaning": "Тёмно-жёлтый"
        },
        {
          "ru": "Серый",
          "en": "Gray",
          "meaning": "Серый"
        },
        {
          "ru": "ТемноСерый",
          "en": "DarkGray",
          "meaning": "Тёмно-серый"
        },
        {
          "ru": "Синий",
          "en": "Blue",
          "meaning": "Синий"
        },
        {
          "ru": "Зеленый",
          "en": "Green",
          "meaning": "Зелёный"
        },
        {
          "ru": "Бирюза",
          "en": "Cyan",
          "meaning": "Бирюзовый"
        },
        {
          "ru": "Красный",
          "en": "Red",
          "meaning": "Красный"
        },
        {
          "ru": "Малиновый",
          "en": "Magenta",
          "meaning": "Малиновый"
        },
        {
          "ru": "Желтый",
          "en": "Yellow",
          "meaning": "Жёлтый"
        },
        {
          "ru": "Белый",
          "en": "White",
          "meaning": "Белый"
        }
      ]
    },
    {
      "ru": "КодировкаТекста",
      "en": "TextEncoding",
      "values": [
        {
          "ru": "Системная",
          "en": "System",
          "meaning": "Системная кодировка — в реализации UTF-8"
        },
        {
          "ru": "UTF8",
          "en": "UTF8",
          "meaning": "UTF-8 (BOM — только по флагу)"
        },
        {
          "ru": "UTF8БезBOM",
          "en": "UTF8NoBOM",
          "meaning": "UTF-8 без BOM при любой записи"
        },
        {
          "ru": "UTF16",
          "en": "UTF16",
          "meaning": "UTF-16LE"
        },
        {
          "ru": "ANSI",
          "en": "ANSI",
          "meaning": "windows-1251"
        },
        {
          "ru": "OEM",
          "en": "OEM",
          "meaning": "cp866"
        }
      ]
    },
    {
      "ru": "СпециальнаяПапка",
      "en": "SpecialFolder",
      "values": [
        {
          "ru": "МоиДокументы",
          "en": "MyDocuments",
          "meaning": "Каталог документов пользователя"
        },
        {
          "ru": "ДанныеПриложений",
          "en": "ApplicationData",
          "meaning": "Каталог данных приложений (`APPDATA` или `~/.config`)"
        },
        {
          "ru": "ЛокальныйКаталогДанныхПриложений",
          "en": "LocalApplicationData",
          "meaning": "Локальный каталог данных приложений (`LOCALAPPDATA` или `~/.local/share`)"
        },
        {
          "ru": "РабочийСтол",
          "en": "Desktop",
          "meaning": "Рабочий стол"
        },
        {
          "ru": "КаталогРабочийСтол",
          "en": "DesktopDirectory",
          "meaning": "Каталог рабочего стола"
        },
        {
          "ru": "МояМузыка",
          "en": "MyMusic",
          "meaning": "Каталог музыки"
        },
        {
          "ru": "МоиРисунки",
          "en": "MyPictures",
          "meaning": "Каталог изображений"
        },
        {
          "ru": "Шаблоны",
          "en": "Templates",
          "meaning": "Каталог шаблонов"
        },
        {
          "ru": "МоиВидеозаписи",
          "en": "MyVideos",
          "meaning": "Каталог видео"
        },
        {
          "ru": "ОбщиеШаблоны",
          "en": "CommonTemplates",
          "meaning": "Общие шаблоны"
        },
        {
          "ru": "ПрофильПользователя",
          "en": "UserProfile",
          "meaning": "Домашний каталог пользователя"
        },
        {
          "ru": "ОбщийКаталогДанныхПриложения",
          "en": "CommonApplicationData",
          "meaning": "Общий каталог данных приложений (`ProgramData` или `/usr/share`)"
        }
      ]
    },
    {
      "ru": "ТипДиска",
      "en": "DriveType",
      "values": [
        {
          "ru": "Неизвестный",
          "en": "Unknown",
          "meaning": "Тип неизвестен"
        },
        {
          "ru": "НеИмеетКорневойКаталог",
          "en": "NoRootDirectory",
          "meaning": "Нет корневого каталога"
        },
        {
          "ru": "СъемноеЗапоминающееУстройство",
          "en": "Removable",
          "meaning": "Съёмное запоминающее устройство"
        },
        {
          "ru": "ЖесткийДиск",
          "en": "Fixed",
          "meaning": "Жёсткий диск"
        },
        {
          "ru": "СетевойДиск",
          "en": "Network",
          "meaning": "Сетевой диск"
        },
        {
          "ru": "ОптическийДиск",
          "en": "CDRom",
          "meaning": "Оптический диск"
        },
        {
          "ru": "ДискОЗУ",
          "en": "Ram",
          "meaning": "Диск ОЗУ"
        }
      ]
    },
    {
      "ru": "НаправлениеСортировки",
      "en": "SortDirection",
      "values": [
        {
          "ru": "Возр",
          "en": "ASC",
          "meaning": "По возрастанию — по умолчанию"
        },
        {
          "ru": "Убыв",
          "en": "DESC",
          "meaning": "По убыванию"
        }
      ]
    },
    {
      "ru": "СпособКодированияСтроки",
      "en": "StringEncodingMethod",
      "values": [
        {
          "ru": "КодировкаURL",
          "en": "URLEncoding",
          "meaning": "Кодирование по правилам URL"
        },
        {
          "ru": "URLВКодировкеURL",
          "en": "URLInURLEncoding",
          "meaning": "URL в URL-кодировке"
        }
      ]
    },
    {
      "ru": "СостояниеФоновогоЗадания",
      "en": "BackgroundJobState",
      "values": [
        {
          "ru": "НеВыполнялось",
          "en": "NotRunned",
          "meaning": "Задание ещё не начинало выполняться"
        },
        {
          "ru": "Активно",
          "en": "Active",
          "meaning": "Задание выполняется"
        },
        {
          "ru": "Завершено",
          "en": "Completed",
          "meaning": "Задание завершилось успешно"
        },
        {
          "ru": "ЗавершеноАварийно",
          "en": "Failed",
          "meaning": "Задание завершилось ошибкой"
        }
      ]
    },
    {
      "ru": "ПорядокБайтов",
      "en": "ByteOrder",
      "values": [
        {
          "ru": "LittleEndian",
          "en": "LittleEndian",
          "meaning": "Младший байт первым"
        },
        {
          "ru": "BigEndian",
          "en": "BigEndian",
          "meaning": "Старший байт первым"
        }
      ]
    },
    {
      "ru": "ТипПлатформы",
      "en": "PlatformType",
      "values": [
        {
          "ru": "Linux_x86",
          "en": "Linux_x86",
          "meaning": "Linux, 32-бит"
        },
        {
          "ru": "Linux_x86_64",
          "en": "Linux_x86_64",
          "meaning": "Linux, 64-бит"
        },
        {
          "ru": "MacOS_x86",
          "en": "MacOS_x86",
          "meaning": "macOS, 32-бит"
        },
        {
          "ru": "MacOS_x86_64",
          "en": "MacOS_x86_64",
          "meaning": "macOS, 64-бит"
        },
        {
          "ru": "Windows_x86",
          "en": "Windows_x86",
          "meaning": "Windows, 32-бит"
        },
        {
          "ru": "Windows_x86_64",
          "en": "Windows_x86_64",
          "meaning": "Windows, 64-бит"
        },
        {
          "ru": "Unknown",
          "en": "Unknown",
          "meaning": "Неизвестная платформа"
        }
      ]
    },
    {
      "ru": "РасположениеПеременнойСреды",
      "en": "EnvironmentVariableTarget",
      "values": [
        {
          "ru": "Процесс",
          "en": "Process",
          "meaning": "Переменные текущего процесса"
        },
        {
          "ru": "Пользователь",
          "en": "User",
          "meaning": "Переменные пользователя"
        },
        {
          "ru": "Машина",
          "en": "Machine",
          "meaning": "Переменные машины"
        }
      ]
    }
  ],
  "globals": [
    "документ",
    "ожидаем",
    "символы",
    "фоновыезадания",
    "backgroundjobs",
    "chars",
    "document",
    "expect"
  ]
};
