import { Op } from './OneScriptOperations.js';
import { Instruction } from './OneScriptCompiler.js';

export class OSMachine {
  private stack: any[];
  private variables: Map<string, any>;
  private labels: Map<any, number>;
  private ip: number;
  private callStack: Array<{returnIP: number, returnLabel: string | null, localVars: Map<string, any>}>;
  private functions: Map<string, {startIP: number, endIP: number, params: string[], endLabel: string | null}>;

  constructor() {
    this.stack = [];
    this.variables = new Map<string, any>();
    this.labels = new Map<any, number>();
    this.ip = 0;
    this.callStack = [];
    this.functions = new Map();
  }

  resolveLabels(instructions: Instruction[]) {
    this.labels.clear();
    for (let i = 0; i < instructions.length; i++) {
      const instr = instructions[i];
      if (instr && instr.code === Op.LABEL) {
        this.labels.set(instr.arg, i);
      }
    }
  }

  resolveFunctions(instructions: Instruction[]) {
    this.functions.clear();
    for (let i = 0; i < instructions.length; i++) {
      const instr = instructions[i];
      if (instr && instr.code === Op.BEGIN_FUNC && instr.arg.name) {
        const funcName = instr.arg.name;
        const { params, endLabel } = instr.arg;
        
        // Находим endIP (после END_FUNC)
        let endIP = i + 1;
        for (let j = i + 1; j < instructions.length; j++) {
          if (instructions[j] && instructions[j].code === Op.END_FUNC) {
            endIP = j + 1;
            break;
          }
        }
        
        this.functions.set(funcName, {
          startIP: i,
          endIP,
          params,
          endLabel: endLabel || null
        });
      }
    }
  }

  private getVariable(name: string): any {
    if (this.callStack.length > 0) {
      const currentFrame = this.callStack[this.callStack.length - 1];
      if (currentFrame.localVars.has(name)) {
        return currentFrame.localVars.get(name);
      }
    }
    if (this.variables.has(name)) {
      return this.variables.get(name);
    }
    throw new ReferenceError(`Переменная не определена: ${name}`);
  }

  private setVariable(name: string, value: any) {
    if (this.callStack.length > 0) {
      const currentFrame = this.callStack[this.callStack.length - 1];
      if (currentFrame.localVars.has(name)) {
        currentFrame.localVars.set(name, value);
        return;
      }
    }
    this.variables.set(name, value);
  }

