import { Op } from './OneScriptOperations.js';
import { Instruction } from './OneScriptCompiler.js';

export class OSMachine {
  private stack: any[];
  private variables: Map<string, any>;
  private labels: Map<any, number>;
  private ip: number;

  constructor() {
    this.stack = [];
    this.variables = new Map<string, any>(); // имя → значение
    this.labels = new Map<any, number>(); // имя метки → индекс в программе
    this.ip = 0; // instruction pointer (для управления переходами)
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

  run(instructions: Instruction[]) {
    this.resolveLabels(instructions);
    this.ip = 0;

    while (this.ip < instructions.length) {
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
          this.variables.set(instr.arg, null); // инициализируем
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