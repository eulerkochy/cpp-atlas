---
title: "Reference binding and temporaries"
summary: "Which expressions bind to T&, const T&, and T&&, when implicit conversions silently materialize fresh temporaries, why lifetime extension stops at function boundaries, and C++23 range-for fixes."
track: "value-semantics"
minutes: 10
standard:
  - "[dcl.init.ref]"
  - "[class.temporary]"
  - "[stmt.ranged]"
  - "[dcl.ref]"
  - "[meta.unary.prop]"
cppreference:
  - title: "Reference initialization"
    path: "language/reference_initialization"
  - title: "Reference declaration"
    path: "language/reference"
  - title: "Lifetime"
    path: "language/lifetime"
  - title: "Range-based for loop"
    path: "language/range-for"
  - title: "Implicit conversions"
    path: "language/implicit_conversion"
  - title: "std::reference_constructs_from_temporary"
    path: "types/reference_constructs_from_temporary"
  - title: "std::reference_converts_from_temporary"
    path: "types/reference_converts_from_temporary"
prerequisites:
  - "value-categories"
  - "casts-and-qualifiers"
---

References look like simple aliases, yet two rules make them a prime source of silent dangling bugs: references can trigger implicit conversions that materialize unexpected temporary objects, and lifetime extension stops abruptly across function calls and constructors. Knowing exactly when a reference aliases an existing object versus when it anchors a freshly created temporary prevents subtle use-after-free bugs.

## The reference-binding matrix

C++ offers four reference types with strict rules over which value categories and cv-qualifications they accept (`[dcl.init.ref]`). Note that `const T&&` exists in the grammar, though almost its only practical use is writing `= delete` overloads (such as `std::as_const(const T&&) = delete;`) to reject rvalues cleanly.

| Reference parameter | Mutable `lvalue` (`T`) | `const lvalue` (`const T`) | Mutable `xvalue` / `prvalue` (`T`) | `const xvalue` / `prvalue` (`const T`) |
| --- | --- | --- | --- | --- |
| `T&` | Binds directly | Rejected | Rejected | Rejected |
| `const T&` | Binds directly | Binds directly | Binds (materializes prvalue) | Binds (materializes prvalue) |
| `T&&` | Rejected | Rejected | Binds (materializes prvalue) | Rejected |
| `const T&&` | Rejected | Rejected | Binds (materializes prvalue) | Binds (materializes prvalue) |

Two rules stand out immediately:

1. Non-const `T&` refuses rvalues because mutating an expiring temporary through a caller's output parameter is almost always a bug.
2. `const T&` binds every value category—and goes even further by invoking implicit conversions when types do not match directly.

> **Mental model.** A reference does not necessarily alias the exact expression you wrote; when types differ or a prvalue appears, `const T&` and `T&&` may silently materialize a brand-new temporary object just for the reference to hold onto.

## Silent temporaries during implicit conversion

Because `const T&` accepts convertible expressions of a different type, writing `double ratio = 3.75; const int& r = ratio;` compiles cleanly—and creates a **brand-new `int{3}` temporary** on the stack rather than aliasing `ratio`. Updating `ratio = 9.5;` leaves `r` equal to `3`! The exact same temporary materialization happens when passing `"hello"` to a function expecting `const std::string&`: a temporary `std::string` allocates, copies `"hello"`, binds to the parameter, and destroys when the full-expression ends.

> **Pitfall.** Binding `const T&` to a different or convertible type creates a hidden temporary object rather than aliasing the original variable—and silently dangles if stored in a reference member or returned from a function.

C++23 introduced `<type_traits>` predicates `std::reference_constructs_from_temporary_v<T, U>` and `std::reference_converts_from_temporary_v<T, U>` (`[meta.unary.prop]`) so generic containers like `std::tuple` and `std::pair` can detect and reject dangling bindings at compile time. Note carefully that passing a non-reference `U` (such as `std::string`) checks binding from a `U` **prvalue** (which does materialize a temporary), whereas `std::string&` checks an lvalue:

```cpp
#include <string>
#include <type_traits>

static_assert(std::reference_converts_from_temporary_v<const int&, double>);
static_assert(std::reference_converts_from_temporary_v<const std::string&, const char*>);
static_assert(std::reference_converts_from_temporary_v<const std::string&, std::string>);
static_assert(!std::reference_converts_from_temporary_v<const std::string&, std::string&>);

void implicit_temp_proof() {
    double d = 3.75;
    const int& r = d; // Binds to a temporary int{3}, NOT to d
    d = 9.5;          // r still reads 3!
    (void)r;
}
```

