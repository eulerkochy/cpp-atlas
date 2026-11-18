---
title: "Lambdas: Closure Types, Captures & Generic Parameters"
summary: "Read every lambda as the compiler lowers it: a unique unnamed closure struct, captured data members, const-by-default operator(), and C++20/23 template and explicit-this extensions."
track: "expressions-and-functions"
minutes: 8
standard:
  - "[expr.prim.lambda]"
  - "[expr.prim.lambda.closure]"
  - "[expr.prim.lambda.capture]"
  - "[expr.prim.lambda.general]"
cppreference:
  - title: "Lambda expressions"
    path: "language/lambda"
  - title: "The this pointer"
    path: "language/this"
  - title: "Implicit conversions"
    path: "language/implicit_conversion"
  - title: "Placeholder type specifiers"
    path: "language/auto"
  - title: "std::function"
    path: "utility/functional/function"
prerequisites:
  - "value-categories"
  - "type-deduction-auto-decltype"
---

A lambda expression is syntactic sugar with remarkably transparent semantics. Whenever the compiler sees `[captures](params) { body }`, it synthesizes a fresh, unnamed non-union class—called the **closure type** (`[expr.prim.lambda.closure]`)—with one data member per capture and a public `operator()` containing your body. The lambda expression itself evaluates to a prvalue **closure object** of that type.

> **Mental model.** Never treat a lambda as an opaque heap allocation or a bare function pointer. By default, a lambda is a small stack struct whose members are its captures and whose `operator()` is `const` and implicitly `constexpr` whenever eligible.

Every lambda expression creates its own distinct type, even when two lambdas have identical tokens: `std::is_same_v<decltype([]{}), decltype([]{})>` is always `false`.

## Value captures, reference captures, and mutable

The introducer `[...]` controls which outer variables become members inside the generated closure struct and whether those members are stored by value or by reference.

| Introducer form | Generated closure member | Mutability without `mutable` | Typical use |
| --- | --- | --- | --- |
| `[]` | None (empty class) | N/A | Stateless predicates and callbacks |
| `[x]` or `[=]` | Copy of `x` (`T x;`) | Read-only inside `operator()` | Snapshot local scalars or small values |
| `[&x]` or `[&]` | Reference (`T& x;`) | **Referent is mutable** | Mutate caller state synchronously |
| `[p = expr]` | Deduced member `auto p` (C++14) | Read-only unless `mutable` | Move-only ownership like `std::unique_ptr` |
| `[=, *this]` | Copy of enclosing object (C++17) | Copy is `const` inside `operator()` | Async tasks outliving `this` |

Notice why modifying a by-value capture requires `mutable`: the synthesized `operator()` is **`const`-qualified by default** (`[expr.prim.lambda.closure]/5`). A `const` member function cannot assign to a non-static data member `int count;`, so `[count]() { ++count; }` is rejected unless you write `mutable`, which drops `const` from `operator()`. By contrast, a `const` member function *can* mutate what a reference member points to—just like any struct containing an `int&` field—so `[&count]() { ++count; }` compiles cleanly without `mutable`.

Init-captures (`[p = std::move(ptr)]`, introduced in C++14) deduce the captured member type using `auto` rules rather than binding directly to an existing local variable name, making it trivial to move non-copyable handles such as `std::unique_ptr` into closures.

```cpp
#include <memory>
#include <utility>

void capture_demo() {
    int count = 0;

    auto by_val = [count]() mutable { return ++count; }; // Mutates its own copy
    auto by_ref = [&count]() { return ++count; };         // Mutates caller's count

    auto handle = std::make_unique<int>(42);
    auto owner = [p = std::move(handle)]() { return *p; }; // Moves ownership into closure

    (void)by_val();
    (void)by_ref();
    (void)owner();
}
```

One surprising shortcut in `[expr.prim.lambda.capture]` concerns local constants: if a local `constexpr` variable is read solely for its compile-time value (not odr-used by taking its address or binding a reference), a lambda can use it directly with an empty capture list `[]`.

## The silent dangling trap with [=] and this

Capturing by reference (`[&]` or `[&x]`) stores a raw reference inside the closure struct; returning that closure from a function or handing it to a thread pool leaves a dangling reference the moment the stack frame unwinds. Less obvious—and far more insidious—is what `[=]` does inside a member function.

> **Pitfall.** Inside a member function, `[=]` does *not* capture member variables by value. Instead, it captures the enclosing `this` pointer by value (`Widget*`), so accessing `member_` inside the lambda still reads through a pointer that dangles once the `Widget` is destroyed.

