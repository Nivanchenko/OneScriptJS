import { Parser } from 'web-tree-sitter'
import { Language } from 'web-tree-sitter'

export class OSparser {
  constructor() {
  }

  async Parse(source){
    await Parser.init();
    const parser = new Parser();
    const Lang = await Language.load('tree-sitter-onescript.wasm');
    parser.setLanguage(Lang);
    return parser.parse(source);
  }

}