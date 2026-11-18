---
title: "Constant Expressions: constexpr, consteval & constinit"
summary: "Distinguish core constant expressions from constant-evaluated contexts, choose cleanly between constexpr, consteval, and constinit, and branch safely with if consteval."
track: "expressions-and-functions"
minutes: 8
standard:
  - "[expr.const]"
  - "[dcl.constexpr]"
  - "[dcl.consteval]"
  - "[dcl.constinit]"
  - "[stmt.if]"
  - "[meta.const.eval]"
cppreference:
  - title: "Constant expressions"
    path: "language/constant_expression"
  - title: "constexpr specifier"
    path: "language/constexpr"
  - title: "consteval specifier"
    path: "language/consteval"
  - title: "constinit specifier"
    path: "language/constinit"
  - title: "if statement"
    path: "language/if"
prerequisites:
  - "evaluation-order"
  - "initialization-forms"
---

When developers hear "compile-time evaluation," they often picture an aggressive optimizer folding arithmetic constants at `-O2`. In C++, **constant expressions** are something far stronger: a formal part of the language rules defined in `[expr.const]` that governs what the compiler *must* evaluate during translation—even at `-O0`—and when an evaluation error becomes a hard diagnostic.

> **Mental model.** `constexpr` on a function means "permitted in constant evaluation," not "forced at compile time." On a variable, `constexpr` means both "compile-time initialized" and `const`. When you want compile-time initialization *without* `const`, reach for `constinit`; when you want compile-time execution *mandatorily*, reach for `consteval`.

## What makes an expression constant

The standard splits the idea into two layers. First, an expression is a **core constant expression** unless evaluating it runs into a forbidden runtime operation under `[expr.const]/5`. Disqualified operations include calling a non-`constexpr` function, reading an uninitialized scalar or `volatile` glvalue, performing `reinterpret_cast`, throwing an uncaught exception, or triggering **any undefined behavior**.

Second, to serve as a full **constant expression** (for instance, to initialize a `constexpr` variable or size a `std::array`), the result cannot dangle: it cannot point or refer to an automatic local variable or to heap memory that has not been freed before evaluation ends.

Just as important is *when* the compiler is required to evaluate one. The standard calls those places **manifestly constant-evaluated contexts**:

- `static_assert` conditions and `if constexpr (...)` predicates
- Non-type template arguments and array bounds
- Initializers of `constexpr` and `constinit` variables
- Invocations of `consteval` functions
- `const` integral or enumeration variables whose initializers happen to be constant expressions

Outside those contexts, calling a `constexpr` function with literal arguments might evaluate at compile time as an optimization—or might run at runtime under `-O0`.

## constexpr vs. consteval vs. constinit

Mixing up these three specifiers is easy because they share a prefix, yet each solves a distinct problem.

| Specifier | Applies to | Evaluation timing | Resulting object mutable? | Usable with runtime inputs? |
| --- | --- | --- | --- | --- |
| `constexpr` (variable) | Variables (and static data members) | Must be constant-initialized | No (implicitly `const`) | N/A |
| `constexpr` (function) | Functions and constructors | Compile-time *or* runtime | N/A | Yes |
| `consteval` | Functions and constructors | **Always** compile-time | N/A | No (compile error) |
| `constinit` | Static or `thread_local` variables | Must be constant-initialized | **Yes** (unless also `const`) | N/A |

Notice two details in that comparison that routinely trip people up. First, `constexpr` on a function signature never makes the return type `const` (unlike `constexpr` on a variable, where `constexpr int* p` means `int* const p`—top-level `const`!). Second, `constinit` solves the **static initialization order fiasco** for mutable globals and `thread_local` caches: if the initializer is not a valid constant expression, compilation fails immediately instead of silently falling back to dynamic initialization before `main`.

```cpp
consteval int square_now(int n) {
    return n * n;
}

constexpr int square_anytime(int n) {
    return n * n;
}

// Guaranteed static initialization, yet still mutable at runtime.
constinit int global_hits = square_now(4);

// Compile-time constant and implicitly const.
constexpr int table_size = square_anytime(8);
static_assert(table_size == 64);

int runtime_demo(int user_input) {
    global_hits += 1;                        // Legal: constinit is not const
    // int bad = square_now(user_input);     // Error: user_input is not constant
    return square_anytime(user_input);       // Legal: runs at runtime
}
```

## Transient allocation and C++20/23 expansions

Since C++20, constant evaluation supports `new` and `delete`, which enables `constexpr` `std::vector` and `std::string`. There is one strict boundary rule: **transient allocation**. Any dynamic memory allocated during a constant evaluation must be deallocated before that constant evaluation returns its final value (`[expr.const]/5`).

