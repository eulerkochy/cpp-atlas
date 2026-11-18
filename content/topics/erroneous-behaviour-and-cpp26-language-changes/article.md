---
title: "Erroneous behaviour and C++26 language changes"
summary: "C++26 adds erroneous behaviour, a new category for code that is wrong but still well-defined, and uses it to take uninitialized reads out of undefined behaviour. Alongside it come several rules that turn old traps into compile errors, plus the small conveniences `_`, `= delete(\"why\")`, computed `static_assert` messages, and `#embed`."
track: "cpp26"
minutes: 15
standard:
  - "[defns.erroneous]"
  - "[intro.abstract]"
  - "[basic.indet]"
  - "[dcl.attr.indet]"
  - "[stmt.return]"
  - "[expr.delete]"
  - "[expr.arith.conv]"
  - "[basic.scope.scope]"
  - "[dcl.fct.def.delete]"
  - "[dcl.pre]"
  - "[dcl.struct.bind]"
  - "[stmt.iter.general]"
  - "[cpp.embed]"
  - "[depr.ellipsis.comma]"
cppreference:
  - title: "C++ attribute: indeterminate"
    path: "language/attributes/indeterminate"
  - title: "Undefined behavior"
    path: "language/ub"
  - title: "Default-initialization"
    path: "language/default_initialization"
  - title: "static_assert declaration"
    path: "language/static_assert"
  - title: "Structured binding declaration"
    path: "language/structured_binding"
  - title: "Function definition (deleted functions)"
    path: "language/function"
prerequisites:
  - "strict-aliasing-and-undefined-behavior"
  - "object-lifetime-and-storage"
  - "initialization-forms"
  - "reference-binding-and-temporaries"
  - "structured-bindings"
  - "preprocessor-and-translation-phases"
---

## The one idea

Undefined behaviour gives the compiler permission to assume that something never happens. When it does happen anyway, the program can do anything, and optimizers really do delete checks and reorder code on that assumption. C++26 adds a third category between "correct" and "undefined": **erroneous behaviour**. The behaviour is still a bug, but it is *defined*. The program gets a specific, predictable result, and the implementation is encouraged to diagnose it, either while compiling or at run time.

The first and most important use is reading an uninitialized local variable. In C++23 that is undefined behaviour. In C++26 the variable holds an **erroneous value**, a fixed value chosen by the implementation, and reading it is erroneous behaviour. Your program is still wrong, but the optimizer can no longer reason from your mistake.

This is C++26. Erroneous behaviour comes from P2795R5, adopted in March 2024. The other changes covered here are P2748R5, P3144R2, P2864R2, P2865R6, P2169R4, P2573R2, P2741R3, P0963R3, P0609R3, P1061R10, P1967R14, P2809R3 and P3176R1, each named where it appears. Everything here follows N5050, the final C++26 draft sent to the international ballot. That ballot closed in October 2026 and was reported as not approved, so check the status before you quote this as published ISO C++. GCC 16 implements all of these with `-std=c++26`. The one deviation is that it only warns about mixed-enumeration arithmetic, which N5050 makes ill-formed. Clang 21 implements most of them, but it ignores `[[indeterminate]]` with a warning and treats `#embed` in C++ as an extension.

> **Mental model.** Undefined behaviour means the compiler may assume it never happens. Erroneous behaviour means it is a bug, it may be reported, and it still means one particular thing.

## Erroneous values

[basic.indet] now distinguishes two kinds of "garbage". When storage for an object with **automatic** storage duration is obtained, its bytes have **erroneous values**. Each is fixed by the implementation and does not depend on the program's state. Storage from `new`, and any variable or parameter marked `[[indeterminate]]`, starts with **indeterminate values**, as before. Static and thread-local variables are still zero-initialized.

Evaluating an erroneous value is erroneous behaviour. Evaluating an indeterminate value is still undefined behaviour. In both cases, copying an `unsigned char` or `std::byte` is allowed, and the copy inherits the erroneous or indeterminate value.

```cpp
void consume(int);

void f() {
  int a;                      // erroneous value
  int b [[indeterminate]];    // indeterminate value: opted out
  int* p = new int;           // *p has an indeterminate value

  consume(a);                 // erroneous behaviour: defined but wrong
  consume(b);                 // undefined behaviour
  consume(*p);                // undefined behaviour
  delete p;
}
```

