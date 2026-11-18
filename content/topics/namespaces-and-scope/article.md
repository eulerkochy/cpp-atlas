---
title: "Namespaces and scope"
summary: "A scope is the stretch of program text where a declaration can be found by unqualified lookup, and a namespace is a scope you can name, reopen and nest. Points of declaration, shadowing, using-directives and inline namespaces all follow from a few precise rules."
track: "program-structure"
minutes: 12
standard:
  - "[basic.scope.scope]"
  - "[basic.scope.pdecl]"
  - "[basic.scope.block]"
  - "[basic.namespace]"
  - "[namespace.def]"
  - "[namespace.unnamed]"
  - "[namespace.alias]"
  - "[namespace.udir]"
cppreference:
  - title: "Scope"
    path: "language/scope"
  - title: "Namespaces"
    path: "language/namespace"
  - title: "Namespace aliases"
    path: "language/namespace_alias"
  - title: "Unqualified name lookup"
    path: "language/unqualified_lookup"
  - title: "Conflicting declarations"
    path: "language/conflicting_declarations"
prerequisites:
  - "translation-units-and-linkage"
---

## The one idea

Every declaration lives in a **scope**, and from its point of declaration onward, unqualified lookup inside that scope, and inside the scopes nested in it, can find it. Scopes nest: a block inside a function, a function inside a namespace, namespaces inside the global namespace. Lookup walks that nesting from the inside out.

A **namespace** is the one kind of scope you can name, close, and open again later, possibly in another file. Everything else in this topic, from shadowing to inline namespaces, is a consequence of where a scope begins, what it contains, and how using-directives splice one namespace's names into another's lookup.

> **Mental model.** Think of scopes as nested boxes of program text. A name is visible from the point just after its declarator to the end of its box, and an inner box can hide an outer name by declaring the same one.

## The kinds of scope

C++23 lists these kinds of scope in [basic.scope]: the global scope, which is the namespace scope of the global namespace; namespace scopes; class scopes; enumeration scopes; block scopes; function parameter scopes; lambda scopes; and template parameter scopes.

A block scope is introduced by a compound statement, by each selection and iteration statement, and by each exception handler. That is why a variable declared in the condition of an `if`, or in the init-statement of a `for`, is local to the whole statement, including the `else` branch.

The vocabulary changed in C++23. P1787R6, "Declarations and where to find them", rewrote these rules in terms of a declaration **inhabiting** a scope, having a **target scope**, and **binding** a name there. The aim was to fix long-standing defects and inconsistencies while keeping almost all existing code meaning the same thing, and compilers treat most of its fixes as applying to earlier modes too. One related change is visible: P2036R3, adopted for C++23 as a defect report, made a lambda's trailing return type see its own init-captures.

```cpp
#include <type_traits>

void lambda_scope() {
  int x = 0;
  auto f = [x = 2.5]() -> decltype(x) { return x; };  // decltype(x) names the capture
  static_assert(std::is_same_v<decltype(f()), double>);  // passes with GCC 16 and Clang 21
  (void)x;
}
```

## Point of declaration

A name becomes visible at its **locus**, the point of declaration, and the precise location surprises people. For a variable, the locus is immediately after the complete declarator and *before* the initializer. So the declarator still sees the outer name, but the initializer already sees the new one.

```cpp
#include <cstdio>

const int n = 4;

int main() {
  char n[n] = {};                    // array bound uses the outer n: a char[4]
  const int k = 10;
  {
    enum { k = k + 5, m = k * 2 };   // enumerator k is 15, then m is 30
    std::printf("%zu %d %d\n", sizeof n, k, m);  // prints 4 15 30
  }
}
```

Enumerators are different from variables: an enumerator's locus is *after* its initializer, so `k + 5` still reads the outer `k`, while the following `m = k * 2` sees the new enumerator. For a variable, `int v = v;` initializes `v` from itself, so the initializer reads the object's own indeterminate value, which is undefined behavior in C++23.

Other loci worth knowing: a class name is visible right after its name in the class head, so it can appear in its own base-class list, as in CRTP; an alias declaration's name becomes visible only after its type, so `using T = T*;` in an inner scope refers to the outer `T` on the right; and a range-`for` variable is visible only after the range expression, so `for (auto x : x)` iterates over the outer `x`.

Class scope is the exception to "declare before use". Inside member function bodies, default member initializers and default arguments, the whole class is visible, including members declared later. The class is said to be complete in those places.

## Block scope and shadowing

A declaration in an inner block hides any declaration of the same name in enclosing scopes, local or not. A hidden namespace-scope name can still be reached with qualification, such as `::level`, but a hidden local variable cannot be named at all.

```cpp
int level = 0;

int depth() {
  int level = 1;
  {
    int level = 2;            // hides both outer levels; -Wshadow warns
    return level + ::level;   // 2 + 0: the middle level cannot be named from here
  }
}
```

Some redeclarations look like shadowing but are ill-formed. [basic.scope.block] forbids a declaration in the outermost block of a function body from reusing a parameter's name, and a declaration in the body of an `if`, `while`, `for` or `switch` from reusing a name declared in its condition or init-statement. The same applies to a handler's parameter and the handler's outermost block.

