---
title: "The preprocessor and translation phases"
summary: "Before any C++ is parsed, source text passes through splicing, tokenization and macro expansion. The preprocessor works on tokens, knows nothing of scopes or types, and follows a handful of exact rules that explain almost every macro surprise."
track: "program-structure"
minutes: 14
standard:
  - "[lex.phases]"
  - "[lex.pptoken]"
  - "[lex.digraph]"
  - "[cpp.include]"
  - "[cpp.cond]"
  - "[cpp.replace]"
  - "[cpp.stringize]"
  - "[cpp.concat]"
  - "[cpp.rescan]"
  - "[cpp.predefined]"
  - "[cpp.embed]"
cppreference:
  - title: "Phases of translation"
    path: "language/translation_phases"
  - title: "Preprocessor"
    path: "preprocessor"
  - title: "Replacing text macros"
    path: "preprocessor/replace"
  - title: "Conditional inclusion"
    path: "preprocessor/conditional"
  - title: "Source file inclusion"
    path: "preprocessor/include"
  - title: "Alternative operator representations"
    path: "language/operator_alternative"
  - title: "Feature testing"
    path: "feature_test"
prerequisites:
  - "translation-units-and-linkage"
---

## The one idea

A C++ compiler does not read your program as C++ straight away. The standard describes translation as nine phases applied in order, and the first four turn bytes into a stream of *preprocessing tokens* with every directive executed and every macro expanded. Only in phase 7 does anything know about declarations, scopes or types.

That ordering explains the preprocessor's character. A macro is a rewrite rule on tokens. It cannot see a namespace, cannot tell a type from a variable, and runs before the compiler could object. Most macro bugs come from expecting it to know something that, at phase 4, does not exist yet.

> **Mental model.** Bytes become characters, characters become tokens, tokens get rewritten, and only then does C++ begin. When a macro does something odd, ask which phase you are in and what that phase can see.

## The nine phases

The phases are a model; real compilers fuse them, but must behave as if they ran in this order.

```text
1  map the file to characters      UTF-8 must be supported (C++23); trigraphs gone (C++17)
2  splice lines                    backslash + newline is deleted
3  tokenize                        preprocessing tokens; each comment becomes one space
4  preprocess                      directives, macro expansion, _Pragma, #include recursion
5  literal encodings               adjacent string literals agree on one encoding prefix
6  concatenate string literals     "a" "b" becomes "ab"
7  compile                         tokens are parsed and analyzed as a translation unit
8  instantiate templates           instantiation units are produced
9  link                            translation units and libraries form a program
```

Phase 2 deletes every backslash that is followed by a newline, joining two physical lines into one logical line. Since C++23 the standard also allows whitespace between the backslash and the newline, which GCC and Clang had long accepted. Splicing happens before comments are recognized, so a `//` comment ending in a backslash swallows the next line.

```cpp
int main() {
  int x = 1;
  // add one to x \
  x = x + 1;
  return x;   // returns 1: the assignment was part of the comment
}
```

Phase 3 forms tokens and replaces each comment with a single space, which is why `/**/` cannot glue two identifiers together. A raw string literal is the one place where splicing is undone: between its quotes, the characters are exactly what you typed.

Because `#include` reruns phases 1 to 4 on the included file, and phase 4 ends by deleting all directives, a header's macros are part of the including file's phase 4 state. That is the property modules deliberately remove; the modules topic covers what `import` does instead.

## Tokenization: maximal munch

Phase 3 cuts the text greedily: the next preprocessing token is the longest sequence of characters that could form one, even if a shorter choice would have let the program compile.

```cpp
int a = 5, b = 2;
int c = a---b;        // a-- - b: c is 3, a becomes 4
// int d = a+++++b;   // a++ ++ + b: error, a++ is not an lvalue
// int e = 0xE+1;     // one pp-number "0xE+1": error, not a valid literal
```

The last line is the subtle one. A *pp-number* may contain `e+` or `E+` because floating literals such as `1e+5` need it, so `0xE+1` is a single token. Spaces around the `+` fix it.

There are a few deliberate exceptions to greed. Header names such as `<vector>` are only formed after `#include`, after `import`, and inside `__has_include`, so `a<b>c` stays three tokens in ordinary code. The sequence `<::` is not read as the digraph `<:` followed by `:` unless the next character is `:` or `>`, which is why `std::vector<::std::string>` works since C++11. And when `>>` closes two template argument lists, the parser splits it, so `std::vector<std::vector<int>>` is fine since C++11 while `X<(6>>1)>` still needs its parentheses.

The *digraphs* `<:` `:>` `<%` `%>` `%:` and `%:%:` are full tokens spelling `[` `]` `{` `}` `#` and `##`, so `%:define` is a directive. The alternative tokens `and`, `or`, `not`, `bitand`, `xor_eq` and the rest are also tokens in their own right, not macros, so `#define and &&` is ill-formed.

## How macros expand

An object-like macro is replaced by its replacement list. A function-like macro is replaced only when its name is followed by `(`, so `(max)(a, b)` calls a function named `max` even when a `max` macro exists.

For a function-like invocation the preprocessor works in a fixed order:

1. Collect the arguments, splitting on commas that are not inside parentheses. Braces and angle brackets do not protect commas, so `F(std::pair<int, int>)` passes two arguments.
2. For each parameter, substitute the argument. If the parameter is an operand of `#` or `##`, the argument is used as written; otherwise it is fully macro-expanded first.
3. Apply `#`, which turns an argument into a string literal, and `##`, which pastes two tokens into one. Pasting must produce a valid token.
4. Rescan the result, together with the rest of the file, for more macros to expand.