`[[indeterminate]]` exists for performance-critical code, such as a large buffer that is about to be overwritten, where you do not want the compiler to spend time initializing it. It may appear only on the definition of a block variable with automatic storage, or on a function parameter, and it must be on the first declaration. Using it is a promise that you will write before you read. If you break the promise, you are back in undefined behaviour.

> **Standardese.** [defns.erroneous] defines erroneous behaviour as "well-defined behavior that the implementation is recommended to diagnose". Its note adds that erroneous behaviour is always the consequence of incorrect program code, and that evaluating a constant expression never exhibits behaviour specified as erroneous in the core language clauses. [intro.abstract] permits an implementation to issue a diagnostic and to terminate the program when an erroneous operation executes. Its recommended practice is to diagnose, and a note accepts diagnostics with false positives.

Constant evaluation is stricter. `constexpr int f() { int x; return x; }` cannot be used in a constant expression, because reading `x` is erroneous behaviour, and anything that exhibits erroneous behaviour is not a core constant expression.

## What GCC 16 does

The standard leaves the erroneous value unspecified. GCC 16 chooses zero. In C++26 mode, when you pass no `-ftrivial-auto-var-init=` option, GCC zero-initializes automatic variables, excluding padding bits, unless they are marked `[[indeterminate]]` or `[[gnu::uninitialized]]`. So a program that read garbage when built with `-std=c++23` reads 0 when built with `-std=c++26`. `-ftrivial-auto-var-init=pattern` chooses a recognizable non-zero pattern instead, which is usually better for finding bugs in tests.

```cpp
#include <cstdio>

[[gnu::noinline]] void scribble() { volatile int junk = 100; (void)junk; }

[[gnu::noinline]] int read_uninit() {
  int x;                // erroneous value
  return x;             // erroneous behaviour
}

int main() {
  scribble();
  std::printf("%d\n", read_uninit());  // GCC 16 -std=c++26 -O0: prints 0
}                                      // the same flags with -std=c++23 printed 100
```

> **Pitfall.** Zero is a valid value, not a diagnosis. GCC 16 does not warn at run time when an erroneous value is read, so a missing initializer can silently become "works by accident". Keep `-Wuninitialized` enabled, and run sanitizers in tests. Do not write code that relies on the zero, because another implementation, or a pattern flag, will pick something else.

## Old traps that are now compile errors

Several C++26 papers take patterns that were always bugs, often undefined behaviour, and make them ill-formed.

**Returning a reference to a temporary (P2748).** A `return` statement that binds the returned reference to a temporary is ill-formed by [stmt.return]. This catches the obvious `auto&& f() { return 42; }`, and also the subtle case where a conversion creates the temporary:

```cpp
const double& f() {
  static int x = 42;
  return x;          // error in C++26: binds the result to a temporary double
}
```

**Deleting an incomplete class (P3144).** `delete p` where `p` points to an incomplete class type used to compile, and was undefined behaviour if the class turned out to have a non-trivial destructor. It is now ill-formed.

**Mixed enumeration arithmetic (P2864).** C++20 deprecated arithmetic between two different enumeration types, and between an enumeration and a floating-point type. C++26 makes both ill-formed. Comparing two arrays with `==` or `<` was also deprecated in C++20, because it compared their addresses, and P2865R6 makes it ill-formed as well.

```cpp
enum Color { red };
enum Fruit { apple };

int a = red + apple;      // C++26: ill-formed (GCC 16 only warns)
double b = red * 1.5;     // C++26: ill-formed (GCC 16 only warns)
int c = red + 1;          // still fine: an unscoped enumeration with an integer
```

GCC 16 diagnoses the two enumeration cases only with a `-Wdeprecated-enum-enum-conversion` or `-Wdeprecated-enum-float-conversion` warning, not an error, which is a deviation from the draft. Clang 21 rejects them. Both compilers reject array comparison.

**The variadic comma (P3176).** `void f(int...)`, a C-style variadic function written without a comma before the ellipsis, is deprecated. Write `void f(int, ...)`. The motivation is `void g(auto...)`, which declares a function parameter pack, and `void h(auto......)`, which is a pack followed by C varargs.

