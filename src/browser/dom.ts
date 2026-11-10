import type { BslObject } from '../runtime/object';
import type { GlobalContext } from '../runtime/context';
import type { Interpreter } from '../runtime/interpreter';
import type { Value } from '../runtime/values';
import { toNumber, toStringValue } from '../runtime/values';
import { BslArray } from '../stdlib/collections/array';

/**
 * Обёртки над DOM для браузерного исполнения BSL.
 * Живут только в браузерной сборке (`createBrowserGlobalContext`), чтобы
 * `src/stdlib` оставался Node-совместимым.
 */

function getDocument(): Document {
  const doc = (globalThis as { document?: Document }).document;
  if (!doc) throw new Error('Документ недоступен вне браузера');
  return doc;
}

function getElement(value: Value): Element {
  if (!(value instanceof BslDomElement)) throw new Error('Неверный тип аргумента: ожидался элемент DOM');
  return value.element;
}

/** Слушатели событий живут на самом DOM-элементе: любая обёртка над ним может снять обработчик. */
const LISTENERS = new WeakMap<Element, Map<string, EventListener>>();

/** Псевдонимы имён событий: русское/английское имя → DOM-событие. */
const EVENT_ALIASES = new Map<string, string>();

function alias(domEvent: string, ...names: string[]): void {
  for (const name of names) EVENT_ALIASES.set(name.toLowerCase(), domEvent);
}

alias('click', 'Нажатие', 'Click');
alias('dblclick', 'ДвойноеНажатие', 'DoubleClick');
alias('input', 'Ввод', 'Input');
alias('change', 'Изменение', 'Change');
alias('mouseenter', 'Наведение', 'MouseEnter');
alias('mouseleave', 'Уход', 'MouseLeave');
alias('keydown', 'НажатиеКлавиши', 'KeyDown');
alias('submit', 'Отправка', 'Submit');

/** Имя события из BSL → тип DOM-события (неизвестные имена передаются как есть). */
export function domEventType(name: string): string {
  return EVENT_ALIASES.get(name.toLowerCase()) ?? name;
}

/** `Событие` DOM, доступное обработчику BSL. */
export class BslDomEvent implements BslObject {
  readonly typeName = 'СобытиеDOM';

  constructor(
    private readonly event: Event,
    private readonly ctx: GlobalContext,
  ) {}

  callMethod(name: string): Value {
    switch (name.toLowerCase()) {
      case 'отменить':
      case 'preventdefault':
        this.event.preventDefault();
        return undefined;
      case 'остановитьраспространение':
      case 'stopPropagation':
        this.event.stopPropagation();
        return undefined;
      default:
        throw new Error(`Метод '${name}' не найден у типа СобытиеDOM`);
    }
  }

  getProp(name: string): Value {
    switch (name.toLowerCase()) {
      case 'тип':
      case 'type':
        return this.event.type;
      case 'цель':
      case 'target': {
        const target = this.event.target as Element | null;
        return target ? new BslDomElement(target, this.ctx) : undefined;
      }
      case 'отменено':
      case 'defaultprevented':
        return this.event.defaultPrevented;
      default:
        throw new Error(`Свойство '${name}' не найдено у типа СобытиеDOM`);
    }
  }

  setProp(name: string): void {
    throw new Error(`Свойство '${name}' недоступно для записи`);
  }

  getIndex(): Value {
    throw new Error('Индексация недоступна для типа СобытиеDOM');
  }

  setIndex(): void {
    throw new Error('Индексация недоступна для типа СобытиеDOM');
  }
}

/** `Стиль` элемента — доступ к `element.style`. */
export class BslDomStyle implements BslObject {
  readonly typeName = 'СтильDOM';

  constructor(private readonly element: HTMLElement) {}

  callMethod(name: string, args: Value[]): Value {
    switch (name.toLowerCase()) {
      case 'установить':
      case 'set':
        this.element.style.setProperty(toStringValue(args[0] ?? ''), toStringValue(args[1] ?? ''));
        return undefined;
      case 'получить':
      case 'get':
        return this.element.style.getPropertyValue(toStringValue(args[0] ?? ''));
      case 'удалить':
      case 'remove':
        this.element.style.removeProperty(toStringValue(args[0] ?? ''));
        return undefined;
      default:
        throw new Error(`Метод '${name}' не найден у типа СтильDOM`);
    }
  }

