---
title: "Casts"
summary: "Each named cast is a narrow permission. static_cast performs conversions the type system can check, const_cast only changes qualifiers, reinterpret_cast reuses a value's bits or address under a different type, and dynamic_cast asks the object at run time. A C-style cast tries them in a fixed order and takes the first that compiles."
track: "types-and-initialization"
minutes: 13
standard:
  - "[expr.static.cast]"
  - "[expr.const.cast]"
  - "[expr.reinterpret.cast]"
  - "[expr.dynamic.cast]"
  - "[expr.cast]"
  - "[expr.type.conv]"
  - "[bit.cast]"
  - "[dcl.type.cv]"
  - "[expr.type]"
cppreference:
  - title: "static_cast conversion"
    path: "language/static_cast"
  - title: "const_cast conversion"
    path: "language/const_cast"
  - title: "reinterpret_cast conversion"
    path: "language/reinterpret_cast"
  - title: "dynamic_cast conversion"
    path: "language/dynamic_cast"
  - title: "Explicit type conversion (C-style and functional casts)"
    path: "language/explicit_cast"
  - title: "std::bit_cast"
    path: "numeric/bit_cast"
prerequisites:
  - "implicit-conversions"
  - "value-categories"
  - "const-volatile-and-qualifiers"
---

## The one idea

A cast is a request to treat an expression as having another type, and C++ splits that request into four kinds of permission so that each cast states which rule it is relying on.

- `static_cast` performs conversions the compiler can check from the types alone, including some that are unsafe at run time.
- `const_cast` adds or removes `const` and `volatile`, and nothing else.
- `reinterpret_cast` reuses an address or a bit pattern under another type, and never changes the value representation.
- `dynamic_cast` consults the object's dynamic type at run time and can fail.

The C-style cast `(T)e` and the functional cast `T(e)` are not a fifth kind. They try the named casts in a fixed order and quietly use the first that is well-formed, which is why they are dangerous.

> **Mental model.** Choose the weakest cast that does the job. If the cast compiles, you know which rule applies; if a stronger cast is needed, the compiler forces you to spell it.

## static_cast: conversions the type system can check

[expr.static.cast] allows four broad groups of conversions.

1. Anything direct-initialization could do: `static_cast<T>(e)` is valid if `T t(e);` would be, and it means the same thing. This includes explicit constructors and explicit conversion functions.
2. Conversion to `void`, which discards a value.
3. The reverse of many standard conversions: integer or floating to enumeration, `void*` to `T*`, base pointer or reference to derived, and pointer to member of base to pointer to member of derived. It cannot reverse lvalue-to-rvalue, array-to-pointer, function-to-pointer or the boolean conversion, and it never removes `const`.
4. A glvalue to an rvalue reference, `static_cast<T&&>(x)`, which is what `std::move` is.

The downcast in group 3 is checked only statically. If a `Base*` does not actually point to a `Base` subobject of a `Derived`, the cast itself has undefined behavior, before anyone dereferences the result. The base must also not be virtual: downcasting through a virtual base needs `dynamic_cast`.

```cpp
struct Base {};
struct Derived : Base { int extra = 0; };

constexpr bool bad() {
  Base b;
  Derived* d = static_cast<Derived*>(&b);  // undefined: b is not inside a Derived
  (void)d;
  return true;
}
// static_assert(bad());  // Clang rejects it: "cannot cast object of dynamic type
//                        // 'Base' to type 'Derived'"; GCC 16 misses this one
```

Casting an integer to an enumeration without a fixed underlying type is undefined if the value is outside the enumeration's range, since C++17; the enumerations-and-unions topic has the details. `static_cast<void*>` and back to the original type is always a round trip.

## const_cast and when writing is undefined

`const_cast` changes only cv-qualification, at any level of a pointer or pointer-to-member type, or on a reference. It can also turn an lvalue into an xvalue with `const_cast<T&&>`. It cannot change any other part of the type.

Removing `const` is always allowed; what you do next may not be. [dcl.type.cv] says any attempt to modify a **const object** during its lifetime is undefined behavior. The question is whether the object itself was created const, not whether the path you reached it through was.

