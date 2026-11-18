---
title: "Name Lookup, Qualified Lookup, and ADL"
summary: "Trace how the compiler maps an identifier to candidate declarations across unqualified lookup, qualified lookup, Argument-Dependent Lookup, and two-phase template lookup."
track: "program-structure"
minutes: 9
standard:
  - "[basic.lookup.unqual]"
  - "[basic.lookup.qual]"
  - "[basic.lookup.argdep]"
  - "[namespace.udir]"
  - "[temp.res]"
cppreference:
  - title: "Name lookup"
    path: "language/lookup"
  - title: "Unqualified name lookup"
    path: "language/unqualified_lookup"
  - title: "Qualified name lookup"
    path: "language/qualified_lookup"
  - title: "Argument-dependent lookup"
    path: "language/adl"
  - title: "Using-declaration"
    path: "language/using_declaration"
  - title: "Dependent names"
    path: "language/dependent_name"
  - title: "Friend declaration"
    path: "language/friend"
prerequisites:
  - "translation-units-and-linkage"
---

When the compiler sees an expression like `process(x)` or `ns::find(y)`, it does not jump straight to matching parameter types or checking `private` access. It runs a strict multi-stage pipeline where **name lookup** executes first, completely blind to argument types (except during Argument-Dependent Lookup) and access specifiers.

## Lookup precedes overload resolution and access checking

Every function call passes through four sequential stages:

1. **Name lookup** collects candidate declarations from scopes determined by syntax.
2. **Template argument deduction** synthesizes specializations for any function templates found.
3. **Overload resolution** ranks the viable candidates by argument conversion sequences.
4. **Access control** verifies that the chosen declaration is `public` or accessible via friendship.

Because lookup finishes before overload resolution begins, an inner scope declaration **hides** outer declarations of the same name regardless of signature. Likewise, because access checking happens *last*, a `private` overload with a better parameter match wins overload resolution and then triggers an access error rather than falling back to a worse `public` overload.

> **Mental model.** Name lookup builds the candidate menu by name alone; overload resolution picks the best dish from that menu; access control checks whether you are allowed to order it.

## Unqualified lookup and name hiding

**Unqualified name lookup** (`[basic.lookup.unqual]`) searches outward from the point of use through enclosing block, class (including base classes), and namespace scopes—stopping at the **first** scope that contains at least one declaration of that name. Once a declaration is found, outer scopes are never examined, even if parameter types do not match.

This hiding rule catches programmers off guard in derived classes. Declaring `void log(int)` in `Derived` hides every `log` overload in `Base`—including `void log(const std::string&)`—unless `using Base::log;` pulls the base overload set into `Derived` scope.

```cpp
#include <string>

struct Base {
    void log(double) {}
};

struct Derived : Base {
    using Base::log; // Without this, Base::log(double) is hidden by Derived::log(int)
    void log(int) {}
};

void run_lookup() {
    Derived d;
    d.log(3.5); // Resolves to Base::log(double) thanks to using-declaration
    d.log(42);  // Resolves to Derived::log(int)
}
```

Unqualified lookup interacts subtly with `using` declarations versus `using namespace` directives. A `using ns::foo;` declaration introduces `foo` as a synonym in the *current* declarative region—so it participates in overloading, hides outer declarations, and is visible to qualified lookup. By contrast, a `using namespace ns;` directive (`[namespace.udir]`) instructs unqualified lookup to search `ns` as if its members were declared in the nearest common enclosing namespace of the directive and `ns`. It does not inject names into the current scope itself.

| Mechanism | Scope where name appears | Participates in qualified lookup? | Can cause ambiguity with local name? |
| --- | --- | --- | --- |
| Unqualified declaration | Current block, class, or namespace | Yes, via enclosing qualifier | Redefinition or overload |
| `using ns::name;` | Current declarative region | Yes (`Current::name`) | Yes, conflicts with identical signature |
| `using namespace ns;` | Nearest common enclosing namespace | Never (`Current::name` ignores it) | Only if unqualified lookup reaches both |

## Qualified name lookup and using-declarations