## Temporary lifetime and direct lifetime extension

Under `[class.temporary]`, temporary objects materialized during a full-expression are destroyed as the last step of evaluating that full-expression (typically at the semicolon), in strict reverse order of their creation.

A single narrow rule alters that schedule: **direct lifetime extension** (`[class.temporary]`). When a temporary is bound **directly** to a local reference variable (`const T&` or `T&&`), that temporary's lifetime extends to match the lifetime of the reference itself—including when binding to a direct non-static data member subobject (`const int& id = make_pair().first;`) or initializing a reference field of an aggregate (`struct View { const std::string& s; }; View v{"hi"};`). Notice that in `const int& id = make_pair().first;`, the **entire** `std::pair` temporary stays alive until `id` leaves scope, not only `.first`.

> **Standardese.** Under `[class.temporary]`, when a reference binds directly to a temporary prvalue or a member subobject thereof, that temporary's lifetime expands to match the reference's scope—except across specific syntactic boundaries listed by the standard.

## Five boundaries where lifetime extension stops

Lifetime extension is shallow and purely syntactic. The moment indirection enters, the temporary resumes dying at the full-expression's semicolon:

1. **Passing through a function returning a reference**: In `const T& r = identity(make_t());` (where `identity` returns `const T&`), the compiler cannot track provenance across function bodies, so `make_t()` dies at the semicolon and `r` dangles immediately.
2. **Member accessors and views (`make_vec().front()` or `std::string_view(make_str())`)**: Because `.front()` and `std::string_view` conversion are function calls rather than direct member subobject accesses, the owning `vector` or `string` dies at the semicolon while `r` or the view still points into freed storage.
3. **Constructor member initializers**: Binding a temporary to a reference member inside a constructor initializer list (`Holder(const T& t) : ref(t) {}` or `Holder() : ref(T{}) {}`) never extends the temporary beyond the constructor's full-expression.
4. **`return` statements**: Binding a local reference inside a `return` statement (`const T& x = make_t(); return x;`) destroys the temporary when the function stack frame unwinds.
5. **`new` expressions**: Temporaries bound within a `new` initializer do not outlive the full-expression containing `new`.

```cpp
#include <string>
#include <vector>

struct Wrapper {
    std::vector<int> items{10, 20, 30};
    const std::vector<int>& get_items() const { return items; }
};

Wrapper make_wrapper() { return Wrapper{}; }

void boundary_demo() {
    // Extended: direct binding to data member subobject of temporary Wrapper
    const std::vector<int>& safe = make_wrapper().items;

    // DANGLES immediately at semicolon: get_items() is a function call!
    // const std::vector<int>& bad = make_wrapper().get_items();
    (void)safe;
}
```

## Range-based for loops and C++23 P2718

For over a decade, range-based `for` loops suffered from one of C++'s sharpest traps. Because `for (auto x : range_expr)` expands roughly to `auto&& __range = range_expr;`, any outer temporary behind a chained accessor died at the semicolon **before the first loop iteration ever executed**:

```cpp
#include <vector>

struct RangeBox {
    std::vector<int> items{1, 2, 3};
    const std::vector<int>& get_items() const { return items; }
};

RangeBox make_box() { return RangeBox{}; }

// Pre-C++23: UB! RangeBox temporary died before the loop body started!
// C++23 (P2718R0): Well-defined! All range-initializer temporaries live across the loop.
void iterate_temporaries() {
    for (int v : make_box().get_items()) {
        (void)v;
    }
}
```

In C++11 through C++20, `make_box().get_items()` extended nothing because `__range` bound to the `const std::vector<int>&` returned by `get_items()`, leaving the outer `RangeBox` temporary to destruct immediately. C++23 paper **P2718R0** (`[stmt.ranged]`) changed the specification so that **all temporaries created inside the range-initializer expression** remain alive until the entire range-based `for` loop completes (and are destroyed in reverse order after the loop exits). Until your whole toolchain targets C++23 or newer, binding `auto box = make_box();` into a named variable before the loop remains the safest portable habit.

## What to remember

- `T&` binds only mutable lvalues, `T&&` binds only mutable rvalues, and `const T&` binds everything—including convertible types that materialize hidden temporaries.
- Direct reference binding extends a temporary (or whole object containing a bound data member or aggregate reference field) to the reference's scope.
- Lifetime extension stops cold at function calls (`std::string_view`, `.front()`, `identity()`), constructor initializer lists, `return` statements, and `new` expressions.
- C++23 (P2718R0) extends all temporaries in a range-based `for` initializer across the entire loop, fixing the classic `for (x : make().get_items())` dangling bug.
