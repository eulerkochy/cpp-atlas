---
title: "Vocabulary types and std::format"
summary: "Value-semantic sum types, type-erased callables with const and move-only correctness, and compile-time checked text formatting in modern C++."
track: "utilities"
minutes: 11
standard:
  - "[optional]"
  - "[variant]"
  - "[any]"
  - "[func.wrap.move]"
  - "[format.fmt.string]"
cppreference:
  - title: "std::optional"
    path: "utility/optional"
  - title: "std::variant"
    path: "utility/variant"
  - title: "std::visit"
    path: "utility/variant/visit2"
  - title: "std::any"
    path: "utility/any"
  - title: "std::move_only_function"
    path: "utility/functional/move_only_function"
  - title: "std::format"
    path: "utility/format/format"
  - title: "std::print"
    path: "io/print"
prerequisites:
  - "copy-and-move"
  - "optional-expected-and-error-codes"
---

Modern standard C++ replaces sentinel integers (`-1`), `void*` user-data pointers, and stateful `std::ostream` manipulators with **vocabulary types**: value-semantic abstractions that encode presence, alternatives, callable ownership, and formatting rules directly in the type system.

> **Mental model.** `std::optional<T>` represents `T + 1` states, `std::variant<Ts...>` represents a closed sum `T1 + T2 + ...`, and `std::any` represents an open type-erased slot. All three store small objects inline without touching the heap when possible, preserving value semantics.

## Algebraic types: optional, variant, and any

`std::optional<T>` models an object that may or may not exist using aligned inline storage for `T` plus a `bool` engaged flag—zero heap allocation. Calling `.value()` throws `std::bad_optional_access` when empty, whereas `*opt` and `opt->` are unchecked (undefined behavior if empty). C++23 adds monadic operations—`.and_then()`, `.transform()`, and `.or_else()`—so pipelines avoid nested `if (opt)` pyramids:

```cpp
#include <optional>
#include <string_view>

std::optional<int> parse_port(std::string_view text) {
    if (text == "443") return 443;
    return std::nullopt;
}

int resolve_port(std::optional<std::string_view> env_value) {
    return env_value
        .and_then(parse_port)
        .transform([](int port) { return port + 1000; })
        .or_else([]() -> std::optional<int> { return 8080; })
        .value();
}
```

`std::variant<Ts...>` is a type-safe discriminated union sized to the maximum size and alignment of its alternatives plus a compact index tag. Unlike `std::optional`, a default-constructed `std::variant` initializes its **first** alternative `T0` (wrap `std::monostate` as `T0` when an empty state is desired or `T0` is not default-constructible).

While `std::variant` normally always holds one active alternative, it can enter a rare degenerate state where `v.valueless_by_exception()` is `true` (`v.index() == std::variant_npos`). That happens only if an exception is thrown *during* type-changing assignment or `emplace()` after destroying the old alternative and before completing construction of the new one.

`std::any` trades a closed alternative list for open type erasure: it stores any `CopyConstructible` type, typically using a Small Buffer Optimization (SBO) for small nothrow-movable objects and allocating on the heap for larger ones. Access via `std::any_cast<T>(&a)` returns `nullptr` on type mismatch, whereas `std::any_cast<T>(a)` throws `std::bad_any_cast`.

## Exhaustive visitation and the overloaded pattern

Reading a `std::variant` with `std::get_if<T>(&v)` works for one case, yet `std::visit` enforces **compile-time exhaustiveness** across every alternative. The standard idiom combines a variadic inheritance wrapper `overloaded` with `using Ts::operator()...`:

```cpp
#include <cstddef>
#include <string>
#include <variant>

template <class... Ts>
struct overloaded : Ts... {
    using Ts::operator()...;
};

std::size_t payload_score(const std::variant<int, std::string>& item) {
    return std::visit(overloaded{
        [](int n) -> std::size_t { return static_cast<std::size_t>(n); },
        [](const std::string& s) -> std::size_t { return s.size(); },
    }, item);
}
```

Since C++20, aggregate Class Template Argument Deduction deduces `overloaded` without an explicit deduction guide (add `template <class... Ts> overloaded(Ts...) -> overloaded<Ts...>;` only if targeting C++17). Note that `std::visit` checks `valueless_by_exception()` internally and throws `std::bad_variant_access` if any visited variant is valueless.

> **Pitfall.** Avoid writing a catch-all `[](const auto&) {}` arm inside `overloaded` unless deliberate fallback behavior is required: a generic lambda silently swallows newly added variant alternatives and defeats compile-time exhaustiveness checking.

## Callable wrappers: std::function vs. std::move_only_function

For over a decade, `std::function<R(Args...)>` was the default type-erased callback wrapper, yet it carries three structural flaws:

