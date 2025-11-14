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
  Если а = 2 И в = "1" Тогда
    б = 1;
  КонецЕсли;
  `;
  const tree = await OS.GetTree(source);
  if (tree) walk(tree.rootNode);
  await OS.Run(source);
  const variables = OS.dumpVariables();
  console.log(tree?.rootNode.toString());
  console.log(variables);
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