---
title: "Template argument deduction"
summary: "Deduction matches each function parameter type against the type of its argument, independently, and then insists the answers agree. A handful of adjustments, a list of contexts that deduce nothing, and the rule that deduction never considers conversions explain almost every surprising call."
track: "templates"
minutes: 12
standard:
  - "[temp.deduct]"
  - "[temp.deduct.call]"
  - "[temp.deduct.type]"
  - "[temp.deduct.funcaddr]"
  - "[temp.deduct.conv]"
  - "[temp.arg.explicit]"
  - "[temp.over]"
cppreference:
  - title: "Template argument deduction"
    path: "language/template_argument_deduction"
  - title: "Function template"
    path: "language/function_template"
  - title: "std::type_identity"
    path: "types/type_identity"
  - title: "Address of an overloaded function"
    path: "language/overloaded_address"
prerequisites:
  - "template-instantiation-and-specialization"
  - "value-categories"
  - "overload-resolution"
---

## The one idea

When you call a function template without spelling out its arguments, the compiler has to invent them. It does so by pattern matching. Each function parameter whose type mentions a template parameter is a pattern, called `P` in the standard. The type of the corresponding argument, called `A`, is the thing being matched. For every `P`/`A` pair, deduction asks which template arguments would make `P` identical to `A`, after a few adjustments. The pairs are matched independently, and every pair that deduces a given parameter must produce the same answer.

Deduction does not consider implicit conversions. Conversions happen later, in overload resolution, for parameters that did not take part in deduction. Once you hold on to "independent pairs, exact match, then agree", most deduction puzzles solve themselves.

```cpp
template<class T> T biggest(T a, T b) { return a < b ? b : a; }

auto x = biggest(1, 2);           // T = int from both pairs
// auto y = biggest(1, 2.0);      // error: T deduced as int and as double
auto z = biggest<double>(1, 2.0); // T given explicitly; 1 converts to double
```

> **Mental model.** Deduction is pattern matching per parameter, not overload resolution. It never asks "could this convert?", only "what would make these types the same?".

## Adjusting P and A for a call

Before matching, [temp.deduct.call] adjusts both sides so that the pattern resembles how the argument will actually be passed.

If `P` is not a reference type, the argument is going to be copied, so `A` decays. An array type becomes a pointer, a function type becomes a function pointer, and top-level cv-qualifiers on `A` are dropped. Top-level cv-qualifiers on `P` are ignored too. If `P` is a reference type, the type it refers to is used as `P` and `A` is left alone, so arrays and `const` survive.

The third case is the **forwarding reference**: `P` is `T&&` for a template parameter `T` of the function template, with no cv-qualifiers. If the argument is an lvalue, `A` is replaced by "lvalue reference to `A`", so `T` itself becomes a reference type, and reference collapsing turns the parameter into an lvalue reference. The forwarding machinery built on this is covered in the topic on forwarding references and perfect forwarding.

```cpp
template<class T> void byval(T);
template<class T> void byref(T&);
template<class T> void byfwd(T&&);

const int ci = 0;
int arr[3];
void fn(int);

void demo() {
  byval(ci);    // T = int: top-level const dropped
  byval(arr);   // T = int*: array decays
  byval(fn);    // T = void(*)(int): function decays
  byref(ci);    // T = const int: the reference keeps const
  byref(arr);   // T = int[3]: no decay through a reference
  byfwd(ci);    // T = const int&: lvalue argument
  byfwd(0);     // T = int: rvalue argument
}
```

After adjustment, deduction looks for an exact match, with three permitted differences. The deduced `A` may be more cv-qualified than the argument when `P` is a reference, so `const T&` accepts an `int` lvalue with `T = int`. A pointer argument may differ by a qualification conversion, so `const T*` accepts `int*`. And if `P` is a class template specialization such as `Base<T>`, or a pointer to one, the argument may be a class derived from some specialization of `Base`.

```cpp
template<class T> struct Base {};
struct Derived : Base<int> {};
template<class T> void take(Base<T>*);

template<class T> struct Wrapper { Wrapper(T) {} };
template<class T> void wrap(Wrapper<T>);

void demo2() {
  Derived d;
  take(&d);     // OK: T = int, derived-to-base is allowed during deduction
  // wrap(1);   // error: deduction cannot see through the converting constructor
}
```

> **Pitfall.** Writing a template parameter as `Wrapper<T>` and hoping callers pass a `T` never works. The pattern `Wrapper<T>` cannot match `int`, and the converting constructor is invisible to deduction. Either make the parameter deducible from the argument, or supply `T` explicitly.

## Non-deduced contexts

Some parts of a type are positions from which deduction refuses to learn anything. The main ones are:

- anything to the left of `::` in a qualified name, as in `typename Id<T>::type`;
- the operand of `decltype`;
- a non-type template argument or array bound that is an expression involving a template parameter, such as `A<N + 1>`;
- a parameter whose argument is a braced list, unless the parameter is `std::initializer_list<P>` or an array;
- a parameter whose argument is an overload set that matches more than one way, or that contains a function template;
- a parameter used only in a default argument that the call relies on.

A template parameter appearing only in non-deduced contexts must come from somewhere else: another parameter, an explicit argument, or a default. A non-deduced function parameter whose type contains no remaining undeduced parameters is just an ordinary parameter, and ordinary implicit conversions apply to it.

