---
title: "SFINAE"
summary: "When substituting template arguments into a function template's declaration produces an invalid type or expression, that template quietly leaves the overload set. Only failures in the immediate context of the signature count; everything else is a hard error."
track: "templates"
minutes: 12
standard:
  - "[temp.deduct.general]"
  - "[temp.deduct.call]"
  - "[temp.over]"
  - "[temp.over.link]"
  - "[temp.param]"
  - "[meta.trans.other]"
  - "[dcl.spec.auto]"
cppreference:
  - title: "SFINAE"
    path: "language/sfinae"
  - title: "std::enable_if"
    path: "types/enable_if"
  - title: "std::void_t"
    path: "types/void_t"
  - title: "std::experimental::is_detected"
    path: "experimental/is_detected"
  - title: "Template argument deduction"
    path: "language/template_argument_deduction"
prerequisites:
  - "template-argument-deduction"
  - "overload-resolution"
---

## The one idea

Before overload resolution can compare a function template with other candidates, the compiler has to work out its template arguments and substitute them into the template's declaration: the parameter types, the return type, the template parameter list, and since C++20 the `explicit` specifier. If that substitution produces something that cannot exist, such as `int::type`, a pointer to a reference, or a call to a member that is not there, the template is simply dropped from the candidate set. Substitution failure is not an error. If no candidate survives, the call fails as usual with "no matching function".

That is the entire mechanism. Everything clever built on it, from `enable_if` to the detection idiom, is a way of writing a condition so that it turns into an invalid type or expression in the signature when the condition is false.

> **Mental model.** SFINAE looks only at the declaration the compiler is substituting into, never at what substitution sets in motion. A failure written directly in the signature removes the candidate. A failure that happens inside some other template the signature had to instantiate, or inside a function body, stops compilation.

## The immediate context: signature, not body

The standard calls the region where failures are soft the immediate context of the function type, its template parameter types and its `explicit` specifier. It does not define the term precisely, but its examples and the long-standing compiler consensus agree on the boundary. Forming the type `typename T::value_type` is in the immediate context. Instantiating a class template so that you can look inside it is a side effect, and an error inside that class's definition is not.

```cpp
template <class T>
struct Checked {
  static_assert(sizeof(T) > 1, "too small");
  using type = int;
};

template <class T> typename Checked<T>::type h(T) { return 0; }
long h(...) { return 1; }

// h('c');  // hard error: the static_assert fires while instantiating
//          // Checked<char>; the h(...) fallback is never reached
```

Function bodies are never part of the immediate context. That includes bodies the compiler has to instantiate just to learn a deduced return type. If a signature asks for the type of a call to a function declared with `auto`, the callee's body is instantiated, and an error there is final.

```cpp
#include <utility>

template <class T> auto value_of(T t) { return t.value; }

template <class T>
auto probe(int) -> decltype(value_of(std::declval<T>()), true) { return true; }
template <class T> bool probe(...) { return false; }

// probe<int>(0);  // hard error inside value_of's body, not a quiet false
```

C++20 adds one explicit exclusion: the body of a lambda expression is not part of the immediate context, so a lambda inside `decltype` cannot be used to probe for validity.

Substitution also happens in a defined order. Since C++11 (through CWG 1227), it proceeds in lexical order and stops at the first failure. Where you put a constraint can therefore decide whether a later, dangerous instantiation happens at all.

```cpp
template <class T> struct A { using X = typename T::X; };

template <class T> typename T::X f(typename A<T>::X);
template <class T> int f(...) { return 1; }

template <class T> auto g(typename A<T>::X) -> typename T::X;
template <class T> int g(...) { return 2; }

void use() {
  f<int>(0);    // OK: the return type int::X fails first, A<int> is never touched
  // g<int>(0); // error: the parameter is substituted first and instantiates A<int>
}
```

## `enable_if` and where to put it

`std::enable_if<B, T>` has a member `type` equal to `T` only when `B` is true. Naming `std::enable_if_t<B, T>` when `B` is false names a member that does not exist, which is a substitution failure. There are three places to put it.

- **The return type**: `std::enable_if_t<cond, R> f(T)`. Clear, but unusable for constructors and conversion operators, and it clutters the signature people read.
- **An extra function parameter with a default argument**: `void f(T, std::enable_if_t<cond>* = nullptr)`. It works for constructors, but it changes the function's arity and leaks into function pointer types.
- **A template parameter**: either a type parameter with a default, or a non-type parameter. This is the idiomatic choice, and the form you pick matters.

The type-parameter form has a trap. Default template arguments are not part of a function template's signature, so two templates that differ only in their defaults are the same template declared twice.

```cpp
#include <cstdio>
#include <type_traits>

// template <class T, class = std::enable_if_t<std::is_integral_v<T>>>
// void f(T) {}
// template <class T, class = std::enable_if_t<std::is_floating_point_v<T>>>
// void f(T) {}   // error: redefinition, both are template <class, class> void f(T)

template <class T, std::enable_if_t<std::is_integral_v<T>, int> = 0>
void g(T) { std::puts("integral"); }
template <class T, std::enable_if_t<std::is_floating_point_v<T>, int> = 0>
void g(T) { std::puts("floating"); }   // OK: the parameter's type differs
```

In the non-type form, the condition is part of the template parameter's type, and two template parameter lists are equivalent only if their parameters have equivalent types. The two `g` templates are therefore distinct, and each one removes itself when its condition fails.

