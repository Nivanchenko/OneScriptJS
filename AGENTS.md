# OneScript.JS Development Guide

## Core Architecture
- Implementation of OneScript engine in JavaScript/TypeScript
- Uses tree-sitter grammar compiled to WASM for parsing
- Three main components: Parser (OneScriptParser.ts), Compiler (OneScriptCompiler.ts), Virtual Machine (OneScriptVirtualMachine.ts)
- Entry point: OneScript.ts combines all components

## Key Directories and Files
- `src/` - Main source code directory
- `tests/` - Test suite using Vitest
- `grammar.js` - Tree-sitter grammar definition
- `src/OneScriptCompiler.ts` - Compiler for VM
- `src/OneScriptParser.ts` - Parser
- `src/OneScriptVirtualMachine.ts` - VM implementation
- `src/OneScriptOperations.ts` - List of VM operations

## Development Commands
- `npm test` or `npm run test:run` - Run all tests
- `npm run debug` - Run debug script (debug.ts)
- `bash ./run_test.sh` - Run tests via shell script

## Testing
- Tests located in `tests/all.test.ts`
