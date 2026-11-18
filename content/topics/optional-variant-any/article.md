---
title: "optional, variant and any"
summary: "Three vocabulary types answer three different questions. optional is a value or nothing, variant is exactly one of a closed list, and any is one of an open set, checked at run time. Each has a precise rule for how it can be wrong, and those rules are the part worth knowing."
track: "utilities"
minutes: 14
standard:
  - "[optional]"
  - "[optional.observe]"
  - "[optional.comp.with.t]"
  - "[variant]"
  - "[variant.ctor]"
  - "[variant.assign]"
  - "[variant.mod]"
  - "[variant.visit]"
  - "[variant.get]"
  - "[any]"
  - "[any.cons]"
cppreference:
  - title: "std::optional"
    path: "utility/optional"
  - title: "std::variant"
    path: "utility/variant"
  - title: "std::variant::valueless_by_exception"
    path: "utility/variant/valueless_by_exception"
  - title: "std::visit"
    path: "utility/variant/visit"
  - title: "std::any"
    path: "utility/any"
  - title: "std::any_cast"
    path: "utility/any/any_cast"
prerequisites:
  - "copy-and-move"
  - "exceptions-and-stack-unwinding"
---

## The one idea

These three types are all "a value that might be one of several things", and they differ in who knows the answer. With `optional<T>`, the type says the choices are a `T` or nothing. With `variant<A, B, C>`, the type lists every alternative, so the compiler can check that you handled all of them. With `any`, the type says nothing; only the object knows what it holds, and the check moves to run time.

All three store the value inside the object. None of them allocates for `optional` or `variant`; the standard forbids it. `any` is allowed to allocate and usually does for large types.

> **Mental model.** `optional` adds one state to a type, `variant` makes a tagged union you cannot misread, and `any` is a type-erased box that remembers only what it was constructed from.

The monadic operations of `optional` (`and_then`, `transform`, `or_else`) and `std::expected` belong to the topic on `optional-expected-and-error-codes`; this one is about the state model of each type.

## optional: engaged or empty

An `optional<T>` is either engaged, holding a `T`, or empty. The two ways to read it differ in what happens when you are wrong.

```cpp
#include <optional>
#include <cstdio>

int main() {
  std::optional<int> o;
  try {
    (void)o.value();             // throws std::bad_optional_access
  } catch (const std::bad_optional_access&) {
    std::puts("empty");
  }
  // *o;                         // undefined behavior: precondition is has_value()
  std::printf("%d\n", o.value_or(7));  // 7
}
```

`operator*` and `operator->` have the precondition that the optional is engaged, and violating it is undefined behavior. `value()` checks and throws `bad_optional_access`. Use `*` after a test, and `value()` or `value_or` when you do not want to prove it.

### Assignment follows the engaged states

Assigning to an optional does whatever the pair of states calls for. If both sides are engaged, the contained value is assigned. If the target is empty and the source is engaged, a value is constructed. If the target is engaged and the source is empty, the value is destroyed. If both are empty, nothing happens. Assigning a plain `T` works like the first two cases. `emplace` is different: it always destroys the old value first and then constructs the new one, so it needs no assignment operator.

```cpp
#include <optional>
#include <cstdio>

struct Noisy {
  Noisy() = default;
  Noisy(int) { std::puts("construct"); }
  Noisy& operator=(int) { std::puts("assign"); return *this; }
};

int main() {
  std::optional<Noisy> o;
  o = 1;   // construct: the optional was empty
  o = 2;   // assign: the optional was engaged
  o = {};  // destroys the value; o is empty again
}
```

### The `optional<bool>` trap

`optional` converts to `bool` to ask whether it is engaged, not what it holds. For `optional<bool>`, the two questions look identical and are not.

```cpp
#include <optional>
#include <cstdio>

int main() {
  std::optional<bool> flag = false;
  if (flag) std::puts("engaged");   // prints: the test is has_value()
  if (*flag) std::puts("true");     // does not print
}
```

The conversion is `explicit`, so `bool b = flag;` does not compile, but contexts such as `if`, `!` and `&&` still apply it. When the payload is a boolean, say `flag.has_value()` or `flag.value_or(false)` so the reader can tell which you meant.

