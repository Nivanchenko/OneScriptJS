import { test } from 'node:test';
import assert from 'node:assert';

import { OneScript } from '../src/main.js';

function getOneScript(){
    return new OneScript('./wasm/tree-sitter-onescript.wasm');
}

test('template', async () => {

    // Given
    // const OS = getOneScript();
    // const source = 
    // `
    // `;
    
    // When 
    // await OS.Run(source);
    // const variables = OS.DumpVariables();

    // Then

});

test('Simple parse', async () => {
    
    // Given
    const OS = getOneScript();
    const source = 
    `
    Перем а; 
    а = 1;
    `;

    // When 
    
    const tree = await OS.GetTree(source);

    // Then
    assert.equal(tree.rootNode.children[0].text, "Перем а;")
    assert.equal(tree.rootNode.children[1].text, "а = 1")
       
});

test('load and run', async () => {

    // Given
    const OS = getOneScript();
    const source = 
    `
    Перем а; 
    а = 1;
    б = "1";
    `;

    // When 
    await OS.AddSource(source);
    await OS.Run();
    const variables = OS.DumpVariables();

    // Then
    assert.equal(variables['а'], 1);
    assert.equal(variables['б'], '"1"');

});

test('double load and run', async () => {

    // Given
    const OS = getOneScript();

    const source = 
    `
    а = 1;
    `;

    const source2 = 
    `
    б = "1";
    `;

    // When 
    await OS.AddSource(source);
    await OS.AddSource(source2);
    await OS.Run();
    const variables = OS.DumpVariables();

    // Then
    assert.equal(variables['а'], 1);
    assert.equal(variables['б'], '"1"');

});

test('String and Number vars', async () => {

    // Given
    const OS = getOneScript();
    const source = 
    `
    Перем а; 
    а = 1;
    б = "1";
    `;

    // When 
    await OS.Run(source);
    const variables = OS.DumpVariables();

    // Then
    assert.equal(variables['а'], 1);
    assert.equal(variables['б'], '"1"');

});

test('math assingn',async () => {
    
    // Given
    const OS = getOneScript();
    const source = 
    `
    a = 1 + 1;
    b = 2 - 1;
    c = 2 * 3;
    d = 6 / 2;
    f = 1 + 2 * 2 - 8 / 2;
    `;

    // When 
    await OS.Run(source);
    const variables = OS.DumpVariables();

    // Then
    assert.equal(variables['a'], 2);
    assert.equal(variables['b'], 1);
    assert.equal(variables['c'], 6);
    assert.equal(variables['d'], 3);
    assert.equal(variables['f'], 1);

});

test('math ret val',async () => {
    
    // Given
    const OS = getOneScript();
    const source = 
    `
    a = 1 + 1;
    b = 2 - 1;
    c = a + b;
    `;
    
    // When 
    await OS.Run(source);
    const variables = OS.DumpVariables();

    // Then
    assert.equal(variables['c'], 3);

});

test('if >',async () => {
    
    // Given
    const OS = getOneScript();
    const source = 
    `
    б = 0;
    а = 1 ;
    Если а > 0 Тогда
        б = 1
    КонецЕсли;`;
    
    // When 
    await OS.Run(source);
    const variables = OS.DumpVariables();

    // Then
    assert.equal(variables['б'], 1);

});

test('if >=',async () => {
    
    // Given
    const OS = getOneScript();
    const source = 
    `
    б = 0;
    а = 2 ;
    Если а >= 2 Тогда
        б = 1
    КонецЕсли;`;
    
    // When 
    await OS.Run(source);
    const variables = OS.DumpVariables();

    // Then
    assert.equal(variables['б'], 1);

});

test('if >=',async () => {
    
    // Given
    const OS = getOneScript();
    const source = 
    `
    б = 0;
    а = 3 ;
    Если а >= 2 Тогда
        б = 1
    КонецЕсли;`;
    
    // When 
    await OS.Run(source);
    const variables = OS.DumpVariables();

    // Then
    assert.equal(variables['б'], 1);

});

test('if =',async () => {
    
    // Given
    const OS = getOneScript();
    const source = 
    `
    б = 0;
    а = 1 ;
    Если а = 1 Тогда
        б = 1
    КонецЕсли;`;
    
    // When 
    await OS.Run(source);
    const variables = OS.DumpVariables();

    // Then
    assert.equal(variables['б'], 1);

});

test('if <',async () => {
    
    // Given
    const OS = getOneScript();
    const source = 
    `
    б = 0;
    а = 1 ;
    Если а < 2 Тогда
        б = 1
    КонецЕсли;`;
    
    // When 
    await OS.Run(source);
    const variables = OS.DumpVariables();

    // Then
    assert.equal(variables['б'], 1);

});

test('if <=',async () => {
    
    // Given
    const OS = getOneScript();
    const source = 
    `
    б = 0;
    а = 2 ;
    Если а <= 2 Тогда
        б = 1
    КонецЕсли;`;
    
    // When 
    await OS.Run(source);
    const variables = OS.DumpVariables();

    // Then
    assert.equal(variables['б'], 1);

});

test('if <=',async () => {
    
    // Given
    const OS = getOneScript();
    const source = 
    `
    б = 0;
    а = 1 ;
    Если а <= 2 Тогда
        б = 1
    КонецЕсли;`;
    
    // When 
    await OS.Run(source);
    const variables = OS.DumpVariables();

    // Then
    assert.equal(variables['б'], 1);

});

test('if and',async () => {
    
    // Given
    const OS = getOneScript();
    const source = 
    `
    б = 1;
    а = 1;
    в = 0;
    Если а = 1 И б = 1 Тогда
        в = 1
    КонецЕсли;`;
    
    // When 
    await OS.Run(source);
    const variables = OS.DumpVariables();

    // Then
    assert.equal(variables['в'], 1);

});

test('if or',async () => {
    
    // Given
    const OS = getOneScript();
    const source = 
    `
    б = 1;
    а = 1;
    в = 0;
    Если а = 1 ИЛИ б = 0 Тогда
        в = 1
    КонецЕсли;`;
    
    // When 
    await OS.Run(source);
    const variables = OS.DumpVariables();

    // Then
    assert.equal(variables['в'], 1);

});

test('if or',async () => {
    
    // Given
    const OS = getOneScript();
    const source = 
    `
    б = 1;
    а = 1;
    в = 0;
    Если а = 0 ИЛИ б = 1 Тогда
        в = 1
    КонецЕсли;`;
    
    // When 
    await OS.Run(source);
    const variables = OS.DumpVariables();

    // Then
    assert.equal(variables['в'], 1);

});

test('if noteq',async () => {
    
    // Given
    const OS = getOneScript();
    const source = 
    `
    а = 1;
    в = 0;
    Если а <> 0 Тогда
        в = 1
    КонецЕсли;`;
    
    // When 
    await OS.Run(source);
    const variables = OS.DumpVariables();

    // Then
    assert.equal(variables['в'], 1);

});

test('if not',async () => {
    
    // Given
    const OS = getOneScript();
    const source = 
    `
    а = 1;
    в = 0;
    Если НЕ а = 0 Тогда
        в = 1
    КонецЕсли;`;
    
    // When 
    await OS.Run(source);
    const variables = OS.DumpVariables();

    // Then
    assert.equal(variables['в'], 1);

});