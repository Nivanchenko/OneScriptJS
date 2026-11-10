import type { BslObject } from '../runtime/object';
import type { GlobalContext } from '../runtime/context';
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

  constructor(readonly element: Element) {}

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
      case 'запросить':
      case 'queryselector': {
        const found = el.querySelector(toStringValue(args[0] ?? ''));
        return found ? new BslDomElement(found) : undefined;
      }
      default:
        throw new Error(`Метод '${name}' не найден у типа ЭлементDOM`);
    }
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
        return parent ? new BslDomElement(parent) : undefined;
      }
      case 'дети':
      case 'children': {
        const arr = new BslArray([]);
        for (const child of Array.from(el.children)) arr.callMethod('Добавить', [new BslDomElement(child)]);
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
    return child ? new BslDomElement(child) : undefined;
  }

  setIndex(): void {
    throw new Error('Индексация недоступна для установки у типа ЭлементDOM');
  }
}

/** `Документ` — обёртка над `document`. */
export class BslDomDocument implements BslObject {
  readonly typeName = 'ДокументDOM';

  callMethod(name: string, args: Value[]): Value {
    const doc = getDocument();
    switch (name.toLowerCase()) {
      case 'получитьэлемент':
      case 'getelementbyid': {
        const found = doc.getElementById(toStringValue(args[0] ?? ''));
        return found ? new BslDomElement(found) : undefined;
      }
      case 'создатьэлемент':
      case 'createelement':
        return new BslDomElement(doc.createElement(toStringValue(args[0] ?? 'div')));
      case 'запросить':
      case 'queryselector': {
        const found = doc.querySelector(toStringValue(args[0] ?? ''));
        return found ? new BslDomElement(found) : undefined;
      }
      case 'запроситьвсе':
      case 'queryselectorall': {
        const arr = new BslArray([]);
        for (const el of Array.from(doc.querySelectorAll(toStringValue(args[0] ?? '')))) {
          arr.callMethod('Добавить', [new BslDomElement(el)]);
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
        return body ? new BslDomElement(body) : undefined;
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
  const domDocument = new BslDomDocument();
  ctx.registerGlobal('Документ', domDocument);
  ctx.registerGlobal('Document', domDocument);
}
