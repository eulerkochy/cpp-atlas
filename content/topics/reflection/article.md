---
title: "Static reflection"
summary: "C++26 lets a program ask the compiler about its own declarations at compile time. The `^^` operator turns a construct into a `std::meta::info` value, `<meta>` functions query and transform those values, and a splice `[: r :]` turns a value back into code."
track: "cpp26"
minutes: 15
standard:
  - "[expr.reflect]"
  - "[basic.splice]"
  - "[basic.types.general]"
  - "[expr.const.imm]"
  - "[expr.const.reflect]"
  - "[stmt.expand]"
  - "[dcl.attr.annotation]"
  - "[meta.syn]"
  - "[meta.reflection.access.context]"
  - "[meta.reflection.member.queries]"
  - "[meta.reflection.define.aggregate]"
cppreference:
  - title: "Reflection TS (the earlier, type-based design)"
    path: "experimental/reflect"
  - title: "consteval specifier"
    path: "language/consteval"
  - title: "Constant expressions"
    path: "language/constant_expression"
prerequisites:
  - "constant-expressions"
  - "type-traits-and-metaprogramming"
  - "template-instantiation-and-specialization"
  - "constexpr-in-cpp26"
---

## The one idea

Reflection gives you a value that stands for a piece of your program: a type, a variable, a data member, an enumerator, a function, a namespace. You can store that value, pass it to functions, put it in a `std::vector`, and compare it. When you are done computing, you **splice** it back, and the compiler treats the splice as if you had written the name of the thing it stands for.

All of this happens during constant evaluation. A reflection value never exists at run time, so reflection costs nothing at run time and cannot leak compiler internals into a binary.

This is C++26. The core paper is P2996R13, adopted in June 2025, together with P3394R4 (annotations), P3293R3 (splicing base class subobjects), P3096R12 (reflecting function parameters), P3491R3 (`define_static_array` and friends), P3560R2 (errors as exceptions), P3289R1 (`consteval` blocks) and P1306R5 (expansion statements). Everything here follows N5050, the final C++26 draft sent to the international ballot. That ballot closed in October 2026 and was reported as not approved, so check the status before you quote this as published ISO C++. GCC 16 lists every one of these papers except P3289 as implemented, and `consteval` blocks work as well. Reflection itself needs `-std=c++26 -freflection`. Expansion statements work with `-std=c++26` alone. Clang 21 has no reflection support. Every example below was compiled with GCC 16.2.

> **Mental model.** `^^` lifts a construct into a value of type `std::meta::info`. Ordinary `consteval` code computes with those values. `[: :]` lowers a value back into a construct. Between the lift and the lower, reflection is just constant-expression programming.

## Lifting and lowering

The reflection operator accepts `^^::` for the global namespace, a namespace or template name, a type-id, or an id-expression naming a variable, function, enumerator, structured binding, or non-static data member. Its result is a prvalue of type `std::meta::info`, a scalar type whose values can be compared with `==` and `!=` but not ordered. A value-initialized `info` holds the unique **null reflection**.

```cpp
#include <meta>

constexpr std::meta::info t = ^^int;     // a reflection of the type int
typename [:t:] answer = 42;              // splice it back: declares an int

struct Point { int x; int y; };
constexpr std::meta::info ry = ^^Point::y;          // reflects the data member y
int read_y(const Point& p) { return p.[:ry:]; }     // member access through a splice

static_assert(std::meta::is_type(t));
static_assert(std::meta::identifier_of(ry) == "y");
static_assert(std::meta::type_of(ry) == ^^int);
static_assert(^^Point::x != ^^Point::y);            // reflections compare by identity
```

A splice `[: r :]` requires `r` to be a constant expression. Where the grammar cannot tell what kind of thing the splice produces, you disambiguate as you do with dependent names: write `typename [:r:]` for a type and `template [:r:]` for a template. `obj.[:m:]` accesses a member, and `[:r:]` alone is an expression when `r` reflects a variable, function, or enumerator.