  getProp(name: string): Value {
    return this.element.style.getPropertyValue(name.toLowerCase());
  }

  setProp(name: string, value: Value): void {
    this.element.style.setProperty(name.toLowerCase(), toStringValue(value ?? ''));
  }

  getIndex(): Value {
    throw new Error('Индексация недоступна для типа СтильDOM');
  }

  setIndex(): void {
    throw new Error('Индексация недоступна для типа СтильDOM');
  }
}

/** `ЭлементDOM` — обёртка над `Element`. */
export class BslDomElement implements BslObject {
  readonly typeName = 'ЭлементDOM';

  constructor(
    readonly element: Element,
    private readonly ctx: GlobalContext,
  ) {}

  callMethod(name: string, args: Value[]): Value {
    const el = this.element;
    switch (name.toLowerCase()) {
      case 'установитьатрибут':
      case 'setattribute':
        el.setAttribute(toStringValue(args[0] ?? ''), toStringValue(args[1] ?? ''));
        return undefined;
      case 'получитьатрибут':
      case 'getattribute': {
        const value = el.getAttribute(toStringValue(args[0] ?? ''));
        return value === null ? undefined : value;
      }
      case 'удалитьатрибут':
      case 'removeattribute':
        el.removeAttribute(toStringValue(args[0] ?? ''));
        return undefined;
      case 'добавитьв':
      case 'appendto':
        getElement(args[0]!).appendChild(el);
        return undefined;
      case 'добавить':
      case 'append':
        el.appendChild(getElement(args[0]!));
        return undefined;
      case 'удалить':
      case 'remove':
        el.remove();
        return undefined;
      case 'добавитькласс':
      case 'addclass':
        el.classList.add(toStringValue(args[0] ?? ''));
        return undefined;
      case 'убратькласс':
      case 'removeclass':
        el.classList.remove(toStringValue(args[0] ?? ''));
        return undefined;
      case 'естькласс':
      case 'hasclass':
        return el.classList.contains(toStringValue(args[0] ?? ''));
      case 'насобытие':
      case 'onevent': {
        const domType = domEventType(toStringValue(args[0] ?? ''));
        const code = toStringValue(args[1] ?? '');
        this.onEvent(domType, code);
        return undefined;
      }
      case 'снятьсобытие':
      case 'offevent': {
        this.offEvent(domEventType(toStringValue(args[0] ?? '')));
        return undefined;
      }
      case 'запросить':
      case 'queryselector': {
        const found = el.querySelector(toStringValue(args[0] ?? ''));
        return found ? new BslDomElement(found, this.ctx) : undefined;
      }
      default:
        throw new Error(`Метод '${name}' не найден у типа ЭлементDOM`);
    }
  }

  /** Подписка на DOM-событие: код исполняется в области видимости скрипта-подписчика. */
  private onEvent(domType: string, code: string): void {
    this.offEvent(domType);
    const listener: EventListener = (event) => {
      try {
        this.interpreter().executeInModule(code, { 'Событие': new BslDomEvent(event, this.ctx) });
      } catch (e) {
        // Ошибка в обработчике не должна ломать страницу.
        console.error(`Ошибка в обработчике события '${domType}':`, e instanceof Error ? e.message : e);
      }
    };
    let map = LISTENERS.get(this.element);
    if (!map) {
      map = new Map<string, EventListener>();
      LISTENERS.set(this.element, map);
    }
    map.set(domType, listener);
    this.element.addEventListener(domType, listener);
  }

  private offEvent(domType: string): void {
    const map = LISTENERS.get(this.element);
    const listener = map?.get(domType);
    if (!map || !listener) return;
    this.element.removeEventListener(domType, listener);
    map.delete(domType);
  }

  private interpreter(): Interpreter {
    const interpreter = this.ctx.currentInterpreter;
    if (!interpreter) throw new Error('Нет исполняемого скрипта для обработчика события');
    return interpreter;
  }

