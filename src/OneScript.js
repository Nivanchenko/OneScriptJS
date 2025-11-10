
import { OSCompiler } from "./OneScriptCompiler.js"
import { OSMachine } from "./OneScriptVirtualMachine.js"
import { OSparser } from "./OneScriptParser.js"

export class OneScript {
  constructor(PathToWASMParser = 'tree-sitter-onescript.wasm') {
    this.parser = new OSparser(PathToWASMParser);
    this.compiler = new OSCompiler();
    this.vm = new OSMachine();
  }

  DumpVariables(){
    return this.vm.dumpVariables();
  }

  async GetTree(source){
    return await this.parser.Parse(source)
  }

  async AddSource(source){
    const tree = await this.parser.Parse(source);
    this.compiler.loadAst(tree.rootNode);
  }

  async Run(source = null){

    if (source != null){
      await this.AddSource(source);
    }
    this.vm.run(this.compiler.GetInstructions())
  }

}