When a name follows `::`, `.`, or `->`, the compiler performs **qualified name lookup** (`[basic.lookup.qual]`). Qualified lookup searches strictly inside the named class (and its base classes) or namespace (and any `inline namespace` members plus transitive `using namespace` directives inside that namespace—ignoring directives in the caller's scope).

Crucially, **qualified lookup disables Argument-Dependent Lookup**. Writing `std::swap(a, b)` forces lookup inside `namespace std` alone and refuses to consider a custom `swap` defined alongside user types. Also worth noting is the **injected-class-name**: inside any class `Widget` (or template `Box<T>`), the bare name `Widget` (or `Box`) is injected into the class scope itself, which is why `Widget::Widget` names the constructor and `Box` inside `Box<T>` denotes `Box<T>`.

## Argument-Dependent Lookup and hidden friends

Why does `std::cout << "hello"` compile without writing `std::operator<<(std::cout, "hello")`? Because of **Argument-Dependent Lookup (ADL)** (`[basic.lookup.argdep]`), also called Koenig lookup. When an unqualified function call uses a bare function name (not parenthesized and not qualified with `::`), the compiler augments ordinary unqualified lookup by searching the **associated namespaces and classes** of every argument's type.

> **Standardese.** Under `[basic.lookup.argdep]`, ADL is bypassed completely if ordinary unqualified lookup finds a class member declaration, a block-scope function declaration (that is not a using-declaration), or any declaration that is neither a function nor a function template.

Each argument type contributes associated namespaces and classes according to its structure:

- **Class types** contribute the class itself, its enclosing namespace (plus inline namespace parents), and all direct and indirect base classes along with their enclosing namespaces.
- **Class template specializations** contribute the same namespaces as a non-template class, plus the associated namespaces of template type arguments (so `std::vector<geom::Vec>` brings in both `std` and `geom`).
- **Fundamental types** (`int`, `double`, pointers to them) contribute **zero** associated namespaces.

One of the cleanest idioms in modern C++—**hidden friends**—relies entirely on ADL. A `friend` function defined *inline inside a class body* is a member of the enclosing namespace, yet is **invisible** to ordinary qualified or unqualified lookup (`geom::operator+` fails). It can *only* be found by ADL when an argument of that class type appears in the call. Hidden friends keep namespace overload sets tiny, improve compile times, and prevent unintended implicit conversions when unrelated types are passed.

```cpp
#include <utility>

namespace geom {
struct Vec {
    int x, y;

    // Hidden friend: visible only via ADL when Vec is an argument.
    friend Vec operator+(Vec a, Vec b) {
        return {a.x + b.x, a.y + b.y};
    }
};

int norm_sq(Vec v) {
    return v.x * v.x + v.y * v.y;
}
} // namespace geom

template<class T>
void generic_swap(T& a, T& b) {
    using std::swap; // Fallback for types without custom swap
    swap(a, b);      // Unqualified call triggers ADL for T's namespace
}

int test_adl() {
    geom::Vec u{1, 2}, v{3, 4};
    geom::Vec sum = u + v; // Finds hidden friend operator+ via ADL
    // (norm_sq)(sum);     // Parentheses suppress ADL: ill-formed here
    generic_swap(u, v);
    return norm_sq(sum);   // Unqualified id triggers ADL into geom
}
```

> **Pitfall.** Parenthesizing a function name—`(func)(arg)`—turns the callee from an unqualified-id into a parenthesized expression, which **disables ADL** just like `ns::func(arg)`. Standard C++20 customization point objects (like `std::ranges::sort`, nicknamed *niebloids*) are function objects rather than function declarations, intentionally blocking ADL at call sites while internally performing controlled customization dispatch.

## Two-phase lookup in templates

Templates resolve names in two distinct phases (`[temp.res]`):

- **Phase 1 (template definition time):** All **non-dependent names** (names that do not depend on a template parameter) are resolved immediately using ordinary unqualified or qualified lookup in the template's definition context—**without** ADL.
- **Phase 2 (template instantiation time):** **Dependent names** (such as `f(t)` where `t` has dependent type `T`) are looked up in the template's definition context *and*, via ADL only, in the instantiation context.

This split explains why `Derived<T>` inheriting from dependent `Base<T>` cannot write bare `count` inside member functions: `count` is syntactically non-dependent, and in phase 1 the compiler refuses to look inside `Base<T>` because a future explicit specialization of `Base<int>` could omit or alter `count`. Writing `this->count` or `Base<T>::count` makes the lookup dependent, deferring resolution to phase 2.

> **Pitfall.** Defining an unqualified helper `void trace(int)` *after* a template definition does not make `trace(t)` find it during phase 2 when `T = int`. Phase 2 looks in the instantiation context **only via ADL**, and fundamental types like `int` have no associated namespaces.

```cpp
template<class T>
struct Store {
    int count = 1;
};

template<class T>
struct CachedStore : Store<T> {
    int read() const {
        // `return count;` would fail Phase 1 lookup (non-dependent name ignores Store<T>).
        return this->count; // Dependent member access defers lookup to Phase 2
    }
};
```

## What to remember

- The compiler always resolves **name lookup** before template deduction, overload resolution, and access control; inner names hide outer names regardless of signature, and `private` best matches still win overload resolution and fail access checks.
- **Qualified lookup** (`ns::f`, `obj.f`) and parenthesized callees (`(f)(x)`) disable ADL.
- **ADL** searches associated namespaces and classes of argument types unless ordinary lookup finds a class member, a block-scope function declaration, or a non-function.
- **Hidden friends** defined inline inside a class are reachable exclusively through ADL, preventing accidental overload pollution.
- **Two-phase lookup** resolves non-dependent names at template definition time and dependent names at instantiation time (via ADL for unqualified calls).