  run(instructions: Instruction[]) {
    this.resolveLabels(instructions);
    this.resolveFunctions(instructions);
    this.ip = 0;

    while (this.ip < instructions.length) {
      // Проверяем, не находимся ли мы внутри тела функции в глобальном контексте
      if (this.callStack.length === 0) {
        for (const [funcName, funcInfo] of this.functions) {
          if (this.ip > funcInfo.startIP && this.ip < funcInfo.endIP) {
            // Мы внутри тела функции, но не в вызове - пропускаем до конца функции
            this.ip = funcInfo.endIP;
            break;
          }
        }
      }
      
      const instr = instructions[this.ip];
      if (!instr) {
        throw new Error(`Instruction at index ${this.ip} is undefined`);
      }
      this.ip++;

      switch (instr.code) {
        case Op.PUSH:
          this.stack.push(instr.arg);
          break;

        case Op.LOAD:
          const value = this.getVariable(instr.arg);
          this.stack.push(value);
          break;

        case Op.STORE:
          const val = this.stack.pop();
          this.setVariable(instr.arg, val);
          break;

        case Op.ADD:
          const addb = this.stack.pop();
          const adda = this.stack.pop();
          if (adda === undefined || addb === undefined) {
            throw new Error('Stack underflow in ADD operation');
          }
          this.stack.push(adda + addb);
          break;

        case Op.SUB:
          const subb = this.stack.pop();
          const suba = this.stack.pop();
          if (suba === undefined || subb === undefined) {
            throw new Error('Stack underflow in SUB operation');
          }
          this.stack.push(suba - subb);
          break;

        case Op.MUL:
          const multb = this.stack.pop();
          const multa = this.stack.pop();
          if (multa === undefined || multb === undefined) {
            throw new Error('Stack underflow in MUL operation');
          }
          this.stack.push(multa * multb);
          break;

        case Op.DIV:
          const divb = this.stack.pop();
          const diva = this.stack.pop();
          if (diva === undefined || divb === undefined) {
            throw new Error('Stack underflow in DIV operation');
          }
          this.stack.push(diva / divb);
          break;

        case Op.DECLARE:
          this.variables.set(instr.arg, null);
          break;

        case Op.EQ:
          const eqb = this.stack.pop();
          const eqa = this.stack.pop();
          if (eqa === undefined || eqb === undefined) {
            throw new Error('Stack underflow in EQ operation');
          }
          this.stack.push(eqa === eqb);
          break;

        case Op.NE:
          const neb = this.stack.pop();
          const nea = this.stack.pop();
          if (nea === undefined || neb === undefined) {
            throw new Error('Stack underflow in NE operation');
          }
          this.stack.push(nea !== neb);
          break;

        case Op.LT:
          const ltb = this.stack.pop();
          const lta = this.stack.pop();
          if (lta === undefined || ltb === undefined) {
            throw new Error('Stack underflow in LT operation');
          }
          this.stack.push(lta < ltb);
          break;

        case Op.LE:
          const leb = this.stack.pop();
          const lea = this.stack.pop();
          if (lea === undefined || leb === undefined) {
            throw new Error('Stack underflow in LE operation');
          }
          this.stack.push(lea <= leb);
          break;

        case Op.GT:
          const gtb = this.stack.pop();
          const gta = this.stack.pop();
          if (gta === undefined || gtb === undefined) {
            throw new Error('Stack underflow in GT operation');
          }
          this.stack.push(gta > gtb);
          break;

        case Op.GE:
          const geb = this.stack.pop();
          const gea = this.stack.pop();
          if (gea === undefined || geb === undefined) {
            throw new Error('Stack underflow in GE operation');
          }
          this.stack.push(gea >= geb);
          break;

        case Op.AND:
          const rightAnd = this.stack.pop();
          const leftAnd = this.stack.pop();
          if (leftAnd === undefined || rightAnd === undefined) {
            throw new Error('Stack underflow in AND operation');
          }
          this.stack.push(leftAnd && rightAnd);
          break;

        case Op.OR:
          const rightOr = this.stack.pop();
          const leftOr = this.stack.pop();
          if (leftOr === undefined || rightOr === undefined) {
            throw new Error('Stack underflow in OR operation');
          }
          this.stack.push(leftOr || rightOr);
          break;

        case Op.JUMP_IF_FALSE:
          const jmpvalue = this.stack.pop();
          if (!jmpvalue) {
            const target = this.labels.get(instr.arg);
            if (target === undefined) throw new Error(`Метка не найдена: ${instr.arg}`);
            this.ip = target + 1;
          }
          break;

        case Op.JUMP:
          const target2 = this.labels.get(instr.arg);
          if (target2 === undefined) throw new Error(`Метка не найдена: ${instr.arg}`);
          this.ip = target2 + 1;
          break;

        case Op.LABEL:
          break;

        case Op.NOT:
          const NOTvalue = this.stack.pop();
          if (NOTvalue === undefined) {
            throw new Error('Stack underflow in NOT operation');
          }
          this.stack.push(!NOTvalue);
          break;

        case Op.NEG:
          const NEGnum = this.stack.pop();
          if (NEGnum === undefined) {
            throw new Error('Stack underflow in NEG operation');
          }
          if (typeof NEGnum !== 'number') {
            throw new Error(`Cannot apply unary minus to non-number: ${typeof NEGnum}`);
          }
          this.stack.push(-NEGnum);
          break;

        case Op.BREAK:
          const breakTarget = this.labels.get(instr.arg);
          if (breakTarget === undefined) throw new Error(`Метка для break не найдена: ${instr.arg}`);
          this.ip = breakTarget + 1;
          break;

        case Op.CONTINUE:
          const continueTarget = this.labels.get(instr.arg);
          if (continueTarget === undefined) throw new Error(`Метка для continue не найдена: ${instr.arg}`);
          this.ip = continueTarget + 1;
          break;

        case Op.BEGIN_FUNC:
          // BEGIN_FUNC используется только для регистрации функции в resolveFunctions
          // При выполнении просто пропускаем эту инструкцию
          break;

        case Op.CALL:
          {
            const { name, paramCount, returnLabel } = instr.arg;
            const funcInfo = this.functions.get(name);
            if (!funcInfo) {
              throw new Error(`Функция не найдена: ${name}`);
            }
            
            const args = [];
            for (let i = 0; i < paramCount; i++) {
              args.unshift(this.stack.pop());
            }
            
            const localVars = new Map<string, any>();
            for (let i = 0; i < funcInfo.params.length; i++) {
              localVars.set(funcInfo.params[i], args[i]);
            }
            
            this.callStack.push({
              returnIP: this.ip,
              returnLabel: returnLabel,
              localVars: localVars
            });
            
            this.ip = funcInfo.startIP + 1;
          }
          break;

        case Op.RET:
          {
            if (this.callStack.length === 0) {
              throw new Error('RET без вызова функции');
            }
            
            const frame = this.callStack.pop()!;
            
            // Если на стеке есть значение возврата, оно должно остаться для вызывающей стороны
            // Ничего не делаем со стеком - значение уже на вершине
            
            const returnTarget = this.labels.get(frame.returnLabel);
            if (returnTarget !== undefined) {
              this.ip = returnTarget + 1;
            } else {
              this.ip = frame.returnIP;
            }
          }
          break;

        case Op.END_FUNC:
          break;

        default:
          throw new Error(`Неизвестная инструкция: ${instr.code}`);
      }
    }
  }

  dumpVariables(): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, value] of this.variables) {
      result[key] = value;
    }
    return result;
  }
}
