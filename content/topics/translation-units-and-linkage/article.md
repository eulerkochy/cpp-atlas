---
title: "Translation Units, ODR, and Linkage"
summary: "Trace how source files become translation units and how scope, storage duration, linkage, and the One Definition Rule govern symbol visibility across them."
track: "program-structure"
minutes: 8
standard:
  - "[lex.phases]"
  - "[basic.scope]"
  - "[basic.stc]"
  - "[basic.link]"
  - "[basic.def.odr]"
  - "[dcl.link]"
cppreference:
  - title: "Phases of translation"
    path: "language/translation_phases"
  - title: "Storage class specifiers"
    path: "language/storage_duration"
  - title: "Definitions and ODR"
    path: "language/definition"
  - title: "inline specifier"
    path: "language/inline"
  - title: "Language linkage"
    path: "language/language_linkage"
  - title: "Translation-unit-local entities"
    path: "language/tu_local"
prerequisites: []
---

C++ compilers do not compile header files. They compile one **translation unit** at a time, after the preprocessor has flattened every `#include` directive into a single stream of tokens. Most linker errors, duplicate-symbol bugs, and mysterious global-state bugs happen when mental models confuse a `.hpp`/`.cpp` file layout on disk with the language rules governing translation units, linkage, and the One Definition Rule (ODR).

## From source files to translation units

The C++ standard divides compilation into nine **phases of translation** (`[lex.phases]`). Phases 1–4 handle character mapping, line splicing, comment stripping, and preprocessing. In phase 4, `#include` textually pastes header contents into the `.cpp` file and macros expand. What emerges is a **translation unit** (TU): one self-contained stream of preprocessed declarations and definitions.

Phases 5–7 convert literals, concatenate adjacent string literals, and perform syntactic and semantic analysis on that single TU in isolation. Phase 8 instantiates needed templates, and phase 9 links all compiled TUs and resolves external symbols. Because phase 7 never inspects neighboring `.cpp` files, cross-file visibility rests entirely on declarations visible in the current TU.

> **Mental model.** A header file is only a convention for copying the same declarations into multiple translation units before phase 7 begins. The language proper sees only separate translation units and the linker contract between them.

## Scope, storage duration, and linkage

Three independent properties govern every named variable or function in C++: **scope**, **storage duration**, and **linkage**. Treating them as synonyms guarantees confusion, especially around the overloaded `static` keyword.

- **Scope** (`[basic.scope]`) is a compile-time lookup property: which region of source text can refer to an unqualified name.
- **Storage duration** (`[basic.stc]`) is a lifetime property: when the object's storage is allocated and released (automatic, static, thread, or dynamic).
- **Linkage** (`[basic.link]`) is a multi-declaration identity property: whether two declarations of the same name in different scopes or different translation units refer to the *same* entity.

| Linkage kind | Declared via | Shared across TUs? | Typical examples |
| --- | --- | --- | --- |
| No linkage | Block-scope locals, parameters, local classes | Never | Local `int x`, block-scope `static int hits` |
| Internal linkage | `static` at namespace scope, unnamed `namespace`, namespace-scope `const` | Private to one TU | `static void helper()`, `const int kLimit = 8;` |
| External linkage | Non-static namespace-scope entities, `extern`, `inline` globals, classes | Shared across whole program | Non-member functions, `inline constexpr`, classes |
| Module linkage | Non-exported entities in module purview | Shared within one module | Helpers inside a named C++20 module |

Notice how a block-scope `static` variable crosses axes: it has **static storage duration** (living for the entire program run) and **block scope**, yet **no linkage**—two functions each declaring `static int hits = 0;` get completely separate objects. An important subtle twist occurs when a local `static` lives inside an `inline` function with external linkage: the local variable still has no linkage itself, yet the ODR requires every TU's copy of that inline function to share the single static local object!

```cpp
// Block-scope static: static storage duration, no linkage.
int next_ticket() {
    static int counter = 0; // distinct per function, not shared by name across scopes
    return ++counter;
}

// Inline function with external linkage: all TUs share one `instance` object.
inline int& global_counter() {
    static int instance = 0;
    return instance;
}
```

## Internal linkage: static, const, and unnamed namespaces

At namespace scope, C++ grants external linkage by default. Three mechanisms switch a declaration to **internal linkage**, keeping its symbol private to the current translation unit so `.cpp` files never collide at link time.

