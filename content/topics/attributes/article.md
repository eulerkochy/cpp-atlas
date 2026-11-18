---
title: "Attributes"
summary: "Attributes annotate entities and statements with information the compiler may use. Unknown ones are ignored, standard ones in the wrong place are errors, and a few of them are promises that cause undefined behavior when broken."
track: "program-structure"
minutes: 12
standard:
  - "[dcl.attr.grammar]"
  - "[dcl.attr.nodiscard]"
  - "[dcl.attr.unused]"
  - "[dcl.attr.deprecated]"
  - "[dcl.attr.fallthrough]"
  - "[dcl.attr.likelihood]"
  - "[dcl.attr.noreturn]"
  - "[dcl.attr.nouniqueaddr]"
  - "[dcl.attr.assume]"
  - "[intro.object]"
cppreference:
  - title: "Attribute specifier sequence"
    path: "language/attributes"
  - title: "C++ attribute: nodiscard"
    path: "language/attributes/nodiscard"
  - title: "C++ attribute: noreturn"
    path: "language/attributes/noreturn"
  - title: "C++ attribute: assume"
    path: "language/attributes/assume"
  - title: "C++ attribute: no_unique_address"
    path: "language/attributes/no_unique_address"
  - title: "C++ attribute: fallthrough"
    path: "language/attributes/fallthrough"
  - title: "C++ attribute: likely, unlikely"
    path: "language/attributes/likely"
  - title: "C++ attribute: indeterminate"
    path: "language/attributes/indeterminate"
prerequisites:
  - "object-layout-and-alignment"
  - "strict-aliasing-and-undefined-behavior"
---

## The one idea

An attribute is a note attached to a declaration, a type or a statement, written in double square brackets. The language promises very little about what any note does. Unknown attributes are ignored, and most standard ones only *encourage* a warning or an optimization.

That makes it easy to forget the exceptions. A few standard attributes are claims you make to the compiler, and the optimizer is entitled to believe them. A `[[noreturn]]` function that returns, or an `[[assume]]` whose expression is false, is undefined behavior. `[[no_unique_address]]` changes the layout of a class.

> **Mental model.** Read every attribute as one of three things: a request for a diagnostic (`nodiscard`, `deprecated`, `maybe_unused`, `fallthrough`), an optimization hint that cannot change meaning (`likely`, `unlikely`), or a promise the program must keep (`noreturn`, `assume`, `indeterminate`). Only the third kind can turn a correct-looking program into undefined behavior. `no_unique_address` is the odd one out: it permits a layout change.

## Syntax and appertainment

An attribute specifier is `[[ ... ]]` holding a comma-separated list. Each attribute is an optionally namespaced name, optionally followed by a parenthesized argument list made of balanced tokens: `[[nodiscard]]`, `[[deprecated("use g")]]`, `[[gnu::always_inline]]`. Since C++17 `[[using gnu: always_inline, hot]]` applies a namespace to every name in the list, and the names inside may then not be namespaced themselves.

Where you write it decides what it *appertains* to:

| Position | Appertains to |
| --- | --- |
| start of a declaration: `[[nodiscard]] int f();` | each entity declared |
| after the declarator-id: `int x [[maybe_unused]];` | that one entity |
| after `class`, `struct`, `union` or `enum`: `struct [[nodiscard]] S` | the class or enumeration |
| after the type specifiers: `int [[vendor::x]] y;` | the type |
| start of a statement: `[[likely]] return 0;` | the statement |
| start of a label: `[[unlikely]] case 3:` | the label |

The table hides a common mistake. An attribute at the start of a declaration appertains to the entities its declarators declare. A class definition with no declarator declares no such entity, so the grammar does not allow the attribute there at all.

```cpp
struct [[nodiscard]] Error { int code; };   // OK: Error is a nodiscard type
// [[nodiscard]] struct Bad { int code; };  // ill-formed; GCC ignores it with a warning,
//                                           // Clang rejects it
```

Lambdas follow the same logic. Before C++23 there was no place to put an attribute that appertains to a lambda's function call operator; C++23 allows one right after the capture list.

```cpp
auto make = [] [[nodiscard]] () { return 42; };   // C++23: appertains to operator()

void demo() {
  make();   // warning: discarded nodiscard result
}
```

One attribute specifier does not use brackets at all. `alignas` is grammatically an attribute specifier too, which is why it can appear in the same positions, but its rules live with alignment rather than here.

## Unknown and misplaced attributes

[dcl.attr.grammar] says an attribute token the implementation does not recognize is ignored. This is what makes vendor attributes portable: GCC ignores `[[msvc::no_unique_address]]`, MSVC ignores `[[gnu::cold]]`, and both compile. Before C++17, the effect of an unrecognized attribute was implementation-defined. Compilers still warn, with `-Wattributes` in GCC and `-Wunknown-attributes` in Clang, and the argument tokens must still be balanced.

Standard attributes get no such latitude. If a standard attribute appears where it may not apply, the program is ill-formed. `[[noreturn]]` on a variable, `[[fallthrough]]` not followed by a case label, and `[[likely, unlikely]]` together are all errors in the standard's eyes, even where GCC only warns.

```cpp
[[acme::fast]] int f();      // ignored: unknown attribute
[[noreturn]] int v;          // ill-formed: noreturn applies only to functions
```

To ask whether an attribute is supported, use `__has_cpp_attribute(name)` inside `#if`. It yields 0 for an unknown attribute and otherwise a date, such as `201907L` for `nodiscard` with a reason string.

