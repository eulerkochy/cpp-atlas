---
title: "Value categories"
summary: "Replace circular left-of-equals folklore with C++17's two orthogonal expression axes—identity and movability—plus temporary materialization and decltype probes."
track: "value-semantics"
minutes: 9
standard:
  - "[basic.lval]"
  - "[conv.rval]"
  - "[lex.string]"
  - "[expr.ref]"
  - "[dcl.type.decltype]"
  - "[expr.pre.incr]"
  - "[expr.post.incr]"
cppreference:
  - title: "Value categories"
    path: "language/value_category"
  - title: "String literal"
    path: "language/string_literal"
  - title: "decltype specifier"
    path: "language/decltype"
  - title: "Increment/decrement operators"
    path: "language/operator_incdec"
  - title: "Copy elision"
    path: "language/copy_elision"
prerequisites:
  - "initialization-forms"
  - "casts-and-qualifiers"
---

Traditional C textbooks define lvalues and rvalues by where they sit around an assignment operator. In modern C++, that rule collapses immediately: a `const int` cannot sit on the left of `=`, yet it is an lvalue; meanwhile, a class rvalue like `std::string{} = "ok"` is allowed on the left of `=`, yet it is a prvalue. Every expression in C++—never a variable declaration—belongs to a value category governed by two independent properties.

## Expressions have value categories, not variables

A **variable** has a declared type, such as `int`, `const Widget&`, or `Widget&&`. An **expression** appearing in code has both a non-reference type (references are stripped during expression analysis) and a **value category** (`[basic.lval]`). Keeping those two dimensions separate resolves the single biggest source of confusion around move semantics:

```cpp
#include <utility>

struct Widget {};
void consume(Widget& w);
void consume(Widget&& w);

void relay(Widget&& param) {
    // param's declared type is Widget&&, yet the expression `param` is an lvalue
    consume(param);            // calls consume(Widget&)
    consume(std::move(param)); // std::move returns unnamed Widget&& -> xvalue
}
```

Inside `relay`, `param` has a name and an addressable stack location, so the expression `param` is an **lvalue**, selecting `consume(Widget&)`. Calling `std::move(param)` produces an unnamed `Widget&&`, which is an **xvalue**, selecting `consume(Widget&&)`.

> **Pitfall.** Inside a function body, a parameter declared as `Widget&& param` has type "rvalue reference to `Widget`", yet the expression `param` itself is an lvalue because it has a name and an address.

## The two orthogonal axes: glvalue and rvalue

C++17 organizes value categories around two orthogonal questions:

1. **Has identity (`glvalue`)?** Does evaluating the expression identify a specific object, bit-field, or function whose address or identity can be compared against another?
2. **Can be moved from (`rvalue`)?** Is the expression disposable or explicitly marked expiring so its resources may be safely transferred without another observer noticing?

```text
                  expression
                 /          \
           glvalue          rvalue
           /     \          /    \
       lvalue      xvalue      prvalue
```

Combining these two axes yields three primary, mutually exclusive leaf categories, alongside two compound categories (`glvalue` = `lvalue` or `xvalue`; `rvalue` = `prvalue` or `xvalue`):

| Value category | Has identity (`glvalue`)? | Movable (`rvalue`)? | Addressable with `&`? | Representative expressions |
| --- | --- | --- | --- | --- |
| `lvalue` | Yes | No | Yes (unless bit-field) | `var`, `"cpp"`, `++i`, `func_returning_lref()` |
| `xvalue` | Yes | Yes | Not directly | `std::move(x)`, `Widget{}.member`, `func_returning_rref()` |
| `prvalue` | No | Yes | No | `42`, `Widget{1}`, `i++`, `func_returning_value()` |

> **Mental model.** Every expression falls into one of three leaves: an `lvalue` has durable identity, a `prvalue` is an unmaterialized recipe with no address yet, and an `xvalue` is an existing object whose resources are cleared for reuse.

## Prvalues since C++17: recipes, not objects

Before C++17, a prvalue of class type represented a real temporary object in memory that compilers tried to optimize away. C++17 inverted the model in `[basic.lval]` and `[conv.rval]`. A **prvalue** is no longer an object at all—it is an unmaterialized computation or **initialization recipe** waiting to construct an object directly inside whatever destination slot the caller provides.

