const Op = {
  // Переменные
    PUSH: 'PUSH',        
    LOAD: 'LOAD',        
    STORE: 'STORE', 
    DECLARE: 'DECLARE',    
  // Математика  
    ADD: 'ADD',
    SUB: 'SUB',
    MUL: 'MUL',
    DIV: 'DIV',
    MOD: 'MOD',
  // Сравнение
    EQ: 'EQ',   // =
    NE: 'NE',   // <>
    LT: 'LT',   // <
    LE: 'LE',   // <=
    GT: 'GT',   // >
    GE: 'GE',   // >=
  // Логические
    AND: 'AND',
    OR: 'OR',
    NOT: 'NOT',
  // Условия
    JUMP_IF_FALSE: 'JUMP_IF_FALSE', 
    JUMP: 'JUMP',                   
    LABEL: 'LABEL',   
                
};

export class OSCompiler {
  constructor(source) {
    this.source = source;
    this.instructions = [];
    this._nextLabelId = 0;
  }

  newLabel() {
    return `L${this._nextLabelId++}`;
  }

  compile(astNode) {
    this.visit(astNode);
    return this.instructions;
  }

  visit(node) {
    console.log('Обрабатываем узел ' + node);
    const method = `visit${this.capitalize(node.type)}`;
    console.log('Обрабатываем метод ' + method);
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
    const children = node.children; // важно: .children, не .namedChildren
    if (children.length < 3) {
      // Это может быть скобка: ( expr )
      if (children.length === 1 && children[0].type === '_expression') {
        return this.visit(children[0]);
      }
      throw new Error(`Некорректный binary_expression: ${node.toString()}`);
    }

    const left = children[0];
    const opNode = children[1];
    const right = children[2];

    this.visit(left);
    this.visit(right);

    const opText = opNode.text.trim();

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
        throw new Error(`Неизвестный бинарный оператор: "${opText}"`);
    }
  }

    visitIf_statement(node) {
        const named = node.namedChildren; // только значимые узлы

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
export class OSMachine {
  constructor() {
    this.stack = [];
    this.variables = new Map(); // имя → значение
    this.labels = new Map(); // имя метки → индекс в программе
    this.ip = 0; // instruction pointer (для управления переходами)
  }

  resolveLabels(instructions) {
    this.labels.clear();
    for (let i = 0; i < instructions.length; i++) {
      const instr = instructions[i];
      if (instr.op === Op.LABEL) {
        this.labels.set(instr.arg, i);
      }
    }
  }

  run(instructions) {
    this.resolveLabels(instructions);
    this.ip = 0;

    while (this.ip < instructions.length) {
      const instr = instructions[this.ip];
      this.ip++;

      switch (instr.op) {
        case Op.PUSH:
          this.stack.push(instr.arg);
          break;

        case Op.LOAD:
          const value = this.variables.get(instr.arg);
          if (value === undefined) throw new ReferenceError(`Переменная не определена: ${instr.arg}`);
          this.stack.push(value);
          break;

        case Op.STORE:
          const val = this.stack.pop();
          this.variables.set(instr.arg, val);
          break;

        case Op.ADD:
          const addb = this.stack.pop();
          const adda = this.stack.pop();
          this.stack.push(adda + addb);
          break;

        case Op.SUB:
          const subb = this.stack.pop();
          const suba = this.stack.pop();
          this.stack.push(suba - subb);
          break;

        case Op.MUL:
          const multb = this.stack.pop();
          const multa = this.stack.pop();
          this.stack.push(multa * multb);
          break;

        case Op.DIV:
          const divb = this.stack.pop();
          const diva = this.stack.pop();
          this.stack.push(diva / divb);
          break;

        case Op.DECLARE:
          this.variables.set(instr.arg, null); // инициализируем
          break;

        case Op.EQ:
          const eqb = this.stack.pop();
          const eqa = this.stack.pop();
          this.stack.push(eqa === eqb);
          break;

        case Op.NE:
          const neb = this.stack.pop();
          const nea = this.stack.pop();
          this.stack.push(nea !== neb);
          break;

        case Op.LT:
          const ltb = this.stack.pop();
          const lta = this.stack.pop();
          this.stack.push(lta < ltb);
          break;

        case Op.LE:
          const leb = this.stack.pop();
          const lea = this.stack.pop();
          this.stack.push(lea <= leb);
          break;

        case Op.GT:
          const gtb = this.stack.pop();
          const gta = this.stack.pop();
          this.stack.push(gta > gtb);
          break;

        case Op.GE:
          const geb = this.stack.pop();
          const gea = this.stack.pop();
          this.stack.push(gea >= geb);
          break;

        case Op.AND:
          const rightAnd = this.stack.pop();
          const leftAnd = this.stack.pop();
          this.stack.push(leftAnd && rightAnd);
          break;

        case Op.OR:
          const rightOr = this.stack.pop();
          const leftOr = this.stack.pop();
          this.stack.push(leftOr || rightOr);
          break;

        case Op.JUMP_IF_FALSE:
          const jmpvalue = this.stack.pop();
          if (!jmpvalue) {
            const target = this.labels.get(instr.arg);
            if (target === undefined) throw new Error(`Метка не найдена: ${instr.arg}`);
            this.ip = target + 1; // +1, потому что в конце цикла ip++
          }
          break;

        case Op.JUMP:
          const target2 = this.labels.get(instr.arg);
          if (target2 === undefined) throw new Error(`Метка не найдена: ${instr.arg}`);
          this.ip = target2 + 1;
          break;

        case Op.LABEL:
          // ничего не делаем — метки уже разрешены
          break;

        default:
          throw new Error(`Неизвестная инструкция: ${instr.op}`);
      }
    }
  }

  dumpVariables() {
    return Object.fromEntries(this.variables);
  }
}
