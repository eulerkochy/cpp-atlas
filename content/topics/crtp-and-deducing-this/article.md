---
title: "CRTP and Deducing This"
summary: "Achieve zero-overhead static polymorphism with the Curiously Recurring Template Pattern, then eliminate its boilerplate and fourfold member overloads using C++23 explicit object parameters."
track: templates
minutes: 9
standard:
  - "[class.derived]"
  - "[dcl.fct]"
  - "[class.mfct]"
  - "[temp.dep]"
  - "[over.match.funcs]"
  - "[class.mem]"
cppreference:
  - title: "Curiously Recurring Template Pattern"
    path: "language/crtp"
  - title: "Non-static member functions"
    path: "language/member_functions"
  - title: "The this pointer"
    path: "language/this"
  - title: "Dependent names"
    path: "language/dependent_name"
  - title: "std::forward_like"
    path: "utility/forward_like"
  - title: "Empty base optimization"
    path: "language/ebo"
prerequisites:
  - inheritance-and-virtual-functions
  - value-categories
  - forwarding-references-and-perfect-forwarding
---

When concrete types are known at compile time, virtual dispatch forces unnecessary indirection through a `vptr` and blocks inlining across interfaces. C++ solves static polymorphism via two complementary techniques: the classic **Curiously Recurring Template Pattern** (CRTP) and C++23's **explicit object parameters** (commonly called *deducing `this`*).

## Static polymorphism with CRTP

In CRTP, a derived class `Widget` inherits from a class template `Base<Widget>`, passing its own type as the template argument (`[class.derived]`):

```cpp
template <class Derived>
class CounterMixin {
    friend Derived;
    CounterMixin() = default; // prevents accidental Base<WrongType> inheritance
public:
    void bump() {
        static_cast<Derived&>(*this).on_bump();
    }
    const Derived& self() const {
        return static_cast<const Derived&>(*this);
    }
};

struct Metric : CounterMixin<Metric> {
    int count = 0;
    void on_bump() { ++count; }
};
```

Because `CounterMixin<Metric>` knows the exact type `Metric` at compile time, `static_cast<Derived&>(*this)` resolves to `Metric::on_bump()` statically—with zero `vptr` storage overhead, zero vtable lookup, and full inlining. Standard and production libraries rely on CRTP extensively for mixins (like `std::ranges::view_interface` or `std::enable_shared_from_this`), static interfaces, and empty base optimization (`[class.mem]`).

## Classic CRTP pitfalls: lookup, timing, and friends

Three recurring traps catch authors writing classic CRTP bases:

1. **Wrong template argument copy-paste:** Writing `struct B : CounterMixin<A>` instead of `CounterMixin<B>` causes undefined behavior when `CounterMixin<A>` casts `*this` to `A&`! Guard against this by making `CounterMixin`'s constructor `private` and declaring `friend Derived;`.
2. **Incomplete `Derived` during instantiation:** Inside the class body of `CounterMixin<Metric>`, `Metric` is still an incomplete type while `CounterMixin<Metric>` is being instantiated as `Metric`'s base. Member *function bodies* may reference `Derived` (since function bodies are instantiated lazily upon use), whereas non-static data members or signature return types like `typename Derived::value_type` will fail because `Derived` is not complete yet.
3. **Dependent base name lookup (`[temp.dep]`):** When a class template `Child<T>` inherits from a dependent base `Base<T>`, two-phase lookup does **not** examine `Base<T>` during unqualified lookup. Access base members via `this->member` or `Base<T>::member`.

> **Pitfall.** Never call `static_cast<Derived&>(*this)` inside `Base<Derived>`'s constructor or destructor. When `Base`'s constructor executes, `Derived`'s subobject has not begun its lifetime yet; when `Base`'s destructor runs, `Derived` has already been destroyed. Either access invokes undefined behavior (`[class.cdtor]`).

## C++23 explicit object parameters (Deducing This)

C++23 (`P0847R7`) introduces **explicit object member functions** (`[dcl.fct]`, `[class.mfct]`): instead of an implicit hidden `this` pointer, the first parameter carries the keyword `this` and gives the receiver an explicit name and deducible template type.

Before C++23, wrapper types such as `std::optional` or fluent builders had to write four nearly identical accessor overloads (`&`, `const&`, `&&`, and `const&&`) just to forward a stored member with matching constness and value category. Worse, adding `&` and `&&` ref-qualifiers to a classic CRTP base required duplicating every mixin method too.

> **Mental model.** An explicit object parameter makes the receiver parameter behave like any ordinary function parameter whose type and value category (`&`, `const&`, `&&`, `const&&`, or even derived subclass type `Self`) are deduced straight from the call expression.

