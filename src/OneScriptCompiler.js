import { Op } from "./OneScriptOperations.js"

export class OSCompiler {
  constructor() {
    this.instructions = [];
    this._nextLabelId = 0;
  }

  newLabel() {
    return `L${this._nextLabelId++}`;
  }

  GetInstructions() {
    return this.instructions;
  }

  loadAst(astNode) {
    this.visit(astNode);
  }

  compile(astNode) {
    this.visit(astNode);
    return this.instructions;
  }

  visit(node) {
    // console.log('Обрабатываем узел ' + node);
    // console.log('текст узла ' + node.text);
    // console.log('тип узла ' + node.type);
    const method = `visit${this.capitalize(node.type)}`;
    // console.log('Обрабатываем метод ' + method);
    if (typeof this[method] === 'function') {
      return this[method](node);
    }
    throw new Error(`Нет компилятора для: ${node.type}`);
  }

  capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  visitSource_file(node) {
    for (const child of node.namedChildren) {
      this.visit(child);
    }
  }

  visitModule_var_block(node) {
    for (const decl of node.namedChildren) {
      if (decl.type === 'module_var_declaration') {
        const id = decl.namedChildren.find(c => c.type === 'identifier');
        if (id) {
          const name = id.text;
          this.instructions.push({ op: Op.DECLARE, arg: name });
        }
      }
    }
  }

  visitMember_access(node) {
  const child = node.namedChildren[0];
  if (!child) {
    throw new Error(`Пустой member_access в узле: ${node.toString()}`);
  }
  this.visit(child);
}

  visitAssignment(node) {
    const target = (node.childForFieldName('target') || node.namedChildren[0]).text;
    const valueNode = node.childForFieldName('value') || node.namedChildren[1];

    // Сначала компилируем значение
    this.visit(valueNode);
    // Потом сохраняем в переменную
    this.instructions.push({ op: Op.STORE, arg: target });
  }

  visitIdentifier(node) {
    const name = node.text;
    this.instructions.push({ op: Op.LOAD, arg: name });
  }

  visitNumber(node) {
    const NumberValue = Number(node.text);
    this.instructions.push({ op: Op.PUSH, arg: NumberValue });
  }

  visitString(node) {
    this.instructions.push({ op: Op.PUSH, arg: node.text });
  }

  visitBinary_expression(node) {
    const children = node.children; // ← ОБЯЗАТЕЛЬНО .children, не .namedChildren
    const childerString = children.toString();

    // Случай скобок: ( expr )
    if (children.length === 3 && children[0].text === '(' && children[2].text === ')') {
      this.visit(children[1]);
      return;
    }

    var opText = '';
    var left = null;
    var right = null;
    var opNode = null;
    if (children.length == 3) {
        [left, opNode, right] = children;
        opText = opNode.text.trim();
    }
    else if(children.length == 2){
        [left, right] = children;
        // Грамматика не определяет и\или, поэтому наколхозим тут
        const opPartLength = node.text.length - left.text.length - right.text.length;
        opText = node.text.substring(left.text.length, left.text.length + opPartLength).trim();
    }

    

    this.visit(left);
    this.visit(right);

    switch (opText) {
      case '+': this.instructions.push({ op: Op.ADD }); break;
      case '-': this.instructions.push({ op: Op.SUB }); break;
      case '*': this.instructions.push({ op: Op.MUL }); break;
      case '/': this.instructions.push({ op: Op.DIV }); break;
      case '%': this.instructions.push({ op: Op.MOD }); break;

      case '=': this.instructions.push({ op: Op.EQ }); break;
      case '<>': this.instructions.push({ op: Op.NE }); break;
      case '<': this.instructions.push({ op: Op.LT }); break;
      case '<=': this.instructions.push({ op: Op.LE }); break;
      case '>': this.instructions.push({ op: Op.GT }); break;
      case '>=': this.instructions.push({ op: Op.GE }); break;

      case 'И':
      case 'and': this.instructions.push({ op: Op.AND }); break;
      case 'ИЛИ': 
      case 'or': this.instructions.push({ op: Op.OR }); break;

      default:
        throw new Error(`Неизвестный оператор: "${opText}"`);
    }
  }

    visitIf_statement(node) {
        const named = node.namedChildren; // только значимые узлы

        // console.log('if_statement namedChildren:', named.map(n => n.type));

        // const condition_log = named[0];
        // console.log('Условие type:', condition_log.type);
        // console.log('Условие text:', condition_log.text);
        // console.log('Условие children:', condition_log.children.length);
        // console.log('Условие children детально:', condition_log.children.map((c, i) => ({
        //   index: i,
        //   type: c.type,
        //   text: c.text,
        //   isNamed: c.isNamed
        // })));

        if (named.length < 2) {
            throw new Error("Ожидалось: условие и тело");
        }

        const condition = named[0];
        const thenBody = named[1];
        const elseBody = named.length > 2 ? named[2] : null;

        const endLabel = this.newLabel();

        if (elseBody) {
            const elseLabel = this.newLabel();

            // Компилируем условие
            this.visit(condition);
            this.instructions.push({ op: Op.JUMP_IF_FALSE, arg: elseLabel });

            // Тело "Тогда"
            this.visit(thenBody);
            this.instructions.push({ op: Op.JUMP, arg: endLabel });

            // Тело "Иначе"
            this.instructions.push({ op: Op.LABEL, arg: elseLabel });
            this.visit(elseBody);
        } else {
            const skipLabel = this.newLabel();
            this.visit(condition);
            this.instructions.push({ op: Op.JUMP_IF_FALSE, arg: skipLabel });
            this.visit(thenBody);
            this.instructions.push({ op: Op.LABEL, arg: skipLabel });
            return;
        }

        this.instructions.push({ op: Op.LABEL, arg: endLabel });
    }
}