Reflections keep aliases apart. With `using Int = int;`, `^^Int` reflects the type alias and is not equal to `^^int`. `std::meta::dealias(^^Int)` gives `^^int`.

> **Pitfall.** `^^` takes the longest token sequence that forms a type-id. So `r == ^^int && ok` parses as `r == ^^(int&&) ok` and does not compile. The draft's own example shows this, and also `^^int & true`. Write `(^^int) && ok`.

## Why it is compile-time only

N5050 introduces **consteval-only types** in [basic.types.general]. `std::meta::info` is one, and so is any pointer, reference, array, or class that contains one, including `std::vector<std::meta::info>`. Every object of such a type must be a `constexpr` variable, a template parameter object, or an object whose lifetime begins and ends inside one constant evaluation. A function whose type mentions a consteval-only type must be an immediate function.

```cpp
#include <meta>

consteval std::size_t field_count(std::meta::info type) {
  return std::meta::nonstatic_data_members_of(
      type, std::meta::access_context::unchecked()).size();
}

struct P { int a; double b; };
static_assert(field_count(^^P) == 2);

int main() {
  // std::meta::info bad = ^^P;          // error: a run-time object of consteval-only type
  constexpr std::meta::info r = ^^P;     // OK: a constexpr variable
  return field_count(r) == 2 ? 0 : 1;    // OK: the call is folded to a constant
}
```

A plain `constexpr` function with an `info` parameter is ill-formed, because it is not immediate. A `constexpr` function *template*, or a lambda, escalates to an immediate function automatically when it touches a reflection.

> **Standardese.** [expr.const.imm] defines an immediate function as one declared `consteval`, or an immediate-escalating function whose type is consteval-only or whose body uses an immediate-escalating expression. Only lambdas, defaulted special members, and specializations of `constexpr` templates are immediate-escalating. That is why `constexpr bool f(std::meta::info)` is an error while `template<class T> constexpr bool f(T)` is fine.

## Querying with `<meta>`

`<meta>` declares more than two hundred `consteval` functions in `std::meta`. They fall into a few families:

- **names**: `identifier_of`, `has_identifier`, `display_string_of`, `source_location_of`;
- **queries**: `type_of`, `parent_of`, `is_public`, `is_static_member`, `is_noexcept`, `has_default_member_initializer`, and many more;
- **members**: `members_of`, `bases_of`, `nonstatic_data_members_of`, `static_data_members_of`, `enumerators_of`, `parameters_of`;
- **layout**: `offset_of`, `size_of`, `alignment_of`, `bit_size_of`;
- **templates**: `template_of`, `template_arguments_of`, `can_substitute`, `substitute`;
- **values**: `reflect_constant`, `reflect_object`, `extract`, `constant_of`;
- **type traits**: an `info`-based twin for every standard trait, such as `is_class_type`, `remove_cvref`, and `is_constructible_type`.

When a function cannot produce a meaningful result, it throws `std::meta::exception` (P3560). If the exception escapes a constant evaluation, the expression is not constant and the program is ill-formed. Inside your own `consteval` code you can catch it.

```cpp
#include <meta>
#include <vector>

constexpr std::meta::info vi = std::meta::substitute(^^std::vector, {^^int});
static_assert(vi == ^^std::vector<int>);
typename [:vi:] numbers{1, 2, 3};        // a std::vector<int>

constexpr std::meta::info c = std::meta::reflect_constant(42);
static_assert(std::meta::extract<int>(c) == 42);
static_assert(std::meta::type_of(c) == ^^int);

consteval bool has_name(std::meta::info r) {
  try {
    (void)std::meta::identifier_of(r);
    return true;
  } catch (const std::meta::exception&) {
    return false;                        // identifier_of throws for unnamed constructs
  }
}
static_assert(has_name(^^numbers));
static_assert(!has_name(^^int));
```