That makes a non-deduced context a tool. C++20's `std::type_identity_t<T>` is exactly `typename std::type_identity<T>::type`, a nested name that blocks deduction, so one parameter decides `T` and the other converts.

```cpp
#include <type_traits>
#include <vector>

template<class T> void scale(std::vector<T>&, std::type_identity_t<T>) {}
template<class T> void scale_bad(std::vector<T>&, T) {}

void demo3() {
  std::vector<double> v;
  scale(v, 2);       // OK: T = double from v; 2 converts to double
  // scale_bad(v, 2); // error: T deduced as double and as int
}
```

> **Standardese.** [temp.deduct.type] lists the non-deduced contexts and says that template parameters appearing in them are not deduced there. A parameter used only in non-deduced contexts, and not given explicitly, makes deduction fail; values deduced from other parameters are substituted into those positions afterwards.

## Braced lists, function addresses and conversion functions

A braced list has no type, so `template<class T> void f(T); f({1, 2});` cannot deduce `T`. Two parameter forms are special-cased. For `std::initializer_list<T>`, each element is deduced against `T` separately. For a reference to an array, `const T(&)[N]`, both the element type and the bound are deduced, which is how a function can learn the length of a braced list.

```cpp
#include <cstddef>
#include <initializer_list>

template<class T> void list(std::initializer_list<T>);
template<class T, std::size_t N> constexpr std::size_t len(const T (&)[N]) { return N; }

void demo4() {
  list({1, 2, 3});              // T = int
  static_assert(len({1, 2, 3, 4}) == 4);  // T = int, N = 4
}
```

Deduction also runs outside calls. Taking the address of a function template where a target type is known deduces from that type, as in `int (*pf)(int) = twice;`, which picks `twice<int>`. Passing an overload set as an argument triggers trial deduction against each member. If exactly one succeeds it is used, and if several succeed the parameter becomes a non-deduced context. A conversion function template, `template<class T> operator T()`, deduces `T` from the type the conversion is needed for, after stripping a reference and top-level cv-qualifiers from it.

```cpp
struct Zero {
  template<class T> operator T() const { return T(); }
};

int i = Zero{};         // T = int
double d = Zero{};      // T = double
bool b = bool(Zero{});  // T = bool
```

## Explicit arguments and default template arguments

Explicit template arguments fill the template parameters from the left, and deduction handles the rest. A function parameter whose type no longer contains any undeduced parameter does not participate in deduction, so implicit conversions are allowed on it. This is why `biggest<double>(1, 2.0)` compiles: both parameters are now just `double`.

Order the template parameters so that the ones callers must spell come first, as in `template<class To, class From> To convert(From)`, called as `convert<double>(1)`.

Since C++11, function templates may have default template arguments. A default is used only when a parameter is neither given explicitly nor deduced. Deduction wins whenever it succeeds.

```cpp
#include <type_traits>

template<class T = double>
const char* kind(T = {}) {
  return std::is_same_v<T, int> ? "int" : std::is_same_v<T, double> ? "double" : "other";
}
// kind(1)        -> "int": deduced from the argument, default ignored
// kind()         -> "double": nothing to deduce from, so the default applies
// kind<long>(1)  -> "other": explicit argument, 1 converts to long
```

Note that `kind()` relies on the default *function* argument `= {}`. A parameter that only appears in a default argument is a non-deduced context, so the default *template* argument is what makes the call work.

## Failure versus hard error, and the two relatives

After deduction, the compiler substitutes the deduced arguments into the function type. If the result is invalid, for example because it names `T::size_type` for `T = int`, that is a deduction failure. The template quietly drops out of overload resolution, which is the rule known as SFINAE, covered in its own topic. Only errors in the *immediate context* of the function type count. An error found while instantiating something else, such as a function body needed to deduce an `auto` return type, is a hard error.

```cpp
template<class T> auto size_a(const T& c) -> decltype(c.size()) { return c.size(); }
int size_a(...) { return -1; }

template<class T> auto size_b(const T& c) { return c.size(); }
int size_b(...) { return -1; }

int ok = size_a(42);      // -1: substitution into the return type fails, template removed
// int no = size_b(42);   // hard error: the body is instantiated to deduce the return type
```

Two neighbouring features reuse this machinery. A variable declared with `auto` is deduced as if `auto` were a template parameter `T` and the initializer an argument for a parameter of type `T`, with one notable difference: `auto x = {1, 2};` deduces `std::initializer_list<int>`, where a template would fail. The details live in the topic on `auto` and `decltype`. Class template argument deduction, since C++17, deduces a class template's arguments by running this same deduction against a set of invented function templates made from constructors and deduction guides; it has its own topic.

## What to remember

- Each `P`/`A` pair is matched independently; all deductions of a parameter must agree, and no implicit conversions are considered.
- By-value parameters decay the argument and drop its top-level cv; reference parameters keep arrays and `const`.
- `T&&` with an lvalue argument deduces `T` as an lvalue reference.
- Allowed differences are extra cv through a reference, qualification conversions on pointers, and derived-to-base for class template specializations.
- Nested names, `decltype`, expressions in template arguments, and braced lists are non-deduced; `std::type_identity_t` uses this on purpose.
- Braced lists deduce only into `std::initializer_list<T>` or a reference to an array.
- Explicit arguments fill from the left; parameters left with nothing to deduce accept conversions.
- Defaults apply only when nothing was deduced or given; substitution failures in the immediate context remove the candidate, while errors in bodies are hard errors.
