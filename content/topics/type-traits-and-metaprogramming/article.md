---
title: "Type traits and metaprogramming"
summary: "A type trait is a class template that maps types to a constant or to another type, answered either by specialization or by the compiler itself. Knowing exactly which question each trait asks, and when its operands are instantiated, separates working metaprograms from subtly wrong ones."
track: "templates"
minutes: 13
standard:
  - "[meta.rqmts]"
  - "[meta.type.synop]"
  - "[meta.help]"
  - "[meta.unary.prop]"
  - "[meta.rel]"
  - "[meta.trans.other]"
  - "[meta.logical]"
  - "[declval]"
  - "[stmt.if]"
  - "[expr.context]"
  - "[dcl.pre]"
cppreference:
  - title: "Metaprogramming library"
    path: "meta"
  - title: "std::integral_constant"
    path: "types/integral_constant"
  - title: "std::is_trivially_copyable"
    path: "types/is_trivially_copyable"
  - title: "std::is_constructible"
    path: "types/is_constructible"
  - title: "std::is_convertible"
    path: "types/is_convertible"
  - title: "std::decay"
    path: "types/decay"
  - title: "std::common_type"
    path: "types/common_type"
  - title: "std::conjunction"
    path: "types/conjunction"
  - title: "std::declval"
    path: "utility/declval"
  - title: "if statement (constexpr if)"
    path: "language/if"
prerequisites:
  - "template-instantiation-and-specialization"
  - "type-deduction-auto-decltype"
  - "sfinae"
---

## The one idea

A type trait is a function evaluated by the compiler. Its argument is a type, and its result is either a constant, such as `std::is_integral<T>::value`, or another type, such as `std::remove_reference<T>::type`. The function is written as a class template, and its "body" is the set of specializations the compiler picks from, or, for the traits that cannot be written in C++, a built-in the compiler answers directly.

Two habits make traits reliable. First, read the precise question a trait asks, because many names promise more or less than they test. Second, know when an operand gets instantiated, because metaprograms fail most often by instantiating something that was never meant to be looked at.

> **Mental model.** A trait is a lookup table indexed by type. Specializations are the rows, `true_type` and `false_type` are the cells, and the compiler fills in the rows nobody could write by hand.

## How a trait is built

The building block is `std::integral_constant<T, v>`, which holds `static constexpr T value = v`, a `type` alias to itself, and conversions to `T` so it can be used directly as a value. `std::true_type` and `std::false_type` are its `bool` instances. A predicate trait derives from one of them, so the answer travels by inheritance and can be dispatched on as a type.

```cpp
#include <type_traits>

template<class T> struct is_ptr : std::false_type {};      // primary: the default row
template<class T> struct is_ptr<T*> : std::true_type {};   // partial specialization
template<class T> struct is_ptr<T* const> : std::true_type {};

template<class T> inline constexpr bool is_ptr_v = is_ptr<T>::value;

static_assert(is_ptr_v<int* const> && !is_ptr_v<int>);
```

C++14 added the `_t` alias templates, so `std::remove_reference_t<T>` replaces `typename std::remove_reference<T>::type`. C++17 added the `_v` variable templates. They are pure conveniences; the class template is still what gets instantiated and what you inherit from when composing traits.

Cv-qualifiers and references interact in a way that trips everyone once. A reference type is never const, because `const` applies to the referred-to type, so `is_const_v<const int&>` is false and `remove_const_t<const int&>` is `const int&` unchanged. Strip the reference first.

```cpp
#include <type_traits>

static_assert(!std::is_const_v<const int&>);
static_assert(std::is_same_v<std::remove_const_t<const int&>, const int&>);
static_assert(std::is_same_v<std::remove_cvref_t<const int&>, int>);
```

## The families and the surprising members

The standard groups traits into primary type categories such as `is_class` and `is_pointer`, composite categories such as `is_arithmetic` and `is_object`, type properties such as `is_trivially_copyable` and `is_constructible`, relationships such as `is_same`, `is_base_of` and `is_convertible`, and transformations such as `decay` and `common_type`. Exactly one primary category is true for any type. The trouble lives in the properties and relationships.

### Trivially copyable is not trivial

