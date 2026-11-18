---
title: "Type Deduction: auto, decltype, and CTAD"
summary: "Master template-style auto deduction, the braced-initializer exception, decltype's two-rule split, structured bindings, and Class Template Argument Deduction."
track: "types-and-initialization"
minutes: 9
standard:
  - "[dcl.type.auto.deduct]"
  - "[dcl.type.decltype]"
  - "[temp.deduct.type]"
  - "[dcl.struct.bind]"
  - "[over.match.class.deduct]"
cppreference:
  - title: "Placeholder type specifiers"
    path: "language/auto"
  - title: "decltype specifier"
    path: "language/decltype"
  - title: "Template argument deduction"
    path: "language/template_argument_deduction"
  - title: "Structured binding declaration"
    path: "language/structured_binding"
  - title: "Class template argument deduction"
    path: "language/class_template_argument_deduction"
prerequisites:
  - "initialization-forms"
---

C++ offers several ways to omit spelling a type—`auto`, `decltype`, `decltype(auto)`, structured bindings, and Class Template Argument Deduction (CTAD)—yet they obey different rulebooks. Treating `auto` and `decltype` as interchangeable causes dangling references, unintended copies, and surprise `std::initializer_list` deductions.

## auto is template argument deduction in disguise

Under `[dcl.type.auto.deduct]`, deducing `auto` in `ParamSpec x = expr;` is mechanically identical to inventing a helper function template `template<class T> void f(ParamSpec_T param);` and calling `f(expr);`. Whatever `T` template argument deduction solves for replaces `auto`.

That single equivalence explains all three `auto` specifier patterns:

1. **`auto x = expr;` (by value):** Strips references first, then drops top-level `const` and `volatile`, and decays array or function expressions to pointers.
2. **`const auto& x = expr;` or `auto* p = ptr;` (reference or pointer):** Drops top-level reference from `expr`, yet *preserves* inner `const`/`volatile` qualifiers and prevents array-to-pointer decay.
3. **`auto&& x = expr;` (forwarding reference):** If `expr` is an lvalue of type `U`, reference collapsing deduces `auto` as `U&` so `x` has type `U&`; if `expr` is an rvalue of type `U`, `x` has type `U&&`.

| Initializer `expr` (given `const int ci = 7; int arr[3]{};`) | `auto x = expr` | `const auto& x = expr` | `auto&& x = expr` | `decltype((expr))` |
| --- | --- | --- | --- | --- |
| `ci` (lvalue `const int`) | `int` | `const int&` | `const int&` | `const int&` |
| `42` (prvalue `int`) | `int` | `const int&` | `int&&` | `int` |
| `arr` (lvalue `int[3]`) | `int*` | `const int (&)[3]` | `int (&)[3]` | `int (&)[3]` |
| `std::move(ci)` (xvalue `const int`) | `int` | `const int&` | `const int&&` | `const int&&` |

> **Mental model.** `auto` behaves like a value parameter unless decorated with `&`, `*`, or `&&`—it strips references and top-level `const` by default, whereas `decltype` acts as an exact mirror of the expression's type and value category.

```cpp
#include <type_traits>

void check_auto_deduction() {
    const int ci = 7;
    const int& ref = ci;

    auto a = ref;        // int (drops & and top-level const)
    const auto& b = ref; // const int& (preserves constness)
    auto&& c = ci;       // const int& (forwarding ref binds lvalue)
    auto&& d = 7;        // int&& (forwarding ref binds rvalue)

    int arr[3]{};
    auto ptr = arr;      // int* (by-value auto decays array)
    auto& arr_ref = arr; // int (&)[3] (reference avoids decay)

    static_assert(std::is_same_v<decltype(a), int>);
    static_assert(std::is_same_v<decltype(b), const int&>);
    static_assert(std::is_same_v<decltype(c), const int&>);
    static_assert(std::is_same_v<decltype(d), int&&>);
    static_assert(std::is_same_v<decltype(ptr), int*>);
    static_assert(std::is_same_v<decltype(arr_ref), int(&)[3]>);
}
```

## The braced-initializer exception

`auto` differs from template argument deduction in exactly **one** place: braced initializers (`{...}`). A function template `template<class T> void f(T);` cannot deduce `T` from `f({1, 2});` because a braced-init-list has no type of its own (`[temp.deduct.type]`). By contrast, `auto` has special rules refined in C++17:

- **Copy-list-initialization (`auto x = {1, 2};`):** Deduces `std::initializer_list<int>`, provided every element deduces the same type.
- **Direct-list-initialization (`auto x{1};`):** Deduces `int` since C++17 (single element only; `auto x{1, 2};` is ill-formed).

> **Pitfall.** Writing `auto x = {42};` creates a `std::initializer_list<int>`, not an `int`! Use `auto x = 42;` or `auto x{42};` when you want `int`.

## decltype and decltype(auto)

Unlike `auto`, `decltype(e)` (`[dcl.type.decltype]`) never strips `const` or references and never evaluates `e`. Its rules split sharply into two branches:

1. **Unparenthesized id-expression or class member access** (`decltype(x)`, `decltype(obj.field)`): Yields the **declared type** of that variable or data member.
2. **Any other expression** (`decltype((x))`, `decltype(x + 1)`, `decltype(fn())`): Classifies the expression by value category—yielding **`T&` for lvalue**, **`T&&` for xvalue**, and **`T` for prvalue**.

> **Standardese.** Under `[dcl.type.decltype]`, wrapping a variable name in extra parentheses transforms an unparenthesized id-expression into a parenthesized lvalue expression, turning `decltype(x)` (`int`) into `decltype((x))` (`int&`).

