---
title: "Overload Resolution: Candidates, Viability & Ranking"
summary: "Trace the three-phase pipeline the compiler runs on every overloaded call—candidate lookup, viability filtering, and conversion-sequence ranking—to predict exact winners and ambiguities."
track: "expressions-and-functions"
minutes: 9
standard:
  - "[over.match]"
  - "[over.match.viable]"
  - "[over.match.best]"
  - "[over.ics.rank]"
  - "[over.best.ics]"
cppreference:
  - title: "Overload resolution"
    path: "language/overload_resolution"
  - title: "Implicit conversions"
    path: "language/implicit_conversion"
  - title: "Argument-dependent lookup"
    path: "language/adl"
  - title: "Converting constructor"
    path: "language/converting_constructor"
  - title: "Function template"
    path: "language/function_template"
prerequisites:
  - "name-lookup-and-adl"
  - "value-categories"
  - "casts-and-qualifiers"
---

When multiple functions share a name, the compiler does not guess by intuition or pick the first match in the file. Instead, `[over.match]` specifies a deterministic three-stage pipeline that takes the call site, narrows down the visible declarations, scores each parameter's conversion path, and declares either one unique winner or a hard ambiguity error.

> **Mental model.** Overload resolution is a tournament with strict rules: first gather all candidates (`lookup + deduction`), eliminate those that cannot accept the call (`viability`), and finally crown the unique candidate that is at least as good on *every* argument and strictly better on *at least one* (`best viable`).

## The three-phase pipeline

Every overloaded function call, constructor call, or operator expression passes through three ordered stages:

1. **Candidate functions.** Name lookup (including ADL for unqualified calls) collects all matching functions. For function templates, template argument deduction (`[temp.deduct]`) runs here: if deduction succeeds, the resulting specialization enters the candidate set; if deduction fails (SFINAE), the specialization is silently dropped before viability even begins.
2. **Viable functions.** A candidate survives Phase 2 only if its parameter count (accounting for default arguments and ellipses) matches the call, any C++20 `requires`-clause evaluates to `true` (`[over.match.viable]/3`), and an implicit conversion sequence exists for every argument.
3. **Best viable function.** All surviving candidates are compared pairwise across every argument (`[over.match.best]`). If no single candidate beats every rival, the call is ill-formed due to ambiguity.

Notice what happens *after* Phase 3 picks the winner: access control (`private`/`protected`) and `= delete` checks! Because deleted functions stay in the viable set, `void f(double) = delete;` intercepts `f(1.5)` and stops compilation rather than silently letting `void f(int)` convert `1.5` to `1`.

## The three-tier conversion hierarchy

To compare how well a viable candidate fits an argument, the compiler assigns an **Implicit Conversion Sequence (ICS)** to each parameter (`[over.best.ics]`) and ranks sequences across three top-level tiers, then three sub-ranks inside Standard Conversions.

| Tier / Sub-rank | Rank | Examples |
| --- | --- | --- |
| **Standard: Exact Match** | Highest | Identity, lvalue-to-rvalue, array-to-pointer, `int*` to `const int*` |
| **Standard: Promotion** | 2nd | `char` or `bool` to `int`, `float` to `double` (value-preserving) |
| **Standard: Conversion** | 3rd | `int` to `double`, `double` to `int`, `Derived*` to `Base*`, `const char*` to `bool` |
| **User-Defined Conversion** | 4th | Single converting constructor or `operator T()` plus standard conversions |
| **Ellipsis Conversion** | Lowest | C-style variadic `...` parameter |

That separation between Standard Conversions and User-Defined Conversions explains one of C++'s sharpest traps.

> **Pitfall.** Given `void log(bool);` and `void log(std::string);`, calling `log("hello")` invokes `log(bool)`! Converting `const char[6]` via array-to-pointer (`const char*`) and pointer-to-boolean (`bool`) is a **Standard Conversion Sequence**, which outranks the **User-Defined Conversion Sequence** calling `std::string(const char*)`.

```cpp
#include <string>

int report(bool flag) { return flag ? 1 : 0; }
int report(const std::string&) { return 2; }

void conversion_trap() {
    // Array-to-pointer + pointer-to-bool is a Standard Conversion;
    // const char* -> std::string is a User-Defined Conversion.
    int a = report("oops");          // Calls report(bool) -> 1!
    int b = report(std::string("ok")); // Calls report(const std::string&) -> 2
    (void)a;
    (void)b;
}
```

## Reference binding, const, and value-category tie-breakers

Inside the **Exact Match** tier, reference parameters follow specialized sub-rules (`[over.ics.rank]/3`) so value categories and `const`-ness dispatch cleanly without extra conversions:

