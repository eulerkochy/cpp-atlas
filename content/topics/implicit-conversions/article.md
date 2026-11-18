---
title: "Implicit conversions"
summary: "An implicit conversion is a short, fixed pipeline of standard conversions, optionally wrapped around exactly one user-defined conversion. Knowing the slots in that pipeline explains why some conversions happen silently, why narrowing is banned only in braces, and why a second user-defined step is never taken."
track: "types-and-initialization"
minutes: 13
standard:
  - "[conv.general]"
  - "[conv.lval]"
  - "[conv.array]"
  - "[conv.func]"
  - "[conv.qual]"
  - "[conv.prom]"
  - "[conv.fpint]"
  - "[conv.ptr]"
  - "[conv.fctptr]"
  - "[conv.bool]"
  - "[dcl.init.list]"
  - "[expr.const]"
  - "[class.conv]"
  - "[over.best.ics]"
cppreference:
  - title: "Implicit conversions"
    path: "language/implicit_conversion"
  - title: "List-initialization (narrowing conversions)"
    path: "language/list_initialization"
  - title: "Copy-initialization"
    path: "language/copy_initialization"
  - title: "nullptr, the pointer literal"
    path: "language/nullptr"
  - title: "Overload resolution"
    path: "language/overload_resolution"
prerequisites:
  - "value-categories"
  - "fundamental-types-and-arithmetic-conversions"
---

## The one idea

Whenever an expression of one type is used where another type is needed, such as an argument, an initializer, a return value or an operand, the compiler looks for an **implicit conversion sequence**. That sequence is not open-ended. It is either a **standard conversion sequence**, a fixed pipeline with at most one step in each of four slots, or a **user-defined conversion sequence**: a standard sequence, then one constructor or conversion function, then another standard sequence.

Everything else follows from that shape. A conversion that needs two steps in the same slot does not happen. A conversion that needs two user-defined steps does not happen. And overload resolution ranks candidate functions by comparing these sequences slot by slot, which is the overload-resolution topic's subject.

> **Mental model.** Picture four optional boxes in a row: fix the value category, change the type, drop `noexcept`, add `const`. A standard conversion passes through each box at most once. A user-defined conversion is one extra box in the middle, and there is only ever one.

## The four slots of a standard conversion sequence

[conv.general] lists the order:

1. At most one of **lvalue-to-rvalue**, **array-to-pointer** or **function-to-pointer** conversion.
2. At most one of the **promotions**, the integral, floating and floating-integral **conversions**, the **pointer** and **pointer-to-member** conversions, or the **boolean** conversion.
3. At most one **function pointer conversion**, which drops `noexcept` (C++17).
4. At most one **qualification conversion**, which adds cv-qualifiers below the top level.

The first slot fixes the value category and the shape. Lvalue-to-rvalue conversion reads the value out of a glvalue of a non-array, non-function type; it is what happens when you use a variable's value. Array-to-pointer turns an array into a pointer to its first element, and function-to-pointer turns a function into a pointer to it.

```cpp
int a[3];
int* p = a;              // array-to-pointer
int (*pa)[3] = &a;       // no conversion: &a already has type int(*)[3]
void g();
void (*fp)() = g;        // function-to-pointer
const int* cp = p;       // qualification conversion only
const void* vp = a;      // array-to-pointer, pointer conversion, qualification
```

A prvalue of class type does not go through these slots; temporary materialization is a separate standard conversion that turns a prvalue into an xvalue when a reference binds to it or a member is accessed, as the value-categories topic explains.

## Promotions, conversions and the boolean conversion

The second slot distinguishes **promotions** from **conversions**, and the difference matters even though both change the type. Integral promotion widens a narrow integer to `int` or `unsigned int`, and floating-point promotion turns `float` into `double`. Nothing else is a promotion: `int` to `long`, `short` to `long` and `float` to `long double` are conversions. Overload resolution ranks a promotion better than a conversion, so a `short` argument picks `f(int)` over `f(double)`, but finds `f(long)` and `f(double)` equally good.

```cpp
void f(long);
void f(double);

void test(short s, float x) {
  f(x);     // OK: float to double is a promotion, beats float to long
  // f(s);  // ill-formed: short to long and short to double are both conversions
}
```

