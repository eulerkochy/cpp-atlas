---
title: "Copy elision and NRVO"
summary: "Why C++17 guaranteed prvalue elision eliminates moves by language semantics rather than optimization, and how optional NRVO breaks when you write return std::move(x)."
track: "value-semantics"
minutes: 9
standard:
  - "[class.copy.elision]"
  - "[basic.lval]"
  - "[conv.rval]"
  - "[dcl.init]"
  - "[expr.call]"
cppreference:
  - title: "Copy elision"
    path: "language/copy_elision"
  - title: "Value categories"
    path: "language/value_category"
  - title: "return statement"
    path: "language/return"
  - title: "Copy-initialization"
    path: "language/copy_initialization"
  - title: "Direct-initialization"
    path: "language/direct_initialization"
prerequisites:
  - "value-categories"
  - "copy-and-move"
---

Copy elision began in C++98 as a compiler permission slip: the compiler could skip calling a copy constructor when constructing from a temporary, yet the language still forced that copy constructor to exist and be accessible. C++17 split that single rule into two fundamentally different mechanisms: **guaranteed prvalue initialization**, where no copy or move ever exists in the abstract machine, and **optional elision** such as NRVO, where a real local object's construction may still be fused into the caller's destination.

## From compiler optimization to language guarantee

Prior to C++17, returning a `std::mutex` or non-movable lock guard by value from a factory function failed to compile. Even when `-O2` elided every copy instruction in machine code, the front-end checked whether an accessible copy or move constructor existed before eliding it.

C++17 fixed this by redefining **prvalues** (`[basic.lval]`, `[dcl.init]`). Because a prvalue is an unmaterialized initializer rather than an object in storage, returning `T{args...}` passes the initialization recipe directly down to the caller's target object slot.

> **Mental model.** Guaranteed copy elision does not delete a move constructor call—it passes the destination memory address down the prvalue chain so only one object is ever constructed.

## Mandatory prvalue elision in C++17 and beyond

Under `[dcl.init]` and `[conv.rval]`, whenever an object of class type `T` is initialized from a prvalue whose cv-unqualified type is also `T`, no temporary object is materialized at all. You can chain arbitrarily many factory functions returning by value, pass prvalues into value parameters (`take(make())`), or allocate via `new T(make())`, and none of them require a copy or move constructor:

```cpp
struct NonMovable {
    int token;
    explicit NonMovable(int t) : token(t) {}
    NonMovable(const NonMovable&) = delete;
    NonMovable(NonMovable&&) = delete;
};

NonMovable make_inner() { return NonMovable{42}; }
NonMovable make_outer() { return make_inner(); }
void consume(NonMovable nm) { (void)nm.token; }

void mandatory_elision_demo() {
    NonMovable direct = make_outer(); // Constructs directly into `direct`
    consume(make_outer());            // Constructs directly into parameter `nm`
    (void)direct;
}
```

Four boundaries mark where mandatory prvalue elision **stops** applying:

- **Assignment (`target = make_outer();`)**: `target` is already alive, so `make_outer()` materializes a temporary xvalue and invokes `operator=`.
- **Type mismatch (`Base b = make_derived();`)**: When the destination type differs from the prvalue's type, materialization occurs to construct `Derived` and then `Base(Derived&&)` (object slicing) runs.
- **Returning a named variable (`return local;`)**: `local` is an lvalue, not a prvalue, shifting the situation from mandatory elision to optional NRVO.
- **No-unique-address members or base subobjects**: Initializing a base subobject or a `[[no_unique_address]]` member from a prvalue may still materialize a temporary on some ABIs because tail padding can overlap sibling data.

> **Standardese.** Under `[dcl.init]`, when initializing an object of class type from a prvalue of the same cv-unqualified class type, the initializer expression directly initializes the target object without materializing a temporary.

## NRVO and optional compiler elision