`is_trivially_copyable` asks whether the type can be copied with `memcpy`: every eligible copy and move operation is trivial, at least one of them is not deleted, and the destructor is trivial and not deleted. `is_trivial` additionally requires trivial default constructors. A class with a user-provided default constructor is therefore trivially copyable but not trivial. For copying bytes, `is_trivially_copyable` is the trait you want; C++26 deprecates `is_trivial` precisely because it mixes two unrelated questions.

```cpp
#include <type_traits>

struct Init { Init() {} int x; };  // user-provided default constructor
static_assert(std::is_trivially_copyable_v<Init>);  // memcpy is fine
static_assert(!std::is_trivial_v<Init>);
```

### Constructible versus convertible

`is_constructible<T, Args...>` asks whether the variable definition `T t(std::declval<Args>()...);` is well-formed. That is direct-initialization, so explicit constructors count, narrowing is allowed, and, since C++20, parenthesized aggregate initialization counts too. `is_convertible<From, To>` asks whether a function returning `To` could `return std::declval<From>();`, which is copy-initialization, so explicit constructors do not count. Only the immediate context is checked: if the chosen constructor's body would fail to compile, the trait still says true.

```cpp
#include <type_traits>

struct Id { explicit Id(int); };
struct Pair { int a, b; };

static_assert(std::is_constructible_v<Id, int>);       // Id t(0) is fine
static_assert(!std::is_convertible_v<int, Id>);        // Id f() { return 0; } is not
static_assert(std::is_constructible_v<int, double>);   // narrowing allowed with parens
static_assert(std::is_constructible_v<Pair, int, int>); // C++20 Pair(1, 2)
static_assert(std::is_constructible_v<const int&, long>); // binds to a temporary
static_assert(!std::is_constructible_v<int&, long>);
```

### decay, remove_cvref and common_type

`decay_t<T>` applies what passing by value does: it removes the reference, then turns arrays into pointers to their element type, functions into function pointers, and strips top-level cv from everything else. `remove_cvref_t<T>`, added in C++20, only removes the reference and the cv-qualifiers, so arrays stay arrays. Reach for `remove_cvref_t` when you want the "plain" type, and `decay_t` only when you are modelling a by-value copy.

`common_type_t<T, U>` is, roughly, the decayed type of `false ? declval<T>() : declval<U>()`. It follows the usual arithmetic conversions, so `common_type_t<int, unsigned>` is `unsigned` and `common_type_t<char, short>` is `int`, and it always yields a non-reference type.

```cpp
#include <type_traits>

static_assert(std::is_same_v<std::decay_t<const int[3]>, const int*>);
static_assert(std::is_same_v<std::decay_t<int(int)>, int (*)(int)>);
static_assert(std::is_same_v<std::remove_cvref_t<const int (&)[3]>, int[3]>);
static_assert(std::is_same_v<std::common_type_t<const int&, int&>, int>);
static_assert(std::is_same_v<std::common_type_t<int, unsigned>, unsigned>);
```

## Traits the compiler must answer

Some questions cannot be answered by any specialization. Nothing in the language distinguishes a union from a class, detects a trivial copy constructor, tells whether a class is an aggregate or is final, or names an enumeration's underlying type. The standard library implements `is_union`, `is_trivially_copyable`, `is_standard_layout`, `is_aggregate`, `is_final`, `has_virtual_destructor`, `underlying_type` and others with compiler built-ins such as `__is_union(T)`. Many traits also require complete types; asking `is_trivially_copyable` about an incomplete class is undefined behaviour, which is a further reason to treat traits as compiler queries rather than ordinary templates.

Because the library may implement any trait with magic, you are not allowed to add rows to the table.

> **Standardese.** [meta.type.synop] says the behaviour of a program that adds specializations for any of the templates in the type traits subclause is undefined unless otherwise specified. The exceptions are `common_type`, which may be specialized when at least one argument is a program-defined type, and `basic_common_reference` since C++20.

```cpp
#include <type_traits>

struct Fixed {};
// template<> struct std::is_integral<Fixed> : std::true_type {};
// undefined behavior; GCC with libstdc++ accepts it silently,
// while Clang with libc++ rejects it as an invalid specialization
```

Write your own trait, such as `is_my_integral`, instead.

## Unevaluated operands and std::declval

