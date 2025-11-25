import { Node } from 'web-tree-sitter'

import { Op } from './OneScriptOperations.js'

export class Instruction{

    code: Op;
    arg: any;

    constructor(_code: Op, _arg: any = null){
        this.code = _code;
        this.arg = _arg;
    }
}

export class OSCompiler {

    instructions: Array<Instruction> = [];
    _nextLabelId: number = 0;

    newLabel(): string {
        return `L${this._nextLabelId++}`;
    }

    GetInstructions(): Array<Instruction> {
        return this.instructions;
    }

    capitalize(s: string): string { 
        return s.charAt(0).toUpperCase() + s.slice(1); 
    }

    loadAst(astNode: Node) {
        this.visit(astNode);
    }

    compile(astNode: Node): Array<Instruction> {
        this.visit(astNode);
        return this.instructions;
    }

    visit(node: Node) {
        
        const method = `visit${this.capitalize(node.type)}`;
        if (method in this && typeof (this as any)[method] === 'function') {
            return (this as any)[method](node);
        }

        throw new Error(`Нет компилятора для: ${node.type}`);
    }

    visitSource_file(node: Node) {
        for (const child of node.namedChildren) {
            if (child) { this.visit(child); }
        }
    }

    visitModule_var_block(node: Node) {
        for (const decl of node.namedChildren) {
            if (decl && decl.type === 'module_var_declaration') {
                const id = decl.namedChildren.find(c => c && c.type === 'identifier');
                if (id) {
                    const name = id.text;
                    this.instructions.push(new Instruction(Op.DECLARE, name));
                }
            }
        }
    }

    visitMember_access(node: Node) {
        const child = node.namedChildren[0];
        if (!child) {
            throw new Error(`Пустой member_access в узле: ${node.toString()}`);
        }
        this.visit(child);
    }

    visitAssignment(node: Node) {
        const targetNode = node.childForFieldName('target') || node.namedChildren[0];
        const valueNode = node.childForFieldName('value') || node.namedChildren[1];

        if (!targetNode || !valueNode) {
            throw new Error('Ошибка компиляции ' + node.text);
        }

        this.visit(valueNode);
        this.instructions.push(new Instruction(Op.STORE, targetNode.text));
    }

    visitIdentifier(node: Node) {
        const name = node.text;
        this.instructions.push(new Instruction(Op.LOAD, name));
    }

    visitPrimary_expression(node: Node) {
        // primary_expression может быть identifier, _const_value, method_call, member_access, new_operator или ( _expression )
        // Мы просто посещаем первого ребенка, который должен быть одним из этих типов
        const child = node.namedChildren[0];
        if (!child) {
            throw new Error(`Пустое primary_expression: ${node.toString()}`);
        }
        this.visit(child);
    }

    visitNumber(node: Node) {
        const NumberValue = Number(node.text);
        this.instructions.push(new Instruction(Op.PUSH, NumberValue));
    }

    visitString(node: Node) {
        this.instructions.push(new Instruction(Op.PUSH, node.text));
    }

    visitBinary_expression(node: Node) {
        const children = node.children; // ← Обязательно .children, не .namedChildren

        // Проверяем, что у нас есть дети
        if (children.length === 0) {
            throw new Error('Ошибка разбора ' + node.text);
        }

        // Случай скобок: ( expr )
        if (children.length === 3 && 
            children[0] && 
            children[2] && 
            children[0].text === '(' && 
            children[2].text === ')') {
            
            if (!children[1]) {
            throw new Error('Middle child is missing in parentheses expression');
            }
            this.visit(children[1]);
            return;
        }

        let opText = '';
        let left: Node | null = null;
        let right: Node | null = null;
        let opNode: Node | null = null;

        if (children.length === 3) {
            const [child0, child1, child2] = children;
            
            if (!child0 || !child1 || !child2) {
            throw new Error('Some children are null in 3-child binary expression');
            }
            
            [left, opNode, right] = [child0, child1, child2];
            opText = opNode.text.trim().toUpperCase();
        } else {
            throw new Error(`Unexpected number of children in binary expression: ${children.length} ${node.toString()}`);
        }

        if (!left || !right) {
            throw new Error('Left or right operand is missing');
        }

        this.visit(left);
        this.visit(right);

        switch (opText) {
            case '+': this.instructions.push(new Instruction(Op.ADD)); break;
            case '-': this.instructions.push(new Instruction(Op.SUB)); break;
            case '*': this.instructions.push(new Instruction(Op.MUL)); break;
            case '/': this.instructions.push(new Instruction(Op.DIV)); break;
            case '%': this.instructions.push(new Instruction(Op.MOD)); break;

            case '=': this.instructions.push(new Instruction(Op.EQ)); break;
            case '<>': this.instructions.push(new Instruction(Op.NE)); break;
            case '<': this.instructions.push(new Instruction(Op.LT)); break;
            case '<=': this.instructions.push(new Instruction(Op.LE)); break;
            case '>': this.instructions.push(new Instruction(Op.GT)); break;
            case '>=': this.instructions.push(new Instruction(Op.GE)); break;

            case 'И':
            case 'AND': this.instructions.push(new Instruction(Op.AND)); break;
            case 'ИЛИ':
            case 'OR': this.instructions.push(new Instruction(Op.OR)); break;

            default:
            throw new Error(`Неизвестный оператор: "${opText}"`);
        }
    }