```cpp
constexpr bool writes_const() {
  const int x = 1;
  *const_cast<int*>(&x) = 2;   // undefined: x is a const object
  return true;
}
// static_assert(writes_const());  // rejected: modifying a const object

constexpr bool writes_nonconst() {
  int y = 1;
  const int& r = y;
  const_cast<int&>(r) = 2;     // fine: y was never const
  return y == 2;
}
static_assert(writes_nonconst());
```

String literals are const arrays, so writing through a `const_cast` of one is undefined too. The legitimate uses are calling an old API that takes `char*` but does not write, and implementing a non-const member function in terms of its const twin with `std::as_const` and a `const_cast` on the result, where the object is known to be non-const.

> **Pitfall.** Compilers assume const objects never change. After `const int n = 1;` and a write through a `const_cast`, later reads of `n` are often folded to 1, so a debugger and the program disagree. That is one possible outcome of undefined behavior, not a rule you can rely on.

## reinterpret_cast: same bits, different type

`reinterpret_cast` exists for conversions the type system cannot check. [expr.reinterpret.cast] lists them exhaustively:

- a pointer to an integer type large enough to hold it, and an integer back to a pointer; a round trip through `std::uintptr_t` gives the original pointer;
- an object pointer to another object pointer type, defined as `static_cast<cv T*>(static_cast<cv void*>(p))`, so the address is unchanged;
- a function pointer to another function pointer type, where calling through the wrong type is undefined;
- a conversion between object and function pointers, which is conditionally-supported;
- an lvalue to a reference type, `reinterpret_cast<T&>(x)`, which means `*reinterpret_cast<T*>(&x)`;
- a pointer to member to another pointer to member of the same kind.

It cannot cast away `const`, it cannot convert between arithmetic values (`reinterpret_cast<int>(3.0)` is ill-formed), and it is never allowed in a constant expression. Producing the new pointer is usually fine; reading through it is governed by the aliasing rules, which the strict-aliasing-and-undefined-behavior topic covers.

## dynamic_cast: asking the object

`dynamic_cast<T*>(p)` and `dynamic_cast<T&>(r)` look at the most derived object at run time. An upcast to an accessible, unambiguous base is just the implicit conversion and works on any class. Every other use requires the operand's class to be **polymorphic**, meaning it has at least one virtual function.

- A **downcast** succeeds if the operand refers to a public base subobject of exactly one `T` object inside the most derived object.
- Otherwise a **cross-cast** succeeds if the operand is a public base of the most derived object and that object has a public, unambiguous base `T`, even if `T` is unrelated to the operand's static type.
- `dynamic_cast<void*>(p)` returns a pointer to the most derived object, which can differ from `static_cast<void*>(p)` under multiple inheritance.
- On failure, the pointer form returns a null pointer and the reference form throws `std::bad_cast`. A null pointer operand gives a null result.

A private or ambiguous base makes the run-time check fail rather than the program ill-formed, because the check is about the dynamic object, not the static types.

```cpp
#include <cstdio>
#include <typeinfo>

struct A { virtual ~A() = default; };
struct B { virtual ~B() = default; };
struct C : A, B {};

int main() {
  C c;
  A* pa = &c;
  B* pb = dynamic_cast<B*>(pa);                     // cross-cast: succeeds
  std::printf("%d\n", dynamic_cast<void*>(pb) == static_cast<void*>(&c));  // 1
  std::printf("%d\n", static_cast<void*>(pb) == static_cast<void*>(&c));   // 0 on common ABIs
  A a;
  try { (void)dynamic_cast<C&>(a); }
  catch (const std::bad_cast&) { std::puts("bad_cast"); }  // printed
}
```

During construction and destruction, `dynamic_cast` treats the object as having the type of the class whose constructor or destructor is running, so a cast to a more derived class fails there.

## C-style and functional casts

[expr.cast] defines `(T)e` as the first of these that is well-formed:

1. `const_cast<T>(e)`
2. `static_cast<T>(e)`
3. `static_cast` followed by `const_cast`
4. `reinterpret_cast<T>(e)`
5. `reinterpret_cast` followed by `const_cast`

