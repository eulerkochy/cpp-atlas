---
title: "Inheritance and Virtual Functions"
summary: "How C++ lays out base subobjects, dispatches virtual calls through vtables, handles multiple and virtual inheritance, and traps callers during construction and destruction."
track: classes
minutes: 9
standard:
  - "[class.derived]"
  - "[class.mi]"
  - "[class.virtual]"
  - "[class.abstract]"
  - "[class.dtor]"
  - "[class.cdtor]"
  - "[class.access.virt]"
  - "[expr.dynamic.cast]"
cppreference:
  - title: "Derived classes"
    path: "language/derived_class"
  - title: "virtual function specifier"
    path: "language/virtual"
  - title: "override specifier"
    path: "language/override"
  - title: "final specifier"
    path: "language/final"
  - title: "Abstract class"
    path: "language/abstract_class"
  - title: "Destructors"
    path: "language/destructor"
  - title: "dynamic_cast conversion"
    path: "language/dynamic_cast"
  - title: "Using-declaration"
    path: "language/using_declaration"
prerequisites:
  - constructors-and-initialization-order
  - casts-and-qualifiers
---

Inheritance in C++ serves two distinct purposes: composing object representations by embedding base subobjects, and dispatching behavior dynamically through interfaces. Confusing those two mechanisms—especially how memory layout interacts with compile-time lookup versus runtime dispatch—causes slicing, undefined deletion, and surprising access bugs.

## Base subobjects and object layout

When `Derived` inherits from `Base`, C++ does not allocate `Base` separately and store a hidden heap pointer. Instead, the `Base` subobject lives directly inside the byte footprint of `Derived` (`[class.derived]`). Under single non-virtual inheritance on common ABIs, the base subobject typically starts at offset zero, followed by `Derived`'s own data members.

> **Mental model.** A `Derived` object is a single contiguous block containing one or more embedded `Base` subobjects plus `Derived`'s own members. Passing `Derived` by value to a parameter of type `Base` copies only the `Base` slice and leaves a plain `Base` object behind.

That embedded layout explains **object slicing**. If a function takes `Base b` by value and receives a `Derived`, copy construction initializes `b` strictly from `Derived`'s `Base` subobject; any derived state vanishes, and `b`'s dynamic type becomes `Base`. Polymorphic callers must therefore pass references (`Base&`, `const Base&`) or pointers (`Base*`, `std::unique_ptr<Base>`).

If a base class has no non-static data members and no virtual functions, the **empty base optimization** (EBO) lets the compiler give that base subobject zero size inside `Derived` (provided two bases of the same type do not share an address). Under multiple inheritance (`struct C : A, B`), `C` embeds both `A` and `B` sequentially. Converting a non-null `C*` to `B*` shifts the pointer address forward by `B`'s offset inside `C`, whereas converting a null `C*` preserves `nullptr`.

## Dynamic dispatch, vtables, and override safety

Every expression of class, pointer, or reference type has a **static type** fixed at compile time and—for polymorphic classes declaring or inheriting at least one `virtual` function—a **dynamic type** belonging to the most-derived object currently occupying that storage.

Compilers almost universally implement `virtual` dispatch with two structures: one read-only **vtable** (virtual function table) per polymorphic class holding function pointers and RTTI metadata, and one hidden **vptr** pointer embedded inside each polymorphic object instance pointing to its dynamic class's vtable. Calling `base_ptr->encode(42)` loads the vptr from `*base_ptr`, indexes into the slot assigned to `encode`, and calls the target address.

```cpp
struct Codec {
    virtual ~Codec() = default;
    virtual int encode(int x) const = 0; // pure virtual makes Codec abstract
};

int Codec::encode(int x) const { return x; } // legal out-of-class fallback definition

struct FastCodec final : Codec {
    int encode(int x) const override {
        return x * 2 + Codec::encode(1); // qualified call bypasses vtable dispatch
    }
};
```

Always mark overriding functions `override`. Without `override`, changing a parameter type, omitting `const`, or dropping a `&`/`&&` ref-qualifier silently creates a brand-new unrelated virtual or non-virtual function instead of overriding the base slot. Adding `final` on a class or virtual member seals further overriding and enables the optimizer to devirtualize calls through pointers of that static type. Notice also that a pure virtual function (`= 0`) prevents direct instantiation of `Codec` (`[class.abstract]`), yet may still provide a definition invoked explicitly via qualified syntax (`Codec::encode(1)`).

## Name hiding, using-declarations, and access traps

C++ splits name lookup, access checking, and default arguments from virtual dispatch. Neglecting that split produces two classic surprises.

First, **name hiding** happens during unqualified lookup before overload resolution begins. If `Derived` declares `void log(double)`, that declaration hides *every* overload named `log` in `Base`, including `void log(int)`. Calling `derived.log(42)` silently picks `log(double)` unless `Derived` pulls base overloads into scope with `using Base::log;`.