The conversions themselves have value rules. A floating value converted to an integer is truncated toward zero, and if the truncated value does not fit, the behavior is undefined. An integer converted to a floating type is exact when possible, otherwise one of the two nearest values chosen in an implementation-defined way, and undefined if it is out of range. Integer to integer conversion is modular, as the fundamental-types-and-arithmetic-conversions topic describes.

The **boolean conversion** turns an arithmetic, unscoped enumeration, pointer or pointer-to-member value into `bool`: zero and null become `false`, everything else `true`. It sits in the same slot as the other conversions, so it is always a conversion, never a promotion, and it is a standard conversion, which makes it beat any user-defined conversion.

```cpp
#include <cstdio>
#include <string>

void f(bool)        { std::puts("bool"); }
void f(std::string) { std::puts("string"); }

int main() { f("hello"); }  // prints bool
```

> **Pitfall.** A string literal is an array, so it decays to `const char*`, and a pointer converts to `bool` with a standard conversion sequence. Constructing `std::string` is a user-defined conversion, which always ranks worse. An overload taking `bool` silently captures every string literal argument.

## Pointer conversions and null pointer constants

The pointer conversions in the second slot are:

- A **null pointer constant** converts to any pointer or pointer-to-member type, giving a null value.
- A pointer to a cv-qualified object type converts to a pointer to `void` with the same or more cv-qualification (the qualification part being slot 4). The reverse is not implicit in C++, unlike C.
- A pointer to a derived class converts to a pointer to a base class, provided the base is accessible and unambiguous. A null pointer stays null; otherwise the result points to the base subobject, which may be at a different address.

[conv.ptr] defines a null pointer constant as an **integer literal** with value zero or a prvalue of type `std::nullptr_t`. Since C++11, through CWG 903, an arbitrary integral constant expression that evaluates to zero no longer qualifies, so `1 - 1`, a `const int` holding zero, `false` and `'\0'` are not null pointer constants. `0L` and `0x0` still are, because they are integer literals.

```cpp
int* a = 0;              // OK: integer literal
int* b = 0L;             // OK: integer literal of type long
int* c = nullptr;        // OK: std::nullptr_t
// int* d = 1 - 1;       // ill-formed since C++11
// int* e = false;       // ill-formed since C++11: a boolean literal
// const int z = 0;
// int* f = z;           // ill-formed since C++11, valid in C++03
```

Slot 3, the function pointer conversion, lets a pointer to a `noexcept` function convert to a pointer to a potentially-throwing function of the same type, and the same for pointers to member functions. The reverse would let a throwing function hide behind a `noexcept` type, so it is not allowed. Slot 4, the qualification conversion, adds `const` and `volatile` at levels below the top; the rules for multi-level pointers, including why `int**` does not convert to `const int**`, belong to the const-volatile-and-qualifiers topic.

## Narrowing: banned in braces and constant expressions

A **narrowing conversion** ([dcl.init.list]) is an implicit conversion that may lose information:

- floating to integer;
- floating to a floating type of lower conversion rank, unless the source is a constant expression whose value is within the destination's range, even if not exactly representable;
- integer or unscoped enumeration to a floating type, unless the source is a constant expression whose value is exactly representable;
- integer or unscoped enumeration to an integer type that cannot represent all its values, unless the source is a constant expression whose value fits;
- pointer or pointer-to-member to `bool`, added in C++20 by P1957 and applied as a defect report.

Narrowing is still a valid implicit conversion. It is banned only in particular contexts: list-initialization in all its forms, including `T{x}`, `return {x};` and aggregate member initializers in braces, and **converted constant expressions**, which are used for non-type template arguments, `case` labels, array bounds, enumerator values with a fixed underlying type, `noexcept(...)` and `explicit(...)`. C++20 parenthesized aggregate initialization deliberately allows narrowing.

```cpp
struct A { int x; };

void demo(double d, int i, int* p) {
  int a = d;           // OK: truncates
  // int b{d};         // ill-formed: floating to integer
  constexpr int k = 10;
  char c{k};           // OK: constant whose value fits
  // char e{i};        // ill-formed: i is not a constant expression
  // bool f{p};        // ill-formed since C++20 (P1957)
  A g(3.5);            // OK in C++20: parentheses allow narrowing
  (void)a; (void)c; (void)g;
}

template <bool B> struct Flag {};
// Flag<2> bad;        // ill-formed: narrowing in a converted constant expression
```

