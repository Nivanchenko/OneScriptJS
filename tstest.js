import OSparser from './src/osparser.js';

function walk(node, depth = 0) {
  const indent = '  '.repeat(depth);
  console.log(`${indent}${node.type}: "${node.text}"`);
  for (const child of node.namedChildren) {
    walk(child, depth + 1);
  }
}

(async () => {

  const parser = new OSparser();

  const source = 
  `
  Перем а; 
  а = 1; 
  б = а + 1;
  м = Новый Массив;
  Если б > 1 Тогда
    м.Добавить(а);
  КонецЕсли;
  Для Каждого Элем Из м Цикл
    Сообщить(Элем);
  КонецЦикла;
  `;
  const tree = await parser.Parse(source);
  walk(tree.rootNode);
})();