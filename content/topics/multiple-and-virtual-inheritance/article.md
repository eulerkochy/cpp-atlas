---
title: "Multiple and virtual inheritance"
summary: "With several bases, a derived object holds several base subobjects at different addresses, so conversions may move the pointer and names may be ambiguous. Virtual inheritance shares one base subobject among all paths, at the price of most-derived initialization and run-time located bases."
track: "classes"
minutes: 13
standard:
  - "[class.mi]"
  - "[class.member.lookup]"
  - "[class.base.init]"
  - "[class.virtual]"
  - "[conv.ptr]"
  - "[expr.static.cast]"
  - "[expr.reinterpret.cast]"
  - "[expr.dynamic.cast]"
  - "[basic.compound]"
  - "[intro.object]"
  - "[expr.cast]"
cppreference:
  - title: "Derived classes (virtual base classes)"
    path: "language/derived_class"
  - title: "static_cast conversion"
    path: "language/static_cast"
  - title: "reinterpret_cast conversion"
    path: "language/reinterpret_cast"
  - title: "dynamic_cast conversion"
    path: "language/dynamic_cast"
  - title: "Empty base optimization"
    path: "language/ebo"
prerequisites:
  - "inheritance-and-virtual-functions"
  - "constructors-and-initialization-order"
  - "casts"
  - "object-layout-and-alignment"
---

## The one idea

A class with several bases contains one subobject per non-virtual base, each at its own place inside the object. Converting a pointer from the derived class to a base means finding that subobject, and in general that changes the address. A virtual base is different: however many paths lead to it, the most derived object contains exactly one, shared subobject, whose position is only known at run time.

Most of the rules follow from that picture. Names found in two different subobjects are ambiguous. Casts that know the class relationship adjust pointers, while casts that do not, such as `reinterpret_cast`, do not. And because a shared virtual base belongs to no single path, only the most derived class can initialize it.

> **Mental model.** A pointer to a base is a pointer to a particular subobject, not to the whole object. Any cast that does not know the inheritance graph cannot find the right subobject.

## Several base subobjects and pointer adjustment

Take `struct C : A, B { ... };`. A `C` object contains an `A` subobject and a `B` subobject, and the standard does not say where. Typical implementations put `A` at offset zero and `B` after it, so `static_cast<B*>(&c)`, or the implicit conversion, adds an offset to the address.

The compiler applies the offset in both directions because it knows the class graph. Converting `B*` back to `C*` with `static_cast` subtracts it, and a null pointer stays null in both directions. Comparing a `B*` with a `C*` converts the `C*` to `B*` first, so the comparison is true for the same object even though the raw addresses differ.

```cpp
#include <cstdio>

struct A { int a = 1; };
struct B { int b = 2; };
struct C : A, B { int c = 3; };

int main() {
  C c;
  B* pb = &c;                       // adjusted to the B subobject
  C* p1 = static_cast<C*>(pb);      // adjusted back: p1 == &c
  std::printf("%d %d\n", pb == &c, p1->c);   // 1 3, guaranteed
  // C* p2 = reinterpret_cast<C*>(pb);  // not adjusted: p2 still points at the B
  //                                    // subobject, so p2->c is undefined behavior
}
```

`reinterpret_cast` between object pointer types is specified as a round trip through `void*`. Converting from `void*` only yields a pointer to a different object when the two objects are **pointer-interconvertible**, which a class and its second base are not. So the value is unchanged: a `C*` that points at a `B`. The same trap catches code that stores a `B*` in a `void*` and later casts the `void*` to `C*`. C-style casts are exposed too: when either class is incomplete at the cast, [expr.cast] leaves it unspecified whether the `static_cast` or the `reinterpret_cast` meaning is used.

> **Pitfall.** Round-trip through `void*` only with the exact type you started from. Store a `B*`, get back a `B*`, then `static_cast` to `C*` if you must.

## Ambiguity and name lookup

Member name lookup in a class with several bases looks in each base and merges the results. If the name is found in two different base subobjects, the lookup is ambiguous, and the program is ill-formed when the name is used. This happens **before** overload resolution, so different parameter lists do not help.

```cpp
struct Reader { void put(int) {} };
struct Writer { void put(double) {} };
struct Device : Reader, Writer {
  // using Reader::put; using Writer::put;   // uncomment to overload them
};

void use(Device& d) {
  // d.put(1);          // ill-formed: put is found in two base classes
  d.Reader::put(1);     // OK: qualified name picks the subobject
}
```

Two using-declarations bring both sets into the derived scope, after which ordinary overload resolution applies. Static members, nested types and enumerators found through several paths are not ambiguous when they denote the same entity, because no particular subobject is needed.

## The diamond and virtual base classes

If `Left` and `Right` both derive from `Top`, and `Bottom` derives from both, a `Bottom` contains two `Top` subobjects. Converting `Bottom*` to `Top*` is ambiguous, and a member of `Top` must be reached through `Left::` or `Right::`.

```text
non-virtual                      virtual

  Top     Top                       Top
   |       |                       /   \
  Left   Right                  Left   Right
     \   /                         \   /
     Bottom                        Bottom
two Top subobjects              one shared Top
```