### Comparisons

Comparing two optionals treats an empty one as smaller than any engaged one, and two empty ones as equal. Comparing an optional with a plain `T` compares the value if engaged, and an empty optional is less than every `T`.

```cpp
#include <optional>
#include <cstdio>

int main() {
  std::optional<int> n;                           // empty
  std::printf("%d %d %d\n", n < 0, n == 0, n < -1);  // 1 0 1
  std::printf("%d\n", n == std::nullopt);            // 1
}
```

Ordering is therefore total, which makes optionals usable as keys, but it can surprise: an empty optional is below `INT_MIN`.

## variant: a union that knows what it holds

A `variant<A, B, C>` holds exactly one alternative, and `index()` says which. A default-constructed variant holds a value-initialized first alternative, so if the first type has no default constructor, the variant does not either. The standard remedy is `std::monostate`, an empty type with all comparisons equal, placed first.

```cpp
#include <variant>
#include <string>
#include <cstdio>

struct NoDefault { NoDefault(int) {} };

int main() {
  std::variant<std::string, int> a;            // holds "" at index 0
  std::variant<std::monostate, NoDefault> b;   // OK because of monostate
  std::printf("%zu %zu\n", a.index(), b.index());  // 0 0
}
```

Duplicate alternatives are legal, but then the type-based accessors are ambiguous. You reach them with `in_place_index<N>` and `get<N>`.

### get, get_if and visit

`get<T>(v)` or `get<N>(v)` returns a reference and throws `bad_variant_access` if the variant holds something else. `get_if<T>(&v)` takes a pointer and returns a pointer, null on mismatch, so it fits in an `if` and cannot throw. `holds_alternative<T>(v)` only asks the question.

`std::visit` is the way to handle every alternative. It calls a callable with the held value, and the compiler requires that the callable accepts all of them.

```cpp
#include <variant>
#include <string>
#include <cstdio>

template <class... Ts> struct overloaded : Ts... { using Ts::operator()...; };

int main() {
  std::variant<int, std::string> v = std::string("hi");
  std::visit(overloaded{
    [](int i)                { std::printf("int %d\n", i); },
    [](const std::string& s) { std::printf("string %s\n", s.c_str()); },
  }, v);                                        // string hi
}
```

The `overloaded` idiom inherits every lambda's call operator, so overload resolution picks the arm. Since C++20 the deduction guide it needed in C++17 is generated automatically for aggregates. Adding a new alternative makes any visitor that does not cover it fail to compile, which is the reason to prefer `visit` over a chain of `holds_alternative` tests. All arms must return the same type unless you name one with `visit<R>` (C++20).

### The converting constructor

Initializing a variant from a value picks the alternative by overload resolution over an imaginary function `F(T_i)` for each alternative. Originally this admitted far too much: `variant<bool, string>` built from a string literal picked `bool`, because pointer-to-bool is a standard conversion and beat the user-defined conversion to `string`.

The fix, P0608R3 plus P1957R2 for the pointer case, was adopted for C++20 and is applied by current library implementations to older modes as well. Alternatives that would need a narrowing conversion are not candidates, and pointer-to-bool counts as narrowing.

```cpp
#include <variant>
#include <string>
#include <cstdio>

int main() {
  std::variant<bool, std::string> v = "hello";
  std::printf("%zu\n", v.index());   // 1: string; bool is not a candidate
  // std::variant<int, double> w = 1L;  // ill-formed: both conversions narrow
}
```

If two alternatives accept the argument equally well, there is no unique choice and the constructor is not available. `variant<int, int> v = 5;` is ill-formed for that reason; write `variant<int, int> v{std::in_place_index<0>, 5};`.

### valueless_by_exception

A variant has to hold something, but changing alternative is a destroy followed by a construct, and the construct can throw. With no allocation allowed, the old value cannot be kept, so the variant may end up in a state where it holds nothing. That is `valueless_by_exception()`. Then `index()` returns `variant_npos`, `get` throws `bad_variant_access`, and `visit` throws `bad_variant_access`.