```cpp
#define STR(x) #x
#define XSTR(x) STR(x)
#define N 42

const char* a = STR(N);    // "N": the operand of # is not expanded
const char* b = XSTR(N);   // "42": N is expanded before STR sees it
```

> **Standardese.** [cpp.rescan] stops recursion. While a macro's replacement is being rescanned, its own name is not replaced again, and any instance of the name found during that time is marked so it is never replaced later either. Compiler writers call such a token "painted blue".

So `#define x (x * 2)` after a variable `int x = 10;` makes `x` mean `(x * 2)`, which evaluates to 20, rather than recursing forever. Mutual recursion stops the same way: with `#define a b` and `#define b a`, the name `a` expands to `b`, which expands to `a`, which is now painted and stays `a`.

> **Pitfall.** Macro arguments are substituted as tokens, not values. `#define SQUARE(v) v * v` turns `SQUARE(1 + 2)` into `1 + 2 * 1 + 2`, which is 5. Parenthesize every parameter and the whole replacement, and remember that an argument with side effects is evaluated once per use.

Variadic macros take `...` and refer to the extra arguments as `__VA_ARGS__`. C++20 added `__VA_OPT__(tokens)`, which expands to its tokens only when the variable arguments are present, replacing the GNU `, ## __VA_ARGS__` trick.

```cpp
#include <cstdio>
#define LOG(fmt, ...) std::printf(fmt __VA_OPT__(,) __VA_ARGS__)

int main() {
  LOG("start\n");          // std::printf("start\n")
  LOG("%d %d\n", 1, 2);    // std::printf("%d %d\n", 1, 2)
}
```

## `#include` and conditional inclusion

`#include <h>` searches implementation-defined places for a header, which need not be a file. `#include "h"` searches in another implementation-defined way, usually starting beside the current file, and falls back to the `<h>` search. A third form, `#include TOKENS`, macro-expands its tokens first and then must match one of the other two.

`#if` and `#elif` evaluate an integer constant expression with a few special rules. `defined X` and `defined(X)` test for a macro. After macro expansion, every identifier that remains is replaced by `0`, including keywords, except `true` and `false`, which become 1 and 0. The arithmetic is done in `std::intmax_t` and `std::uintmax_t`, so ordinary conversions apply at that width.

```cpp
#if UNDEFINED_NAME == 0   // true: a stray identifier is 0, not an error
#endif
#if -1 < 0u               // false: -1 converts to the largest uintmax_t value
#endif
```

`__has_include(<optional>)` (C++17) reports only whether a header can be found, not whether including it in the current mode works. `__has_cpp_attribute(nodiscard)` (C++20) yields a nonzero date when the attribute is supported. C++23 added `#elifdef`, `#elifndef` and `#warning`.

## `#embed` (C++26)

C++26 adopted `#embed`, which C23 introduced. It expands to a comma-separated list of integer literals, one per byte of a resource, so binary data can initialize an array without an external generator. The resource is found like an `#include` file. Parameters such as `limit(n)`, `prefix(...)`, `suffix(...)` and `if_empty(...)` shape the result, and `__has_embed` reports whether a resource exists and whether it is empty.

```cpp
// with -std=c++26, and data.bin beside this file
static const unsigned char blob[] = {
#embed "data.bin"
};
```

GCC 16 implements it, together with the feature-test macro `__cpp_pp_embed`.

## Predefined and feature-test macros

[cpp.predefined] fixes a short list. `__cplusplus` is `201103L`, `201402L`, `201703L`, `202002L` and `202302L` for C++11 through C++23; GCC 16 reports a provisional `202400L` in C++26 mode. `__FILE__`, `__LINE__`, `__DATE__`, `__TIME__`, `__STDC_HOSTED__` and `__STDCPP_DEFAULT_NEW_ALIGNMENT__` are always defined, and `__STDCPP_THREADS__` is defined when the program can have more than one thread. Defining or undefining any of them is undefined behavior.

`__func__` is not on that list. It is a function-local variable created in phase 7, so `#ifdef __func__` is false, and stringizing it yields the string `"__func__"` rather than the function's name. C++20's `std::source_location` is the type-safe successor to `__FILE__` and `__LINE__`.

Feature-test macros describe what the implementation supports. Language features use names like `__cpp_concepts` and are predefined; library features use names like `__cpp_lib_format` and come from `<version>` or the relevant header. Their values are the year and month of the paper that last changed the feature, so you test with `>=`.

```cpp
#include <version>
#if defined(__cpp_lib_print) && __cpp_lib_print >= 202207L
#include <print>
#endif
```

> **Pitfall.** Feature-test macros say what the compiler claims, per translation unit and per mode. A library compiled in C++17 and a client compiled in C++23 can see different answers in the same header, which is a quick route to an ODR violation.

## What to remember

- Nine phases, in order; macros run in phase 4, so they cannot see types, scopes or templates.
- Line splicing precedes comment recognition: a `//` comment ending in a backslash eats the next line; raw strings undo splicing.
- Tokenization is greedy: `a+++++b` fails, `0xE+1` is one pp-number; `<::` and template `>>` are deliberate exceptions.
- Arguments are fully expanded before substitution, except as operands of `#` and `##`; hence the `XSTR(STR(x))` idiom.
- A macro is never re-expanded inside its own expansion, and painted tokens stay unexpanded forever.
- In `#if`, leftover identifiers are 0, `true` is 1, and arithmetic is in `intmax_t` or `uintmax_t`.
- `__VA_OPT__` is C++20; `#elifdef`, `#elifndef` and `#warning` are C++23; `#embed` is C++26.
- `__func__` is a variable, not a macro.
- Test library features through `<version>` and compare with `>=`.
