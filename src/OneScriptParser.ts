import { Parser, Tree, Language } from 'web-tree-sitter'

export class OSparser {

  PathToWASM: string;
  parser: Parser | null = null;

  constructor(_PathToWASM: string = 'tree-sitter-onescript.wasm') {
    this.PathToWASM = _PathToWASM;
  }

  async Parse(source: string): Promise<Tree | null> {
    if (this.parser === null) {
      await Parser.init();
      const Lang = await Language.load(this.PathToWASM);
      this.parser = new Parser();
      this.parser.setLanguage(Lang);
    }
    
    return this.parser.parse(source);
  }

}