1. **Copy requirement:** `std::function` demands a `CopyConstructible` target, rejecting lambdas that capture `std::unique_ptr`, `std::jthread`, or move-only futures.
2. **Broken `const` propagation:** `std::function::operator()` is always `const`-qualified regardless of whether the wrapped callable mutates captured state. Calling a `const std::function` can mutate `[x = 0]() mutable { return ++x; }` silently.
3. **RTTI and throwing empty checks:** `std::function` stores RTTI for `.target_type()` and checks for null on every invocation to throw `std::bad_function_call`.

C++23 `std::move_only_function<Sig>` fixes all three. Its template signature encodes cv-qualifiers, ref-qualifiers (`&` / `&&`), and `noexcept` directly into the wrapper interface:

```cpp
#include <functional>
#include <memory>
#include <utility>

int run_task() {
    auto token = std::make_unique<int>(42);
    std::move_only_function<int() const noexcept> fn =
        [t = std::move(token)]() noexcept { return *t; };

    const auto& readonly_fn = fn;
    return readonly_fn();
}
```

Without `const` in `std::move_only_function<int()>`, calling through `const auto&` fails to compile; with `noexcept` in the signature, only `noexcept` callables bind and calling `fn()` is itself `noexcept`. Unlike `std::function`, invoking an empty `std::move_only_function` is undefined behavior rather than throwing, eliminating a conditional check and dropping RTTI overhead.

> **Standardese.** `[func.wrap.func]` permits `std::function::operator() const` to invoke non-`const` callable objects without propagating `const` correctness. `[func.wrap.move]` resolves this in C++23 by encoding the exact `const`, `&`/`&&`, and `noexcept` qualifiers in the template parameter of `std::move_only_function`.

## Compile-time checked std::format and std::print

C++20 `<format>` and C++23 `<print>` replace both type-unsafe `printf` varargs and verbose stateful `std::ostream` manipulators (`std::hex`, `std::setw` leaking across statements).

`std::format` achieves safety without runtime format parsing bugs by accepting `std::format_string<Args...>`, whose constructor is `consteval`:

```cpp
#include <format>
#include <print>
#include <string>
#include <vector>

struct Point {
    int x;
    int y;
};

template <>
struct std::formatter<Point> {
    constexpr auto parse(std::format_parse_context& ctx) { return ctx.begin(); }
    auto format(const Point& p, std::format_context& ctx) const {
        return std::format_to(ctx.out(), "({}, {})", p.x, p.y);
    }
};

void emit_report() {
    Point origin{3, 4};
    std::vector<int> samples{10, 20, 30};
    std::string text = std::format("pt={} samples={}", origin, samples);
    std::println("{}", text);
}
```

Because `format_string` runs at compile time, passing `"{:d}"` for a `std::string` or mismatched placeholder counts fails compilation immediately. When a format pattern genuinely comes from runtime configuration, opt in explicitly with `std::vformat(fmt, std::make_format_args(arg1, arg2))`—noting that after defect report P2905R2, `std::make_format_args` requires **lvalue** arguments so the returned `format_args` object cannot dangle on temporaries.

C++23 also adds range formatting directly (`std::format("{}", vec)`) and `<print>` (`std::print`, `std::println`), which write directly to `FILE*` or `stdout` without intermediate `std::string` heap allocations and support UTF-8 console output cleanly.

> **Pitfall.** Calling `std::format(runtime_string, x)` fails to compile because `std::format_string<Args...>` requires a compile-time constant string. Use `std::vformat(runtime_string, std::make_format_args(x))` with named lvalue variables when the format string is dynamic.

## Choosing the right utility abstraction

Matching each tool to its ownership and dispatch trade-offs prevents accidental heap allocations, broken `const` invariants, and unchecked runtime formatting errors.

| Type | Heap allocation | Copyable vs move-only | Failure or empty behavior | Best use case |
| --- | --- | --- | --- | --- |
| `std::optional<T>` | Never (inline) | Inherits from `T` | `.value()` throws; `*opt` is UB | Nullable values and optional fields |
| `std::variant<Ts...>` | Never (inline) | Inherits from `Ts...` | `std::get` throws; may go valueless on throw | Closed AST/state machine alternatives |
| `std::any` | SBO then heap | Requires `CopyConstructible` | `any_cast` throws or returns `nullptr` | Open heterogeneous property bags |
| `std::function<Sig>` | SBO then heap | Requires `CopyConstructible` | Empty call throws `bad_function_call` | Legacy copyable callbacks |
| `std::move_only_function<Sig>` | SBO then heap | Move-only (`const`/`noexcept` safe) | Empty call is UB | Modern single-owner tasks and handlers |

## What to remember

- Use `std::optional` monadic methods (`and_then`, `transform`, `or_else`) to chain nullable computations cleanly without heap allocation.
- Prefer `std::visit(overloaded{...}, v)` over `get_if` chains so the compiler enforces handling of every `std::variant` alternative.
- Switch callbacks from `std::function` to C++23 `std::move_only_function` to accept `std::unique_ptr` captures and preserve `const` and `noexcept` qualifiers.
- `std::format` and `std::print` validate format strings at compile time via `consteval` `std::format_string`; use `std::vformat` with lvalue arguments only when runtime format strings are unavoidable.