GCC reports a non-constant narrowing in braces only as a warning by default, which `-Werror=narrowing` or `-pedantic-errors` turns into an error. The program is ill-formed regardless; Clang rejects it outright.

> **Standardese.** [expr.const] defines a converted constant expression of type T as an expression implicitly converted to T where the conversion sequence contains only certain conversions and, for integral and floating sources, no narrowing. That one sentence is why `Flag<2>` and `void f() noexcept(2);` are errors.

## Contextual conversion to bool

Some language constructs need a truth value and use a stronger rule than implicit conversion. An expression is **contextually converted to bool** when it is the condition of `if`, `while`, `for` or `do`, an operand of `!`, `&&` or `||`, the first operand of `?:`, or the operand of `static_assert`, `if constexpr`, `noexcept(...)` or `explicit(...)`. Contextual conversion means the expression is used as if to direct-initialize a `bool`, so **explicit conversion functions are considered**. That is what makes `explicit operator bool` usable in conditions but not in assignments; the conversion-functions-and-explicit topic covers writing one.

```cpp
struct Handle {
  explicit operator bool() const { return true; }
};

void use(Handle h) {
  if (h) {}              // OK: contextual
  bool ok = !h || h;     // OK: both operands are contextual
  // bool b = h;         // ill-formed: copy-initialization ignores explicit
  (void)ok;
}
```

C++23 adopted P1401, which allows narrowing in the contextual conversions of `static_assert` and `if constexpr`, so `static_assert(2);` is valid; GCC and Clang accept it in C++20 mode as well. `noexcept(...)` and `explicit(...)` still reject narrowing. A requires-clause is different again: an atomic constraint is not converted at all and must have type `bool` exactly, so `requires (sizeof(T))` is ill-formed.

## At most one user-defined conversion

A **user-defined conversion** is a call to a converting constructor or a conversion function. [class.conv] says at most one is applied implicitly to a single value. A user-defined conversion sequence therefore looks like this:

```text
  source --[standard seq 1]--> ctor param / object --[ONE user-defined]--> --[standard seq 2]--> target
```

The standard sequences on either side can do the usual work, such as decaying an array before a constructor taking `const char*`, or turning a conversion function's `int` result into a `double`. What cannot happen is a chain of two user-defined steps, such as `const char*` to `std::string` and then `std::string` to a class with a constructor from `std::string`.

```cpp
#include <string>

struct Name {
  Name(std::string) {}
};

// Name n1 = "Ada";    // ill-formed: const char* -> std::string -> Name is two steps
Name n2("Ada");        // OK: the constructor is called directly; its argument needs one
Name n3 = {"Ada"};     // OK: list-initialization also calls the constructor directly
// void take(Name);
// take("Ada");        // ill-formed: same two-step chain as n1
```

Direct-initialization and list-initialization succeed because they pick `Name`'s constructor by overload resolution, so the only implicit conversion left is from the argument to the parameter type, which needs one user-defined step. Copy-initialization from a different type has to find a single conversion all the way to `Name`.

Derived-to-base conversions do not count toward this limit. Binding a `const Base&` to a `Derived`, or converting `Derived*` to `Base*`, is a standard conversion, and a conversion function returning `Derived` can be followed by a derived-to-base step to reach `Base`.

## What to remember

- A standard conversion sequence has four ordered slots: value transformation, promotion or conversion, function pointer conversion, qualification conversion.
- Only narrow integers to `int` and `float` to `double` are promotions; promotions outrank conversions in overload resolution.
- Pointer to `bool` is a standard conversion and beats any constructor, which is why `f("text")` can pick `f(bool)`.
- A null pointer constant is an integer literal zero or a `std::nullptr_t` prvalue; `false`, `'\0'` and `const int z = 0` are not, since C++11.
- Derived-to-base pointer conversion needs an accessible, unambiguous base; `void*` never converts implicitly to `T*`.
- Narrowing is banned in list-initialization and converted constant expressions, including template arguments and `noexcept(...)`; pointer to `bool` became narrowing in C++20.
- Contextual conversion to bool considers explicit conversion functions; requires-clauses need exactly `bool`.
- At most one user-defined conversion per implicit conversion; `Name n = "Ada";` fails where `Name n("Ada");` works.
