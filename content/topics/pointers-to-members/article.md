---
title: "Pointers to members"
summary: "A pointer to member names a member of a class without naming an object, and is applied to an object later with `.*` or `->*`. It converts along the inheritance hierarchy in the opposite direction from object pointers, and `std::invoke` turns it into an ordinary callable."
track: "classes"
minutes: 11
standard:
  - "[dcl.mptr]"
  - "[expr.unary.op]"
  - "[expr.mptr.oper]"
  - "[conv.mem]"
  - "[expr.static.cast]"
  - "[over.over]"
  - "[basic.compound]"
  - "[func.invoke]"
  - "[func.require]"
  - "[func.memfn]"
  - "[namespace.std]"
cppreference:
  - title: "Pointer declaration (pointers to members)"
    path: "language/pointer"
  - title: "Member access operators"
    path: "language/operator_member_access"
  - title: "Address of an overloaded function"
    path: "language/overloaded_address"
  - title: "std::invoke"
    path: "utility/functional/invoke"
  - title: "std::mem_fn"
    path: "utility/functional/mem_fn"
prerequisites:
  - "member-functions-and-this"
  - "inheritance-and-virtual-functions"
---

## The one idea

A pointer to member is a **path into an object**, not an address. `&S::m` means "the member `m` of whatever `S` you give me later". It does not point at memory, it cannot be converted to `void*`, and it becomes a real lvalue only when you combine it with an object using `.*` or `->*`.

Because it describes where a member sits inside a class, its conversions run the opposite way from object pointers. An `S*` converts to a pointer to its base. An `int Base::*` converts to `int Derived::*`, since every member of the base is also a member of the derived class.

> **Mental model.** An object pointer answers "which object?". A pointer to member answers "which part?", and needs an object before it means anything.

## Forming and applying them

The type is spelled with the class in front of the star: `int S::*` is a pointer to an `int` data member of `S`, and `int (S::*)(int) const` is a pointer to a `const` member function taking an `int`. It is formed only by `&` applied to a qualified name. Inside a member function, writing `&(S::m)` with parentheses, or plain `&m`, produces an ordinary `int*` to the member of `*this`.

```cpp
#include <cstdio>

struct S {
  int a = 1, b = 2;
  int twice(int x) const { return 2 * x; }
};

int main() {
  int S::* pm = &S::b;
  int (S::*pf)(int) const = &S::twice;
  S s;
  S* p = &s;
  std::printf("%d %d\n", s.*pm, (p->*pf)(pm == &S::b));   // 2 2
  pm = nullptr;                                         // null member pointer
}
```

The parentheses around `(p->*pf)` are required. `.*` and `->*` bind more loosely than a function call, so `s.*pf(1)` parses as `s.*(pf(1))` and is ill-formed.

The result of `.*` on a data member has the value category of the object: an lvalue object gives an lvalue, an rvalue object gives an xvalue. `->*` on a data member always gives an lvalue. For member functions, the ref-qualifiers apply: a `&&`-qualified function can only be called through an rvalue object. Applying a null pointer to member is undefined behavior.

Member pointers are values like any other. They can be compared with `==` and `!=`, where a null member pointer compares unequal to every pointer to an actual member, but `<` and the other relational operators do not apply to them. They can also be non-type template arguments, and they can sit in `constexpr` tables, which is how reflection-free serializers map field names to fields.

```cpp
#include <cstdio>
#include <utility>

struct Config { int port; int threads; };

constexpr std::pair<const char*, int Config::*> fields[] = {
  {"port", &Config::port}, {"threads", &Config::threads}};

template<int Config::* M> int get(const Config& c) { return c.*M; }

void dump(const Config& c) {
  for (auto [name, m] : fields) std::printf("%s=%d\n", name, c.*m);
  std::printf("%d\n", get<&Config::threads>(c));
}
```

Static members are not reached through pointers to members. `&S::static_member` is an ordinary object or function pointer. Members of reference type and bit-fields cannot be pointed to at all. A C++23 explicit object member function behaves like a static one here: `&S::f` for `int f(this const S&)` has the type `int (*)(const S&)`, a topic covered in crtp-and-deducing-this.

## Conversions run the other way

[conv.mem] allows an implicit conversion from `T Base::*` to `T Derived::*`. Whatever `Base` member the pointer names, a `Derived` object contains it. The reverse direction needs `static_cast`, because the pointer might name a member that only some derived classes have.

```cpp
struct B { int x = 1; };
struct D : B { int y = 2; };

int D::* pd = &B::x;                          // OK: implicit, Base -> Derived
// int B::* bad = &D::y;                      // ill-formed: no implicit Derived -> Base
int B::* pb = static_cast<int B::*>(&D::y);   // OK, but only use it on a D

int read(B& b) { return b.*pb; }              // defined only if b is really a D
```

The rules have sharp edges that object pointers do not.

- The implicit conversion is ill-formed if `Base` is inaccessible, ambiguous, or a **virtual** base of `Derived`. A virtual base sits at a different offset in every most-derived class, so no fixed adjustment exists.
- `&D::x`, where `x` is declared in `B`, has type `int B::*`, not `int D::*`. The type records the class that declares the member, not the class you named.
- Using a pointer whose member is absent from the object's dynamic type is undefined behavior. [expr.mptr.oper] says so directly.

```cpp
#include <type_traits>
struct B { int x; void f(); };
struct D : B {};
static_assert(std::is_same_v<decltype(&D::x), int B::*>);
static_assert(std::is_same_v<decltype(&D::f), void (B::*)()>);
```

> **Pitfall.** Because `&D::f` has type `void (B::*)()`, template argument deduction sees `B`, not `D`. A template that deduces the class from a member pointer, such as `template<class C> void bind(void (C::*)())`, deduces `C = B` for `&D::f`.