Declaring the base `virtual`, as in `struct Left : virtual Top`, makes all virtual occurrences of `Top` in a most derived object share one subobject. The conversion to `Top*` is then unambiguous, and `Top`'s constructor runs once.

Shared bases also create **dominance**. A name declared in a derived class hides the same name in a base, and with a shared virtual base that holds across paths: if `Left` declares `f` and `Top` declares `f`, then in `Bottom` the name `Left::f` dominates `Top::f`, even though `Right` sees only `Top::f`. With non-virtual inheritance the same shape is ambiguous, because `Right`'s `Top` is a different subobject.

For virtual functions, the final overrider must be unique. If both `Left` and `Right` override a virtual function of a shared `Top`, `Bottom` must override it too, or the class is ill-formed.

## Who initializes a virtual base

Because the shared subobject belongs to no single path, [class.base.init] gives its initialization to the **most derived class**. Mem-initializers naming a virtual base in intermediate classes are ignored when those classes are not the most derived. If the most derived class does not name the virtual base, the virtual base is default-initialized, and the program is ill-formed if it has no default constructor.

```cpp
#include <cstdio>

struct Top { Top(int v) { std::printf("Top %d\n", v); } };
struct Left  : virtual Top { Left()  : Top(1) {} };
struct Right : virtual Top { Right() : Top(2) {} };
struct Bottom : Left, Right {
  Bottom() : Top(3) {}   // required: Top has no default constructor
};

int main() { Bottom b; }   // prints Top 3; Top(1) and Top(2) are ignored
```

Virtual bases are also constructed first, before any non-virtual base, in the order of a depth-first, left-to-right walk of the base class graph. For `struct M : N, L, R` where only `L` and `R` derive virtually from `V`, the constructors run in the order `V`, `N`, `L`, `R`, `M`, and destruction reverses it.

> **Standardese.** [class.base.init] says that a mem-initializer whose mem-initializer-id denotes a virtual base class is ignored during execution of a constructor of any class that is not the most derived class.

## Casts across the graph and empty bases

`static_cast` can convert down from a non-virtual base, unchecked. It cannot convert down from a virtual base, and the program is ill-formed if you try, because the position of the virtual base relative to the derived class is not a compile-time constant. `dynamic_cast` handles that case, and it can also **cross-cast** sideways: given an `A*` that points into a `C : A, B`, `dynamic_cast<B*>` finds the `B` subobject of the same most derived object, or returns null if there is no unique public one. `dynamic_cast<void*>` returns the address of the most derived object. Downcasts, cross-casts and casts to `void*` all need a polymorphic source type.

```cpp
struct A { virtual ~A() = default; };
struct B { virtual ~B() = default; };
struct C : A, B {};

B* sideways(A* pa) {
  return dynamic_cast<B*>(pa);   // non-null when *pa is part of a C
  // static_cast<B*>(pa) is ill-formed: A and B are unrelated
}
```

Empty base classes may occupy no storage, the empty base optimization, which the topic on object layout and alignment covers. Multiple inheritance adds one constraint: two subobjects of the same type must have distinct addresses, per [intro.object]. An empty base cannot share its address with a member or another base of the same type, so the optimization quietly turns off in that case.

## Layout: ABI practice, not the standard

> **Mental model.** Everything in this section is implementation practice under the Itanium C++ ABI used by GCC and Clang on Linux and macOS, not a guarantee. MSVC differs in detail.

The first non-virtual polymorphic base is the **primary base**: it lives at offset zero and shares the object's vptr. Every other polymorphic base subobject has its own vptr pointing into a secondary vtable. When you call a virtual function through a `B*` and `C` overrides it, the `B` vtable slot points to a small **thunk** that subtracts the offset to get `this` back to the start of the `C` before jumping to `C`'s function.

A virtual base sits at an offset that depends on the most derived class, so the vtable stores a **virtual base offset**, and converting to a virtual base loads that offset at run time. During construction, intermediate classes use special construction vtables with offsets that suit the partially built object. MSVC instead stores a separate virtual base table pointer in the object. These differences are why mixing compilers across a class hierarchy needs a shared ABI, and why size or offset numbers are never portable facts.

## What to remember

- Each non-virtual base is its own subobject; converting to most bases changes the pointer value.
- `static_cast` and implicit conversions adjust pointers; `reinterpret_cast` and round trips through `void*` with a different type do not.
- Lookup that finds a name in two base subobjects is ambiguous before overload resolution; qualify it or add using-declarations.
- A non-virtual diamond has two top subobjects; virtual inheritance shares one.
- In a virtual diamond, a derived declaration dominates the virtual base's, and a virtual function needs a unique final overrider.
- Only the most derived class initializes a virtual base; intermediate mem-initializers for it are ignored.
- Virtual bases are built first, depth-first and left to right.
- `static_cast` cannot go down from a virtual base; `dynamic_cast` can, and can cross-cast.
- Two subobjects of the same type never share an address, which can disable the empty base optimization.
- Thunks, primary bases and virtual base offsets are ABI practice, not standard guarantees.
