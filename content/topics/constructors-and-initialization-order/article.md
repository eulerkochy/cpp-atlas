---
title: "Constructors & Member Initialization Order"
summary: "Follow the deterministic sequence of base-class, member, and destructor execution—and avoid initializer reordering traps, virtual dispatch bugs, and accidental non-aggregates."
track: "classes"
minutes: 8
standard:
  - "[class.ctor]"
  - "[class.base.init]"
  - "[class.dtor]"
  - "[class.cdtor]"
  - "[except.ctor]"
  - "[dcl.init.aggr]"
cppreference:
  - title: "Constructors and member initializer lists"
    path: "language/constructor"
  - title: "Default constructors"
    path: "language/default_constructor"
  - title: "Converting constructor"
    path: "language/converting_constructor"
  - title: "explicit specifier"
    path: "language/explicit"
  - title: "Destructors"
    path: "language/destructor"
  - title: "Derived classes"
    path: "language/derived_class"
prerequisites:
  - "initialization-forms"
  - "copy-and-move"
  - "copy-elision"
---

Every object in C++ follows a single, rigid construction script. Whether a class has one `int` or a diamond inheritance hierarchy, the compiler never follows the order you type in a constructor's member initializer list. Instead, `[class.base.init]/13` locks construction to the **declaration order** in the class definition so that every constructor shares one fixed destruction reverse order.

> **Mental model.** A constructor's member initializer list supplies *arguments*, not *execution order*. Every object is assembled bottom-up—virtual bases, direct bases, declared members, then body—and torn down in the exact mirror sequence when its lifetime ends.

## The invariant initialization order

For any non-delegating constructor of a class `D`, initialization executes in four mandatory stages (`[class.base.init]/13`):

| Phase | Subobjects initialized | Order rule | Destruction order (`~D`) |
| --- | --- | --- | --- |
| 1 | Virtual base classes | Depth-first, left-to-right in the inheritance DAG | Runs **4th** (very last) |
| 2 | Direct non-virtual base classes | Left-to-right in the base-specifier list | Runs **3rd** |
| 3 | Non-static data members | Top-to-bottom declaration order in class body | Runs **2nd** |
| 4 | Constructor compound body `{ ... }` | Statements inside `D::D(...)` | `~D` body runs **1st** (before subobjects) |

Two subtleties stand out in diamond hierarchies. First, **the most-derived class owns every virtual base**: when `Derived` inherits from `Left` and `Right` (which both inherit virtually from `VBase`), `Derived`'s constructor invokes `VBase`'s initializer directly—or default-initializes `VBase` if `Derived` omits it—while `Left` and `Right`'s initializers for `VBase` are skipped completely. Second, if a member has both a default member initializer (`int n = 42;`) and a mem-initializer (`: n(7)`), the mem-initializer wins and the default member initializer is ignored without double work.

```cpp
#include <iostream>

struct VBase {
    explicit VBase(int x) { std::cout << "VBase(" << x << ") "; }
    virtual ~VBase() = default;
};

struct Left : virtual VBase {
    Left() : VBase(1) { std::cout << "Left "; } // VBase(1) skipped by Derived!
};

struct Right : virtual VBase {
    Right() : VBase(2) { std::cout << "Right "; } // VBase(2) skipped by Derived!
};

struct Derived : Left, Right {
    int first = (std::cout << "first ", 10);
    int second;

    // Even if written in reverse order, VBase -> Left -> Right -> first -> second -> body:
    Derived() : VBase(99), Left(), Right(), second(first + 1) {
        std::cout << "Derived\n";
    }
};
```

## The mem-initializer order trap and initialization vs. assignment

Because member order always obeys declaration order inside the class body, reordering members in a mem-initializer list creates silent use-before-initialization bugs.

> **Pitfall.** Writing `struct Buffer { int* data; std::size_t cap; Buffer(std::size_t n) : cap(n), data(new int[cap]) {} };` has undefined behavior. Because `data` is declared before `cap`, `data(new int[cap])` runs *first*, reading an uninitialized `cap` before `cap(n)` executes. Always keep mem-initializers in exact declaration order and enable `-Wreorder`.

Always initialize members in the mem-initializer list rather than assigning inside `{ ... }`. A member constructed in `{ name_ = std::move(s); }` is **default-constructed first** during Phase 3 and then **move-assigned** during Phase 4—wasting work and failing to compile altogether for `const` members, reference members (`T&`), and types without default constructors.

## Delegating constructors and inherited constructors

