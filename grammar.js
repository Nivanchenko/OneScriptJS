/**
 * @file OneScript language
 * @author Gukov Viktor <zchokobo@gmail.com>
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
/** @type {import("tree-sitter-cli/dsl").RustRegexConstructor} */
const RustRegex = globalThis.RustRegex;
// @ts-check

const PREC = {
  LOGICAL_OR: 1,
  LOGICAL_AND: 2,
  RELATIONAL: 3,
  ADD: 4,
  MULTIPLY: 5,
  UNARY: 6,
  CALL: 7,
  SIMPLE_CALL: 8,
  PRTHS: 9,
};

module.exports = grammar({
  name: "onescript",

  extras: ($) => [/\s|\r?\n/, $._comment, $._preprocessor_directive],

  word: ($) => $.identifier,
  conflicts: ($) => [[$.module_var_block]],

  rules: {
    source_file: ($) =>
      seq(
        optional($.module_var_block),
        optional($.method_block),
        optional($._code_block)
      ),

    annotation: ($) =>
      seq("&", $.identifier, optional($._annotation_parameters)),
    _annotation_parameters: ($) =>
      seq(
        "(",
        $.annotation_parameter,
        optional(repeat1(seq(",", $.annotation_parameter))),
        ")"
      ),

    annotation_parameter: ($) =>
      choice(
        seq($.identifier, optional(seq("=", $._const_value))),
        $._const_value
      ),

    module_var_block: ($) => repeat1($.module_var_declaration),

    module_var_declaration: ($) =>
      seq(
        repeat($.annotation),
        new RustRegex("(?iu)(var|перем)"),
        $.identifier,
        repeat(seq(",", $.identifier)),
        optional($.export),
        ";"
      ),
    var_block: ($) => repeat1($.var_declaration),
    method_block: ($) => repeat1($._method_declaration),

    var_declaration: ($) =>
      seq(
        new RustRegex("(?iu)(var|перем)"),
        $.identifier,
        repeat(seq(",", $.identifier)),
        optional($.export),
        ";"
      ),
    _method_declaration: ($) => choice($.func_declaration, $.proc_declaration),
    func_declaration: ($) =>
      seq(
        repeat($.annotation),
        new RustRegex("(?iu)(function|функция)"),
        field("func_name", $.identifier),
        $.argument_list,
        optional(new RustRegex("(?iu)(export|экспорт)")),
        seq(optional($.var_block), optional($._code_block)),
        new RustRegex("(?iu)(endfunction|конецфункции)")
      ),
    proc_declaration: ($) =>
      seq(
        repeat($.annotation),
        new RustRegex("(?iu)(procedure|процедура)"),
        field("proc_name", $.identifier),
        $.argument_list,
        optional(new RustRegex("(?iu)(export|экспорт)")),
        seq(optional($.var_block), optional($._code_block)),
        new RustRegex("(?iu)(endprocedure|конецпроцедуры)")
      ),
    argument_list: ($) => seq("(", optional($.arguments), ")"),
    export: (_) => new RustRegex("(?iu)(export|экспорт)"),
    arguments: ($) =>
      seq(
        repeat($.annotation),
        optional(new RustRegex("(?iu)(val|знач)")),
        $.identifier,
        optional(seq("=", $._const_value)),
        repeat(
          seq(
            ",",
            optional(repeat1($.annotation)),
            optional(new RustRegex("(?iu)(val|знач)")),
            $.identifier,
            optional(seq("=", $._const_value))
          )
        )
      ),

    _code_block: ($) => repeat1(seq(choice($._statement, $.assignment))),
    _statement: ($) =>
      prec.left(
        choice(
          seq(
            choice(
              $.if_statement,
              $.while_loop,
              $.for_loop,
              $.for_each_loop,
              $.return_statement,
              $.raise_operator,
              $.break_statement,
              $.continue_statement,
              $.try_statement,
              $.call_statement,
              $.add_handler,
              $.remove_handler
            ),
            optional(";")
          ),
          ";"
        )
      ),
    add_handler: ($) =>
      seq(
        new RustRegex("(?iu)(addHandler|добавитьОбработчик)"),
        $._expression,
        ",",
        $._expression
      ),
    remove_handler: ($) =>
      seq(
        new RustRegex("(?iu)(removeHandler|удалитьОбработчик)"),
        $._expression,
        ",",
        $._expression
      ),
    call_statement: ($) =>
      prec.left(seq(choice($.method_call, $._member_call))),
    raise_operator: ($) =>
      prec.right(
        seq(
          new RustRegex("(?iu)(raise|вызватьисключение)"),
          optional($._expression)
        )
      ),
    return_statement: ($) =>
      prec.right(
        seq(new RustRegex("(?iu)(return|возврат)"), optional($._expression))
      ),
    break_statement: ($) => new RustRegex("(?iu)(break|прервать)"),
    continue_statement: ($) => new RustRegex("(?iu)(continue|продолжить)"),
    while_loop: ($) =>
      seq(
        new RustRegex("(?iu)(while|пока)"),
        $._expression,
        new RustRegex("(?iu)(do|цикл)"),
        optional($._code_block),
        new RustRegex("(?iu)(endwhile|конеццикла)")
      ),
    for_loop: ($) =>
      seq(
        new RustRegex("(?iu)(для|for)"),
        $.identifier,
        "=",
        $._expression,
        new RustRegex("(?iu)(по|to)"),
        $._expression,
        new RustRegex("(?iu)(цикл|do)"),
        optional($._code_block),
        new RustRegex("(?iu)(конеццикла|enddo)")
      ),
    for_each_loop: ($) =>
      seq(
        new RustRegex("(?iu)(for each|для каждого)"),
        $.identifier,
        new RustRegex("(?iu)(из|in)"),
        $.member_access,
        new RustRegex("(?iu)(do|цикл)"),
        optional($._code_block),
        new RustRegex("(?iu)(enddo|конеццикла)")
      ),
    try_statement: ($) =>
      seq(
        new RustRegex("(?iu)(try|попытка)"),
        optional($._code_block),
        new RustRegex("(?iu)(исключение|except)"),
        optional($._code_block),
        new RustRegex("(?iu)(endtry|конецпопытки)")
      ),
    if_statement: ($) =>
      seq(
        new RustRegex("(?iu)(if|если)"),
        $._expression,
        new RustRegex("(?iu)(then|тогда)"),
        optional($._code_block),
        repeat(
          seq(
            new RustRegex("(?iu)(elsif|иначеесли)"),
            $._expression,
            new RustRegex("(?iu)(then|тогда)"),
            optional($._code_block)
          )
        ),
        optional(
          seq(new RustRegex("(?iu)(else|иначе)"), optional($._code_block))
        ),
        new RustRegex("(?iu)(endif|конецесли)")
      ),
    ternary_operator: ($) =>
      seq("?", "(", $._expression, ",", $._expression, ",", $._expression, ")"),
    new_operator: ($) =>
      prec.right(
        choice(
          seq(
            new RustRegex("(?iu)(новый|new)"),
            $.member_access,
            optional(";")
          ),
          seq(
            new RustRegex("(?iu)(новый|new)"),
            "(",
            field("type_name", $.identifier),
            optional(seq(",", $.identifier)),
            ")"
          )
        )
      ),
    _expression: ($) =>
      choice(
        $.unary_expression,
        $.binary_expression,
        $.member_access,
        $.ternary_operator,
        $.new_operator,
        $._const_value
      ),

    _const_value: ($) =>
      choice(
        $.number,
        $.string,
        $.null_literal,
        $.undefined_literal,
        $.true_literal,
        $.false_literal,
        $.date_literal
      ),

    assignment: ($) =>
      prec.left(
        seq(
          field(
            "target",
            choice($.identifier, $.index_access, $.member_property)
          ),
          "=",
          field("value", $._expression),
          optional(";")
        )
      ),
    member_access: ($) =>
      choice(
        $.identifier,
        $.index_access,
        $.method_call,
        $._member_call,
        $.member_property
      ),
    _member_call: ($) => prec.left(seq($.member_access, ".", $.method_call)),
    method_call: ($) =>
      prec.left(PREC.CALL, seq($.identifier, "(", optional($.call_args), ")")),
    member_property: ($) =>
      prec.left(
        seq($.member_access, ".", choice($.identifier, $.index_access))
      ),
    index_access: ($) =>
      seq(choice($.identifier, $.method_call), "[", $._expression, "]"),

    call_args: ($) =>
      choice(
        seq($._expression, repeat(seq(",", optional($._expression)))),
        seq(optional($._expression), repeat1(seq(",", optional($._expression))))
      ),

    unary_expression: ($) =>
      prec(
        PREC.UNARY,
        choice(
          seq("-", $._expression),
          seq("+", $._expression),
          seq(new RustRegex("(?iu)(not|не)"), $._expression)
        )
      ),

    binary_expression: ($) =>
      choice(
        prec(PREC.PRTHS, seq("(", $._expression, ")")),
        prec.left(PREC.MULTIPLY, seq($._expression, "*", $._expression)),
        prec.left(PREC.MULTIPLY, seq($._expression, "/", $._expression)),
        prec.left(PREC.MULTIPLY, seq($._expression, "%", $._expression)),
        prec.left(PREC.ADD, seq($._expression, "-", $._expression)),
        prec.left(PREC.ADD, seq($._expression, "+", $._expression)),
        prec.left(PREC.RELATIONAL, seq($._expression, "<", $._expression)),
        prec.left(PREC.RELATIONAL, seq($._expression, "<=", $._expression)),
        prec.left(PREC.RELATIONAL, seq($._expression, "=", $._expression)),
        prec.left(PREC.RELATIONAL, seq($._expression, ">=", $._expression)),
        prec.left(PREC.RELATIONAL, seq($._expression, ">", $._expression)),
        prec.left(PREC.RELATIONAL, seq($._expression, "<>", $._expression)),
        prec.left(
          PREC.LOGICAL_AND,
          seq($._expression, new RustRegex("(?iu)(and|и)"), $._expression)
        ),
        prec.left(
          PREC.LOGICAL_OR,
          seq($._expression, new RustRegex("(?iu)(or|или)"), $._expression)
        )
      ),

    number: (_) =>
      token(seq(optional(choice("+", "-")), /\d+/, optional(/\\.d+/))),
    _comment: (_) => seq("//", /.*/),
    identifier: ($) => /[a-zA-Zа-яА-Я_][a-zA-Zа-яА-Я0-9_]*/,
    _preprocessor_directive: (_) => seq("#", /.*/),
    string: ($) =>
      choice(
        seq('"', token(prec(1, /([^"\r\n]|"")*/)), '"'),
        seq(
          '"',
          token(prec(1, /([^"\r\n]|"")*/)),
          repeat1(seq("|", token(prec(1, /([^"\r\n]|"")*/)))),
          '"'
        )
      ),
    date_literal: ($) => /'\d{8,14}'/,
    null_literal: ($) => new RustRegex("(?iu)null"),
    true_literal: ($) => new RustRegex("(?iu)True|Истина"),
    false_literal: ($) => new RustRegex("(?iu)False|Ложь"),
    undefined_literal: ($) => new RustRegex("(?iu)Undefined|Неопределено"),
  },
});
