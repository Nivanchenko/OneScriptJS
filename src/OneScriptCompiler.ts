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
    breakTargets: string[] = [];
    continueTargets: string[] = [];
    functions: Map<string, {startLabel: string, params: string[], body: Node | null}> = new Map();
    currentFunction: string | null = null;
    functionReturnLabels: string[] = [];

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

    visitMethod_block(node: Node) {
        for (const child of node.namedChildren) {
            if (child && (child.type === 'func_declaration' || child.type === 'proc_declaration')) {
                this.visit(child);
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
        // Получаем всех детей, включая анонимные узлы
        const children = node.children;
        
        if (children.length < 2) {
            throw new Error("Ожидалось: условие и тело");
        }
        
        const endLabel = this.newLabel();
        let currentChildIndex = 0;
        
        // Находим первое условие (может быть relational_expression или logical_and_expression или logical_or_expression)
        let firstCondition: Node | null = null;
        while (currentChildIndex < children.length && !firstCondition) {
            const child = children[currentChildIndex];
            if (child && (child.type === 'relational_expression' ||
                          child.type === 'logical_and_expression' ||
                          child.type === 'logical_or_expression' ||
                          child.type === 'unary_expression')) {
                firstCondition = child;
            }
            currentChildIndex++;
        }
        
        // Находим тело then - первый именованный узел после условия
        let thenBody: Node | null = null;
        if (currentChildIndex < children.length) {
            const child = children[currentChildIndex];
            if (child && child.isNamed) {
                thenBody = child;
                currentChildIndex++;
            }
        }
        
        if (!firstCondition || !thenBody) {
            throw new Error("Condition or thenBody is null in if statement");
        }

        // Создаем метку для следующего условия (если будет elsif) или else
        let nextConditionLabel = this.newLabel();

        // Компилируем первое условие
        this.visit(firstCondition);
        this.instructions.push(new Instruction(Op.JUMP_IF_FALSE, nextConditionLabel));

        // Тело "Тогда"
        this.visit(thenBody);
        this.instructions.push(new Instruction(Op.JUMP, endLabel));

        // Обрабатываем все "ИначеЕсли" и "Иначе"
        while (currentChildIndex < children.length) {
            // Проверяем, является ли текущий узел условием (relational_expression)
            const child = children[currentChildIndex];
            
            if (!child) {
                currentChildIndex++;
                continue;
            }

            // Если это условие, значит это elsif
            if (child.type === 'relational_expression') {
                // Добавляем метку для предыдущего условия
                this.instructions.push(new Instruction(Op.LABEL, nextConditionLabel));
                
                // Получаем условие elsif
                const elsifCondition = child;
                currentChildIndex++;
                
                // Находим тело elsif - первый именованный узел после условия
                let elsifBody: Node | null = null;
                if (currentChildIndex < children.length) {
                    const nextChild = children[currentChildIndex];
                    if (nextChild && nextChild.isNamed) {
                        elsifBody = nextChild;
                        currentChildIndex++;
                    }
                }

                if (!elsifCondition || !elsifBody) {
                    throw new Error("Elsif condition or body is null");
                }

                // Создаем новую метку для следующего условия или else
                const newNextConditionLabel = this.newLabel();

                // Компилируем условие elsif
                this.visit(elsifCondition);
                this.instructions.push(new Instruction(Op.JUMP_IF_FALSE, newNextConditionLabel));

                // Тело elsif
                this.visit(elsifBody);
                this.instructions.push(new Instruction(Op.JUMP, endLabel));

                // Обновляем метку
                nextConditionLabel = newNextConditionLabel;
            } else if (child.isNamed && child.type !== 'relational_expression') {
                // Это else часть - добавляем метку для else
                this.instructions.push(new Instruction(Op.LABEL, nextConditionLabel));
                
                // Тело "Иначе"
                const elseBody = child;
                currentChildIndex++;
                
                if (elseBody) {
                    this.visit(elseBody);
                }
                this.instructions.push(new Instruction(Op.JUMP, endLabel));
                
                // Завершаем обработку
                this.instructions.push(new Instruction(Op.LABEL, endLabel));
                return;
            } else {
                // Это часть тела или ключевое слово, пропускаем
                currentChildIndex++;
            }
        }

        // Добавляем финальную метку для случая, когда ни одно условие не выполнилось
        this.instructions.push(new Instruction(Op.LABEL, nextConditionLabel));
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

    visitFor_loop(node: Node) {
        // node.type === "for_loop"
        // Структура по tree-sitter: identifier, =, start_expr, end_expr, assignment, ;
        const children = node.children;
        
        if (children.length < 5) {
            throw new Error(`Некорректный for_loop: ${node.toString()}`);
        }
        
        const variableNode = children[0]; // identifier
        const startNode = children[2];    // выражение (начальное значение)
        const endNode = children[3];      // выражение (конечное значение)
        
        if (!variableNode || !startNode || !endNode) {
            throw new Error(`Некорректный for_loop: ${node.toString()}`);
        }
        
        // Ищем тело цикла (assignment или другие statements)
        const bodyNodes: Node[] = [];
        for (let i = 4; i < children.length; i++) {
            const child = children[i];
            if (child && child.isNamed && child.type !== '_code_block') {
                bodyNodes.push(child);
            }
        }
        
        // Генерируем инструкции для цикла for
        const loopStartLabel = this.newLabel();
        const loopEndLabel = this.newLabel();
        const loopContinueLabel = this.newLabel();
        
        // Сохраняем текущие стеки целей и добавляем новые для этого цикла
        const oldBreakTargets = [...this.breakTargets];
        const oldContinueTargets = [...this.continueTargets];
        
        this.breakTargets.push(loopEndLabel);
        this.continueTargets.push(loopContinueLabel);
        
        // Инициализация переменной цикла
        this.visit(startNode);
        this.instructions.push(new Instruction(Op.STORE, variableNode.text));
        
        // Метка начала цикла
        this.instructions.push(new Instruction(Op.LABEL, loopStartLabel));
        
        // Проверка условия продолжения цикла
        this.instructions.push(new Instruction(Op.LOAD, variableNode.text));
        this.visit(endNode);
        this.instructions.push(new Instruction(Op.LE)); // переменная <= конечное значение
        
        // Переход к концу цикла, если условие не выполняется
        this.instructions.push(new Instruction(Op.JUMP_IF_FALSE, loopEndLabel));
        
        // Тело цикла
        for (const child of bodyNodes) {
            this.visit(child);
        }
        
        // Переход к продолжению цикла (для обработки continue)
        this.instructions.push(new Instruction(Op.JUMP, loopContinueLabel));
        
        // Метка продолжения цикла
        this.instructions.push(new Instruction(Op.LABEL, loopContinueLabel));
        
        // Инкремент переменной цикла
        this.instructions.push(new Instruction(Op.LOAD, variableNode.text));
        this.instructions.push(new Instruction(Op.PUSH, 1));
        this.instructions.push(new Instruction(Op.ADD));
        this.instructions.push(new Instruction(Op.STORE, variableNode.text));
        
        // Переход к началу цикла
        this.instructions.push(new Instruction(Op.JUMP, loopStartLabel));
        
        // Метка окончания цикла
        this.instructions.push(new Instruction(Op.LABEL, loopEndLabel));
        
        // Восстанавливаем старые стеки целей
        this.breakTargets = oldBreakTargets;
        this.continueTargets = oldContinueTargets;
    }

    visitBreak_statement(node: Node) {
        // Генерируем инструкцию break с меткой конца текущего цикла
        if (this.breakTargets.length === 0) {
            throw new Error('Прервать вне цикла');
        }
        this.instructions.push(new Instruction(Op.BREAK, this.breakTargets[this.breakTargets.length - 1]));
    }

    visitContinue_statement(node: Node) {
        // Генерируем инструкцию continue с меткой продолжения текущего цикла
        if (this.continueTargets.length === 0) {
            throw new Error('Продолжить вне цикла');
        }
        this.instructions.push(new Instruction(Op.CONTINUE, this.continueTargets[this.continueTargets.length - 1]));
    }

    visitFunc_declaration(node: Node) {
        const funcNameNode = node.childForFieldName('func_name');
        if (!funcNameNode) {
            throw new Error('Функция без имени');
        }
        const funcName = funcNameNode.text;
        
        const params: string[] = [];
        const argsListNode = node.namedChildren.find(c => c && c.type === 'argument_list');
        if (argsListNode) {
            const argumentsNode = argsListNode.namedChildren.find(c => c && c.type === 'arguments');
            if (argumentsNode) {
                for (const child of argumentsNode.namedChildren) {
                    if (child && child.type === 'identifier') {
                        params.push(child.text);
                    }
                }
            }
        }
        
        const funcStartLabel = this.newLabel();
        const funcEndLabel = this.newLabel();
        
        this.functions.set(funcName, { startLabel: funcStartLabel, params, body: node });
        
        this.instructions.push(new Instruction(Op.LABEL, funcStartLabel));
        this.instructions.push(new Instruction(Op.BEGIN_FUNC, { name: funcName, params, endLabel: funcEndLabel }));
        
        const oldBreakTargets = [...this.breakTargets];
        const oldContinueTargets = [...this.continueTargets];
        this.breakTargets = [];
        this.continueTargets = [];
        
        for (const child of node.namedChildren) {
            if (child && child.type === 'var_block') {
                this.visit(child);
            } else if (child && (child.type === '_code_block' || child.type === 'return_statement')) {
                this.visit(child);
            }
        }
        
        // Явный RET в конце функции без значения возврата
        this.instructions.push(new Instruction(Op.RET, null));
        this.instructions.push(new Instruction(Op.LABEL, funcEndLabel));
        this.instructions.push(new Instruction(Op.END_FUNC));
        
        this.breakTargets = oldBreakTargets;
        this.continueTargets = oldContinueTargets;
    }

    visitProc_declaration(node: Node) {
        const procNameNode = node.childForFieldName('proc_name');
        if (!procNameNode) {
            throw new Error('Процедура без имени');
        }
        const procName = procNameNode.text;
        
        const params: string[] = [];
        const argsListNode = node.namedChildren.find(c => c && c.type === 'argument_list');
        if (argsListNode) {
            const argumentsNode = argsListNode.namedChildren.find(c => c && c.type === 'arguments');
            if (argumentsNode) {
                for (const child of argumentsNode.namedChildren) {
                    if (child && child.type === 'identifier') {
                        params.push(child.text);
                    }
                }
            }
        }
        
        const procStartLabel = this.newLabel();
        this.functions.set(procName, { startLabel: procStartLabel, params, body: null });
        
        this.instructions.push(new Instruction(Op.LABEL, procStartLabel));
        this.instructions.push(new Instruction(Op.BEGIN_FUNC, { name: procName, params, endLabel: null }));
        
        const oldBreakTargets = [...this.breakTargets];
        const oldContinueTargets = [...this.continueTargets];
        this.breakTargets = [];
        this.continueTargets = [];
        
        for (const child of node.namedChildren) {
            if (child && (child.type === 'var_block' || child.type === '_code_block')) {
                this.visit(child);
            }
        }
        
        this.instructions.push(new Instruction(Op.RET));
        this.instructions.push(new Instruction(Op.END_FUNC));
        
        this.breakTargets = oldBreakTargets;
        this.continueTargets = oldContinueTargets;
    }

    visitReturn_statement(node: Node) {
        const exprNode = node.namedChildren.find(c => c && c.type !== 'return_statement' && c.isNamed);
        
        if (exprNode) {
            this.visit(exprNode);
        }
        
        // RET уже кладет значение на стек если оно есть
        this.instructions.push(new Instruction(Op.RET));
    }

    visitMethod_call(node: Node) {
        const identifierNode = node.namedChildren.find(c => c && c.type === 'identifier');
        if (!identifierNode) {
            throw new Error('Вызов метода без имени');
        }
        const methodName = identifierNode.text;
        
        const argsListNode = node.namedChildren.find(c => c && c.type === 'call_args');
        let argCount = 0;
        if (argsListNode) {
            for (const child of argsListNode.namedChildren) {
                if (child && child.isNamed) {
                    this.visit(child);
                    argCount++;
                }
            }
        }
        
        if (this.functions.has(methodName)) {
            const returnLabel = this.newLabel();
            this.instructions.push(new Instruction(Op.CALL, { name: methodName, paramCount: argCount, returnLabel }));
            this.instructions.push(new Instruction(Op.LABEL, returnLabel));
        } else {
            throw new Error(`Функция не найдена: ${methodName}`);
        }
    }
}