Metaprograms constantly ask "what would this expression be?" without running it. The operands of `sizeof`, `decltype`, `noexcept`, a non-polymorphic `typeid` and `requires` expressions are unevaluated, as described in [expr.context]: they are type-checked but never executed, and functions named inside them are not odr-used.

`std::declval<T>()` is a function declared to return `add_rvalue_reference_t<T>`, so `declval<int>()` is an `int&&` xvalue and `declval<int&>()` is an `int&` lvalue. It conjures a value of any type, even one with no usable constructor. It only works in unevaluated operands: [declval] makes odr-use ill-formed, and both libstdc++ and libc++ enforce that with a `static_assert` in its definition.

```cpp
#include <type_traits>
#include <utility>

struct NoDefault { NoDefault(int); double size() const; };

using R = decltype(std::declval<const NoDefault&>().size());  // double, nothing runs
static_assert(std::is_same_v<R, double>);

// int bad = std::declval<int>();  // ill-formed: odr-use of declval
```

## if constexpr and discarded statements

C++17's `if constexpr` evaluates its condition as a constant expression and discards the branch not taken. Inside a template, a discarded statement is not instantiated, so it can contain code that would be invalid for the current arguments. In any function, `return` statements in a discarded branch do not take part in return type deduction, and an entity odr-used only in a discarded branch needs no definition.

Outside a template nothing is instantiated, so a discarded branch is checked like any other code: it must name declared entities and be otherwise well-formed.

```cpp
#include <type_traits>

template<class T> int to_int(T t) {
  if constexpr (std::is_pointer_v<T>) return *t;  // not instantiated for int
  else if constexpr (std::is_integral_v<T>) return t;
  else static_assert(false, "unsupported type");  // OK since C++23
}
int a = to_int(1);
```

That trailing `static_assert(false)` was ill-formed, no diagnostic required, before P2593. C++23 changed [dcl.pre] so that a `static_assert` inside a template definition is only evaluated on instantiation, and GCC 13 and Clang 17 apply the change in earlier modes too.

> **Pitfall.** `if constexpr` is not the preprocessor. In a non-template function, `if constexpr (false) { undeclared(); }` is ill-formed, and `static_assert(false)` in a discarded branch still fires, because the function is not a template definition.

## conjunction, disjunction and lazy instantiation

`std::conjunction<B...>`, `disjunction` and `negation` arrived in C++17. They are not just spelled-out `&&` and `||`. `conjunction` derives from the first `Bi` whose `value` is false, or from the last one, and it stops: later arguments are never asked for their `::value`, so they are never instantiated. A fold expression such as `(Ts::value && ...)` names every `Ts::value`, and naming a member of a class template specialization instantiates it, before `&&` gets a chance to short-circuit.

```cpp
#include <type_traits>

template<class T> struct Expensive {
  static_assert(sizeof(T) == 0, "must not be instantiated");
  static constexpr bool value = true;
};

static_assert(!std::conjunction_v<std::is_integral<float>, Expensive<int>>);  // OK
// template<class... Ts> constexpr bool all = (Ts::value && ...);
// static_assert(!all<std::is_integral<float>, Expensive<int>>);  // static_assert fires
```

This matters for recursive traits and for traits guarding operations that are hard errors on some types. Note also that a conjunction's result type is one of its arguments, not a fresh `bool_constant`, so it carries that argument's `value_type`.

## What to remember

- A trait is a class template whose specializations, or a compiler built-in, map types to `integral_constant` values or to types; `_t` is C++14 and `_v` is C++17.
- References are never const: `is_const_v<const int&>` is false and `remove_const` leaves it alone.
- `is_trivially_copyable` answers "can I memcpy it"; `is_trivial` also demands trivial default construction and is deprecated in C++26.
- `is_constructible` tests direct-initialization, explicit constructors included; `is_convertible` tests implicit conversion; both check only the immediate context.
- `decay_t` models pass-by-value; `remove_cvref_t` keeps arrays and functions intact; `common_type_t` follows the conditional operator and always decays.
- Specializing a standard trait is undefined behaviour, except `common_type` and `basic_common_reference` for program-defined types.
- `std::declval` is for unevaluated operands only; odr-using it is ill-formed.
- `if constexpr` discards without instantiating only inside templates; in C++23 `static_assert(false)` in such a branch is fine.
- `conjunction` and `disjunction` short-circuit instantiation; a fold over `::value` does not.
