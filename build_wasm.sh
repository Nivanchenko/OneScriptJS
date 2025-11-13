mv package.json _package.json
rm -rf build/wasm | true
tree-sitter generate --output build/wasm/src
mv _package.json package.json
tree-sitter build build/wasm --output wasm/tree-sitter-onescript.wasm --wasm