    visitIf_statement(node: Node) {
        const named = node.namedChildren; // только значимые узлы

        if (named.length < 2) {
            throw new Error("Ожидалось: условие и тело");
        }

        const condition = named[0];
        const thenBody = named[1];
        const elseBody = named.length > 2 ? named[2] : null;

        if (!condition || !thenBody) {
            throw new Error("Condition or thenBody is null in if statement");
        }

        const endLabel = this.newLabel();

        if (elseBody) {
            if (!elseBody) {
            throw new Error("Else body is null in if statement");
            }
            
            const elseLabel = this.newLabel();

            // Компилируем условие
            this.visit(condition);
            this.instructions.push(new Instruction(Op.JUMP_IF_FALSE, elseLabel));

            // Тело "Тогда"
            this.visit(thenBody);
            this.instructions.push(new Instruction(Op.JUMP, endLabel));

            // Тело "Иначе"
            this.instructions.push(new Instruction(Op.LABEL, elseLabel));
            this.visit(elseBody);
        } else {
            const skipLabel = this.newLabel();
            this.visit(condition);
            this.instructions.push(new Instruction(Op.JUMP_IF_FALSE, skipLabel));
            this.visit(thenBody);
            this.instructions.push(new Instruction(Op.LABEL, skipLabel));
            return;
        }

        this.instructions.push(new Instruction(Op.LABEL, endLabel));
    }

    visitUnary_expression(node: Node) {
        // node.type === "unary_expression"
        // node.children.length === 2
        const operatorNode = node.child(0);      // ← это "не"
        const expressionNode = node.child(1);    // ← это "member_access (identifier)"

        if (!operatorNode || !expressionNode) {
            throw new Error(`Некорректное unary_expression: ${node.toString()}`);
        }

        // Компилируем выражение после "не"
        this.visit(expressionNode);

        // Определяем оператор
        const opText = operatorNode.text.trim().toLowerCase();

        switch (opText) {
            case 'не':
            case 'not':
            this.instructions.push(new Instruction(Op.NOT));
            break;
            case '-':
            this.instructions.push(new Instruction(Op.NEG));
            break;
            case '+':
            // Унарный плюс: не изменяет значение
            break;
            default:
            throw new Error(`Неизвестный унарный оператор: "${opText}"`);
        }
        }
    
    visitRelational_expression(node: Node) {
        // node.type === "relational_expression"
        // node.children.length === 3
        const leftNode = node.child(0);
        const opNode = node.child(1);
        const rightNode = node.child(2);

        if (!leftNode || !opNode || !rightNode) {
            throw new Error(`Некорректное relational_expression: ${node.toString()}`);
        }

        this.visit(leftNode);
        this.visit(rightNode);

        const opText = opNode.text.trim();
        switch (opText) {
            case '=': this.instructions.push(new Instruction(Op.EQ)); break;
            case '<>': this.instructions.push(new Instruction(Op.NE)); break;
            case '<': this.instructions.push(new Instruction(Op.LT)); break;
            case '>': this.instructions.push(new Instruction(Op.GT)); break;
            case '<=': this.instructions.push(new Instruction(Op.LE)); break;
            case '>=': this.instructions.push(new Instruction(Op.GE)); break;
            default:
                throw new Error(`Неизвестный оператор сравнения: "${opText}"`);
        }
    }

    visitLogical_and_expression(node: Node) {
        // node.type === "logical_and_expression"
        // node.children.length === 3
        const leftNode = node.child(0);
        const opNode = node.child(1);
        const rightNode = node.child(2);

        if (!leftNode || !opNode || !rightNode) {
            throw new Error(`Некорректное logical_and_expression: ${node.toString()}`);
        }

        this.visit(leftNode);
        this.visit(rightNode);
        this.instructions.push(new Instruction(Op.AND));
    }

    visitLogical_or_expression(node: Node) {
        // node.type === "logical_or_expression"
        // node.children.length === 3
        const leftNode = node.child(0);
        const opNode = node.child(1);
        const rightNode = node.child(2);

        if (!leftNode || !opNode || !rightNode) {
            throw new Error(`Некорректное logical_or_expression: ${node.toString()}`);
        }

        this.visit(leftNode);
        this.visit(rightNode);
        this.instructions.push(new Instruction(Op.OR));
    }
}