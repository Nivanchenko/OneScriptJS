import { describe, it, expect, beforeEach } from 'vitest';
import { OneScript } from '../src/OneScript.js';

describe('OneScript', () => {
  let oneScript: OneScript;

  beforeEach(async () => {
    oneScript = new OneScript('./wasm/tree-sitter-onescript.wasm');
  });

    it('Simple parse', async () => {

        // Given
        const source = 
        `
        Перем а; 
        а = 1;
        `;

        // When 
        const tree = await oneScript.GetTree(source);

        // Then
        expect(tree?.rootNode?.children?.[0]?.text).toBe("Перем а;");
        expect(tree?.rootNode?.children?.[1]?.text).toBe("а = 1");

    });

    it('Assign', async () => {

        // Given
        const source = 
        `
        а = 4;
        `;

        // When 
        await oneScript.Run(source);
        const vars = oneScript.dumpVariables();

        // Then
        expect(vars['а']).toBe(4);
    });

    it('load and run', async () => {

        // Given
        const source = 
        `
        Перем а; 
        а = 1;
        б = "1";
        `;

        // When 
        await oneScript.addSource(source);
        await oneScript.Run();
        const vars = oneScript.dumpVariables();

        // Then
        expect(vars['а']).toBe(1);
        expect(vars['б']).toBe('"1"');
    });

    it('double load and run', async () => {

        // Given
        const source = 
        `
        а = 1;
        `;

        const source2 = 
        `
        б = "1";
        `;

        // When 
        await oneScript.addSource(source);
        await oneScript.addSource(source2);
        await oneScript.Run();
        const vars = oneScript.dumpVariables();

        // Then
        expect(vars['а']).toBe(1);
        expect(vars['б']).toBe('"1"');
    });

    it('String and Number vars', async () => {

        // Given
        const source = 
        `
        Перем а; 
        а = 1;
        б = "1";
        `;

        // When 
        await oneScript.Run(source);
        const vars = oneScript.dumpVariables();

        // Then
        expect(vars['а']).toBe(1);
        expect(vars['б']).toBe('"1"');
    });

    it('Math assingn', async () => {

        // Given
        const source = 
        `
        a = 1 + 1;
        b = 2 - 1;
        c = 2 * 3;
        d = 6 / 2;
        f = 1 + 2 * 2 - 8 / 2;
        `;

        // When 
        await oneScript.Run(source);
        const vars = oneScript.dumpVariables();

        // Then
        expect(vars['a']).toBe(2);
        expect(vars['b']).toBe(1);
        expect(vars['c']).toBe(6);
        expect(vars['d']).toBe(3);
        expect(vars['f']).toBe(1);
    });

    it('math ret val', async () => {

        // Given
        const source = 
        `
        a = 1 + 1;
        b = 2 - 1;
        c = a + b;
        `;

        // When 
        await oneScript.Run(source);
        const vars = oneScript.dumpVariables();

        // Then
        expect(vars['c']).toBe(3);
    });

    it('if >', async () => {

        // Given
        const source = 
        `
        б = 0;
        а = 1 ;
        Если а > 0 Тогда
            б = 1
        КонецЕсли;
        `;

        // When 
        await oneScript.Run(source);
        const vars = oneScript.dumpVariables();

        // Then
        expect(vars['б']).toBe(1);
    });

    it('if >=', async () => {

        // Given
        const source = 
        `
        б = 0;
        а = 2 ;
        Если а >= 2 Тогда
            б = 1
        КонецЕсли;
        `;

        // When 
        await oneScript.Run(source);
        const vars = oneScript.dumpVariables();

        // Then
        expect(vars['б']).toBe(1);
    });

    it('if >= (2)', async () => {

        // Given
        const source = 
        `
        б = 0;
        а = 3 ;
        Если а >= 2 Тогда
            б = 1
        КонецЕсли;
        `;

        // When 
        await oneScript.Run(source);
        const vars = oneScript.dumpVariables();

        // Then
        expect(vars['б']).toBe(1);
    });

    it('if =', async () => {

        // Given
        const source = 
        `
        б = 0;
        а = 3 ;
        Если а = 3 Тогда
            б = 1
        КонецЕсли;
        `;

        // When 
        await oneScript.Run(source);
        const vars = oneScript.dumpVariables();

        // Then
        expect(vars['б']).toBe(1);
    });

    it('if = strings', async () => {

        // Given
        const source = 
        `
        б = 0;
        а = "string" ;
        Если а = "string" Тогда
            б = 1
        КонецЕсли;
        `;

        // When 
        await oneScript.Run(source);
        const vars = oneScript.dumpVariables();

        // Then
        expect(vars['б']).toBe(1);
    });

    it('if <', async () => {

        // Given
        const source = 
        `
        б = 0;
        а = 1 ;
        Если а < 2 Тогда
            б = 1
        КонецЕсли;
        `;

        // When 
        await oneScript.Run(source);
        const vars = oneScript.dumpVariables();

        // Then
        expect(vars['б']).toBe(1);
    });

    it('if <=', async () => {

        // Given
        const source = 
        `
        б = 0;
        а = 1 ;
        Если а <= 2 Тогда
            б = 1
        КонецЕсли;
        `;

        // When 
        await oneScript.Run(source);
        const vars = oneScript.dumpVariables();

        // Then
        expect(vars['б']).toBe(1);
    });

    it('if <= (2)', async () => {

        // Given
        const source = 
        `
        б = 0;
        а = 2 ;
        Если а <= 2 Тогда
            б = 1
        КонецЕсли;
        `;

        // When 
        await oneScript.Run(source);
        const vars = oneScript.dumpVariables();

        // Then
        expect(vars['б']).toBe(1);
    });

    it('if and', async () => {

        // Given
        const source = 
        `
        б = 1;
        а = 1;
        в = 0;
        Если а = 1 И б = 1 Тогда
            в = 1
        КонецЕсли;
        `;

        // When 
        await oneScript.Run(source);
        const vars = oneScript.dumpVariables();

        // Then
        expect(vars['в']).toBe(1);
    });

    it('if and (2)', async () => {

        // Given
        const source = 
        `
        б = 1;
        а = 1;
        в = 0;
        Если а = 1 И б = 1 и в = 0 Тогда
            в = 1
        КонецЕсли;
        `;

        // When 
        await oneScript.Run(source);
        const vars = oneScript.dumpVariables();

        // Then
        expect(vars['в']).toBe(1);
    });

    it('if or', async () => {

        // Given
        const source = 
        `
        б = 1;
        а = 1;
        в = 0;
        Если а = 1 или б = 0 Тогда
            в = 1
        КонецЕсли;
        `;

        // When 
        await oneScript.Run(source);
        const vars = oneScript.dumpVariables();

        // Then
        expect(vars['в']).toBe(1);
    });

    it('if or (2)', async () => {

        // Given
        const source = 
        `
        б = 1;
        а = 1;
        в = 0;
        Если а = 0 ИЛИ б = 1 Тогда
            в = 1
        КонецЕсли;
        `;

        // When 
        await oneScript.Run(source);
        const vars = oneScript.dumpVariables();

        // Then
        expect(vars['в']).toBe(1);
    });

    it('if or (3)', async () => {

        // Given
        const source = 
        `
        б = 1;
        а = 1;
        в = 0;
        Если а = 1 ИЛИ б = 1 Тогда
            в = 1
        КонецЕсли;
        `;

        // When 
        await oneScript.Run(source);
        const vars = oneScript.dumpVariables();

        // Then
        expect(vars['в']).toBe(1);
    });

    it('if or (4)', async () => {

        // Given
        const source = 
        `
        б = 1;
        а = 1;
        в = 0;
        Если а = 2 ИЛИ б = 3 Тогда
            в = 1
        КонецЕсли;
        `;

        // When 
        await oneScript.Run(source);
        const vars = oneScript.dumpVariables();

        // Then
        expect(vars['в']).toBe(0);
    });

    it('if else', async () => {

        // Given
        const source = 
        `
        б = 1;
        а = 1;
        в = 0;
        Если а = 2 Тогда
            в = 2
        Иначе
            в = 1
        КонецЕсли;
        `;

        // When 
        await oneScript.Run(source);
        const vars = oneScript.dumpVariables();

        // Then
        expect(vars['в']).toBe(2);
    });

    it('if else (2)', async () => {

        // Given
        const source = 
        `
        б = 1;
        а = 1;
        в = 0;
        Если а = 1 Тогда
            в = 2
        Иначе
            в = 1
        КонецЕсли;
        `;

        // When 
        await oneScript.Run(source);
        const vars = oneScript.dumpVariables();

        // Then
        expect(vars['в']).toBe(2);
    });

    it('if noteq', async () => {

        // Given
        const source = 
        `
        а = 1;
        в = 0;
        Если а <> 0 Тогда
            в = 1
        КонецЕсли;
        `;

        // When 
        await oneScript.Run(source);
        const vars = oneScript.dumpVariables();

        // Then
        expect(vars['в']).toBe(1);
    });

    it('if unar not', async () => {

        // Given
        const source = 
        `
        а = 1;
        в = 0;
        Если НЕ а = 0 Тогда
            в = 1
        КонецЕсли;
        `;

        // When 
        await oneScript.Run(source);
        const vars = oneScript.dumpVariables();

        // Then
        expect(vars['в']).toBe(1);
    });

    it('if unar (not)', async () => {

        // Given
        const source = 
        `
        а = 1;
        в = 0;
        Если не (а = 0) Тогда
            в = 1
        КонецЕсли;
        `;

        // When 
        await oneScript.Run(source);
        const vars = oneScript.dumpVariables();

        // Then
        expect(vars['в']).toBe(1);
    });

    it('if unar minus', async () => {

        // Given
        const source = 
        `
        а = - 1;
        `;

        // When 
        await oneScript.Run(source);
        const vars = oneScript.dumpVariables();

        // Then
        expect(vars['а']).toBe(-1);
    });

    it('if unar minus 2', async () => {

        // Given
        const source = 
        `
        а = - 2 + 1;
        `;

        // When 
        await oneScript.Run(source);
        const vars = oneScript.dumpVariables();

        // Then
        expect(vars['а']).toBe(-1);
    });

    it('if unar minus 3', async () => {

        // Given
        const source = 
        `
        а = - (2 + 1);
        `;

        // When 
        await oneScript.Run(source);
        const vars = oneScript.dumpVariables();

        // Then
        expect(vars['а']).toBe(-3);
    });

});