`int` has no identifier in this sense: for a type, `has_identifier` is true only for an unqualified class or enumeration type without template arguments, or one with a typedef name for linkage purposes. Use `display_string_of` when you just want something printable. Its text is implementation-defined.

### Access is an explicit argument

Every member query takes a `std::meta::access_context`. `access_context::current()` checks access as if from the point where you wrote the call. `unprivileged()` checks from the global namespace, and `unchecked()` ignores access entirely. A reflection library cannot quietly read private members. The caller has to opt in, and a code reviewer can see where they did.

## From metadata back to code

Iterating over members needs a loop whose body is instantiated once per element, because each member has a different type. That loop is the **expansion statement**, `template for`. An enumerating expansion statement walks a braced list of expressions. A destructuring expansion statement walks anything that structured bindings accept, such as a tuple or an aggregate. An iterating expansion statement walks a range whose size is a constant. `break` and `continue` work as in a normal loop.

A `std::vector<std::meta::info>` cannot outlive the constant evaluation that created it, so it cannot serve as a `constexpr` range for `template for`. `std::define_static_array` copies the elements into a static array and returns a `span` over it, which can.

```cpp
#include <meta>
#include <string_view>
#include <cstdio>

template <class E>
  requires std::is_enum_v<E>
constexpr std::string_view enum_name(E value) {
  template for (constexpr std::meta::info e :
                std::define_static_array(std::meta::enumerators_of(^^E))) {
    if (value == [:e:]) return std::meta::identifier_of(e);
  }
  return "<unnamed>";
}

enum class Color { red, green, blue };

int main() {
  Color c = Color::blue;                 // a run-time value
  std::puts(enum_name(c).data());        // prints blue
  static_assert(enum_name(Color::red) == "red");
}
```

`enum_name` takes a run-time value, yet it is still a `constexpr` function. The reflections are used only inside the constant initializer of the loop variable `e`, and what survives into run time is a chain of comparisons against enumerator constants and pointers to static strings. The returned `string_view` is null-terminated, because the standard guarantees that every name string from `std::meta` is.

The same pattern prints a struct generically. Because the context is `current()` inside a function template, private members of the argument are skipped.

```cpp
#include <meta>
#include <iostream>

template <class T>
void print_fields(const T& obj) {
  constexpr auto ctx = std::meta::access_context::current();
  template for (constexpr auto m :
                std::define_static_array(std::meta::nonstatic_data_members_of(^^T, ctx))) {
    std::cout << std::meta::identifier_of(m) << " = " << obj.[:m:] << '\n';
  }
}

struct Order {
  int id = 7;
  double price = 9.5;
private:
  int secret = 42;                       // not visible from print_fields
};

int main() { print_fields(Order{}); }    // prints id = 7, then price = 9.5
```

### Annotations

P3394 adds **annotations**, written `[[=expr]]`, where `expr` is any constant expression of structural type. Unlike attributes, the compiler does not interpret them. They exist so that reflection code can read them. Each annotation is a distinct entity, so `[[=1, =1]]` attaches two annotations. Annotations accumulate across redeclarations, and `annotations_of` returns them all.

```cpp
#include <meta>
#include <iostream>

struct Skip {};
struct Width { int chars; };

struct Config {
  [[=Width{6}]] int port = 8080;
  [[=Skip{}]] int cache_handle = 0;
  int max_connections = 64;
};

template <class T>
void dump(const T& obj) {
  constexpr auto ctx = std::meta::access_context::current();
  template for (constexpr auto m :
                std::define_static_array(std::meta::nonstatic_data_members_of(^^T, ctx))) {
    if constexpr (std::meta::annotations_of_with_type(m, ^^Skip).empty()) {
      constexpr auto w = std::define_static_array(
          std::meta::annotations_of_with_type(m, ^^Width));
      std::cout << std::meta::identifier_of(m) << ": ";
      if constexpr (!w.empty())
        std::cout.width(std::meta::extract<Width>(w[0]).chars);
      std::cout << obj.[:m:] << '\n';
    }
  }
}

int main() { dump(Config{}); }  // prints port, padded to 6 columns, then max_connections
```

