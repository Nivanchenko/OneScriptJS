import { OSCompiler } from "./OneScriptCompiler.js";
import { OSMachine } from "./OneScriptVirtualMachine.js";
import { OSparser } from "./OneScriptParser.js";

export class OneScript {
  private parser: OSparser;
  private compiler: OSCompiler;
  private vm: OSMachine;

  constructor(PathToWASMParser = 'tree-sitter-onescript.wasm') {
    this.parser = new OSparser(PathToWASMParser);
    this.compiler = new OSCompiler();
    this.vm = new OSMachine();
  }

  dumpVariables() {
    return this.vm.dumpVariables();
  }

  async GetTree(source: string) {
    return await this.parser.Parse(source);
  }

  async addSource(source: string) {
    const tree = await this.parser.Parse(source);
    if (!tree) {
        throw Error("Не удалось получить дерево разбора");
    }
    this.compiler.loadAst(tree.rootNode);
  }

  async Run(source: string | null = null) {
    if (source !== null) {
      await this.addSource(source);
    }
    this.vm.run(this.compiler.GetInstructions());
  }
}