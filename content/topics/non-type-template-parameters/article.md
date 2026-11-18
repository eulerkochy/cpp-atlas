---
title: "Non-type template parameters"
summary: "A non-type template parameter makes a compile-time value part of a type's identity. Which types may carry such values, which arguments are acceptable, and when two arguments name the same specialization all follow from one requirement, that the compiler must be able to decide template-argument equivalence."
track: "templates"
minutes: 12
standard:
  - "[temp.param]"
  - "[temp.arg.nontype]"
  - "[temp.type]"
  - "[expr.const]"
  - "[dcl.type.auto.deduct]"
  - "[expr.prim.lambda.closure]"
cppreference:
  - title: "Template parameters and template arguments"
    path: "language/template_parameters"
  - title: "Constant expressions"
    path: "language/constant_expression"
  - title: "Lambda expressions"
    path: "language/lambda"
prerequisites:
  - "template-instantiation-and-specialization"
  - "constant-expressions"
  - "template-argument-deduction"
  - "class-template-argument-deduction"
---

## The one idea

A non-type template parameter, or NTTP, puts a value into a type. `std::array<int, 3>` and `std::array<int, 4>` are different types because `3` and `4` are different values, and the program needs to agree, in every translation unit, on whether two template argument lists name the same specialization. That question is called template-argument equivalence.

Almost every rule about NTTPs exists to keep that question answerable at compile time, without running user code: which types are allowed, which arguments are acceptable, and why the parameter of class type behaves like an object while the parameter of `int` type does not.

> **Mental model.** An NTTP value is part of the mangled name. If the compiler could not write the value down and compare it member by member, the type is not allowed.

## Which types are allowed, by version

| Standard | Adds |
| --- | --- |
| C++98 | integral and enumeration types, pointers to objects and functions, lvalue references to objects and functions, pointers to members |
| C++11 | `std::nullptr_t` |
| C++17 | placeholder types: `auto` and `decltype(auto)` |
| C++20 | floating-point types and structural literal class types, plus arrays of these inside classes |

The parameter's declared type is adjusted like a function parameter's. An array type becomes a pointer, a function type becomes a pointer to function, and top-level cv-qualifiers are dropped, so `template<const int N>` declares a parameter of type `int`.

C++20 defines a **structural type** as a scalar type, an lvalue reference type, or a literal class type whose bases and non-static data members are all public and non-mutable, and whose base and member types are themselves structural or arrays of structural types. User-provided constructors are allowed, as long as the class is literal. The standard does not promise that library types are structural. In practice GCC and Clang accept `std::array` and `std::pair` of structural types, and reject `std::string` and `std::string_view`, whose members are private.

```cpp
#include <string>

struct Point { int x, y; };                 // structural
class Hidden { int v = 0; public: constexpr Hidden() = default; };
struct Cache { mutable int hits; };

template<Point P> struct A {};              // OK since C++20
template<double D> struct B {};             // OK since C++20
// template<Hidden H> struct C {};          // error: private member
// template<Cache K> struct E {};           // error: mutable member
// template<std::string S> struct F {};     // error: not structural
```

> **Standardese.** [temp.param] lists the permitted types: a structural type, a type containing a placeholder, or a placeholder for a deduced class type. The definition of structural type in the same section is what C++20 compilers check, and GCC and Clang both report "not a structural type" when it fails.

## Arguments are converted constant expressions

An argument for an NTTP of non-reference type must be a converted constant expression of the parameter's type, as defined in [expr.const]. Only a short list of conversions is allowed: integral promotions and integral conversions that are not narrowing, floating-point promotions and exact floating-point conversions, array-to-pointer and function-to-pointer conversions, qualification conversions, null pointer conversions from `std::nullptr_t`, and user-defined conversions built from these.

Two consequences surprise people. Narrowing is an error, even when the value would fit after wrapping. And an integer argument for a `double` parameter is rejected, because the integral-to-floating conversion is not on the list.

```cpp
template<unsigned char C> struct Byte {};
template<double D> struct Scale {};

Byte<200> ok;
// Byte<300> bad;     // error: narrowing conversion of 300
Scale<1.0> fine;
// Scale<1> no;       // error: int to double is not allowed here
```

For a class-type parameter, the argument copy-initializes the parameter, so a constexpr converting constructor works: given `struct Q { int v; constexpr Q(int x) : v(x) {} };`, writing `X<5>` for `template<Q P> struct X` is fine.

## Pointer and reference arguments

Before C++17, an argument for a pointer or reference parameter had to be spelled as the address of, or the name of, an object or function with linkage. C++17 relaxed that to any constant expression, then listed what the pointer or reference may not designate: a temporary, a string literal, the result of `typeid`, the predefined `__func__` variable, and, in C++17 only, any subobject. C++20 allows subobjects, so `&arr[1]` and `&obj.member` became valid arguments, while subobjects of the forbidden objects remain forbidden.

```cpp
template<const char* P> struct Tag {};
template<int* P> struct Slot {};
int arr[3];

// Tag<"hi"> t1;           // error: string literal
constexpr char name[] = "hi";
Tag<name> t2;              // OK: names an object with static storage
Slot<&arr[1]> s;           // OK since C++20; an error in C++17

void f() {
  static constexpr char local[] = "hi";
  Tag<local> t3;           // OK since C++17; C++14 required linkage
  (void)t3;
}
```