First, applying `static` to a namespace-scope variable or function gives it internal linkage. Second, an **unnamed namespace** (`namespace { ... }`) gives internal linkage to every variable, function, class, enumeration, and template inside it (`[basic.link]`). Unlike `static`, which cannot mark a class definition, an unnamed namespace hides user-defined types and prevents ODR collisions between `struct Impl` helpers across `.cpp` files.

Third, a namespace-scope variable declared `const` (including `constexpr`, which implies `const` on objects) has internal linkage unless also marked `extern`, `inline`, or `volatile`, or previously declared external.

> **Standardese.** Under `[basic.link]`, a non-volatile, non-template, non-inline namespace-scope variable of non-exported `const`-qualified type has internal linkage unless previously declared otherwise or explicitly marked `extern`.

```cpp
namespace {
struct ScratchBuffer {   // Internal linkage: safe to define differently in another TU
    int size = 64;
};
int helper_calls = 0;    // Internal linkage; `static` here would be redundant
}

static void record_call() {
    ++helper_calls;
}

const int kDefaultPort = 8080;         // Internal linkage (const without extern/inline)
extern const int kSharedVersion = 3;   // External linkage (explicit extern overrides const rule)
```

## The One Definition Rule and inline entities

The **One Definition Rule** (`[basic.def.odr]`) separates declarations (which may appear repeatedly in a TU) from definitions (which actually allocate storage, provide a function body, or define a type). Its rules split into two tiers:

1. **Within a single translation unit**, no variable, function, class type, enumeration, or template may be defined more than once.
2. **Across the entire program**, every **odr-used** non-inline function and non-inline variable with external linkage must have **exactly one** definition. Missing definitions cause undefined-reference linker errors; duplicate definitions cause multiple-definition linker errors.

Certain entities—classes, templates, `inline` functions, and C++17 `inline` variables—*must* be defined in headers across multiple TUs. The ODR permits one definition per TU provided every TU sees identical tokens whose names resolve to the exact same entities. Changing class layout across TUs via macros is **ill-formed, no diagnostic required (IFNDR)**: the linker rarely catches it, and runtime corruption silently ensues.

```cpp
// Safe header constant since C++17: external linkage, merged to a single address.
inline constexpr int kMaxRetries = 5;

// Contrast with plain `const int kLegacyRetries = 5;` in a header:
// each TU receives its own internal-linkage copy with a distinct address.
inline const int* retry_address() {
    return &kMaxRetries; // Every TU observes the exact same pointer value
}
```

> **Pitfall.** Taking the address of a namespace-scope `const` (non-`inline`) or `static` variable inside an external `inline` function causes IFNDR: each TU resolves to a distinct object, violating ODR entity-identity rules.

Using `inline constexpr` (C++17+) avoids this trap in headers by granting external linkage and merging every TU to one object.

## Language linkage and TU-local boundaries

When calling C libraries or exposing ABI symbols, `extern "C"` specifies **language linkage** (`[dcl.link]`). It disables C++ name mangling and selects the C calling convention while leaving **C++ linkage** (internal vs. external) intact.

Two subtleties frequently catch developers off guard. First, `extern "C" { int x; }` defines `x`, whereas `extern "C" int x;` (without braces) treats `extern` as a declaration only. Second, ISO C++ treats function types with different language linkages as distinct types (`[dcl.link]`)—meaning `extern "C" void (*)(int)` differs formally from `void (*)(int)`—though GCC and Clang allow converting between them when calling conventions match.

C++20 also formalized **TU-local** entities (`[basic.link]`): entities with internal linkage or no linkage cannot be exposed from external-linkage `inline` functions or module interfaces without triggering an error.

> **Pitfall.** Inside `extern "C" { int global_flag; }`, the braces suppress the `extern` storage-class effect on `global_flag`, turning it into a tentative definition that causes duplicate-symbol errors if placed in a header. Always write `extern "C" extern int global_flag;` for header declarations inside a linkage block.

## What to remember

- A **translation unit** is the post-preprocessor token stream of a single `.cpp` file; phase 7 compiles each TU in isolation before phase 9 links them.
- **Scope** governs name lookup, **storage duration** governs object lifetime, and **linkage** governs whether declarations across scopes or TUs refer to the same entity.
- Namespace-scope `const` variables default to **internal linkage**; prefer `inline constexpr` in headers so every TU shares one object and address.
- Use **unnamed namespaces** rather than `static` when hiding types, templates, or groups of helpers inside a single `.cpp` file.
- Every odr-used external non-inline entity needs exactly one definition program-wide; inline functions, inline variables, classes, and templates require identical definitions in every TU (or else IFNDR).