```cpp
#include <variant>
#include <string>
#include <cstdio>

struct Bad {
  Bad(int) {}
  Bad(const Bad&) { throw 1; }
};

int main() {
  std::variant<std::string, Bad> v = "text";
  try { v = Bad{1}; } catch (int) {}
  std::printf("%d\n", v.valueless_by_exception());  // 1 with libstdc++
}
```

> **Standardese.** [variant.mod] and [variant.assign] say that if an exception is thrown while initializing the new alternative during `emplace` or a type-changing assignment, the variant might not hold a value. Move assignment between different alternatives, where the move constructor throws, is the case cppreference lists as always producing the valueless state. Implementations may avoid it by building a temporary first when the alternative's move is `noexcept`, so what the example prints is implementation behavior, not a promise.

The practical rule: keep alternatives nothrow-movable and valueless is nearly unreachable, and `std::visit` throwing on it is then a bug check rather than a case to handle.

## any: type erasure with a run-time check

`std::any` holds a copy of any copy-constructible value. It stores the decayed type, so `any a = "hello"` holds a `const char*`, not a `std::string`. The standard encourages implementations to keep small objects inside the `any` and avoid allocating, but does not require it, and what counts as small differs by library.

Copyability is a hard requirement because an `any` can itself be copied, and the copy must work for whatever it holds. That rules out `unique_ptr` and other move-only types, even if you never copy the `any`.

```cpp
#include <any>
#include <memory>
#include <string>
#include <cstdio>

int main() {
  std::any a = std::string("s");
  // std::any b = std::make_unique<int>(1);    // ill-formed: not copy-constructible
  std::printf("%d\n", std::any_cast<std::string>(&a) != nullptr);  // 1
  std::printf("%d\n", std::any_cast<int>(&a) != nullptr);          // 0
}
```

### any_cast has three shapes

`any_cast<T>(any&)` and `any_cast<T>(const any&)` return a value, and `any_cast<T&>` returns a reference. All of them throw `bad_any_cast` on a mismatch. The overload taking a pointer, `any_cast<T>(&a)`, returns a pointer and gives null on mismatch.

The match is exact, by dynamic type. There are no conversions, so an `any` holding an `int` does not yield a `long`, and one built from a literal does not yield a `std::string`.

```cpp
#include <any>
#include <string>
#include <cstdio>

int main() {
  std::any a = "hello";                  // holds const char*
  try {
    (void)std::any_cast<std::string>(a);
  } catch (const std::bad_any_cast&) {
    std::puts("bad_any_cast");           // printed
  }
  std::string s = std::any_cast<const char*>(a);  // OK: a const char* converts here
  std::printf("%s\n", s.c_str());
}
```

Use `any` when the set of types really is open, for example at a plugin boundary. If you can list the types, a `variant` is checked at compile time, cheaper, and cannot hold surprises.

## Choosing between them

| Need | Use |
| --- | --- |
| A value that may be absent | `optional<T>` |
| One of a known, closed set of types | `variant<...>` |
| An open set of types, checked at run time | `any` |
| Absent or an error value | `expected` (see the sibling topic) |

> **Pitfall.** `if (opt)` on an `optional<bool>`, and `get<T>(v)` on a variant that holds a different type, both compile and both do the wrong thing in a way tests with `true` data will not catch. Use `has_value()`, `get_if` and `visit`, which say what you mean.

## What to remember

- `optional`: `*o` on an empty optional is undefined behavior, `value()` throws `bad_optional_access`, and `value_or` supplies a fallback.
- Assigning an optional constructs, assigns or destroys according to which side is engaged; `emplace` destroys then constructs.
- `if (optional<bool>)` tests engagement, not the boolean. An empty optional compares less than every value and equal to `nullopt`.
- A default-constructed `variant` holds its first alternative, so use `monostate` first when that type has no default constructor.
- `get` throws on the wrong alternative, `get_if` returns null, and `visit` with an `overloaded` set checks at compile time that every alternative is handled.
- The converting constructor ignores narrowing candidates since the C++20 fix, so `variant<bool, string>` from a literal holds the string; ambiguous cases are ill-formed.
- A variant can become valueless after an exception during a type change; `index()` is then `variant_npos` and `visit` throws.
- `any` stores the decayed type and requires it to be copy constructible; `any_cast` matches the exact type, and the pointer form returns null instead of throwing.
