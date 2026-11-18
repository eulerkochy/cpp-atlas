---
title: "Enumerations and unions"
summary: "An enumeration is an integer type with named values and a precisely defined set of valid values; a union is storage for one of several objects at a time. Both are easy to misuse, because the language lets you hold values and read members it has not promised you."
track: "types-and-initialization"
minutes: 12
standard:
  - "[dcl.enum]"
  - "[enum.udecl]"
  - "[expr.static.cast]"
  - "[dcl.init.list]"
  - "[utility.underlying]"
  - "[class.union]"
  - "[class.union.anon]"
  - "[class.mem.general]"
cppreference:
  - title: "Enumeration declaration"
    path: "language/enum"
  - title: "std::to_underlying"
    path: "utility/to_underlying"
  - title: "std::underlying_type"
    path: "types/underlying_type"
  - title: "Union declaration"
    path: "language/union"
  - title: "std::variant"
    path: "utility/variant"
prerequisites:
  - "fundamental-types-and-arithmetic-conversions"
  - "initialization-forms"
  - "object-lifetime-and-storage"
---

## The one idea

An enumeration is a distinct type whose representation is an integer type, called its **underlying type**. Its enumerators are named constants, but its set of valid values is usually larger than the enumerators and sometimes smaller than the underlying type. Converting a value outside that set is not a wrap-around; since C++17 it is undefined behavior.

A union is a class whose non-static data members all share the same storage, so at most one of them is alive at any moment. That member is the **active member**. The language does not track which one it is; you must. Reading any other member reads an object whose lifetime has not begun, which is undefined behavior, with one carefully bounded exception.

> **Mental model.** An enum is an integer with a fence around its legal values, and a union is a box that holds one object at a time. Neither checks at run time, so both are only as safe as the code that remembers what is inside.

## Scoped and unscoped enumerations

An unscoped enumeration, `enum Color { red, green };`, puts its enumerators into the enclosing scope, and its values convert implicitly to integers through integral promotion. A scoped enumeration, `enum class Color { red, green };`, keeps its enumerators inside its own scope, so you must write `Color::red`, and it never converts implicitly to anything. The conversion requires a `static_cast` or `std::to_underlying`.

```cpp
enum Fruit { apple, pear };
enum class Color { red, green };

int a = pear + 1;                       // fine: Fruit promotes to int
// int b = Color::green;                // ill-formed: no implicit conversion
int c = static_cast<int>(Color::green); // fine: explicit
```

The **underlying type** of a scoped enumeration is `int` unless you name another with `enum class E : std::uint8_t`. For an unscoped enumeration you may also fix it with `: type`. If you do not, the underlying type is an implementation-defined integral type able to represent every enumerator, and it is not larger than `int` unless some enumerator needs it. `std::underlying_type_t<E>` names it, and C++23 adds `std::to_underlying(e)` in `<utility>` as shorthand for `static_cast<std::underlying_type_t<E>>(e)`.

Implicit conversions of unscoped enumerations are also being narrowed. C++20 deprecated arithmetic between two different enumeration types and between an enumeration and a floating-point type. C++26 (P2864) removes those conversions; GCC 16 reports them with a warning.

## The range of values, and what is undefined

Which integers is an enumeration allowed to hold? [dcl.enum] gives two answers.

- With a **fixed underlying type**, which every scoped enumeration has, the values are exactly the values of the underlying type. `enum class Id : std::uint32_t {}` has no enumerators, yet every `uint32_t` is a valid `Id`.
- Without one, the values are those of the smallest bit-field that can hold every enumerator. For `enum Small { a = 1, b = 4 };` that is three unsigned bits, so the valid values are 0 through 7. If an enumerator is negative, the range is the corresponding two's complement range.

Converting an integer to an enumeration with `static_cast` gives the corresponding value when it is in range. For a fixed underlying type, the integer is first converted to that type, which is ordinary integral conversion and always defined. For an enumeration without a fixed type, an out-of-range value gave an unspecified result before C++17. Since C++17, through CWG 1766, the behavior is undefined.

```cpp
enum Small { a = 1, b = 4 };     // values 0 to 7

constexpr Small ok = static_cast<Small>(7);  // fine: in range, no enumerator needed
// constexpr Small bad = static_cast<Small>(8);
// undefined behavior; Clang rejects it as not a constant expression,
// GCC 16 accepts it
```

> **Standardese.** [expr.static.cast] says that if the enumeration type does not have a fixed underlying type and the value is outside its range of values, the behavior is undefined. The range is defined in [dcl.enum] as the values of the smallest bit-field that can store all the enumerators. Optimizers may assume an enum variable only holds such values; GCC exposes this as `-fstrict-enums`.

## Initializing enums from integers and `using enum`

Before C++17 the only way to make an `Id` from a number was a cast. P0138, in C++17, allows direct-list-initialization of an enumeration with a fixed underlying type from a single integer, without a cast. It is deliberately narrow: only braces without `=`, and narrowing is still forbidden.

