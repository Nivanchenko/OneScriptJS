import { test } from 'node:test';
import assert from 'node:assert';

import { OSparser , OSMachine , OSCompiler } from '../src/main.js';

async function getTree(source) {
    var parser = new OSparser('./wasm/tree-sitter-onescript.wasm');
    var tree = await parser.Parse(source);
    return tree
}

function runCode(source, tree){
    const compiler = new OSCompiler(source);
    const ir = compiler.compile(tree.rootNode);

    const vm = new OSMachine();
    vm.run(ir);

    return vm;
}

test('template', async () => {

    // Given
    // const source = 
    // `
    // `;
    // const tree = await getTree(source);
    // When 
    // const vm = runCode(source);

    // Then

});

test('Simple parse', async () => {
    
    // Given
    const source = 
    `
    Перем а; 
    а = 1;
    `;

    // When 
    const tree = await getTree(source);

    // Then
    assert.equal(tree.rootNode.children[0].text, "Перем а;")
    assert.equal(tree.rootNode.children[1].text, "а = 1")
       
});

test('String and Number vars', async () => {

    // Given
    const source = 
    `
    Перем а; 
    а = 1;
    б = "1";
    `;
    const tree = await getTree(source);
    // When 
    const vm = runCode(source, tree);
    const variables = vm.dumpVariables();
    // const compiler = new OSCompiler(source);
    // const ir = compiler.compile(tree.rootNode);

    // const vm = new OSMachine();
    // vm.run(ir);
    // const variables = vm.dumpVariables();

    // Then
    assert.equal(variables['а'], 1);
    assert.equal(variables['б'], '"1"');

});

test('math assingn',async () => {
    
    // Given
    const source = 
    `
    a = 1 + 1;
    b = 2 - 1;
    c = 2 * 3;
    d = 6 / 2;
    f = 1 + 2 * 2 - 8 / 2;
    `;
    const tree = await getTree(source);
    // When 
    const vm = runCode(source, tree);
    const variables = vm.dumpVariables();

    // Then
    assert.equal(variables['a'], 2);
    assert.equal(variables['b'], 1);
    assert.equal(variables['c'], 6);
    assert.equal(variables['d'], 3);
    assert.equal(variables['f'], 1);

});

test('math ret val',async () => {
    
    // Given
    const source = 
    `
    a = 1 + 1;
    b = 2 - 1;
    c = a + b;
    `;
    const tree = await getTree(source);
    // When 
    const vm = runCode(source, tree);
    const variables = vm.dumpVariables();

    // Then
    assert.equal(variables['c'], 3);

});

test('if >',async () => {
    
    // Given
    const source = 
    `
    б = 0;
    а = 1 ;
    Если а > 0 Тогда
        б = 1
    КонецЕсли;`;
    const tree = await getTree(source);
    // When 
    const vm = runCode(source, tree);
    const variables = vm.dumpVariables();

    // Then
    assert.equal(variables['б'], 1);

});

test('if >=',async () => {
    
    // Given
    const source = 
    `
    б = 0;
    а = 2 ;
    Если а >= 2 Тогда
        б = 1
    КонецЕсли;`;
    const tree = await getTree(source);
    // When 
    const vm = runCode(source, tree);
    const variables = vm.dumpVariables();

    // Then
    assert.equal(variables['б'], 1);

});

test('if >=',async () => {
    
    // Given
    const source = 
    `
    б = 0;
    а = 3 ;
    Если а >= 2 Тогда
        б = 1
    КонецЕсли;`;
    const tree = await getTree(source);
    // When 
    const vm = runCode(source, tree);
    const variables = vm.dumpVariables();

    // Then
    assert.equal(variables['б'], 1);

});

test('if =',async () => {
    
    // Given
    const source = 
    `
    б = 0;
    а = 1 ;
    Если а = 1 Тогда
        б = 1
    КонецЕсли;`;
    const tree = await getTree(source);
    // When 
    const vm = runCode(source, tree);
    const variables = vm.dumpVariables();

    // Then
    assert.equal(variables['б'], 1);

});

test('if <',async () => {
    
    // Given
    const source = 
    `
    б = 0;
    а = 1 ;
    Если а < 2 Тогда
        б = 1
    КонецЕсли;`;
    const tree = await getTree(source);
    // When 
    const vm = runCode(source, tree);
    const variables = vm.dumpVariables();

    // Then
    assert.equal(variables['б'], 1);

});

test('if <=',async () => {
    
    // Given
    const source = 
    `
    б = 0;
    а = 2 ;
    Если а <= 2 Тогда
        б = 1
    КонецЕсли;`;
    const tree = await getTree(source);
    // When 
    const vm = runCode(source, tree);
    const variables = vm.dumpVariables();

    // Then
    assert.equal(variables['б'], 1);

});

test('if <=',async () => {
    
    // Given
    const source = 
    `
    б = 0;
    а = 1 ;
    Если а <= 2 Тогда
        б = 1
    КонецЕсли;`;
    const tree = await getTree(source);
    // When 
    const vm = runCode(source, tree);
    const variables = vm.dumpVariables();

    // Then
    assert.equal(variables['б'], 1);

});

test('if and',async () => {
    
    // Given
    const source = 
    `
    б = 1;
    а = 1;
    в = 0;
    Если а = 1 И б = 1 Тогда
        в = 1
    КонецЕсли;`;
    const tree = await getTree(source);
    // When 
    const vm = runCode(source, tree);
    const variables = vm.dumpVariables();

    // Then
    assert.equal(variables['в'], 1);

});