The static_cast steps also get one extra power: they may convert to or from a base class that is **inaccessible**, which no named cast can do. So `(Base*)&d` performs a correct, address-adjusting derived-to-base conversion even when `Base` is a private base.

The order hides mistakes. `(int*)p` with `p` a `const char*` cannot be a static_cast, so it silently becomes a reinterpret_cast plus a const_cast. Worse, if the classes involved are incomplete at the point of the cast, [expr.cast] makes it unspecified whether the static_cast or reinterpret_cast interpretation is used, so an include you forgot can turn a pointer-adjusting conversion into a plain reinterpretation of the address.

```cpp
struct Base { int x = 1; };
struct Other { int y = 2; };
struct Derived : Other, private Base {};

void demo() {
  Derived d;
  // Base* a = static_cast<Base*>(&d);  // ill-formed: Base is inaccessible
  Base* b = (Base*)&d;                  // OK: static_cast semantics, access ignored
  const char* s = "hi";
  int* p = (int*)s;                     // reinterpret_cast, then const_cast
  (void)b; (void)p;
}
```

The functional notation `T(e)` with a single expression means exactly `(T)e`, so `std::uintptr_t(p)` is a reinterpret_cast. `T{e}` is different: it is list-initialization, which considers only implicit conversions and rejects narrowing. `T()` value-initializes, and `T(a, b)` direct-initializes. C++23 adds `auto(x)` and `auto{x}`, which produce a decayed prvalue copy.

## std::bit_cast and the value category of a cast

C++20 added `std::bit_cast<To>(from)` in `<bit>` for the job people used to do with `reinterpret_cast` or a union: reading an object's bits as another type. Both types must be trivially copyable and of the same size. The result is a new object, so there is no aliasing problem, and it is `constexpr` unless a pointer, union, volatile member or reference is involved. If the bits do not form a valid value of `To`, the behavior is undefined. The bit-manipulation topic covers it in more depth.

```cpp
#include <bit>
#include <cstdint>

constexpr std::uint32_t one = std::bit_cast<std::uint32_t>(1.0f);
static_assert(one == 0x3f800000);  // holds wherever float is IEEE binary32
```

Every cast obeys one rule for the category of its result: an lvalue reference type gives an lvalue, an rvalue reference to an object type gives an xvalue, and any other type gives a prvalue. A prvalue of non-class type is never cv-qualified, so `static_cast<const int>(i)` has type `int`; for a class type, `static_cast<const S>(s)` keeps the `const`.

```cpp
#include <type_traits>
#include <utility>

int i = 0;
static_assert(std::is_same_v<decltype(static_cast<const int>(i)), int>);
static_assert(std::is_same_v<decltype((static_cast<int&&>(i))), int&&>);  // xvalue
static_assert(std::is_same_v<decltype((const_cast<const int&>(i))), const int&>);
```

> **Standardese.** [expr.static.cast] and its siblings each open with the same sentence: the result is an lvalue if the target is an lvalue reference type or an rvalue reference to function type, an xvalue if it is an rvalue reference to object type, and a prvalue otherwise. [expr.type] then strips cv-qualifiers from non-class prvalues.

## What to remember

- `static_cast` does what direct-initialization could, plus checked reversals of standard conversions; a wrong downcast is undefined at the cast.
- `const_cast` changes qualifiers only; writing to an object that was created const is undefined, writing to a non-const object through a const path is fine.
- `reinterpret_cast` keeps addresses and bits, cannot remove `const`, cannot convert arithmetic values, and is never constant.
- `dynamic_cast` needs a polymorphic source except for upcasts, supports cross-casts and `void*`, returns null for pointers and throws `std::bad_cast` for references.
- A C-style cast tries const, static, static plus const, reinterpret, reinterpret plus const, and may ignore base-class access.
- `T(e)` equals `(T)e`; `T{e}` is list-initialization and rejects narrowing.
- `std::bit_cast` copies bits into a new object of the same size and is usually constexpr.
- Cast results are lvalues for `T&`, xvalues for `T&&`, prvalues otherwise; non-class prvalues lose cv.