## Attributes that ask for a diagnostic

`[[nodiscard]]` (C++17) on a function, or on a class or enumeration type returned by value, asks for a warning when a call's result is discarded. C++20 added a reason string and allowed it on constructors, so `S(1);` as a statement can warn too. A cast to `void` is the sanctioned way to discard.

The type form only covers calls that return the type by value. A function returning a reference to a nodiscard type does not trigger it, because its return type is a reference, not the class.

```cpp
struct [[nodiscard]] Error { int code; };
Error make();
Error& last();

void demo() {
  make();          // warning: discarded nodiscard type
  last();          // no warning: the return type is Error&
  (void)make();    // no warning: explicitly discarded
}
```

> **Standardese.** The standard never makes ignoring a nodiscard result ill-formed. [dcl.attr.nodiscard] puts the warning under "recommended practice", so a conforming compiler may stay silent.

`[[maybe_unused]]` (C++17) suppresses unused warnings for variables, parameters, functions, types, enumerators and structured bindings. `[[deprecated]]` (C++14), optionally with a message, marks a name whose use should warn; it also works on namespaces, enumerators and template specializations.

`[[fallthrough]];` (C++17) is a null statement that documents an intentional fall from one case into the next. The rule is strict: the next statement executed after it must be a statement labelled with a `case` or `default` of the same `switch`. Placing it at the end of the last case is ill-formed.

## Hints that change no meaning

`[[likely]]` and `[[unlikely]]` (C++20) go on a statement or label and say a path is more or less probable. They affect only code layout and branch prediction hints. A path containing a likely label is presumed more probable than one without, and compilers are free to ignore all of it. The two cannot appear on the same statement.

```cpp
int classify(int x) {
  switch (x) {
    [[likely]] case 0: return 1;
    [[unlikely]] case 1: return 2;
    default: return 3;
  }
}
```

`[[no_unique_address]]` (C++20) is not a pure hint, because it lets a non-static data member overlap others, which normally changes `sizeof`. It is still optional: MSVC ignores it for ABI reasons and spells it `[[msvc::no_unique_address]]`. What the standard does guarantee is that two distinct objects of the same type never share an address, even with the attribute.

```cpp
struct Empty {};
struct Pair {
  [[no_unique_address]] Empty a;
  [[no_unique_address]] Empty b;   // same type as a: &p.a != &p.b is guaranteed
  int i;
};
```

## Promises the optimizer believes

`[[noreturn]]` (C++11) says a function never returns to its caller. It may throw, loop forever or end the program, but if control ever returns, the behavior is undefined. The compiler uses the promise to delete code after the call and to silence missing-return warnings. The standard library declares `std::exit`, `std::abort`, `std::terminate` and `std::rethrow_exception` this way, among others. The first declaration of the function must carry the attribute if any declaration does. Within one file that is diagnosed; across files it is ill-formed with no diagnostic required.

```cpp
[[noreturn]] void fail(const char* why);

int parse(int x) {
  if (x < 0) fail("negative");   // compiler may assume this never comes back
  return x;
}
```

`[[assume(expr)]];` (C++23) is a statement that tells the compiler `expr` would be true at that point. The expression is never evaluated, so side effects in it never happen. If it would not evaluate to true, the behavior is undefined. The point is to give the optimizer facts it cannot prove, such as a divisor being positive or a size being a multiple of four, so that it can drop the code for the cases you have ruled out.

```cpp
#include <cstdio>
int main() {
  int i = 0;
  [[assume(++i > 0)]];       // not evaluated: i stays 0
  std::printf("%d\n", i);    // prints 0
}
```

> **Pitfall.** `assert(cond)` checks in debug builds and does nothing under `NDEBUG`. `[[assume(cond)]]` never checks and lets the optimizer delete code that handles the case where `cond` is false. Turning asserts into assumptions for release builds turns every failing assert into undefined behavior.

`[[indeterminate]]` is C++26. C++26 makes reading an uninitialized automatic variable *erroneous behavior*: the variable holds an implementation-chosen value, and reading it is a bug the implementation may diagnose, or even stop the program for, but may not treat as undefined. `[[indeterminate]]` on such a variable, or on a function parameter, opts back into the old rules: the value is indeterminate and reading it is undefined behavior. It exists for performance-critical buffers that are always written before they are read. GCC 16 accepts it with `-std=c++26`; Clang 21 ignores it as unknown. The erroneous behavior rules themselves belong to the C++26 language-changes topic.

## What to remember

- Position decides appertainment; put class attributes after the class key, as in `struct [[nodiscard]] S`.
- Unknown attributes are ignored since C++17; misplaced standard attributes are ill-formed.
- `[[using ns: a, b]]` namespaces a whole list, and the names inside cannot repeat a namespace.
- `nodiscard`, `deprecated`, `maybe_unused` and `fallthrough` only request diagnostics; none makes discarding a result ill-formed.
- `nodiscard` on a type covers by-value returns only.
- `[[fallthrough]];` must be followed by a case or default label of the same switch.
- `likely` and `unlikely` are pure hints; `no_unique_address` may change layout but never merges two objects of one type.
- A `noreturn` function that returns, or an `assume` that is false, is undefined behavior.
- An `assume` expression is never evaluated.
- `[[indeterminate]]` (C++26) opts an uninitialized variable out of erroneous behavior and back into undefined behavior.
