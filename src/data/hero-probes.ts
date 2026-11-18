import { HeroExpressionProbe } from "@/types/cpp";

export const HERO_PROBES: HeroExpressionProbe[] = [
  {
    id: "widget-prvalue",
    expression: "Widget{42}",
    contextSnippet: "Widget w = Widget{42};",
    declType: "Widget",
    exprType: "Widget",
    category: "prvalue",
    hasIdentity: false,
    canMoveFrom: true,
    storageRegion: "Unmaterialized until target slot",
    materialized: "Constructed directly into caller stack slot (C++17)",
    clause: "[basic.lval] & [class.copy.elision]",
    canonicalPath: "language/copy_elision",
    verdict:
      "In C++17+, a prvalue is not a temporary object in memory; it is an initialization recipe waiting for a target location.",
    trapNote:
      "Even if Widget deletes both its copy and move constructors, Widget w = Widget{42}; still compiles cleanly.",
  },
  {
    id: "std-move",
    expression: "std::move(w)",
    contextSnippet: "sink(std::move(w));",
    declType: "Widget&& (return type)",
    exprType: "Widget",
    category: "xvalue",
    hasIdentity: true,
    canMoveFrom: true,
    storageRegion: "Caller stack frame (existing object)",
    materialized: "Already exists in memory; cast emits 0 instructions",
    clause: "[expr.static.cast] & [utility.syn]",
    canonicalPath: "utility/move",
    verdict:
      "std::move moves nothing. It unconditionally casts an expression to an unnamed rvalue reference, producing an xvalue.",
    trapNote:
      "If w is declared const Widget w, std::move(w) yields const Widget&&, which silently falls back to copying.",
  },
  {
    id: "string-literal",
    expression: "\"hello\"",
    contextSnippet: "const char (*p)[6] = &\"hello\";",
    declType: "const char[6]",
    exprType: "const char[6]",
    category: "lvalue",
    hasIdentity: true,
    canMoveFrom: false,
    storageRegion: "Static read-only data (.rodata)",
    materialized: "Static storage duration for entire program run",
    clause: "[lex.string] §5.13.5",
    canonicalPath: "language/string_literal",
    verdict:
      "Unlike numeric literals such as 42 (prvalue), string literals are lvalues because they reside in static storage and have an address.",
    trapNote:
      "In interviews and standardese quizzes, most engineers guess prvalue because it looks like a literal.",
  },
  {
    id: "named-rref",
    expression: "w  /* inside void f(Widget&& w) */",
    contextSnippet: "void f(Widget&& w) { consume(w); }",
    declType: "Widget&&",
    exprType: "Widget",
    category: "lvalue",
    hasIdentity: true,
    canMoveFrom: false,
    storageRegion: "Caller object bound to reference parameter",
    materialized: "Addressable via &w inside f",
    clause: "[basic.lval] §7.2.1",
    canonicalPath: "language/value_category",
    verdict:
      "Type and value category are orthogonal. Inside f, w has a name so it is an lvalue, even though its declared type is Widget&&.",
    trapNote:
      "Without std::move(w), calling consume(w) invokes the copy overload, not the move overload.",
  },
  {
    id: "pre-vs-post-incr",
    expression: "++i  vs  i++",
    contextSnippet: "int* p = &(++i);  // OK | &(i++) ill-formed",
    declType: "int& (prefix) / int (postfix)",
    exprType: "int",
    category: "lvalue",
    hasIdentity: true,
    canMoveFrom: false,
    storageRegion: "In-place increment on stack/heap slot",
    materialized: "++i designates i itself; i++ yields prvalue copy",
    clause: "[expr.pre.incr] & [expr.post.incr]",
    canonicalPath: "language/operator_incdec",
    verdict:
      "Built-in ++i returns the mutated lvalue directly. Built-in i++ yields a prvalue snapshot of the old integer.",
    trapNote:
      "User-defined iterators mimic this convention so tight loops avoid allocating a spare copy via prefix ++it.",
  },
  {
    id: "temp-materialization",
    expression: "const Widget& r = make_widget();",
    contextSnippet: "const Widget& r = make_widget();",
    declType: "const Widget&",
    exprType: "const Widget (via xvalue conversion)",
    category: "xvalue",
    hasIdentity: true,
    canMoveFrom: true,
    storageRegion: "Stack temporary extended to r's enclosing block",
    materialized: "Temporary materialization conversion prvalue -> xvalue",
    clause: "[conv.rval] & [class.temporary]",
    canonicalPath: "language/reference_initialization",
    verdict:
      "Binding a prvalue to a reference triggers temporary materialization, turning the recipe into an xvalue object whose lifetime matches r.",
    trapNote:
      "Lifetime extension only applies to direct binding; const int& x = make_widget().id; dangles immediately at the semicolon.",
  },
];
