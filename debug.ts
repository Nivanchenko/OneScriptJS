import { OneScript } from './src/OneScript.ts';
import { Node } from 'web-tree-sitter'

function walk(node: Node, depth = 0) {
  const indent = '  '.repeat(depth);
  console.log(`${indent}${node.type}: "${node.text}"`);
  for (const child of node.children) {
    if (child) {
      walk(child, depth + 1);
    }
  }
}

(async () => {

  const OS = new OneScript('./wasm/tree-sitter-onescript.wasm');

  const source = 
  `
  а = 1;
  в = 0;
  Если а = 1 И в = 0 Тогда
      в = 1;
  ИначеЕсли а = 2 ИЛИ в = 1 Тогда
      в = 2;
  ИначеЕсли а = 3 Тогда
      в = 3;
  Иначе 
      в = 4;
  КонецЕсли;
  `;
  const tree = await OS.GetTree(source);
  if (tree) walk(tree.rootNode);
  console.log(tree?.rootNode.toString());
  await OS.Run(source);
  // const variables = OS.dumpVariables();
  // console.log(variables);
})();

// (async () => {

//   const OS = new OneScript('./wasm/tree-sitter-onescript.wasm');

//   const source = 
//   `
//   а = 1;
//   Если 1 = 1 Тогда
//       в = 1
//   КонецЕсли;;
//   `;

//   const source2 = 
//   `
//   а=1 + 1;
//   `;
//   await OS.Run(source);
//   const variables = OS.dumpVariables();
// })();