## Virtual functions through member pointers

A pointer to a virtual member function keeps the virtual behaviour. Calling it through an object dispatches to the final overrider of the dynamic type, exactly like a call by name. There is no member pointer equivalent of the qualified call `b.B::f()`, which suppresses dispatch.

```cpp
#include <cstdio>
struct B { virtual void f() { std::puts("B::f"); } };
struct D : B { void f() override { std::puts("D::f"); } };

int main() {
  void (B::*pf)() = &B::f;
  D d;
  B* bp = &d;
  (bp->*pf)();   // D::f
  bp->B::f();    // B::f: only a qualified name turns dispatch off
}
```

## What they look like in memory

Nothing in this section is guaranteed by the standard. The sizes and encodings below are implementation practice, and code must not depend on them.

Under the Itanium C++ ABI, used by GCC and Clang on Linux and macOS, a pointer to data member is a single `ptrdiff_t` holding the byte offset of the member, and the null value is `-1`, because offset 0 is a valid member. A pointer to member function is two words: a function address or a virtual table offset, plus an adjustment added to `this`. That adjustment is what makes conversions across multiple inheritance work.

```text
Itanium ABI, 64-bit
  int S::*            [ offset (ptrdiff_t) ]          null = -1
  void (S::*)()       [ ptr | adj ]                   two words, 16 bytes
    x86-64:   virtual if ptr is odd, ptr = 1 + vtable offset
    AArch64:  virtual if adj is odd, ptr = vtable offset
```

On arm64 macOS, a pointer to the first virtual function measured as `ptr = 0, adj = 1` with both compilers, and a data member at offset 8 stored the value 8. MSVC is different again: the size of its member function pointers depends on the inheritance model, from a single code pointer for single inheritance to several fields for virtual inheritance or for a class that is still incomplete where the pointer type is used.

> **Standardese.** [basic.compound] lists pointers to members as their own compound type, separate from object and function pointers. [conv.mem] gives null member pointer values and the base-to-derived conversion; there is no conversion to or from `void*` or integers, and a `reinterpret_cast` between two member pointer types has an unspecified result except that casting back recovers the original.

## std::invoke, std::mem_fn and projections

Calling through a member pointer needs different syntax for an object, a pointer, a smart pointer, and a `std::reference_wrapper`. `std::invoke` hides all four behind one call, as specified by the INVOKE rules in [func.require] that [func.invoke] refers to. For a data member it returns a reference whose value category follows the object, so `std::invoke(&P::age, p) = 41;` assigns.

```cpp
#include <functional>
#include <memory>

struct P { int age; int older(int n) const { return age + n; } };

void demo(P& p, std::unique_ptr<P>& up) {
  std::invoke(&P::age, p) = 41;          // object: int&
  int a = std::invoke(&P::older, up, 1); // smart pointer: dereferenced with *
  int b = std::invoke(&P::age, &p);      // raw pointer
  auto m = std::mem_fn(&P::older);       // a function object wrapping INVOKE
  int c = m(std::ref(p), 2);             // reference_wrapper is unwrapped
  (void)a; (void)b; (void)c;
}
```

`std::mem_fn` packages the same behaviour as a reusable function object, which predates lambdas and is still handy as an argument. To pass a member function as a callback, C++20's `std::bind_front(&Widget::on_click, this)` binds the object as the first INVOKE argument. It stores `this` as a plain pointer, so the widget must outlive the callable; the member pointer does nothing to keep the object alive. For a single call site, a lambda that captures the object is usually clearer and lets the compiler see the target directly. The most common modern use is a **projection**. Ranges algorithms accept a projection that they apply through `std::invoke` before comparing, so a member pointer is enough to sort or search by a field.

```cpp
#include <algorithm>
#include <string>
#include <vector>

struct Person { std::string name; int age; };

void by_age(std::vector<Person>& v) {
  std::ranges::sort(v, {}, &Person::age);                   // compare ages
  auto it = std::ranges::find(v, 25, &Person::age);         // find age 25
  (void)it;
}
```

## Taking the address of an overloaded member

`&S::f` names an overload set if `f` is overloaded, and an overload set has no type. [over.over] resolves it from the target: the type of the variable being initialized, a parameter, or a cast. With `auto` or a deduced template parameter there is no target, and the expression is ill-formed.

```cpp
struct S {
  void f(int);
  void f(double);
};

void (S::*p)(int) = &S::f;                         // picks f(int)
auto q = static_cast<void (S::*)(double)>(&S::f);  // picks f(double)
// auto r = &S::f;                                 // ill-formed: no target type
```

Standard library members are a special case. [namespace.std] says forming a pointer to a non-static member function of a standard library class, such as `&std::string::size`, has unspecified behavior and may be ill-formed. Implementations are allowed to add overloads, default arguments, or extra template parameters to those members. Wrap the call in a lambda instead.

## What to remember

- `&S::m` with a qualified name forms a pointer to member; `&(S::m)` does not.
- Write `(obj.*pmf)(args)` and `(ptr->*pmf)(args)`; the parentheses are required.
- `T Base::*` converts implicitly to `T Derived::*`; the other direction needs `static_cast` and a matching dynamic type.
- No implicit conversion goes through an inaccessible, ambiguous or virtual base.
- `&Derived::inherited` has the type of the declaring class, `T Base::*`.
- Member function pointers to virtual functions still dispatch virtually.
- Sizes and encodings are ABI choices: on Itanium, an offset with null `-1`, and a two-word pair for functions.
- `std::invoke` and `std::mem_fn` make member pointers callable with objects, pointers, smart pointers and `std::ref`; ranges projections use them.
- Overloaded members need a target type; never take the address of a standard library member function.
