---
title: "Conversion functions and explicit"
summary: "A class can convert from other types through converting constructors and to other types through conversion functions. The language applies at most one of these implicitly, and `explicit` removes a conversion from the implicit contexts without removing it from direct initialization."
track: "classes"
minutes: 12
standard:
  - "[class.conv]"
  - "[class.conv.general]"
  - "[class.conv.ctor]"
  - "[class.conv.fct]"
  - "[dcl.fct.spec]"
  - "[conv.general]"
  - "[over.match.copy]"
  - "[over.match.conv]"
  - "[over.match.ctor]"
  - "[over.match.list]"
  - "[over.best.ics]"
  - "[temp.deduct.conv]"
cppreference:
  - title: "Converting constructor"
    path: "language/converting_constructor"
  - title: "User-defined conversion function"
    path: "language/cast_operator"
  - title: "explicit specifier"
    path: "language/explicit"
  - title: "Copy-initialization"
    path: "language/copy_initialization"
  - title: "Implicit conversions"
    path: "language/implicit_conversion"
prerequisites:
  - "implicit-conversions"
  - "initialization-forms"
  - "overload-resolution"
---

## The one idea

A user-defined conversion is a function call the compiler inserts for you. There are two ways to write one. A **converting constructor** of `T` turns some other type into a `T`. A **conversion function** `operator U()` of `T` turns a `T` into a `U`. Either way, the compiler may insert at most one such call into an implicit conversion, surrounded by ordinary standard conversions.

`explicit` does not delete a conversion. It moves it out of the contexts where the compiler inserts conversions silently, mainly copy-initialization, and leaves it available where you asked for a `T` by name: direct-initialization, casts, and for `operator bool`, the conditions of `if` and loops.

> **Mental model.** An implicit conversion sequence is standard conversions, then at most one user-defined call, then standard conversions. `explicit` means "only when I write the target type myself".

## Converting constructors and conversion functions

Any constructor that is not `explicit` is a converting constructor, including ones with several parameters, which convert from braced lists. A conversion function is a member named `operator` followed by a type. It has no parameters and no declared return type, can be `const`, `virtual`, or a template, and since C++14 may be `operator auto()` with a deduced type.

Some conversion functions are never used implicitly. [class.conv.fct] says a conversion function is never used to convert an object to its own type, to a base class, or to `void`. Converting to a base is handled by the derived-to-base conversion, so the function would be dead code; GCC and Clang both warn with `-Wclass-conversion`.

Conversion functions are inherited like other members and may be virtual, so a call through a base reference can convert using the derived class's override. A conversion function in a derived class hides one in a base only when both convert to the same type; `operator long()` in the derived class leaves the base's `operator int()` visible.

`explicit` matters for constructors with several parameters too, because braced lists use them. With `explicit S(int, int)`, both `S s = {1, 2};` and `return {1, 2};` are ill-formed, while `S s{1, 2};` is fine.

```cpp
#include <cstdio>
struct B {};
struct D : B { operator B() const { std::puts("conv"); return {}; } };

void slice(D d) {
  B b = d;   // copies the B subobject; the conversion function is not called
  (void)b;
}
```

## The one-user-defined-conversion limit

[class.conv.general] says at most one user-defined conversion is implicitly applied to a single value. Standard conversions on either side do not count, so `int` to a class taking `double`, or a class with `operator long()` to `short`, are fine. Two class hops are not.

```cpp
#include <string>
struct Name { Name(std::string) {} };
void greet(Name);

void use() {
  // greet("bob");                // ill-formed: const char* -> std::string -> Name is two
  greet(std::string("bob"));      // OK: one user-defined conversion
  greet(Name("bob"));             // OK: the parameter of Name(std::string) gets the one hop
}
```

The limit is per value, not per expression. In `Name("bob")` the compiler is initializing the parameter of `Name`'s constructor, and that initialization may use its own conversion. The same is why `B b(1);` works when `B` has a constructor from `A` and `A` has a constructor from `int`, while `B b = 1;` does not: direct-initialization calls a `B` constructor whose parameter is converted from `1` in one hop, whereas copy-initialization needs one implicit conversion from `int` all the way to `B`.

The limit also shapes overload resolution. Two user-defined conversion sequences can be ranked against each other only when they use the same constructor or conversion function. If `f(A)` and `f(B)` both exist and `A` and `B` both have a constructor from `int`, then `f(1)` is ambiguous: each candidate needs a different user-defined conversion, and neither is better.

## Copy-initialization and direct-initialization pick from different sets

The two forms of initialization build different candidate sets, and most surprises come from that.

For `T t = u;` with `u` of another type, [over.match.copy] takes the converting constructors of `T` and the non-explicit conversion functions of `u`'s type that yield `T` or a derived class. Explicit constructors are not candidates at all, so a worse non-explicit one can win.

For `T t(u);`, [over.match.ctor] takes all constructors of `T`, explicit or not. The argument may then use a conversion function of `u` to reach a constructor's parameter type.

```cpp
#include <cstdio>
struct S {
  explicit S(int) { std::puts("int"); }
  S(double)       { std::puts("double"); }
};

int main() {
  S a = 1;   // prints double: S(int) is not a candidate
  S b(1);    // prints int
}
```