The annotation value must be usable as a template argument. `Rename{"name"}` with a `const char*` member fails, because a pointer to a string literal is not a permitted constant. Wrap the text with `std::define_static_string` instead.

## Generating types with `define_aggregate`

C++26 reflection can create one kind of declaration: the definition of a previously incomplete class as a plain aggregate. `data_member_spec` describes a member (type, name, alignment, bit-width, `no_unique_address`, annotations). `define_aggregate` takes an incomplete class and a list of member descriptions, and produces an **injected declaration** that completes the class.

An injected declaration is a side effect on the program. It may come only from the evaluation of a `consteval` block, a declaration of the form `consteval { ... }`. Calling `define_aggregate` from a `constexpr` variable's initializer is not a constant expression. A `consteval` block also may not sit inside the class it defines.

```cpp
#include <meta>
#include <array>
#include <vector>
#include <cstdio>

template <class T, std::size_t N>
struct SoA {
  struct Columns;
  consteval {
    std::vector<std::meta::info> specs;
    for (std::meta::info m : std::meta::nonstatic_data_members_of(
             ^^T, std::meta::access_context::unchecked())) {
      std::meta::info column = std::meta::substitute(
          ^^std::array, {std::meta::type_of(m), std::meta::reflect_constant(N)});
      specs.push_back(std::meta::data_member_spec(
          column, {.name = std::meta::identifier_of(m)}));
    }
    std::meta::define_aggregate(^^Columns, specs);
  }
  Columns data;
};

struct Particle { float x; float y; int id; };

int main() {
  SoA<Particle, 1024> ps{};
  ps.data.x[3] = 1.5f;                   // x is std::array<float, 1024>
  ps.data.id[3] = 9;                     // id is std::array<int, 1024>
  std::printf("%zu\n", ps.data.y.size()); // prints 1024
}
```

That is a struct-of-arrays transform in about fifteen lines, with member names preserved. Inside the `consteval` block, an ordinary `for` loop over a `std::vector` is fine, because the whole block is one constant evaluation.

## Limits worth knowing

- C++26 reflection reads declarations, but the only code it writes is aggregate definitions. It cannot inject functions, statements, or arbitrary members. Token-sequence injection is proposed for a later standard.
- `members_of` sees only declarations that precede the point of evaluation. Inside a class's own definition, the class is incomplete, and asking for its members throws.
- Function bodies and expressions cannot be reflected. Only declarations and the entities they introduce can.
- Because `members_of` depends on which declarations precede the evaluation, the same query can answer differently in two translation units. An inline function or template that depends on the answer then violates the ODR.
- `display_string_of` and `source_location_of` are only loosely specified. Do not compare their output across compilers.

## What to remember

- `^^x` gives a `std::meta::info`. `[: r :]` turns it back into code, with `typename` or `template` to disambiguate.
- `info` is a consteval-only type, so every object of it is `constexpr` or lives inside one constant evaluation. A non-template `constexpr` function cannot take one.
- `<meta>` functions are `consteval` and report failure by throwing `std::meta::exception`. An uncaught exception makes the expression non-constant.
- Member queries take an `access_context`: `current()`, `unprivileged()`, or the explicit escape hatch `unchecked()`.
- `template for` instantiates its body once per element. Use `std::define_static_array` to turn a `vector<info>` into something it can walk.
- `define_aggregate` completes an incomplete class, and only from inside a `consteval { }` block.
- `[[=v]]` annotations are user data for reflection. Every annotation counts separately.
- GCC 16 implements all of it behind `-std=c++26 -freflection`. Clang 21 does not implement it yet.