> **Pitfall.** A string literal is rejected because two identical literals need not be the same object, so `Tag<"hi">` in two places could not be guaranteed to name one type. The usual way to pass text is a class-type NTTP that holds the characters by value, shown below.

A reference parameter cannot bind to a temporary either, so `template<const int& R>` does not accept `X<42>`.

## auto parameters

C++17 lets a parameter be declared with a placeholder. `template<auto V>` deduces the parameter's type from the argument, as if by `auto x = argument;`, and `template<decltype(auto) V>` deduces it as `decltype` would, which can make it a reference. A pack `template<auto... Vs>` may hold values of different types.

The deduced type is part of the identity. `X<1>` and `X<1u>` are different specializations because their parameters have different types, even though the values compare equal.

```cpp
#include <type_traits>

template<auto V> struct X {};
template<auto... Vs> struct List {};

static_assert(!std::is_same_v<X<1>, X<1u>>);   // int versus unsigned
static_assert(std::is_same_v<X<1>, X<2 - 1>>); // same type, same value
List<1, 'c', true> mixed;                       // int, char, bool
```

Since C++20 a placeholder also accepts class values. `template<auto V>` given `Point{1, 2}` deduces `Point`, provided the deduced type is structural; if it is not, the program is ill-formed.

## Template-argument equivalence

[temp.type] decides when two specializations are the same. Two values of an NTTP are template-argument-equivalent when they have the same type and integral values compare equal, floating-point values are identical, pointers have the same pointer value, pointers to members refer to the same member or are both null, references refer to the same entity, and class values have equivalent subobjects and reference members, recursively.

"Identical" is deliberate for floating point: it is not `==`. Positive and negative zero compare equal but are different values, so they produce different types.

```cpp
#include <type_traits>

template<double D> struct F {};

static_assert(!std::is_same_v<F<0.0>, F<-0.0>>);  // distinct specializations
static_assert(std::is_same_v<F<0.5>, F<1.0 / 2>>); // same value, same type
```

Pointers compare by address, not by what they point to. Two distinct arrays holding the same characters give two different specializations, because the identity of the object is the value. Class-type parameters work the other way round and compare their contents, which is exactly why a wrapper that stores characters by value can do what a `const char*` parameter cannot.

## Class-type parameters and template parameter objects

Inside the template, an NTTP of scalar type is a prvalue, so you cannot take its address. An NTTP of class type is different: its name denotes a **template parameter object**, an object of type `const T` with static storage duration. There is exactly one such object for each distinct value across the whole program, so every specialization with an equivalent argument shares it, and a reference to it never dangles.

```cpp
#include <cstdio>

struct P { int x; };
template<P V> const P& get() { return V; }   // fine: V lives for the whole program
// template<int N> const int* addr() { return &N; }  // error: N is a prvalue

int main() {
  std::printf("%d %d\n", &get<P{1}>() == &get<P{1}>(),  // 1: one object
                         &get<P{1}>() == &get<P{2}>()); // 0
}
```

This is what makes string-literal wrappers work. A small class holds a character array, and a constructor taking a reference to an array lets class template argument deduction work out its size. The parameter is declared with the class template name alone, a placeholder for a deduced class type, which C++20 allows.

```cpp
#include <cstddef>
#include <cstdio>

template<std::size_t N> struct fixed_string {
  char data[N];
  constexpr fixed_string(const char (&s)[N]) {
    for (std::size_t i = 0; i < N; ++i) data[i] = s[i];
  }
};

template<fixed_string S> struct Name {
  static constexpr const char* get() { return S.data; }
};

int main() { std::puts(Name<"hello">::get()); }  // prints hello
```

Two `Name<"hello">` written in different files are the same type, because the arguments are compared character by character rather than by address.

### Lambdas as arguments

C++20 also allows lambda expressions to appear in template arguments. A capture-less lambda's closure type has no data members, and CWG 2845 clarified that such a closure type is structural, so it can be the argument of an `auto` parameter and called inside the template. Every lambda expression has a unique closure type, so two textually identical lambdas give two different specializations.

```cpp
template<auto F> int call() { return F(); }

int seven = call<[] { return 7; }>();  // OK since C++20
```

## What to remember

- An NTTP value is part of the type, so its type must allow comparison at compile time: that is the structural-type rule.
- C++11 added `nullptr_t`, C++17 added `auto` and `decltype(auto)`, and C++20 added floating-point and structural class types.
- Structural classes have only public, non-mutable members and bases of structural type; `std::string` and `std::string_view` are rejected in practice.
- Arguments are converted constant expressions: narrowing is ill-formed, and `int` to `double` is not allowed.
- Pointer and reference arguments cannot designate string literals, temporaries, `typeid` results or `__func__`; subobjects are allowed only since C++20.
- `X<1>` and `X<1u>` differ for an `auto` parameter, and `0.0` and `-0.0` differ for a `double` parameter.
- A class-type NTTP names a single `const` template parameter object with static storage duration, shared by all equivalent arguments.
- Scalar NTTPs are prvalues; you cannot take their address.
- Text goes in as a `fixed_string`-style class, not as `const char*`.
