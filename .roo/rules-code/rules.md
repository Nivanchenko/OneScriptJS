Это проект - интерпретатор OneScript на языке TypeScript. 
В файле @/grammar.js лежит грамматика, которая компилируется в tree-sitter. 
В каталоге @/src/ Реализация парсера, стековой машины и интерпритатора. 
@/src/OneScriptCompiler.ts - Компилятор для стековой машины
@/src/OneScriptParser.ts - Парсер
@/src/OneScriptVirtualMachine.ts - Виртуальная машина
@/src/OneScriptOperations.ts - Список операций виртуальной машины
Примеры кода в тестах @/tests/all.test.ts
Для запуска тестов можно выполнить баш скрипт @/run_test.sh
Игнорируй файлы @/debug.ts и @/run_debug.sh
Если нужно запустить дебаг. Код для дебага лежит в @/debug_test.ts а для запуска его используй баш скрипт @/run_debug_test.sh