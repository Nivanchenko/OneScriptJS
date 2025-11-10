import { Parser } from 'web-tree-sitter'
import { Language } from 'web-tree-sitter'

export class OSparser {
  constructor(PathToWASM = 'tree-sitter-onescript.wasm') {
    this.PathToWASM = PathToWASM;
    this.parser = null;
  }

  async Parse(source){
    if (this.parser === null) {
      await Parser.init();
      const Lang = await Language.load(this.PathToWASM);
      this.parser = new Parser();
      this.parser.setLanguage(Lang);
    }
    
    return this.parser.parse(source);
  }

}