```cpp
int get();

void f(int p) {
  // int p = 1;                 // ill-formed: same name as a parameter
  if (int x = get()) {
  } else {
    // int x = 2;               // ill-formed: else shares the condition's scope
  }
  for (int i = 0; i < 3; ++i) {
    { int i = 5; (void)i; }     // OK: a nested block may shadow i
  }
  (void)p;
}
```

> **Pitfall.** Shadowing is legal and silent by default. A local named like a member or a global changes what every later use in the block means. Enable `-Wshadow` in GCC or Clang if your codebase does not deliberately rely on it.

## Namespaces: reopening, nesting, aliases

A namespace definition can be repeated any number of times, in any number of files, and each repetition adds members to the same namespace. A member declared inside a namespace can be defined outside it with a qualified name, but only after it has been declared, and only from a namespace that encloses it.

```cpp
namespace store {
  void save();
}
namespace store { void load(); }    // reopens store

void store::save() {}               // OK: declared above, defined from an enclosing scope
// void store::purge() {}           // ill-formed: purge was never declared in store

namespace store::detail { int retries = 3; }  // C++17 nested namespace definition
```

A **namespace alias** gives an existing namespace a second name, as in `namespace fs = std::filesystem;`. An alias can be used anywhere the namespace name could be used in a qualified name, but it cannot be used to reopen the namespace: `namespace fs { ... }` after the alias is ill-formed.

An **unnamed namespace** behaves as if it were a namespace with a unique name, followed by a using-directive for it. Its members are visible throughout the rest of the translation unit and, since C++11, have internal linkage; the translation-units-and-linkage topic covers the linkage side. Because the members are reached through a using-directive, a name in an unnamed namespace and the same name in the enclosing namespace can coexist, and an unqualified use of it is ambiguous.

## Using-directives and the nearest enclosing namespace

A using-directive such as `using namespace lib;` declares nothing. During unqualified lookup, it makes the members of `lib` appear **as if they were declared in the nearest enclosing namespace that contains both the using-directive and `lib`**. That rule, from [namespace.udir], has a consequence people rarely expect.

```cpp
#include <cstdio>

namespace lib { int value() { return 1; } }

namespace app {
  int value() { return 2; }
  int get() {
    using namespace lib;   // lib's members act as if declared in the global namespace
    return value();        // finds app::value first: returns 2
  }
}

int main() { std::printf("%d\n", app::get()); }  // prints 2
```

The directive is written inside `app::get`, but the nearest namespace enclosing both that function and `lib` is the global namespace. So `lib::value` behaves as a global, and lookup finds `app::value` before reaching it. A using-declaration, `using lib::value;`, would instead declare `value` in the block itself and win.

Using-directives are also transitive: if `B` contains `using namespace A;`, then `using namespace B;` makes `A`'s members visible too. Two directives that bring in the same name are not an error by themselves; only an unqualified use of that name is ambiguous.

> **Standardese.** [namespace.udir] says that during unqualified lookup, the names of the nominated namespace appear as if they were declared in the nearest enclosing namespace that contains both the using-directive and the nominated namespace, and that a using-directive does not add any members to the region in which it appears.

## Inline namespaces and ABI versioning

An **inline namespace**, added in C++11, is a nested namespace whose members also behave as members of the enclosing namespace for most purposes: unqualified and qualified lookup, argument-dependent lookup, and explicit specialization or instantiation of its templates through the enclosing namespace's name. The enclosing namespace and the inline namespace are each associated with the other for ADL.

```cpp
namespace lib {
  namespace v1 { struct Config { int a; }; }
  inline namespace v2 { struct Config { int a, b; }; }

  void load(Config) {}   // Config means lib::v2::Config
}

template <class T> struct Traits;
template <> struct Traits<lib::Config> {};  // specializes for lib::v2::Config

namespace lib::inline v3 {}  // C++20 nested inline namespace syntax
```

The point is that the inline namespace's name still appears in the **mangled names** of its members. `lib::load(lib::v2::Config)` is mangled as `_ZN3lib4loadENS_2v26ConfigE` by GCC 16. Source code says `lib::Config`, but the linker sees the version, so code compiled against `v1` and code compiled against `v2` cannot be silently linked together. Standard libraries use this: libstdc++'s C++11 `std::string` is `std::__cxx11::basic_string`, and libc++ puts the whole library in `std::__1`.

The keyword `inline` must be on the first definition of the namespace. Reopening an inline namespace without it is allowed, but Clang warns; making a namespace inline after it was first defined as non-inline is ill-formed. A name declared both in the enclosing namespace and in its inline namespace makes lookup through the enclosing name ambiguous.

## What to remember

- C++23 scopes: global and other namespace scopes, class, enumeration, block, function parameter, lambda and template parameter.
- P1787R6 rewrote the scope and lookup wording for C++23 with little change in meaning; P2036R3 lets a lambda's trailing return type see its captures.
- A variable is visible from just after its declarator, so `char n[n]` uses the outer `n` and `int v = v;` reads itself.
- An enumerator is visible only after its initializer.
- Inner declarations hide outer ones; hidden globals are reachable with `::`, hidden locals are not.
- Redeclaring a parameter in the function's outer block, or a condition variable in the `if` or `else` body, is ill-formed.
- Namespaces can be reopened; aliases cannot reopen them; qualified definitions need a prior declaration.
- A using-directive makes names act as if declared in the nearest namespace enclosing both the directive and the nominated namespace.
- Inline namespace members act as enclosing-namespace members but keep the inline name in their mangled names, which is how libraries version their ABI.