When a function constructs a **named** automatic local object and returns it (`return buf;`), that object already owns storage in the function's stack frame unless the compiler places `buf` directly in the caller's return-value slot. That transformation is **Named Return Value Optimization (NRVO)** (`[class.copy.elision]`).

| Mechanism | Applies to | Copy or move ctor required? | Guaranteed by ISO C++? | Observable ctor/dtor side effects skipped? |
| --- | --- | --- | --- | --- |
| Mandatory prvalue init | Unnamed prvalue of same cv-unqualified type | No (even if `= delete`) | Yes (C++17+) | Yes, no extra object exists |
| NRVO | Named local automatic object of same return type | Yes, must be accessible | No (permitted only) | Yes, when compiler applies NRVO |
| Implicit move | Named local or parameter when elision is not used | Yes (rvalue overload first) | Yes (overload order) | No, move ctor runs |

Beyond NRVO, `[class.copy.elision]` permits optional elision in two exception-handling cases: throwing an automatic local variable (`throw err;`) into the exception object, and catching an exception by value (`catch (MyError e)`) directly sharing storage with the active exception object—again, only when a copy or move constructor is accessible.

## What breaks NRVO and how to keep it

Because NRVO is an optional optimization rather than a language guarantee, small structural choices prevent compilers from fusing a local variable into the return slot:

1. **Writing `return std::move(local);`**: NRVO requires the `return` operand to be the unparenthesized name of a non-volatile automatic variable. Wrapping it in `std::move(local)` turns the operand into a function call returning an xvalue, **disabling NRVO** and forcing an actual move constructor call (flagged by `-Wpessimizing-move`).
2. **Returning a function parameter (`return param;`)**: Function parameters reside in caller- or ABI-dictated parameter slots, so `[class.copy.elision]` forbids NRVO on parameters—though implicit move still selects the move constructor.
3. **Returning different local variables on multiple branches (`if (ok) return a; return b;`)**: A single return slot cannot simultaneously alias two distinct live objects `a` and `b`, so compilers usually disable NRVO on at least one branch.
4. **Returning a member subobject or static/global variable (`return pair.first;`)**: Neither is an automatic variable matching the return type's whole storage.

> **Pitfall.** Writing `return std::move(local);` blocks NRVO and forces a runtime move construction where plain `return local;` constructs directly in the caller's slot—and already uses implicit move whenever NRVO cannot run.

## Compilable proof: prvalues vs named locals

Testing `NonMovable` side by side highlights the exact boundary between C++17's language guarantee and optional NRVO:

```cpp
struct NonMovable {
    int id;
    explicit NonMovable(int v) : id(v) {}
    NonMovable(const NonMovable&) = delete;
    NonMovable(NonMovable&&) = delete;
};

NonMovable ok_prvalue(bool flag) {
    if (flag) {
        return NonMovable{1}; // Guaranteed: direct in-place init
    }
    return NonMovable{2};     // Guaranteed: separate prvalue branch
}

/* Ill-formed even though NRVO could optimize it in release builds:
NonMovable broken_nrvo() {
    NonMovable local{3};
    return local; // Error: NonMovable(NonMovable&&) is deleted!
}
*/
```

Even though an optimizing compiler would gladly apply NRVO to `broken_nrvo()`, the standard forbids relying on NRVO for legality because another build configuration (or `-fno-elide-constructors`) must still have a valid move or copy constructor to fall back on. Only when returning an unmaterialized prvalue—even across multiple `if` branches—does C++17 guarantee that no copy or move constructor is ever needed.

## What to remember

- Guaranteed copy elision in C++17+ applies to prvalues of the same cv-unqualified class type and works even when copy and move constructors are `= delete`.
- Assignment (`x = make()`), type mismatches (`Base b = make_derived()`), and named local variables (`return local;`) do not trigger guaranteed prvalue elision.
- NRVO is permitted but never guaranteed, so returned named locals still require an accessible copy or move constructor.
- Never write `return std::move(local);`: it disables NRVO, whereas plain `return local;` gets NRVO when possible and implicit move automatically otherwise.