Copy-list-initialization is different again. For `S s = {1};`, [over.match.list] considers all constructors, explicit included, and if an explicit one wins, the program is ill-formed. It does not fall back to `S(double)`.

When the target is not a class, [over.match.conv] applies. Copy-initialization considers the non-explicit conversion functions that yield the target or something a standard conversion turns into it. Direct-initialization adds the explicit ones, but only those whose result reaches the target through at most a qualification conversion. An `explicit operator int()` therefore makes `int i(e);` well-formed and `long l(e);` ill-formed.

> **Standardese.** [over.match.conv] adds explicit conversion functions to the candidates only for direct-initialization, and only those yielding the target type or a type convertible to it by a qualification conversion. A promotion or integral conversion after an explicit conversion function is not allowed.

## Constructor versus conversion function

When both `A(const B&)` and `B::operator A() const` exist, copy-initializing an `A` from a `B` puts both in one candidate set. Both bind the `B` to a `const B&`, one as the constructor's parameter and one as the implicit object parameter, so neither is better and the conversion is ambiguous.

```cpp
struct B;
struct A { A() = default; A(const B&); };
struct B { operator A() const; };

// A a = B{};   // ill-formed: ambiguous between A(const B&) and B::operator A
```

Clang rejects this. GCC 16 accepts it by default as an extension and calls the constructor, and diagnoses the ambiguity under `-pedantic-errors`. Do not rely on the extension. Direct-initialization `A a(B{});` is not ambiguous, because only constructors of `A` are candidates, and `A(const B&)` beats `A(A&&)`, which would need the conversion function as a user-defined conversion. Small changes tip the balance: if `operator A()` is not `const`, it wins copy-initialization outright, because binding the non-const implicit object parameter is better than binding `const B&`.

> **Pitfall.** Providing a conversion in both directions, or in both classes, is almost always a mistake. Pick one owner for each conversion.

## explicit, explicit(bool), and contextual conversion to bool

Before C++11, a class that wanted to be testable in `if (p)` had to convert to something, and `operator bool()` let it be added to integers, compared with unrelated classes, and passed to `int` parameters. The safe-bool idiom worked around this by converting to a pointer to member, which could be tested but not used in arithmetic. C++11 replaced it with `explicit operator bool`.

An explicit conversion to `bool` is used only where the language **contextually converts to bool**: the conditions of `if`, `while`, `for` and `do`, the operands of `!`, `&&` and `||`, the first operand of `?:`, `static_assert`, and `noexcept(expr)`. It is also used by direct-initialization of a `bool`. It is not used for `bool b = f;`, for `return f;` in a function returning `bool`, or for `f == true`.

```cpp
struct F { explicit operator bool() const { return true; } };

bool test(F f) {
  if (f) {}             // OK: contextual
  bool a = !f;          // OK: contextual
  bool b(f);            // OK: direct-initialization
  // bool c = f;        // ill-formed: copy-initialization
  // int  i(f);         // ill-formed: bool -> int is not a qualification conversion
  return a || b;        // OK; plain "return f;" would be ill-formed
}
```

C++20 added `explicit(bool)`, whose operand is a constant expression of type `bool`, typically one that depends on template parameters. It lets one constructor template be implicit exactly when the underlying conversion is, which is how `std::pair` and `std::optional` became conditionally explicit without duplicated overloads.

```cpp
#include <string>
#include <type_traits>

template<class T> struct Wrap {
  T v;
  template<class U>
  explicit(!std::is_convertible_v<U, T>) Wrap(U&& u) : v(static_cast<U&&>(u)) {}
};

Wrap<std::string> a = "hi";                     // OK: const char* converts implicitly
Wrap<std::string> b(std::string_view("hi"));    // OK: direct-initialization
// Wrap<std::string> c = std::string_view("hi"); // ill-formed: explicit here
```

Mark single-argument constructors and conversion functions `explicit` by default. The exceptions are types meant to be interchangeable with their source, like `std::string` from `const char*`.

## Conversion function templates

A conversion function may be a template. Its template arguments are deduced from the type the conversion is needed for, not from any argument. [temp.deduct.conv] strips references and top-level cv-qualifiers from that required type before deducing, so converting to `const int&` deduces `int`.

```cpp
struct Any {
  template<class T> operator T() const { return T{}; }
};

int i = Any{};          // T = int
const int& r = Any{};   // T = int, and r binds to a temporary
double d = Any{};       // T = double
```

Such a type converts to everything, which makes it useful for test doubles and for proxy objects, and dangerous in overload sets, where it makes every overload viable. Constrain the template, for example with a concept, to keep it from matching by accident.

## What to remember

- An implicit conversion contains at most one user-defined conversion, with standard conversions allowed before and after.
- A conversion function to the class itself, a base, or `void` is never used implicitly.
- Copy-initialization excludes explicit constructors from the candidates; copy-list-initialization includes them and is ill-formed if one wins.
- Direct-initialization considers explicit constructors, and explicit conversion functions followed by at most a qualification conversion.
- `explicit operator bool` works in conditions, `!`, `&&`, `||`, `?:` and `static_assert`, but not in `return`, `==` or `bool b = f;`.
- A converting constructor and a matching `const` conversion function make copy-initialization ambiguous; GCC accepts it only as an extension.
- `explicit(bool)` (C++20) makes a constructor conditionally explicit.
- Conversion function templates deduce from the target type with references and top-level cv removed.