A prvalue becomes an actual object in storage—turning into an **xvalue**—only when **temporary materialization conversion** (`[conv.rval]`) fires. Materialization happens at exact language boundaries that demand object identity:

- Binding a reference (`const Widget&` or `Widget&&`) to a prvalue.
- Accessing a non-static data member (`make_widget().id`) or invoking a member function on a prvalue.
- Subscripting a prvalue array (`using A = int[3]; A{1, 2, 3}[0]`).
- Discarding a class or array prvalue as a standalone expression statement (`make_widget();`), so its constructor and destructor still execute deterministically.

If none of those triggers occur—such as `Widget w = make_widget();`—no temporary object is ever created; the prvalue initializes `w` directly in place.

## Tricky expression taxonomy in the wild

Several everyday C++ expressions defy naive intuition until checked against `[basic.lval]`:

- **String literals vs scalar literals**: Numeric, boolean, and `nullptr` literals (`42`, `true`) are prvalues. A string literal such as `"hello"`, however, resides in static storage for the whole program and is an **lvalue** of type `const char[6]` (`[lex.string]`), which is why `&"hello"` compiles cleanly while `&42` is ill-formed.
- **Prefix vs postfix increment**: Built-in `++i` mutates `i` and returns the object itself as an lvalue (`++ ++i` is legal). Built-in `i++` yields a prvalue copy of the old value (`&(i++)` and `i++ = 5` fail to compile).
- **Member access (`E1.E2`)**: Under `[expr.ref]`, if `E1` is an rvalue (prvalue or xvalue) and `E2` names a non-static **object** member, `E1.E2` triggers materialization if needed and produces an **xvalue**. If `E2` is a static data member or a **reference** member (`int& ref;`), `E1.E2` is an **lvalue** because the member's storage outlives `E1` or belongs independently elsewhere.
- **Conditional operator (`cond ? a : b`)**: Yields an lvalue only when both `a` and `b` are lvalues of matching or reference-compatible types; otherwise it yields a prvalue (or xvalue when both match as xvalues).

> **Standardese.** Under `[lex.string]`, a string literal is an lvalue of array type `const char[N]` with static storage duration, whereas numeric, character, and pointer literals are prvalues.

## Probing value categories with decltype

Because `decltype` distinguishes unparenthesized names from general expressions (`[dcl.type.decltype]`), wrapping any expression `e` in an extra pair of parentheses `decltype((e))` turns it into an exact compile-time value-category probe:

- `decltype((e))` yields `T&` if `e` is an **lvalue**.
- `decltype((e))` yields `T&&` if `e` is an **xvalue**.
- `decltype((e))` yields `T` if `e` is a **prvalue**.

```cpp
#include <type_traits>
#include <utility>

struct Box { int value; };
struct AliasBox { int& ref; };

Box make_box();
AliasBox make_alias();

void verify_categories(int i) {
    // Unparenthesized id-expression yields declared type (int), not lvalue category
    static_assert(std::is_same_v<decltype(i), int>);
    // Parenthesized expression probes value category
    static_assert(std::is_same_v<decltype((i)), int&>);             // lvalue
    static_assert(std::is_same_v<decltype((std::move(i))), int&&>); // xvalue
    static_assert(std::is_same_v<decltype((42)), int>);             // prvalue

    static_assert(std::is_same_v<decltype(("hi")), const char (&)[3]>); // lvalue
    static_assert(std::is_same_v<decltype((++i)), int&>);               // lvalue
    static_assert(std::is_same_v<decltype((i++)), int>);                // prvalue
    static_assert(std::is_same_v<decltype((make_box().value)), int&&>);  // xvalue
    static_assert(std::is_same_v<decltype((make_alias().ref)), int&>);   // lvalue
}
```

## What to remember

- Value categories classify expressions, never variables; a named rvalue reference `T&&` evaluates as an lvalue expression.
- `lvalue` = identity without movability; `prvalue` = movability without identity (an unmaterialized initializer); `xvalue` = both identity and movability.
- Temporary materialization (`[conv.rval]`) turns a prvalue into an xvalue only when reference binding, member access, array subscripting, or discarding demands an object in storage.
- String literals are lvalues (`const char[N]`), `E1.E2` on an rvalue yields an xvalue for data members (or an lvalue for reference/static members), and `decltype((expr))` directly reports `T&`, `T&&`, or `T`.