Look at how one function template replaces all four accessor overloads—while also deducing cv-qualification and preserving value category on member fields with `std::forward_like`:

```cpp
#include <string>
#include <utility>

struct Cell {
    std::string data;

    template <class Self>
    auto&& value(this Self&& self) {
        return std::forward_like<Self>(self.data);
    }
};
```

Wait—why use `std::forward_like<Self>(self.data)` instead of `std::forward<Self>(self).data`? If `data` were a reference member (`std::string& data;`), `[expr.ref]` dictates that `std::forward<Cell>(self).data` evaluates to an **lvalue** `std::string&` even on an rvalue `Cell&&`, silently blocking moves! `std::forward_like<Self>(self.data)` merges `Self`'s constness and value category directly onto `self.data`, returning `std::string&&` when `self` is a non-const rvalue.

> **Standardese.** Under `[dcl.fct]` and `[class.mfct]`, a member function with an explicit object parameter has **no implicit `this` pointer** inside its body, cannot be `static`, `virtual`, `const`, `volatile`, or ref-qualified (`&`/`&&`), and taking its address yields a **plain function pointer** (`auto fn = &Cell::value<Cell&>;` has type `std::string& (*)(Cell&)`), not a pointer-to-member-function.

## CRTP without templates, recursive lambdas, and pass-by-value this

Because `Self` in `(this Self&& self)` deduces to the actual expression type at the call site—including any **derived class**—CRTP no longer requires making the base class a template at all:

```cpp
struct Printable {
    void print_twice(this auto&& self) {
        self.emit();
        self.emit();
    }
};

struct Badge : Printable {
    int hits = 0;
    void emit() { ++hits; }
};

auto factorial = [](this auto&& self, int n) -> int {
    return n <= 1 ? 1 : n * self(n - 1);
};
```

Look at the cleanup achieved in `Printable` and `factorial`:

- **Non-template CRTP:** `Printable` is an ordinary non-template class; `Badge` simply inherits `Printable`, eliminating `Base<WrongType>` bugs, dependent base lookup issues, and `static_cast<Derived&>(*this)` boilerplate.
- **Recursive lambdas:** Writing `(this auto&& self, int n)` inside a lambda binds `self` directly to the closure object, giving zero-overhead self-recursion without `std::function` type erasure or passing the lambda to itself.
- **Pass-by-value `this`:** Small scalar-like types can declare `void tick(this Counter copy)` to receive `this` in a register by value rather than indirectly by pointer.

Compare the three dispatch mechanisms side by side to choose the right tool:

| Mechanism | Runtime cost | Base template needed? | Eliminates 4x `&`/`&&` overloads? | Heterogeneous container support? |
| --- | --- | --- | --- | --- |
| Virtual dispatch | `vptr` + indirect call | No | No | Yes (`Base*`) |
| Classic CRTP | Zero (static inline) | Yes (`Base<Derived>`) | No | No |
| Deducing `this` (C++23) | Zero (static inline) | No | Yes (`this Self&&`) | No |

Note two remaining boundaries when adopting deducing `this`:

- Inside `Printable::print_twice(this auto&& self)`, calling `self.emit()` respects normal member access rules—so `Badge::emit()` must be `public` (or `Printable` declared a `friend`), whereas private helpers on `Printable` itself require care because `self` carries static type `Badge`, not `Printable`.
- Because overload resolution treats an explicit object parameter like a normal first parameter (`[over.match.funcs]`), a derived class can cleanly shadow or customize behavior without template specialization, while pass-by-value `this` removes aliasing concerns on immutable small handles.

## What to remember

- Classic CRTP achieves zero-overhead static polymorphism via `Base<Derived>` and `static_cast<Derived&>(*this)`, but breaks if `Base` invokes `Derived` during construction/destruction or relies on incomplete members of `Derived`.
- Always guard classic CRTP constructors (`private` + `friend Derived`) to prevent inheriting `Base<WrongType>`, and qualify dependent base members with `this->`.
- C++23 explicit object parameters (`this Self&& self`) eliminate quadrupled `&`/`const&`/`&&`/`const&&` overloads, simplify CRTP into non-template bases, and enable direct recursive lambdas.
- Explicit object functions have no implicit `this`, forbid `virtual`/`static`/`const`/ref-qualifiers, and produce regular function pointers when their address is taken.
- Use `std::forward_like<Self>(self.member)` when returning a member from `this Self&& self` so reference members still respect the owner's constness and rvalue-ness.