- A **non-`const` lvalue** binds better to `T&` than to `const T&` (and cannot bind to `T&&`).
- A **`const` lvalue** binds only to `const T&`.
- An **rvalue** (prvalue or xvalue) binds better to `T&&` than to `const T&` (and cannot bind to non-`const` `T&`).

Be careful combining by-value overloads (`void f(T)`) with reference overloads (`void f(const T&)` or `void f(T&&)`). Passing `42` to `f(int)` vs `f(const int&)` is **ambiguous** because both parameter forms achieve Exact Match with no meaningful distinction in conversion rank (`[over.ics.rank]/3`).

## Tie-breakers: templates, specializations, and constraints

Suppose two viable candidates tie across every parameter's conversion sequence. Only then does `[over.match.best]/2` consult structural tie-breakers in strict sequence:

1. **Non-template beats template.** Between `void f(int)` and `template <class T> void f(T)`, `f(42)` selects the non-template `f(int)`.
2. **More constrained C++20 concept beats less constrained.** When two templates share identical conversion ranks, constraint **subsumption** (`[temp.constr.order]`) picks the tighter concept (for example, `std::signed_integral<T>` subsumes `std::integral<T>`).
3. **More specialized template wins.** Partial ordering (`[temp.func.order]`) prefers `template <class T> void f(T*)` over `template <class T> void f(T)` for pointers.

> **Standardese.** "Given these definitions, a viable function `F1` is defined to be a better function than another viable function `F2` if for all arguments `i`, `ICSi(F1)` is not a worse conversion sequence than `ICSi(F2)`, and then ... for some argument `j`, `ICSj(F1)` is a better conversion sequence than `ICSj(F2)`, or, if not that, ... `F1` is not a function template specialization and `F2` is a function template specialization..." — `[over.match.best]`

Read that ordering carefully! **Conversion rank ALWAYS precedes the non-template tie-breaker.** If you overload `int pick(const int&)` alongside `template <class T> int pick(T&)`, calling `pick(x)` with a mutable `int x` picks the **template** `pick<int>(int&)`—because binding `int&` to a non-`const` lvalue is a strictly better conversion sequence than binding `const int&`!

```cpp
#include <concepts>

int pick(const int&) { return 1; }
template <class T>
int pick(T&) { return 2; }

int tie(int) { return 1; }
template <class T>
int tie(T) { return 2; }

template <class T>
int check(T) requires std::integral<T> { return 1; }
template <class T>
int check(T) requires std::signed_integral<T> { return 2; }

void ranking_demo() {
    int x = 10;
    int r1 = pick(x);   // Calls template pick<int>(int&) -> 2 (better ref conversion)
    int r2 = tie(x);    // Calls non-template tie(int) -> 1 (conversion ranks tie)
    int r3 = check(x);  // Calls signed_integral overload -> 2 (subsumption)
    (void)r1;
    (void)r2;
    (void)r3;
}
```

One other specialized rule governs braced initialization (`[over.match.list]`): list-initializing a class like `std::vector<int>{5, 1}` runs a two-pass overload resolution that strongly prefers `std::initializer_list` constructors first, explaining why `std::vector<int>{5, 1}` holds two integers (`5` and `1`) while `std::vector<int>(5, 1)` holds five `1`s.

## Member functions, cv/ref-qualifiers, and C++20 operators

For non-static member functions (without C++23 explicit object parameters), the compiler treats `*this` as an extra implicit object parameter during overload resolution (`[over.match.funcs]/4`). Marking a member function `const`, `&`, or `&&` lets `*this` compete cleanly on value category and `const`-qualification—for instance, moving out of a buffer only when invoked on an rvalue (`buf.take() &&`).

Finally, C++20 streamlined comparison overloads (`[over.match.oper]`): defining a single `operator==` lets overload resolution synthesize reversed (`b == a`) and negated (`a != b`, `b != a`) candidates automatically, placing rewritten candidates just below direct non-rewritten matches in tie-breaking.

## What to remember

- **Three steps govern every call.** Gather candidates (lookup + deduction), filter viable signatures (arity + constraints + ICS), then pick the best overall conversion vector.
- **Standard Conversions always beat User-Defined Conversions.** Watch out for pointer-to-`bool` beating `const char*`-to-`std::string`.
- **Conversion rank beats non-template tie-breaking.** A template taking `T&` defeats a non-template taking `const int&` on mutable lvalues.
- **Ambiguity requires no winner, not equal winners.** Being better on parameter 1 and worse on parameter 2 makes a call ill-formed.
- **`= delete` and access checks happen last.** Deleted overloads actively catch bad conversions instead of falling back silently.