> **Pitfall.** `enable_if` only works on a condition that depends on a template parameter of the function template being substituted. A member function of a class template that uses the class's `T` in `enable_if_t<std::is_integral_v<T>, int>` is not being deduced at all: instantiating the class with `double` produces an invalid declaration, which is a hard error. Give the member its own defaulted parameter, `template <class U = T, ...>`, so there is something to substitute.

## Expression SFINAE with `decltype`

C++11 made it explicit that arbitrary expressions in a signature participate in substitution. A trailing `decltype` lets a template ask "would this expression compile?" and name the resulting type at the same time.

```cpp
#include <cstdio>
#include <string>

template <class T>
auto describe(const T& t) -> decltype(t.size(), void()) { std::printf("size %zu\n", t.size()); }
void describe(...) { std::puts("no size"); }

void demo() {
  describe(std::string("abc"));  // size 3
  describe(42);                  // no size
}
```

The comma operator lets the expression check one thing and yield another type. The `void()` on the right is not decoration: if `t.size()` returned a class type with an overloaded `operator,`, the comma would call it. A `void` operand cannot be passed to a user-defined comma operator, so `void()` forces the built-in one.

Access checking is part of substitution too. If `size` exists but is private, the expression is invalid in the context of the substitution, and the template is removed rather than diagnosed.

## `void_t` and the detection idiom

For type traits, the same trick moves into class template partial specialization. Matching a partial specialization also deduces and substitutes, so an invalid type in its argument list makes that specialization not match. `std::void_t`, added in C++17, maps any list of valid types to `void`, which turns "these types are well-formed" into "this specialization's argument is `void`".

```cpp
#include <type_traits>
#include <utility>

template <class, class = void>
struct has_size : std::false_type {};

template <class T>
struct has_size<T, std::void_t<decltype(std::declval<T&>().size())>> : std::true_type {};

class Hidden { int size() const { return 0; } };
struct Open { int size() const { return 0; } };

static_assert(!has_size<int>::value);
static_assert(!has_size<Hidden>::value);  // private: a substitution failure, not an error
static_assert(has_size<Open>::value);
```

The primary template supplies `void` as the default second argument. When the expression is valid, the specialization's argument is also `void`, it matches, and it is more specialized. When the expression is invalid, only the primary is left.

The Library Fundamentals TS v2 generalized this as the detection idiom: `std::experimental::is_detected<Op, Args...>` takes an alias template `Op` describing the expression, plus `detected_t` and `detected_or` to fetch the resulting type with a fallback. It never made it into the standard library, because concepts arrived and do the job natively.

## Hard errors and soft failures

A useful checklist for the boundary:

| Soft failure: candidate removed | Hard error: compilation stops |
| --- | --- |
| Naming a member type that does not exist | A `static_assert` or invalid member inside a class template instantiated along the way |
| An invalid expression inside `decltype` or `sizeof` in the signature | An error in a body instantiated to deduce an `auto` return type |
| A pointer to a reference, an array of `void`, a negative array bound | An error in a function body after the candidate was chosen |
| An inaccessible member named in the signature | A lambda body used inside the signature (C++20) |
| A non-type argument that does not convert to the parameter's type | An `enable_if` on a class template parameter in a non-template member |

> **Standardese.** [temp.deduct.general] states that only invalid types and expressions in the immediate context of the function type, its template parameter types and its `explicit` specifier cause deduction failure, and that side effects of substitution, such as instantiating class template specializations or implicitly defining member functions, are not in the immediate context. It also says that if different declarations of the same template would substitute in different lexical orders with different instantiation results, the program is ill-formed, no diagnostic required.

The other consequence of this boundary is that SFINAE says nothing about whether the body would compile. A template that passes every check in its signature can still fail when its definition is instantiated. Constraining the signature is a promise you make by hand.

## Concepts replace most of it

C++20 constraints express the same conditions directly. A requires-clause is checked after deduction, an unsatisfied constraint removes the candidate just as a substitution failure would, and constraints also take part in choosing between overloads that are both viable, which SFINAE cannot do without contortions such as mutually exclusive conditions.

```cpp
#include <concepts>
#include <cstdio>

void h(std::integral auto) { std::puts("integral"); }
void h(std::floating_point auto) { std::puts("floating"); }  // no redeclaration trap
```

Constraints remove the redeclaration trap, since different constraints make different templates; they produce diagnostics that name the failed requirement; and they work on non-template members of class templates. What they do not change is the immediate-context rule: an invalid expression inside a requires-expression makes it false, while an error inside something that expression instantiates is still a hard error. SFINAE remains the tool for C++17 and earlier code, for partial specializations written as traits, and for reading the standard library. The concepts-and-constraints topic covers the replacement in depth.

## What to remember

- Substitution failure removes a function template from the candidate set; if nothing viable remains, the call still fails.
- Only the immediate context counts: the signature, template parameter types and `explicit` specifier, not bodies, instantiated classes or lambda bodies.
- Substitution runs in lexical order and stops at the first failure, so placement can prevent a dangerous instantiation.
- Deduced `auto` return types instantiate the body, so probing them is a hard error.
- Default template arguments are not part of the signature; use `std::enable_if_t<cond, int> = 0`, not `class = std::enable_if_t<cond>`, for overloads.
- `enable_if` on a class template's own parameter in a member is a hard error; the condition must depend on the function template's parameters.
- Write `decltype(expr, void())` to sidestep overloaded commas; access violations in the signature are soft failures.
- `void_t` plus a partial specialization is the C++17 detection idiom; concepts and requires-expressions are its C++20 replacement.