Second, **access control** (`public`, `protected`, `private`) and **default arguments** on a virtual call are resolved strictly against the **static type** of the call expression (`[class.access.virt]`), while the function body itself is chosen by the **dynamic type**.

```cpp
struct Base {
    virtual void log(int x = 10) const { (void)x; }
    virtual ~Base() = default;
};

struct Derived : Base {
    using Base::log;
    void log(double d) const { (void)d; }
private:
    void log(int x = 99) const override { (void)x; } // private + different default
};

void dispatch(const Base& b) {
    b.log(); // calls Derived::log(10): public via Base, default 10 via Base
}
```

> **Pitfall.** Making an overriding function `private` in `Derived` does not block callers using a `Base&` or `Base*`, and overriding a default argument in `Derived` has zero effect when invoked polymorphically through `Base`. Keep virtual overrides at matching access and avoid default arguments on virtual functions altogether.

The static-versus-dynamic split across every rule of a virtual call is compactly summarized in this lookup matrix:

| Call property | Resolved from | Reason in standard |
| --- | --- | --- |
| Unqualified name lookup | Static type | Scopes checked at compile time |
| Access check (`public`/`private`) | Static type | Checked at call site expression |
| Default argument value | Static type | Substituted at compile time |
| Target function body | Dynamic type | Dispatched via virtual override |

## Virtual destructors and virtual dispatch in constructors

Deleting a derived object through a `Base*` when `Base::~Base()` is non-virtual triggers **undefined behavior** (`[expr.delete]`), not merely an incomplete destructor call. A polymorphic base class designed for owning deletion through base pointers must declare a `public` `virtual` destructor (`virtual ~Base() = default;`). Conversely, a non-polymorphic mixin or base class that forbids deletion via `Base*` should make its destructor `protected` and non-virtual. Note that a pure virtual destructor (`virtual ~Base() = 0;`) still requires a body (`Base::~Base() {}`), because every derived destructor automatically invokes its base destructor during teardown.

Equally critical is what happens while a constructor or destructor runs.

> **Standardese.** Under `[class.cdtor]`, during execution of `Base`'s constructor or destructor, the dynamic type of the object under construction or destruction is `Base`—not `Derived`.

Because `Derived`'s members are not yet constructed during `Base::Base()` (and have already been destroyed before `Base::~Base()`), C++ locks the `vptr` to `Base` while `Base`'s constructor or destructor runs. Calling a virtual function from `Base::Base()` invokes `Base`'s own implementation rather than `Derived`'s override, and calling a pure virtual function without qualification during construction or destruction causes undefined behavior.

## Multiple inheritance, virtual bases, and RTTI

Non-virtual diamond inheritance (`Left : Base`, `Right : Base`, `Join : Left, Right`) places two separate `Base` subobjects inside `Join`, making conversions from `Join*` to `Base*` ambiguous. Inheriting `virtual Base` (`Left : virtual Base`, `Right : virtual Base`) merges them into a single shared subobject, typically accessed at runtime via a compiler-generated offset table inside the vtable.

With virtual inheritance, **the most-derived class initializes every virtual base directly** (`[class.base.init]`). When constructing `Join`, `Join`'s member-initializer list constructs `Base`, and any `Base(...)` initializers written in `Left` or `Right` are skipped entirely—even if `Join` omits `Base(...)` and relies on default initialization.

At runtime, two RTTI operators inspect polymorphic objects whose static type is a base class:

- `dynamic_cast<Target*>(ptr)` walks the dynamic object's RTTI graph safely across **downcasts** (`Base*` to `Derived*`) and **cross-casts** (`Left*` to sibling `Right*` inside `Join`), returning `nullptr` if the cast fails; `dynamic_cast<Target&>(ref)` throws `std::bad_cast` on failure (`[expr.dynamic.cast]`).
- `typeid(*ptr)` evaluates the dynamic `std::type_info` only when `*ptr` is a glvalue of polymorphic class type (`[expr.typeid]`), throwing `std::bad_typeid` if `ptr` is null; for non-polymorphic expressions, `typeid` evaluates only the static type and does not evaluate its operand.

## What to remember

- Inheritance embeds `Base` subobjects inside `Derived`; passing by value slices `Derived` and strips polymorphism.
- Always use `override` on overrides and `final` when sealing interfaces; pure virtuals (`= 0`) can still have definitions.
- Access control, name lookup, and default arguments bind to the **static type**, whereas virtual dispatch selects the **dynamic type**'s overrider.
- Deleting a derived object via a non-virtual base destructor is undefined behavior; make polymorphic base destructors `public virtual` (or non-polymorphic base destructors `protected` non-virtual).
- Inside `Base`'s constructor and destructor, the dynamic type is `Base`, never `Derived`; in virtual inheritance, the most-derived constructor initializes the virtual base directly.
