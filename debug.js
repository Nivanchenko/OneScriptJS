import { OneScript } from './src/OneScript.js';

function walk(node, depth = 0) {
  const indent = '  '.repeat(depth);
  console.log(`${indent}${node.type}: "${node.text}"`);
  for (const child of node.namedChildren) {
    walk(child, depth + 1);
  }
}

// (async () => {

//   const OS = new OneScript('./wasm/tree-sitter-onescript.wasm');

//   const source = 
//   `
//   Перем а; 
//   а = 1; 
//   б = а + 1;
//   м = Новый Массив;
//   Если б > 1 Тогда
//     м.Добавить(а);
//   КонецЕсли;
//   Для Каждого Элем Из м Цикл
//     Сообщить(Элем);
//   КонецЦикла;
//   `;
//   const tree = await OS.GetTree(source);
//   walk(tree.rootNode);
// })();

(async () => {

  const OS = new OneScript('./wasm/tree-sitter-onescript.wasm');

  const source = 
  `
  Если 1 = 1 И 2 = 2 И 3 = 3 Тогда
      в = 1
  КонецЕсли;;
  `;

  const source2 = 
  `
  а=1 + 1;
  `;
  await OS.Run(source);
  const variables = OS.DumpVariables();
})();