C++14 added **`decltype(auto)`** so forwarding wrappers and return types can apply `decltype` rules to an initializer or `return` operand without repeating the expression inside `decltype(...)`. Remember that `decltype(auto)` cannot be adorned with `*` or `&`—it stands alone as the full type specifier.

```cpp
#include <type_traits>
#include <utility>

template<class Fn, class... Args>
decltype(auto) relay_call(Fn&& fn, Args&&... args) {
    return std::forward<Fn>(fn)(std::forward<Args>(args)...); // Preserves int&, int&&, or int
}

int& get_first(int* arr) { return arr[0]; }

void check_decltype() {
    int x = 5;
    static_assert(std::is_same_v<decltype(x), int>);
    static_assert(std::is_same_v<decltype((x)), int&>);

    int nums[2]{10, 20};
    decltype(auto) r = relay_call(get_first, nums);
    static_assert(std::is_same_v<decltype(r), int&>);
    r = 99; // Mutates nums[0] directly
}
```

> **Pitfall.** Writing `decltype(auto) make() { int local = 42; return (local); }` compiles silently with a catastrophic dangling reference! Because `(local)` is a parenthesized lvalue expression, `decltype(auto)` deduces `int&` rather than `int` and returns a reference to destroyed stack storage.

## Structured bindings under the hood

Structured bindings (`auto [a, b] = expr;`, `[dcl.struct.bind]`) appear to declare two independent variables `a` and `b`. In reality, the compiler introduces a single hidden variable `e` whose type is deduced from the qualifiers written on `auto` (`auto e = expr;`, `const auto& e = expr;`, or `auto&& e = expr;`). The identifiers `a` and `b` are **bindings (aliases)** into `e` via one of three protocols: array elements, `std::tuple_size` + `get`, or public non-static data members.

A subtle consequence follows: `decltype(a)` queries the **declared member or `std::tuple_element` type**, *not* the reference-ness of `auto& [a, b]`! Even when `auto& [a, b] = pair;` mutates `pair` in place, `decltype(a)` is `int`, whereas `decltype((a))` is `int&`. Also note that C++20 fixed a C++17 limitation: structured bindings can now be captured directly by lambdas (`[a]`), since C++20 no longer treats bindings as un-capturable non-variables.

```cpp
#include <type_traits>

struct Entry {
    int id;
    double score;
};

void check_bindings() {
    Entry e{1, 9.5};
    auto& [id_ref, score_ref] = e;
    id_ref = 2; // Mutates e.id directly

    // decltype(id_ref) reflects Entry::id's declared type (int), NOT int&!
    static_assert(std::is_same_v<decltype(id_ref), int>);
    static_assert(std::is_same_v<decltype((id_ref)), int&>);
}
```

## Class Template Argument Deduction and guides

Before C++17, constructing `std::pair` or `std::lock_guard` required repeating template arguments or calling `std::make_pair`. **Class Template Argument Deduction (CTAD)** (`[over.match.class.deduct]`) allows `std::pair p(1, 2.5);` by synthesizing imaginary function templates called **deduction guides** from every constructor of the class template—plus allowing explicit user-defined guides (`Box(const char*) -> Box<std::string>;`).

Two rules keep CTAD predictable in practice:

- **All-or-nothing deduction:** Until you write `std::pair<int, double>`, CTAD only runs when *zero* template arguments are supplied (never `std::pair<int>(1, 2.5)`).
- **Copy-deduction candidate priority:** Writing `std::vector v2{v1};` (where `v1` is already `std::vector<int>`) deduces `std::vector<int>`, not `std::vector<std::vector<int>>`, because CTAD gives the synthesized copy-constructor guide priority for single-argument matching specialization types. Adding a second element (`std::vector v3{v1, v1};`) falls back to `initializer_list` and produces `std::vector<std::vector<int>>`.

In C++20, CTAD also gained automatic deduction for **aggregates** and **alias templates**, eliminating the need for boilerplate deduction guides on simple wrapper structs.

```cpp
#include <string>
#include <type_traits>
#include <vector>

template<class T>
struct Box {
    T value;
};
// User-defined deduction guide transforms C-string literals into std::string boxes.
Box(const char*) -> Box<std::string>;

void check_ctad() {
    std::vector v1{1, 2, 3};     // std::vector<int>
    std::vector v2{v1};          // Copy-deduction candidate -> std::vector<int>
    std::vector v3{v1, v1};      // Two elements -> std::vector<std::vector<int>>

    Box bx{"hello"};             // Deduction guide -> Box<std::string>
    static_assert(std::is_same_v<decltype(v2), std::vector<int>>);
    static_assert(std::is_same_v<decltype(v3), std::vector<std::vector<int>>>);
    static_assert(std::is_same_v<decltype(bx), Box<std::string>>);
}
```

## What to remember

- By-value `auto` mirrors template value deduction: it strips references and top-level `const`/`volatile` and decays arrays/functions to pointers.
- `auto x = {1};` deduces `std::initializer_list<int>`, whereas C++17 `auto x{1};` deduces `int` and `auto x{1, 2};` is ill-formed.
- `decltype(name)` returns the declared type; `decltype((name))` (or any compound expression) adds `&` for lvalues and `&&` for xvalues.
- Never `return (local);` from a `decltype(auto)` function—the extra parentheses deduce a dangling reference.
- In `auto& [a, b] = s;`, `decltype(a)` is the element's declared type while `decltype((a))` reflects the reference binding; CTAD's copy-deduction candidate makes `std::vector{v1}` copy rather than nest.