Because this trap surprised even seasoned C++ teams, C++20 deprecated implicit capture of `this` through `[=]`. In modern code, be explicit: write `[=, this]` when you consciously want the pointer, or `[=, *this]` (valid since C++17) when you want a self-contained copy of the enclosing object inside the closure.

```cpp
struct Job {
    int factor = 3;

    auto share_pointer() const {
        // Explicit pointer capture (C++20 replaces deprecated bare [=])
        return [=, this](int x) { return x * factor; };
    }

    auto snapshot_object() const {
        // Safe to outlive *this: stores a copy of the Job object (C++17+)
        return [=, *this](int x) { return x * factor; };
    }
};
```

## Stateless lambdas, function pointers, and C++20 unevaluated contexts

A captureless lambda (`[]`) carries zero state, so `[expr.prim.lambda.closure]/9` gives it a `constexpr` implicit conversion operator to a matching C-style function pointer. Prefixing `+[]` triggers that conversion via unary `+` whenever a template expects a pointer rather than an arbitrary callable. Once a lambda captures even a single byte, no conversion to a function pointer exists—a closure with state needs a separate `this`-like pointer to find its captured members, so storing it dynamically requires a type-erased wrapper such as `std::function` or `std::move_only_function` (C++23), or keeping it un-erased in a template parameter.

> **Standardese.** "The closure type for a lambda-expression has a public inline function call operator ... For a generic lambda, the function call operator is a template." — `[expr.prim.lambda.closure]`

C++20 closed two longstanding ergonomics gaps for stateless lambdas:

1. **Default-constructible and assignable.** Captureless closure types gained a defaulted default constructor and copy assignment operator, so containers like `std::set<Key, decltype([](auto a, auto b) { ... })>` work without passing a comparator object to the constructor.
2. **Valid in unevaluated contexts.** Lambdas became legal inside `decltype(...)` and `sizeof(...)`, turning custom `std::unique_ptr` deleters into clean one-liners instead of separate structs or helper functions.

```cpp
#include <memory>

void stateless_demo() {
    // Unary '+' converts a captureless lambda to a plain function pointer.
    int (*fn)(int) = +[](int x) { return x + 1; };

    // C++20: lambda directly inside an unevaluated decltype() deleter type.
    std::unique_ptr<int, decltype([](int* p) { delete p; })> ptr(new int(7));
    (void)fn(1);
    (void)ptr;
}
```

## Generic lambdas, template heads, and C++23 deducing this

Writing `auto` in a lambda parameter list (C++14) turns `operator()` into an abbreviated member function template, generating a fresh template parameter for each `auto` argument. When you need to name the deduced type—for example, to require two parameters to share the same type `T` or to call `std::forward<T>(x)` cleanly without `std::forward<decltype(x)>(x)`—C++20 lets you add an explicit template parameter list directly before the parentheses: `[]<class T>(std::vector<T>& v)`.

C++23 rounds out the closure design with two final tools:

- **`this auto self` (deducing this).** Naming the closure parameter inside the parameter list lets a lambda call itself recursively without wrapping itself in `std::function` or passing `self` as a manual second argument.
- **`static operator()`.** Decorating a captureless lambda with `static` eliminates the unused hidden `this` pointer from its calling convention (`[](int x) static { return x * 2; }`), making direct calls through the closure object as cheap as calling a free function.

```cpp
#include <vector>

void modern_lambdas() {
    // C++20 explicit template parameter list
    auto total_bytes = []<class T>(const std::vector<T>& v) {
        return v.size() * sizeof(T);
    };

    // C++23 recursive lambda via explicit object parameter
    auto fib = [](this auto self, int n) -> int {
        return n <= 1 ? n : self(n - 1) + self(n - 2);
    };

    // C++23 static operator() avoids passing an unused closure pointer
    auto double_it = [](int x) static { return x * 2; };

    std::vector<int> data{1, 2, 3};
    (void)total_bytes(data);
    (void)fib(5);
    static_assert(double_it(4) == 8);
}
```

## What to remember

- **A lambda is a struct, not magic syntax.** Captures become data members, and `operator()` is `const` (and implicitly `constexpr` when valid) unless `mutable` or `static` changes it.
- **Every lambda expression has a unique type.** Store closures with `auto`, pass them to templates, or type-erase explicitly when uniform storage is required.
- **By-value `mutable` vs. by-reference.** Reference captures can mutate their target without `mutable`, while value captures need `mutable` to mutate the closure's own copy.
- **Watch `this` inside `[=]` captures.** Prefer `[=, this]` or `[=, *this]` so object lifetimes remain obvious at the call site.
- **Use C++20/23 extensions when needed.** Template heads (`<class T>`), unevaluated `decltype([]{})`, `this auto self` recursion, and `static operator()` replace old boilerplate cleanly.