```cpp
#include <cstdint>

enum class Id : std::uint32_t {};
enum class Byte : unsigned char {};

Id i{42};          // fine since C++17
// Id j = {42};    // ill-formed: copy-list-initialization
// Id k(42);       // ill-formed: parentheses do not get the new rule
// Id m = 42;      // ill-formed: no implicit conversion
// Byte n{300};    // ill-formed: 300 narrows to unsigned char
```

This is how `std::byte` is meant to be created: `std::byte b{0x2a};`.

C++20's `using enum` (P1099) brings all of a scoped enumeration's enumerators into the current scope. It works at namespace, class and block scope, and it removes the repetition from a `switch`.

```cpp
enum class Color { red, green };

int code(Color c) {
  switch (c) {
    using enum Color;
    case red:   return 1;   // Color::red
    case green: return 2;
  }
  return 0;
}
```

## Unions: one active member

Each non-static data member of a union is allocated as if it were the only member of a struct, so all of them start at the union's address, and the union is large enough for its largest member. A union may have member functions, including constructors and destructors, but no virtual functions, no base classes, and no reference members, and it may not be used as a base class.

Initialization makes a member active: aggregate initialization activates the first member, and a C++20 designator chooses another, as in `U u{.f = 1.5f};`. Assignment through the built-in or a trivial assignment operator starts the lifetime of the assigned member and ends the old one's. For a member with non-trivial construction you must end the old member's lifetime and construct the new one explicitly, with placement `new` or `std::construct_at`.

Reading an inactive member is undefined behavior, because it accesses an object that is not within its lifetime. Constant evaluation is required to reject core-language undefined behavior, which makes this easy to see.

```cpp
union U { int i; float f; };

constexpr float reinterpret() {
  U u{.i = 1};
  return u.f;    // reads the inactive member
}
// constexpr float x = reinterpret();
// ill-formed: not a constant expression, because u.f is not active
```

> **Pitfall.** Type punning through a union is valid C, and GCC documents it as supported, but it is undefined behavior in standard C++. To reinterpret bytes, use `std::bit_cast` (C++20) or `std::memcpy`; the strict-aliasing-and-undefined-behavior topic covers why.

### The common initial sequence

The one exception concerns structs that start the same way. If a standard-layout union holds several standard-layout structs, and the active one shares a **common initial sequence** with another, you may read a member of that common prefix through either struct. The common initial sequence is the longest run of leading members that correspond pairwise: layout-compatible types and matching bit-field widths, among a few other conditions. This is what makes the classic tagged-message layout work.

```cpp
#include <cstdio>

struct Circle { int tag; double radius; };
struct Rect   { int tag; long width; };
union Shape   { Circle c; Rect r; };

int main() {
  Shape s{.c = {1, 2.0}};
  std::printf("%d\n", s.r.tag);   // fine: tag is in the common initial sequence
  // s.r.width would be undefined: it is not part of the common prefix
}
```

## Anonymous unions and non-trivial members

An anonymous union, `union { int i; float f; };`, declares an unnamed object whose members are injected into the enclosing scope. It may have only public non-static data members: no member functions and no static members. In the global namespace or a named namespace it must be declared `static`. Placed inside a struct next to a tag, it is the usual hand-written tagged union, and the enclosing struct is called a union-like class.

Since C++11 a union may have members with non-trivial special member functions, such as `std::string`. The price is that the union's corresponding special member functions become deleted. Its default constructor is deleted unless some variant member has a default member initializer, and at most one may have one. Its destructor is deleted if a member has a non-trivial destructor, so you must write one, and since the union cannot know which member is active, that destructor usually does nothing and the owner destroys the active member by hand. These are the C++23 rules; C++26 relaxes some of them for unions through P3074, which GCC 16 does not yet implement.

```cpp
#include <memory>
#include <string>

union Slot {
  int i;
  std::string s;
  Slot() : i(0) {}   // required: the implicit default constructor is deleted
  ~Slot() {}         // required: the implicit destructor is deleted
};

void demo() {
  Slot slot;                          // i is active
  std::construct_at(&slot.s, "hi");   // now s is active
  std::destroy_at(&slot.s);           // end s before slot goes away
}
```

`std::variant` packages all of this safely. It stores the discriminator alongside the storage, constructs and destroys the active alternative for you, and turns a wrong-type access through `std::get` into a `std::bad_variant_access` exception rather than undefined behavior. Prefer it whenever you would otherwise write a tag and an anonymous union by hand; the optional-variant-any topic covers it in depth.

## What to remember

- Scoped enums have scoped names, no implicit conversions and a fixed underlying type, `int` by default.
- An enum with a fixed underlying type accepts every value of that type; one without accepts the values of the smallest bit-field holding its enumerators.
- Casting an out-of-range value to an enum without a fixed type is undefined since C++17 and gave an unspecified value before.
- Since C++17, `Id i{42};` initializes an enum with a fixed underlying type; `= {42}`, `(42)` and narrowing values do not.
- `using enum E;` (C++20) brings the enumerators into scope; `std::to_underlying` (C++23) converts back.
- A union has at most one active member, and reading another one is undefined behavior, except for the common initial sequence of standard-layout structs.
- Non-trivial union members delete the union's special members; construct and destroy the active member yourself.
- Use `std::bit_cast` for reinterpreting bytes and `std::variant` for a safe tagged union.
