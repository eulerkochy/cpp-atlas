---
title: "Forwarding References and Perfect Forwarding"
summary: "Decode the T&& template deduction exception, reference collapsing rules, and why std::forward and C++23 std::forward_like preserve exact value category and constness."
track: templates
minutes: 9
standard:
  - "[dcl.ref]"
  - "[dcl.init.ref]"
  - "[temp.deduct.call]"
  - "[dcl.type.auto.deduct]"
  - "[forward]"
  - "[temp.variadic]"
cppreference:
  - title: "Template argument deduction"
    path: "language/template_argument_deduction"
  - title: "Reference declaration"
    path: "language/reference"
  - title: "Reference initialization"
    path: "language/reference_initialization"
  - title: "std::forward"
    path: "utility/forward"
  - title: "std::forward_like"
    path: "utility/forward_like"
  - title: "std::move"
    path: "utility/move"
  - title: "Placeholder type specifiers"
    path: "language/auto"
prerequisites:
  - value-categories
  - type-deduction-auto-decltype
  - reference-binding-and-temporaries
---

Generic factories, wrappers, and `emplace` methods must pass arguments along to an inner constructor or function without copying lvalues or blocking moves on rvalues. Perfect forwarding achieves that by encoding the caller's value category inside a deduced template type parameter and restoring it at the forwarding boundary.

## When T&& is a forwarding reference (and when it isn't)

Despite sharing syntax with rvalue references, `T&&` becomes a **forwarding reference** (colloquially called a universal reference) only under an exact syntactic condition (`[temp.deduct.call]`): `T` must be a cv-unqualified template type parameter **of that specific function template**, written directly in the form `T&&` (or `auto&&` in variable declarations and generic lambda parameters).

Any cv-qualifier, wrapper type, or enclosing class-template parameter turns `&&` back into a strict rvalue reference that rejects lvalues:

```cpp
#include <vector>

template <class T>
void relay(T&& arg);                // forwarding reference: T is deduced here

template <class T>
void fixed(const T&& arg);          // plain rvalue reference: const disqualifies it

template <class T>
void wrap(std::vector<T>&& arg);    // plain rvalue reference: not bare T&&

template <class T>
struct Box {
    void push(T&& item);            // plain rvalue reference: T comes from Box<T>!
    template <class... Args>
    void emplace(Args&&... args);   // forwarding reference pack: Args deduced per call
};
```

> **Pitfall.** Writing `void push(T&&)` inside `template <class T> struct Box` does **not** declare a forwarding reference. By the time `push` is called on a `Box<Widget>`, `T` is already fixed to `Widget`, so `push` accepts only rvalues. Only a member function template with its own deduced parameter (`Args&&...`) forwards both lvalues and rvalues.

## The deduction exception and reference collapsing

Ordinarily, template argument deduction strips top-level references from parameter patterns. Forwarding references receive a deliberate exception in `[temp.deduct.call]`:

- When the call argument is an **lvalue** of type `U`, `T` is deduced as an **lvalue reference `U&`**.
- When the call argument is an **rvalue** (prvalue or xvalue) of type `U`, `T` is deduced as the non-reference type **`U`**.

C++ forbids writing a reference-to-reference directly in source (`int& &`), yet template substitution, type aliases, and `decltype` routinely produce them. Under `[dcl.ref]`, **reference collapsing** reduces every reference-to-reference pair by one rule: lvalue reference `&` is infectious. Combining `&` with `&`, `&` with `&&`, or `&&` with `&` yields `&`; only `&&` combined with `&&` remains `&&`.

| Call argument | Value category | Deduced `T` | Parameter `T&&` | `std::forward<T>(arg)` |
| --- | --- | --- | --- | --- |
| `Widget w;` | lvalue | `Widget&` | `Widget&` | `Widget&` (lvalue) |
| `const Widget cw;` | const lvalue | `const Widget&` | `const Widget&` | `const Widget&` (lvalue) |
| `Widget{}` | prvalue | `Widget` | `Widget&&` | `Widget&&` (xvalue) |
| `std::move(w)` | xvalue | `Widget` | `Widget&&` | `Widget&&` (xvalue) |

> **Mental model.** A forwarding reference uses `T` as a single-bit envelope recording whether the caller supplied an lvalue (`T = U&`) or an rvalue (`T = U`). Reference collapsing turns `T&&` into the exact parameter type needed to bind either one without copying.

