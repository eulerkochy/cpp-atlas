---
title: "const, volatile and qualifiers"
summary: "A cv-qualifier attaches to one level of a type, and whether it is top-level or buried inside a pointer decides what it protects, what is ignored, and which conversions are safe. const promises nothing about pointees, modifying a const object is undefined, and volatile is about observable accesses, not threads."
track: "types-and-initialization"
minutes: 13
standard:
  - "[basic.type.qualifier]"
  - "[dcl.type.cv]"
  - "[conv.qual]"
  - "[dcl.fct]"
  - "[class.this]"
  - "[class.mfct.non.static]"
  - "[dcl.stc]"
  - "[class.ctor.general]"
  - "[intro.abstract]"
  - "[expr.ass]"
  - "[depr.volatile.type]"
  - "[dcl.constexpr]"
  - "[res.on.data.races]"
cppreference:
  - title: "cv (const and volatile) type qualifiers"
    path: "language/cv"
  - title: "Non-static member functions (const- and ref-qualified)"
    path: "language/member_functions"
  - title: "Implicit conversions (qualification conversions)"
    path: "language/implicit_conversion"
  - title: "constexpr specifier"
    path: "language/constexpr"
  - title: "std::as_const"
    path: "utility/as_const"
prerequisites:
  - "implicit-conversions"
  - "value-categories"
---

## The one idea

`const` and `volatile` are **cv-qualifiers**, and each one qualifies exactly one level of a type. In `const int* p`, the `int` is const and the pointer is not. In `int* const p`, the pointer is const and the `int` is not. Almost every rule about qualifiers depends on which level you are talking about.

A qualifier on the outermost level, the object itself, is **top-level**. It controls whether that object may be modified, and it is dropped whenever only the value matters: when copying, when deducing `auto`, and in function parameter types. A qualifier on a deeper level, such as what a pointer points to, is **low-level** and is part of the type in every context, because it protects someone else's object.

> **Mental model.** Read a declaration from the name outward, right to left: `int const* const p` is "p is a const pointer to const int". Every `const` you meet guards exactly the thing immediately to its left, or the thing to its right if nothing is on its left.

## Where qualifiers attach and where they vanish

Every non-function, non-reference type `T` has four versions: `T`, `const T`, `volatile T` and `const volatile T`. References and function types cannot be cv-qualified; if a typedef or `decltype` makes it look as if they are, the qualifier is silently ignored. Arrays are the odd case: a qualifier applied to an array type attaches to its elements, and the array type is then considered to have the same qualification, so `std::is_const_v<const int[3]>` is true.

Top-level qualifiers disappear in several places:

- **Parameters.** [dcl.fct] removes top-level cv-qualifiers when forming a function's type, so `void f(int)` and `void f(const int)` declare the same function. Inside the definition, the parameter is still const.
- **Prvalues.** A prvalue of non-class type is never cv-qualified, so a function returning `const int` really returns an `int`.
- **Deduction.** `auto x = ci;` with a `const int ci` deduces `int`, while `auto& r = ci;` deduces `const int&`; the type-deduction-auto-decltype topic has the full rules.

```cpp
void f(int);
void f(const int);         // redeclares f(int)
void f(int*);
void f(const int*);        // a different function: low-level const
void f(int* const);        // redeclares f(int*)

void f(const int x) {      // defines f(int); x is const in here
  // x = 1;                // ill-formed
  (void)x;
}
```

A default-initialized const object of class type needs a user-provided default constructor or a default member initializer for every member, so `struct W { int a; }; const W w;` is ill-formed while `struct W { int a = 0; };` is fine. A const variable at namespace scope that is not `inline`, `extern` or `volatile` has internal linkage, which the translation-units-and-linkage topic explains.

## Qualification conversions across pointer levels

The qualification conversion ([conv.qual]) adds cv-qualifiers below the top level. Adding `const` one level down is always safe: `int*` converts to `const int*`. Two levels down, the obvious conversion is banned.

```cpp
const int secret = 42;

void attack() {
  int* p = nullptr;
  // const int** pp = &p;   // ill-formed. If it were allowed:
  // *pp = &secret;         // fine: storing a const int* through const int**
  // *p = 0;                // p now points to secret: writes a const object
  int* const* ok1 = &p;          // OK
  const int* const* ok2 = &p;    // OK: the middle level is const too
  (void)ok1; (void)ok2;
}
```

```text
  int**           ->  const int**          banned: middle level still writable
  int**           ->  const int* const*    allowed: every level above is const
  int**           ->  int* const*          allowed: const only one level down
  level:   0  1  2        (0 is the outermost pointer)
```

The rule is that if a qualifier is added at some level, `const` must also be added at every level between it and the top, excluding the top level itself. Otherwise the intermediate pointer remains writable, and you could store a pointer to a const object into a slot that the original type sees as pointing to non-const.
> **Standardese.** [conv.qual] describes the rule through cv-decompositions of similar types. Since C++20 (P0388) the same machinery also lets an array of known bound convert to an array of unknown bound inside a pointer, so `int(*)[3]` converts to `const int(*)[]`.

## Const objects and undefined modification

[basic.type.qualifier] defines a **const object** as an object of const-qualified type or a non-mutable subobject of one. [dcl.type.cv] makes any attempt to modify a const object during its lifetime undefined behavior. The implementation may place such objects in read-only memory, fold their values into code, or assume they never change across function calls.

Constness belongs to the object, not to the path. Reaching a non-const object through a `const int&` and casting the const away to write is allowed; reaching a const object through any path and writing is undefined. The casts topic shows `const_cast` in both situations.