**Trivial infinite loops (P2809).** This one goes the other way. A loop such as `while (true) ;`, whose body is empty and whose condition is a constant `true`, is no longer undefined behaviour under the forward-progress rules. [stmt.iter.general] treats it as repeated calls to `std::this_thread::yield`, so embedded code that spins forever on purpose is now correct.

## Smaller conveniences

**The placeholder `_` (P2169).** A variable, structured binding, init-capture, or non-static data member named `_` is *name-independent*. You can declare more than one in the same scope without a redefinition error. Using `_` after the second declaration is ill-formed, because the name is then ambiguous. Static variables and namespace-scope declarations do not get this treatment.

```cpp
#include <map>
#include <mutex>

std::mutex m;
std::map<int, int> table;

void g() {
  std::lock_guard _(m);                  // a guard you never refer to
  auto [_, inserted] = table.insert({1, 2});
  // auto x = _;                         // would be an error: _ is ambiguous here
  (void)inserted;
}
```

**Deleted with a reason (P2573).** `= delete("message")` puts a string literal in the diagnostic. GCC 16 prints, for example, "use of deleted function ...: use span instead".

**Computed `static_assert` messages (P2741).** The message of a `static_assert` may be any constant expression with `.size()` and `.data()` members, such as a `std::string_view`, or a `std::string` built during constant evaluation. It is evaluated only when the assertion fails. In practice you usually build such a message with `std::format`, which is not yet `constexpr` in GCC 16. GCC 16's `std::to_string` is not `constexpr` either.

**Structured bindings (P0963, P0609, P1061).** A structured binding declaration can be the condition of an `if`, `while`, or `switch`. The condition tests the whole hidden object, converted to `bool`, before the bindings are initialized. So `if (auto [ok, value] = parse(text))` works when `parse` returns a type with `explicit operator bool`, but `if (auto [it, ok] = m.insert(...))` is ill-formed, because a `std::pair` does not convert to `bool`. Each binding may also carry its own attributes, as in `auto [x [[maybe_unused]], y] = p;`. In templates, `auto [...xs] = t;` introduces a pack of bindings.

**`#embed` (P1967).** `#embed "file.bin"` expands to a comma-separated list of the file's bytes as integer literals, so `const unsigned char data[] = { #embed "data.bin" };` puts a binary file in your program without any generator script. `limit(n)`, `prefix(...)`, `suffix(...)`, and `if_empty(...)` parameters adjust the expansion, and `__has_embed` tests whether a resource exists.

**Pack indexing (P2662).** `Ts...[0]` names the first element of a pack. The pack-indexing topic covers it in full.

## Trivial relocation: adopted, then removed

P2786R13, trivial relocatability, was adopted in February 2025. It added the `trivially_relocatable_if_eligible` and `replaceable_if_eligible` contextual keywords and `std::trivially_relocate`. National-body comments then reported design problems, and in November 2025 P3920R0 removed the whole feature from C++26. N5050 contains none of it. Articles and compiler release notes written during 2025 may still describe it as part of C++26.

## What to remember

- Erroneous behaviour is well-defined but wrong. Implementations are encouraged to diagnose it and may terminate.
- An uninitialized local variable holds an erroneous value, and reading it is erroneous behaviour. Memory from `new` and `[[indeterminate]]` variables still have indeterminate values, so reading them is undefined behaviour.
- `[[indeterminate]]` is the explicit opt-out, and it brings back undefined behaviour if you read before writing.
- GCC 16 in C++26 mode zero-initializes automatic variables by default. Do not rely on it, and keep warnings and sanitizers on.
- Newly ill-formed in C++26: returning a reference bound to a temporary, `delete` of an incomplete class, enumeration-to-enumeration and enumeration-to-floating arithmetic, and comparisons between arrays.
- `_` can be declared repeatedly in one scope but not used once it is ambiguous. `= delete("why")` and computed `static_assert` messages improve diagnostics.
- A structured-binding condition tests the whole object, so it needs a type that converts to `bool`.
- Trivial relocation was added to C++26 and then removed again, so it is not in N5050.
