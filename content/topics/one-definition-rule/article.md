---
title: "The one-definition rule"
summary: "Every entity gets one definition per translation unit, some get exactly one per program, and classes, inline functions and templates may be defined everywhere as long as every copy is the same. Most violations need no diagnostic, so they show up as wrong behaviour that changes with flags and link order."
track: "program-structure"
minutes: 13
standard:
  - "[basic.def.odr]"
  - "[basic.def]"
  - "[dcl.inline]"
  - "[basic.link]"
  - "[expr.prim.lambda.capture]"
  - "[temp.expl.spec]"
cppreference:
  - title: "Definitions and ODR"
    path: "language/definition"
  - title: "inline specifier"
    path: "language/inline"
  - title: "Translation-unit-local entities"
    path: "language/tu_local"
prerequisites:
  - "translation-units-and-linkage"
---

## The one idea

The one-definition rule, the ODR, is the contract that lets separate compilation work. The compiler sees one translation unit at a time and trusts that what it sees there agrees with what every other translation unit sees. The rule has three layers:

1. Within one translation unit, nothing may be defined twice.
2. In the whole program, every non-inline function or variable that is odr-used must be defined exactly once.
3. Classes, enumerations, inline functions, inline variables, templates and a few others may be defined in several translation units, but every definition must be the same, in a strong, token-level sense.

The first layer is checked by the compiler. The second is usually caught by the linker. The third is, for the most part, **ill-formed, no diagnostic required**: the program is broken, nobody is obliged to tell you, and the resulting behaviour is not constrained by the standard.

> **Mental model.** The ODR lets the program behave as if each entity has one definition. Repeating a definition is allowed only where the copies are interchangeable, and the toolchain is free to keep any one of them and throw the rest away.

## One per translation unit, one per program

The per-translation-unit rule is simple and diagnosed. Two definitions of the same class, function or variable in one translation unit are an error, which is what include guards exist to prevent.

The program-wide rule applies to non-inline functions and variables. If such an entity is odr-used, at least one definition must exist somewhere, and if more than one exists in different translation units the program is ill-formed. Neither failure needs a diagnostic, because no single compilation can see it. In practice the linker reports an undefined symbol or a duplicate symbol, but the standard does not promise even that.

```cpp
// helpers.h, included by two .cpp files
int clamp_to_byte(int v) { return v < 0 ? 0 : v > 255 ? 255 : v; }
// two external definitions: ill-formed; usually a duplicate-symbol link error
// fix: mark it inline, or declare it here and define it in one .cpp file
```

A full explicit specialization of a function template is an ordinary function for this purpose. It is not a template, so it is not implicitly inline. Defining `template<> void log<int>(int) { ... }` in a header without `inline` gives one definition per translation unit and the same duplicate-symbol problem.

## Odr-use: when a definition is actually needed

Only odr-used entities need a definition. A function is odr-used when a potentially evaluated expression names it, which covers calls and taking its address. A variable is odr-used when a potentially evaluated expression names it, unless the variable is usable in constant expressions and the expression immediately reads its value, or the expression is a discarded-value expression that does not read it. Binding a reference to the variable, or taking its address, is an odr-use.

The classic casualty is a `static const` data member with an in-class initializer. Reading its value is not an odr-use, but passing it to `std::min`, which takes `const T&`, is.

```cpp
#include <algorithm>

struct Limits { static const int max_items = 64; };  // declaration, not a definition

int clamp_count(int n) {
  int a = Limits::max_items;             // fine: only the value is read
  return std::min(n, Limits::max_items) + a;  // odr-use: binds const int&
}
// without "const int Limits::max_items;" in some .cpp file, GCC and Clang fail to link at -O0;
// at -O2 the call is inlined and it may link anyway
```

Since C++17 the fix is `static constexpr int max_items = 64;`, because a `constexpr` static data member is implicitly an inline variable and its in-class declaration is a definition. The fact that the broken version links at `-O2` is exactly what "no diagnostic required" looks like.

Odr-use also decides what a lambda must capture. A local `const int` initialized with a constant can be read inside a lambda without any capture, because reading it is not an odr-use; taking its address is, and requires a capture.

```cpp
void demo() {
  const int n = 3;
  auto twice = [] { return n * 2; };   // OK: n is not odr-used
  // auto where = [] { return &n; };   // ill-formed: odr-use of n requires a capture
  (void)twice;
}
```

## Many definitions that must be one

For a class, enumeration, inline function, inline variable, templated entity, concept, and a few more, a program may contain one definition per translation unit. [basic.def.odr] then demands that the definitions agree. The main requirements are:

- each definition consists of the **same sequence of tokens**;
- each name in the definitions refers to the **same entity**, after overload resolution, with a narrow exception for constants whose values are read but which are not odr-used;
- overloaded operators, conversions and allocation functions used in the definitions are the same;
- corresponding entities have the same language linkage;
- default arguments used in the definitions satisfy the same requirements;
- for templates, the rules also apply to names looked up at the point of instantiation.

When these hold, the program behaves as if there were one definition. When they do not, and the definitions are not attached to a named module, the program is ill-formed with no diagnostic required.