Constructors and destructors are the exception built into the rule. [class.ctor.general] says const and volatile semantics do not apply to an object under construction; they take effect when the most derived object's constructor finishes and end when its destructor starts. That is why a constructor can assign to members of an object declared `const`.

## const member functions, mutable and logical const

A non-static member function declared `const` gets `this` of type `const X*` ([class.this]), so inside it every non-static data member is accessed as const. A const member function is the only kind that can be called on a const object or through a `const X&`, and you can overload on it, which is how `operator[]` returns `const T&` for const containers and `T&` otherwise.

That const is **bitwise and shallow**. It applies to the members themselves, not to what pointer members point to. A const member function may modify the pointee of a raw pointer or `std::unique_ptr` member. The Library Fundamentals TS offers `std::experimental::propagate_const` to make constness reach through such members.

```cpp
#include <memory>

struct Buffer {
  int* raw;
  std::unique_ptr<int> owned;
  void clear() const {
    raw[0] = 0;   // OK: raw is int* const here, the int is not const
    *owned = 0;   // OK for the same reason
    // raw = nullptr;  // ill-formed: the member itself is const
  }
};
```

**Logical const** is the opposite design: the object's observable state does not change, even if some bits do. The `mutable` specifier ([dcl.stc]) marks a data member that may be modified through a const object, which is how caches, lazily computed values and mutexes live inside const member functions. `mutable` cannot be applied to a reference, a static member or a const member.

```cpp
#include <mutex>
#include <string>

class Name {
  std::string first_, last_;
  mutable std::mutex m_;
  mutable std::string full_;  // cache: logically part of the value
public:
  const std::string& full() const {
    std::lock_guard lock(m_);
    if (full_.empty()) full_ = first_ + " " + last_;
    return full_;
  }
};
```

> **Pitfall.** [res.on.data.races] promises that standard library functions do not modify objects reached only through const arguments, so callers reasonably treat const operations as safe to run concurrently. A `mutable` cache without a mutex or an atomic breaks that assumption and turns two concurrent const calls into a data race.

## volatile: observable accesses, not threads

[intro.abstract] makes every access through a volatile glvalue part of the program's observable behavior. The compiler must perform each such read and write, in program order relative to other volatile accesses, and may not merge, remove or invent them. This is for memory-mapped hardware registers, for locals that must survive `longjmp`, and for `volatile std::sig_atomic_t` flags shared with a signal handler.

`volatile` gives no atomicity and no ordering with respect to other threads. Two threads accessing a `volatile int` without synchronization, where at least one writes, is a data race and undefined; use `std::atomic`, which the atomics-and-memory-ordering topic covers.

C++20 adopted P1152 and deprecated uses of `volatile` whose meaning was unclear:

- `++` and `--` on a volatile object, which read and write but look like one access;
- using the value of a simple assignment to a volatile object, as in `a = v = 1`;
- volatile-qualified function parameters and return types;
- volatile structured bindings.

P1152 also deprecated compound assignment such as `v += 1`. P2327 restored the bitwise forms, and CWG 2654, resolved for C++23 and treated as a defect against C++20, restored all of them, so compound assignment on a volatile is not deprecated.

```cpp
volatile int reg;

void poke() {
  reg = 1;       // OK: assignment used as a statement
  reg += 2;      // OK: not deprecated since CWG 2654
  reg |= 4;      // OK
  // ++reg;      // deprecated since C++20
  // int x = (reg = 5);   // deprecated: value of a volatile assignment is used
}
```

## constexpr versus const

`const` means "this object will not be modified". `constexpr` on a variable means "this object is initialized by a constant expression and is usable in constant expressions", and it implies `const`. A `const` variable may be initialized at run time, so `const int n = read();` is const but cannot size an array.

There is an old shortcut: a const variable of integral or enumeration type initialized with a constant expression is usable in constant expressions without `constexpr`. The shortcut does not extend to floating types, so `const double d = 1.0;` cannot initialize a `constexpr double`.

`constexpr` is always top-level. `constexpr int* p = &g;` declares `p` as `int* const`, so `*p = 5` is fine, and `g` must have static storage duration for its address to be a constant expression. To make the pointee const you still write `constexpr const int* p`.

```cpp
#include <type_traits>

int g = 0;
constexpr int* p = &g;
static_assert(std::is_same_v<decltype(p), int* const>);
void set() { *p = 5; }   // OK: the pointee is not const

const int n = 4;
int arr[n];              // OK: const integral with a constant initializer
// const double d = 1.0;
// constexpr double e = d;  // ill-formed: d is not usable in constant expressions
```

For member functions the link was cut in C++14: a `constexpr` non-static member function is no longer implicitly `const`, so calling one on a const object needs an explicit `const`. Constant evaluation in depth is the constant-expressions topic's subject.

## What to remember

- Each qualifier applies to one level; top-level const protects the object, low-level const protects what it points to.
- Top-level cv is dropped in parameter types, on non-class prvalues and in `auto` deduction by value.
- `T**` does not convert to `const T**`; `const T* const*` is fine, because every intermediate level must be const.
- Modifying a const object is undefined, however you reach it; constructors and destructors are exempt.
- const member functions make members const, not pointees; `mutable` allows logical const and needs synchronization.
- `volatile` makes accesses observable but is not atomic; C++20 deprecated `++`, `--`, volatile parameters and using a volatile assignment's value, while compound assignment was restored.
- `constexpr` implies top-level const; const integral variables with constant initializers are usable in constant expressions, const doubles are not.
- Since C++14, `constexpr` member functions are not implicitly `const`.