  getProp(name: string): Value {
    const el = this.element;
    switch (name.toLowerCase()) {
      case 'текст':
      case 'text':
        return el.textContent ?? '';
      case 'html':
      case 'innerhtml':
        return el.innerHTML;
      case 'значение':
      case 'value':
        return (el as HTMLInputElement).value ?? '';
      case 'идентификатор':
      case 'id':
        return el.id;
      case 'класс':
      case 'classname':
        return el.className;
      case 'имятега':
      case 'tagname':
        return el.tagName.toLowerCase();
      case 'стиль':
      case 'style':
        return new BslDomStyle(el as HTMLElement);
      case 'родитель':
      case 'parent': {
        const parent = el.parentElement;
        return parent ? new BslDomElement(parent, this.ctx) : undefined;
      }
      case 'дети':
      case 'children': {
        const arr = new BslArray([]);
        for (const child of Array.from(el.children)) arr.callMethod('Добавить', [new BslDomElement(child, this.ctx)]);
        return arr;
      }
      default:
        throw new Error(`Свойство '${name}' не найдено у типа ЭлементDOM`);
    }
  }

  setProp(name: string, value: Value): void {
    const el = this.element;
    switch (name.toLowerCase()) {
      case 'текст':
      case 'text':
        el.textContent = toStringValue(value ?? '');
        return;
      case 'html':
      case 'innerhtml':
        el.innerHTML = toStringValue(value ?? '');
        return;
      case 'значение':
      case 'value':
        (el as HTMLInputElement).value = toStringValue(value ?? '');
        return;
      case 'идентификатор':
      case 'id':
        el.id = toStringValue(value ?? '');
        return;
      case 'класс':
      case 'classname':
        el.className = toStringValue(value ?? '');
        return;
      default:
        throw new Error(`Свойство '${name}' не найдено у типа ЭлементDOM`);
    }
  }

  getIndex(index: Value): Value {
    const children = Array.from(this.element.children);
    const child = children[toNumber(index)];
    return child ? new BslDomElement(child, this.ctx) : undefined;
  }

  setIndex(): void {
    throw new Error('Индексация недоступна для установки у типа ЭлементDOM');
  }
}

/** `Документ` — обёртка над `document`. */
export class BslDomDocument implements BslObject {
  readonly typeName = 'ДокументDOM';

  constructor(private readonly ctx: GlobalContext) {}

  callMethod(name: string, args: Value[]): Value {
    const doc = getDocument();
    switch (name.toLowerCase()) {
      case 'получитьэлемент':
      case 'getelementbyid': {
        const found = doc.getElementById(toStringValue(args[0] ?? ''));
        return found ? new BslDomElement(found, this.ctx) : undefined;
      }
      case 'создатьэлемент':
      case 'createelement':
        return new BslDomElement(doc.createElement(toStringValue(args[0] ?? 'div')), this.ctx);
      case 'запросить':
      case 'queryselector': {
        const found = doc.querySelector(toStringValue(args[0] ?? ''));
        return found ? new BslDomElement(found, this.ctx) : undefined;
      }
      case 'запроситьвсе':
      case 'queryselectorall': {
        const arr = new BslArray([]);
        for (const el of Array.from(doc.querySelectorAll(toStringValue(args[0] ?? '')))) {
          arr.callMethod('Добавить', [new BslDomElement(el, this.ctx)]);
        }
        return arr;
      }
      default:
        throw new Error(`Метод '${name}' не найден у типа ДокументDOM`);
    }
  }

  getProp(name: string): Value {
    const doc = getDocument();
    switch (name.toLowerCase()) {
      case 'телокорпуса':
      case 'body': {
        const body = doc.body;
        return body ? new BslDomElement(body, this.ctx) : undefined;
      }
      case 'заголовок':
      case 'title':
        return doc.title;
      default:
        throw new Error(`Свойство '${name}' не найдено у типа ДокументDOM`);
    }
  }

  setProp(name: string, value: Value): void {
    const doc = getDocument();
    if (name.toLowerCase() === 'заголовок' || name.toLowerCase() === 'title') {
      doc.title = toStringValue(value ?? '');
      return;
    }
    throw new Error(`Свойство '${name}' не найдено у типа ДокументDOM`);
  }

  getIndex(): Value {
    throw new Error('Индексация недоступна для типа ДокументDOM');
  }

  setIndex(): void {
    throw new Error('Индексация недоступна для типа ДокументDOM');
  }
}

/** Регистрирует объект `Документ` в браузерном контексте. */
export function registerDomObjects(ctx: GlobalContext): void {
  const domDocument = new BslDomDocument(ctx);
  ctx.registerGlobal('Документ', domDocument);
  ctx.registerGlobal('Document', domDocument);
}