The same tokens are not enough. Each name must also find the same entity. A `constexpr` variable at namespace scope has internal linkage, so each translation unit has its own copy, and an inline function that odr-uses it refers to a different object in each translation unit.

```cpp
// limits.h, included by several .cpp files
constexpr int max_depth = 32;              // internal linkage: one object per TU

inline int depth_value() { return max_depth; }        // OK: value read, not odr-used
inline const int& depth_ref() { return max_depth; }   // ODR violation: binds a reference
// fix: inline constexpr int max_depth = 32;  (one program-wide object)
```

> **Standardese.** [basic.def.odr] allows a name in the definition to refer to a different object in each translation unit only if the object is a non-volatile `const` object with internal or no linkage, has the same literal type and value in every definition, is initialized with a constant expression, and is not odr-used. `depth_value` satisfies that, and `depth_ref` does not.

Lambda expressions follow the same pattern. A lambda inside an inline function or a template has the same closure type in every translation unit, because the definition containing it is "the same". A lambda that initializes a namespace-scope `constexpr` variable does not: the variable has internal linkage, so each translation unit gets its own variable of its own closure type, and any inline function that calls it refers to different entities in different translation units. Declare such variables `inline constexpr`.

## How violations bite

Because no diagnostic is required, ODR violations rarely fail loudly. These are the common shapes:

- A header defines a struct differently depending on a macro, such as a debug-only member guarded by `#ifndef NDEBUG`, and two libraries are built with different settings. Each side computes different offsets and sizes for the "same" class.
- Two libraries each define a helper with the same name, such as `inline int version()`, or a class called `Node`, with different bodies, in the global namespace.
- A file is compiled with flags that change the meaning of the tokens, such as a different `#pragma pack`, a different `-D` value, or a different language standard that changes a library type's layout.
- A function is declared `inline` in one translation unit and not in another.

The second shape is easy to reproduce. Two translation units define `inline int version()` returning 1 and 2, and each calls it. With GCC 16 at `-O0` both calls return the same value, which one depends on the link order. At `-O2` each call is inlined and returns its own translation unit's value. None of these outcomes is a bug in the compiler.

> **Pitfall.** `static` inline functions and functions in unnamed namespaces are immune, because each translation unit has its own entity. That is also a cost: a `static inline` function in a header gives each translation unit its own copy of any `static` local variable, so a counter or cache in it is silently per-translation-unit.

The rule for inline declarations has its own quiet trap. [dcl.inline] requires that if a function with external linkage is declared `inline` in one translation unit, an inline declaration is reachable in every translation unit that declares it, with no diagnostic required. In practice, an inline function is only emitted where it is odr-used. If the translation unit that sees `inline` never calls it, another translation unit that declared it non-inline gets an undefined-symbol error. If it does call it, the program may link at `-O0` and stop linking at `-O2`, once that call is inlined.

## Vague linkage: how implementations cope

The standard only says "behave as if there is one definition". Implementations deliver that with **vague linkage**. On ELF and Mach-O platforms that use the Itanium C++ ABI, a compiler emits every inline function, inline variable, template instantiation, static local guard variable and `typeinfo` object it needs as a weak or COMDAT symbol. The linker keeps one copy of each and discards the others without comparing them. On macOS, `nm -m` shows such a symbol as `weak external`.

```text
a.o:  weak external  version()   -> returns 1
b.o:  weak external  version()   -> returns 2
          \                         /
           linker keeps the first one it sees;
           calls that were inlined keep their own copy
```

Virtual tables follow a related convention. The Itanium ABI emits a class's vtable in the translation unit that defines its **key function**, the first non-inline, non-pure virtual member function. Without one, the vtable is emitted with vague linkage wherever it is needed.

Some tools can find ODR violations that compilers are not required to diagnose. GCC's link-time optimizer warns about mismatched type definitions with `-flto -Wodr`, enabled by default under LTO, and on Linux AddressSanitizer can report some global variables that are defined twice. Neither compares inline function bodies; in the `version()` example above, GCC 16 with `-flto -Wodr` says nothing.

Since C++20, definitions attached to a named module change the picture: an importer reaches the module's one definition instead of compiling its own copy, and a second definition is diagnosable when an earlier one is reachable. The modules topic covers that in detail.

## What to remember

- One definition per translation unit is diagnosed; one per program for non-inline functions and variables is not, and usually surfaces at link time.
- Only odr-used entities need definitions; binding a reference or taking an address is an odr-use, reading a constant's value is not.
- `static constexpr` data members are inline since C++17 and need no out-of-line definition.
- Repeated definitions of classes, inline entities and templates must have the same tokens and must find the same entities.
- An inline function that odr-uses a namespace-scope `constexpr` variable violates the ODR; use `inline constexpr`.
- Explicit specializations of function templates are not implicitly inline.
- ODR violations are ill-formed, no diagnostic required; results change with optimization level and link order.
- Vague linkage keeps one arbitrary copy of each inline entity; `-flto -Wodr` catches type mismatches, not differing function bodies.