C++11 added **delegating constructors** so one constructor can forward to another (`Widget() : Widget(0) { ... }`). A delegating constructor cannot mention any base or member in its initializer list—the target constructor owns all of Phases 1 through 3.

Delegating introduces an important exception-handling rule (`[except.ctor]/3`):

- In a **non-delegating** constructor, throwing inside the constructor body unwinds only already-constructed bases and members; the class's own destructor `~Widget()` does *not* run because the object never finished constructing.
- In a **delegating** constructor, the object's lifetime is considered to have **begun as soon as the target constructor returns**. If the delegating constructor's own body throws afterward, `~Widget()` *does* execute during stack unwinding.

You can also pull base-class constructors into a derived class with `using Base::Base;` (`[namespace.udecl]`), which generates matching forwarding constructors in `Derived` while still initializing `Derived`'s own data members via their default member initializers.

## Virtual dispatch during construction and destruction

Inside a base constructor or destructor, the dynamic type of `*this` is temporarily the base class currently executing, never the final derived class (`[class.cdtor]/4`).

> **Standardese.** "When a virtual function is called directly or indirectly from a constructor or from a destructor, including during the construction or destruction of the class's non-static data members, and the object to which the call applies is the object under construction or destruction, the function called is the final overrider in the constructor's or destructor's class and not one overriding it in a more-derived class." — `[class.cdtor]`

That guarantee prevents a base constructor from touching `Derived` member variables whose constructors have not started yet (or whose destructors have already finished). Calling a **pure virtual** function directly (or implicitly without overriding it in the current class) from a constructor or destructor is undefined behavior—pass configuration values as constructor arguments or invoke a two-phase helper after construction instead.

```cpp
struct Base {
    Base() { init_log(); } // Always calls Base::init_log(), never Derived::init_log()!
    virtual const char* kind() const { return "Base"; }
    void init_log() const { (void)kind(); }
    virtual ~Base() = default;
};

struct Derived : Base {
    int payload = 42;
    const char* kind() const override { return "Derived"; }
};
```

## Special rules: explicit, defaulted, and aggregate traps

Three modern constructor rules save subtle diagnostics once you know them:

1. **Mark converting constructors `explicit`.** Any non-explicit constructor callable with one argument acts as an implicit conversion (`void take(Span); take(10);`). Since C++11, `explicit` also blocks copy-list-initialization with multiple arguments (`return {1, 2};`), and C++20 added conditional `explicit(bool)` (`explicit(!std::is_convertible_v<T, U>)`) for wrapper templates like `std::pair` and `std::optional`.
2. **User-declared constructors suppress defaults.** Declaring *any* constructor—even `Widget(int)`—suppresses the implicitly declared default constructor unless you explicitly write `Widget() = default;`.
3. **C++20 tightened aggregate rules.** Prior to C++20, writing `Point() = default;` kept `Point` an aggregate. Starting in C++20 (`[dcl.init.aggr]/1`), **any user-declared constructor**—even `= default` or `= delete`—removes aggregate status, breaking `{1, 2}` aggregate initialization unless you omit the constructor declaration entirely or provide a matching constructor.

```cpp
#include <type_traits>

struct AggregatePoint {
    int x = 0;
    int y = 0;
};

struct NonAggregatePoint {
    int x = 0;
    int y = 0;
    NonAggregatePoint() = default; // User-declared: disables aggregate init in C++20+!
};

static_assert(std::is_aggregate_v<AggregatePoint>);
static_assert(!std::is_aggregate_v<NonAggregatePoint>);

AggregatePoint p1{1, 2}; // Valid aggregate initialization
// NonAggregatePoint p2{1, 2}; // Error in C++20+: no matching constructor
```

## What to remember

- **Declaration order rules construction.** Virtual bases run first, then direct bases left-to-right, then non-static data members top-to-bottom, ignoring mem-initializer order.
- **Destruction is exact LIFO.** Destructors unwind bodies, members, direct bases, and finally virtual bases in strict reverse construction order.
- **Virtual calls stay in the active class.** Inside `Base::Base()` or `Base::~Base()`, `*this` has dynamic type `Base`, never `Derived`.
- **Delegating completes object lifetime early.** Once the target constructor finishes, throwing in the delegating body triggers `~T()`.
- **Watch `explicit` and C++20 aggregates.** Use `explicit` on single- and multi-argument constructors to stop silent conversions, and omit `= default` constructors when you want aggregate brace initialization.
