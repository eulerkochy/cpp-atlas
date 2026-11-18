---
title: "C++20 Modules"
summary: "Replace fragile textual header graphs with semantic module interfaces, controlled exports, module linkage, and clean boundaries around legacy headers."
track: "program-structure"
minutes: 9
standard:
  - "[module.unit]"
  - "[module.interface]"
  - "[module.import]"
  - "[module.global.frag]"
  - "[module.private.frag]"
  - "[module.reach]"
  - "[basic.link]"
cppreference:
  - title: "Modules"
    path: "language/modules"
  - title: "identifier with special meaning: module"
    path: "identifier_with_special_meaning/module"
  - title: "identifier with special meaning: import"
    path: "identifier_with_special_meaning/import"
  - title: "keyword: export"
    path: "keyword/export"
  - title: "Translation-unit-local entities"
    path: "language/tu_local"
prerequisites:
  - "translation-units-and-linkage"
  - "name-lookup-and-adl"
---

Traditional C++ headers rely on phase 4 textual splicing: every `#include` pastes raw tokens into every consumer translation unit, causing macro leakage in both directions, order-dependent compiles, and quadratic build times. **C++20 modules** replace textual inclusion with semantic translation units compiled once into binary module interfaces (BMIs) and consumed via `import`.

## How modules replace textual inclusion

When a module interface unit is compiled, the compiler emits an interface representation describing only its exported API and reachable entities. Importers read that binary summary directly without re-parsing implementation bodies or legacy headers.

Three isolation guarantees follow immediately from compiling modules semantically rather than textually:

- **Macros never cross `import`.** Preprocessor `#define` directives inside a module interface unit stay strictly inside that unit; importers never inherit them, and macros defined by the importer never alter an already-compiled module.
- **Order independence.** Unlike `#include "a.hpp"` followed by `#include "b.hpp"`, importing named modules in any order produces identical symbol lookup.
- **Private helpers stay hidden.** Non-exported helper functions, constants, and `using namespace` directives inside a module never pollute an importer's namespace.

> **Mental model.** A `#include` copies source code before parsing; a module `import` loads an already-parsed semantic interface. Preprocessor state stops at the module boundary.

## Anatomy of a module unit

A **module unit** (`[module.unit]`) is any translation unit containing a `module-declaration`. Its source layout follows a strict three-zone sequence:

1. **Global module fragment (`module;`):** An optional preamble before the module declaration. Under `[module.global.frag]`, this region may contain *only* preprocessor directives (`#include`, `#define`, `#if`). Legacy headers included here belong to the global module rather than the named module, keeping their C/C++ linkage untouched.
2. **Module purview (`export module name;` or `module name;`):** Everything between the module declaration and an optional private fragment is attached to the named module. Names introduced here carry module ownership and cannot be redeclared identically in another module.
3. **Private module fragment (`module :private;`):** An optional tail inside a *primary module interface unit* (`[module.private.frag]`) when no separate implementation units exist. Declarations after `module :private;` remain invisible and unreachable to importers—useful for single-file libraries, though compiler support varies (`clang++` implements it today, whereas GCC 16 still rejects `module :private;`, making separate `module name;` implementation units more portable).

| Module unit kind | Opening declaration | Emits BMI? | Purpose |
| --- | --- | --- | --- |
| Primary module interface | `export module M;` | Yes | Defines the public exported surface of module `M` |
| Module implementation unit | `module M;` | No | Defines declarations promised by `M` without adding exports |
| Module partition interface | `export module M:part;` | Yes | Splits large interface `M`; must be `export import :part;` |
| Internal partition | `module M:impl;` | Yes | Shares internal helpers across `M` without re-exporting |
| Header unit | `import <vector>;` | Yes | Wraps a legacy header as a precompiled semantic unit with macros |

## Visibility versus reachability

One of the deepest design insights of C++20 modules is the separation between **visibility** (`[module.interface]`) and **reachability** (`[module.reach]`). Adding `export` to a declaration makes its *name* visible to ordinary lookup in importing translation units. However, an entity that is **not** exported can still be **reachable** if an exported declaration refers to it in its return type, parameter type, or template argument.

When a type is reachable but not visible, importers cannot spell the type's name directly, yet they can still receive objects via `auto`, inspect member functions, invoke operators, and use `decltype` on expressions of that type.

