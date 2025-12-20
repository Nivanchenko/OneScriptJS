import { OneScript } from './src/OneScript.ts';
import { Node } from 'web-tree-sitter'
import { OSCompiler } from './src/OneScriptCompiler.ts';
import { OSMachine } from './src/OneScriptVirtualMachine.ts';

function printAST(node: Node, indent: string = '') {
    console.log(`${indent}${node.type}: ${node.text}`);
    for (const child of node.children) {
        if (child) {
            printAST(child, indent + '  ');
        }
    }
}

function printAllChildrenInfo(node: Node) {
    console.log('\n=== All Children info (including anonymous) ===');
    node.children.forEach((child, index) => {
        if (child) {
            console.log(`Child ${index}: type="${child.type}", text="${child.text}"`);
        } else {
            console.log(`Child ${index}: null`);
        }
    });
}

function printNamedChildrenInfo(node: Node) {
    console.log('\n=== Named Children info ===');
    node.namedChildren.forEach((child, index) => {
        if (child) {
            console.log(`Named Child ${index}: type="${child.type}", text="${child.text}"`);
        } else {
            console.log(`Named Child ${index}: null`);
        }
    });
}

async function testIfElse() {
    const oneScript = new OneScript('./wasm/tree-sitter-onescript.wasm');
    
    // Given
    const source = 
    `
    а = 1;
    в = 0;
    Если а = 0 Тогда
        в = 1
    Иначе
        в = 2
    КонецЕсли;
    `;

    console.log('=== Source code ===');
    console.log(source);
    
    // Parse and compile
    const tree = await oneScript.GetTree(source);
    if (!tree) {
        console.error('Failed to parse source');
        return;
    }
    
    console.log('\n=== AST ===');
    printAST(tree.rootNode);
    
    // Find if_statement node
    const ifStatementNode = tree.rootNode.children.find(child => child && child.type === 'if_statement');
    if (ifStatementNode) {
        printAllChildrenInfo(ifStatementNode);
        printNamedChildrenInfo(ifStatementNode);
    }
    
    // Compile
    const compiler = new OSCompiler();
    const instructions = compiler.compile(tree.rootNode);
    
    console.log('\n=== Instructions ===');
    instructions.forEach((instr, index) => {
        console.log(`${index}: ${instr.code} ${instr.arg ? '(' + instr.arg + ')' : ''}`);
    });
    
    // Run
    const machine = new OSMachine();
    machine.run(instructions);
    const vars = machine.dumpVariables();
    
    console.log('\n=== Variables ===');
    console.log('Variables:', vars);
    console.log('Expected в = 2, Actual в =', vars['в']);
}

testIfElse().catch(console.error);