You can build and sort a `std::vector<int>` inside a `constexpr` or `consteval` helper, extract a scalar summary, a fixed `std::array`, or a count, and let the vector's destructor free its buffer before leaving the compile-time evaluator. What you *cannot* do is declare `constexpr std::vector<int> v{1, 2, 3};` at namespace scope, because its heap buffer would attempt to survive past the end of constant evaluation.

```cpp
#include <array>
#include <cstddef>
#include <vector>

consteval int triangular_sum(int n) {
    std::vector<int> scratch;
    for (int i = 1; i <= n; ++i) {
        scratch.push_back(i);
    }
    int sum = 0;
    for (int x : scratch) {
        sum += x;
    }
    return sum; // scratch is destroyed and freed here: valid transient allocation
}

static_assert(triangular_sum(6) == 21);

// To persist compile-time data into the binary, copy into std::array:
consteval std::array<int, 4> make_squares() {
    std::vector<int> tmp{1, 2, 3, 4};
    std::array<int, 4> out{};
    for (std::size_t i = 0; i < out.size(); ++i) {
        out[i] = tmp[i] * tmp[i];
    }
    return out;
}

constexpr auto squares = make_squares();
static_assert(squares[3] == 16);
```

C++23 further widened what can sit inside a `constexpr` function: `static constexpr` variables are now permitted locally, `goto` restrictions eased, and a `constexpr` function no longer causes an error just because *no* valid constant-expression instantiation exists yet (P2448R2).

## Dual-path code with if consteval (C++23)

Sometimes a function needs two implementations: a portable pure-C++ algorithm for compile-time evaluation and a SIMD intrinsic or assembly path at runtime. C++20 introduced `std::is_constant_evaluated()` in `<type_traits>` for that split, and C++23 added a dedicated statement syntax: `if consteval { ... } else { ... }` (notice: **no parentheses** around a condition).

> **Pitfall.** Never write `if constexpr (std::is_constant_evaluated())`. Because the predicate of `if constexpr` is itself a manifestly constant-evaluated context, `std::is_constant_evaluated()` unconditionally evaluates to `true` there—silently discarding your runtime branch even when the outer function is called at runtime.

C++23 `if consteval` eliminates that mistake by syntax alone and adds one capability `if (std::is_constant_evaluated())` lacks: inside the `if consteval` branch, the compiler puts you inside an immediate-function context, allowing direct calls to `consteval` functions using the enclosing function's parameters.

```cpp
#include <type_traits>

consteval int compile_time_hash(int x) { return x * 2654435761u; }
int runtime_crc(int x) { return x ^ 0x5555; }

constexpr int compute_tag(int x) {
    if consteval {
        // Immediate context: calling a consteval function with 'x' is legal here!
        return compile_time_hash(x);
    } else {
        return runtime_crc(x);
    }
}

constexpr int c_tag = compute_tag(7); // Takes the `if consteval` branch

int runtime_tag(int dynamic_x) {
    return compute_tag(dynamic_x);    // Takes the `else` branch
}
```

## Undefined behavior is forbidden at compile time

One underappreciated gift of `constexpr` and `consteval` is that the constant evaluator acts as a built-in undefined-behavior detector. Outside constant evaluation, signed integer overflow, shifting by a negative count, dereferencing a null pointer, reading past the end of an array, or reading an inactive union member can slip silently into compiled machine code. Inside constant evaluation, `[expr.const]/5` rejects *every* core-language undefined behavior with a compile-time diagnostic explaining which rule failed.

> **Standardese.** "An expression `E` is a core constant expression unless the evaluation of `E`, following the rules of the abstract machine, would evaluate one of the following: ... an operation that would have undefined behavior as specified in [intro] through [cpp]." — `[expr.const]`

## What to remember

- **Core constant expressions reject UB.** Any undefined behavior during evaluation turns a constant expression into a guaranteed compile error.
- **Keep the three keywords distinct.** `constexpr` allows compile-time evaluation (and adds `const` to variables), `consteval` requires compile-time evaluation, and `constinit` enforces static initialization on mutable static/thread-local objects.
- **Dynamic memory works if it stays local.** Compile-time `std::vector` and `std::string` allocations are legal as long as they are freed before evaluation returns.
- **Prefer `if consteval` in C++23.** It avoids the `if constexpr (std::is_constant_evaluated())` bug and unlocks calling `consteval` helpers directly.
- **Function `constexpr` is not return `const`.** Always read `constexpr` on a function as an evaluation capability, not a qualifier on its return type.