```cpp
// File: math_core.cppm (module partition interface)
export module math:core;

export int square(int n) {
    return n * n;
}
```

```cpp
// File: math.cppm (primary module interface)
module;
#include <string> // Global module fragment: keeps <string> out of module purview

export module math;
export import :core; // Re-exports math:core so importers see square()

struct SecretHandle { // Not exported: invisible by name, yet reachable via make_handle()
    int value = 7;
    int read() const { return value; }
};

export SecretHandle make_handle() {
    return {};
}

export std::string greet(const std::string& who);
```

```cpp
// File: math_impl.cpp (module implementation unit)
module;
#include <string>

module math; // Implicitly imports primary module interface math

std::string greet(const std::string& who) {
    return "hi, " + who;
}
```

```cpp
// File: main.cpp (consumer)
import math;

int main() {
    auto handle = make_handle(); // Legal: SecretHandle is reachable via auto
    // SecretHandle raw;         // Error: SecretHandle is not visible to lookup
    return square(3) + handle.read() - 16;
}
```

Notice that `module math;` inside an implementation unit implicitly imports the primary module interface `math`, so `math_impl.cpp` can implement `greet` while seeing `SecretHandle` and all non-exported module-purview helpers.

> **Standardese.** Under `[module.reach]`, a declaration is reachable from an importer whenever an exported declaration exposes its type, base class, or template specialization—even if the declaration itself omits `export`. Lookup visibility requires `export`, whereas semantic completeness (member access, overload checks, destruction) requires only reachability.

## Module linkage and TU-local exposure

Because a named module can span multiple implementation units and internal partitions, C++20 introduced **module linkage** (`[basic.link]`). A non-exported namespace-scope function, class, or variable declared inside a module purview (outside unnamed namespaces and without `static`) has module linkage: every translation unit belonging to module `M` shares that single entity, while all external modules and non-module code cannot link against it.

By contrast, declaring a helper `static` or placing it inside `namespace { ... }` gives it **internal linkage**, making it a **translation-unit-local (TU-local)** entity (`[basic.link]`). Exposing a TU-local entity inside an exported `inline` function, exported template, or exported variable initializer makes the module **ill-formed** (no diagnostic required in corner cases, though modern compilers actively warn or reject it).

> **Pitfall.** Never `#include` a legacy header *after* `export module M;`. Putting `#include <vector>` inside the module purview attaches every declaration inside `<vector>` to module `M`, breaking linkage when another translation unit includes `<vector>` in the global module. Always place legacy `#include` directives between `module;` and `export module M;`.

> **Pitfall.** Calling a `static` helper or referencing an unnamed-namespace constant from an `export inline` function inside a module interface triggers a TU-local exposure error. Either drop `static` (giving the helper module linkage across your module) or mark it `inline` without internal linkage.

## Partitions, header units, and contextual keywords

Large modules split cleanly using **partitions**: `export module M:core;` defines an interface partition that `M` re-exports via `export import :core;`, while `module M:impl;` defines an internal partition that `M` imports via `import :impl;` without exposing it to callers. Note that external consumers can never write `import M:core;` directly—only units of module `M` can import partitions of `M`.

For incremental migration, C++20 provides **header units** (`import <vector>;` or `import "legacy.hpp";`). Unlike named modules, header units *do* export preprocessor macros defined inside the header, allowing gradual replacement of `#include` lines without breaking macro-heavy libraries. Finally, `module` and `import` are **identifiers with special meaning** (`[lex.name]`), not reserved keywords—existing variables or parameters named `module` or `import` remain valid outside module-declaration and import-declaration positions.

## What to remember

- Place legacy `#include` directives strictly inside the **global module fragment** (`module;`) before `export module M;`.
- Macros and unexported declarations stay inside the module; `export import :part;` re-exports module partitions to importers.
- `export` grants **lookup visibility**, whereas returning or referencing an unexported type makes it **reachable** for `auto`, member calls, and destruction.
- Non-exported module-purview entities have **module linkage** (shared across `M`'s units only); never expose `static` or unnamed-namespace **TU-local** entities from exported inline functions or templates.
- Named modules never export macros, whereas C++20 **header units** (`import <header>;`) preserve exported macros to ease migration.