## How std::forward and std::forward_like work

Inside `relay(T&& arg)`, the parameter `arg` has a name. Regardless of whether `arg` was bound to an lvalue or an rvalue, the expression `arg` inside the body is **always an lvalue**. Passing `arg` directly to another function would therefore invoke its copy overload even when the caller passed a temporary.

`std::forward<T>(arg)` unpacks the envelope stored in `T` by computing `static_cast<T&&>(arg)`:

- If the caller passed an lvalue, `T` is `Widget&`, so `static_cast<Widget& &&>(arg)` collapses to `static_cast<Widget&>(arg)`—an lvalue.
- If the caller passed an rvalue, `T` is `Widget`, so `static_cast<Widget&&>(arg)` casts the named lvalue back into an xvalue, enabling moves.

Notice why you must always supply `<T>` explicitly (`std::forward<T>(arg)`): `std::forward`'s parameter uses `std::remove_reference_t<T>&` (a non-deduced context) specifically so deduction cannot look at `arg`—which is always an lvalue—and erase the caller's value category. Furthermore, `[forward]` includes a second overload taking `remove_reference_t<T>&&` with a mandated static check ensuring `!std::is_lvalue_reference_v<T>`, so `std::forward<Widget&>(Widget{})` is rejected at compile time rather than returning a dangling lvalue reference to a temporary.

When forwarding a **member or subobject** of a forwarded aggregate `Self&& owner`, C++23 adds `std::forward_like<Self>(owner.member)`. Simply writing `std::forward<Self>(owner).member` fails to move if `member` is a reference or if `Self`'s cv-qualification and value category must be merged onto `member` cleanly:

```cpp
#include <string>
#include <utility>

struct Holder {
    std::string& ref;
};

template <class Self>
decltype(auto) extract(Self&& owner) {
    // Merges Self's constness and value category onto owner.ref
    return std::forward_like<Self>(owner.ref);
}
```

If `owner` is a `Holder&&`, `extract` yields `std::string&&`; if `owner` is `const Holder&&`, it yields `const std::string&&`; if `owner` is `const Holder&`, it yields `const std::string&`.

## Variadic forwarding and universal traps

Real factory wrappers combine forwarding references with parameter packs (`template <class... Args> auto make(Args&&... args) { return Target(std::forward<Args>(args)...); }`). Three sharp pitfalls arise in practice:

1. **Greedy forwarding constructors:** A single-argument template constructor `template <class S> Person(S&& name)` beats `Person(const Person&)` whenever you copy-construct from a **non-const** lvalue `Person p1; Person p2(p1);`. `S` deduces to `Person&` (an exact match), whereas `Person(const Person&)` requires adding `const`. Guard forwarding constructors with concepts (`requires (!std::same_as<std::remove_cvref_t<S>, Person>)`).
2. **Non-deduced braced-init-lists:** Calling `relay({1, 2, 3})` fails to deduce `T`. Unlike `auto x = {1, 2, 3};` (which has a special rule deducing `std::initializer_list<int>`), a braced-init-list is a non-deduced context for template parameter `T` (`[temp.deduct.call]`).
3. **Double forwarding:** Never call `std::forward<T>(arg)` twice on the same parameter in sequence. The first forwarded call may steal `arg`'s resources when the caller passed an rvalue, leaving the second call reading a moved-from object.

> **Standardese.** Under `[temp.deduct.call]`, a braced-init-list `{...}` matches a function template parameter only if that parameter explicitly names `std::initializer_list<U>` or an array/aggregate pattern—never a bare forwarding parameter `T&&`.

## What to remember

- `T&&` is a forwarding reference only when `T` is a cv-unqualified template parameter deduced by that exact function template (or `auto&&`), never `const T&&`, `Vec<T>&&`, or a class template's `T&&`.
- Lvalues deduce `T = U&` and rvalues deduce `T = U`; reference collapsing makes `&` win over `&&` in every combination.
- Named parameters are always lvalues; `std::forward<T>(arg)` restores xvalue-ness only when `T` is non-reference, and rejects forwarding an rvalue as an lvalue reference.
- Use C++23 `std::forward_like<Self>(member)` when forwarding a member or reference field according to its owner's constness and value category.
- Constrain single-argument forwarding constructors so they do not hijack non-const lvalue copies, and remember braced `{...}` arguments cannot deduce `T`.
