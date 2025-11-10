import { Parser } from 'web-tree-sitter'
import { Language } from 'web-tree-sitter'

export class OSparser {
  constructor(PathToWASM = 'tree-sitter-onescript.wasm') {
    this.PathToWASM = PathToWASM;
  }

  async Parse(source){
    await Parser.init();
    const parser = new Parser();
    const Lang = await Language.load(this.PathToWASM);
    parser.setLanguage(Lang);
    return parser.parse(source);
  }

}