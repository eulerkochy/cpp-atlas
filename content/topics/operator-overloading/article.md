---
title: "Operator overloading"
summary: "An overloaded operator is an ordinary function with a special name that an operator expression calls. Arity, precedence and associativity never change, but evaluation guarantees can, and a few operators must be members."
track: "expressions-and-functions"
minutes: 12
standard:
  - "[over.oper]"
  - "[over.match.oper]"
  - "[over.call]"
  - "[over.sub]"
  - "[over.ref]"
  - "[over.inc]"
  - "[over.literal]"
  - "[lex.ext]"
  - "[expr.log.and]"
  - "[expr.comma]"
cppreference:
  - title: "Operator overloading"
    path: "language/operators"
  - title: "User-defined literals"
    path: "language/user_literal"
  - title: "Member access operators"
    path: "language/operator_member_access"
  - title: "Increment/decrement operators"
    path: "language/operator_incdec"
  - title: "Logical operators"
    path: "language/operator_logical"
prerequisites:
  - "overload-resolution"
  - "name-lookup-and-adl"
  - "value-categories"
---

## The one idea

An overloaded operator is a function. When at least one operand of an operator expression has class or enumeration type, the compiler gathers candidate functions named `operator@`, adds the built-in candidates, and runs ordinary overload resolution. Whatever wins is called like any other function, with the operands as arguments.

Everything that surprises people follows from that. The grammar does not change, so precedence, associativity and the number of operands are fixed by the token you chose, not by your function. But the *evaluation* rules of the built-in operator do not come along: a function call evaluates all of its arguments before the body runs, which is why an overloaded `&&` cannot short-circuit.

> **Mental model.** `a + b` is spelled like arithmetic and parsed like arithmetic, then dispatched like `operator+(a, b)` or `a.operator+(b)`. The parse belongs to the language; the meaning belongs to your function.

Candidate gathering and ranking are the subject of overload-resolution; comparison operators, including the rewriting that C++20 introduced, are covered in three-way-comparison. This topic is about which operator functions you may declare, where they must live, and how each special form behaves.

## What can be overloaded, and what must be a member

Almost every operator can be overloaded, including `->*`, the comma, `co_await`, `new` and `delete`, and conversion functions. A handful cannot: scope resolution `::`, member access `.`, pointer-to-member access `.*`, the conditional operator `?:`, and the keyword operators `sizeof`, `alignof`, `typeid` and `noexcept`. You cannot invent new operator tokens, and you cannot change how many operands an operator takes.

A non-member operator function needs at least one parameter whose type is a class, an enumeration, or a reference to one. That rule protects the built-in meaning of `1 + 2`.

```cpp
// int operator+(int, int);   // ill-formed: no class or enumeration parameter
enum class Flags { a = 1, b = 2 };
constexpr Flags operator|(Flags x, Flags y) {   // OK: enumeration operands
  return Flags(int(x) | int(y));
}
```

Four operators must be member functions: assignment `=`, function call `()`, subscript `[]`, and class member access `->`. The usual explanation for assignment is that every class already has an implicitly declared copy assignment operator, and a free function competing with it would be inconsistent. The other three are tied to the object they are applied to. C++23 relaxed one detail: `operator()` and `operator[]` may now be *static* member functions, which removes the hidden `this` parameter for stateless function objects.

> **Standardese.** [over.oper] says an operator function shall be a member function or have at least one parameter of class or enumeration type, and that operator functions cannot have default arguments except where the specific subclause allows it. [over.call] and, since C++23, [over.sub] are the two subclauses that allow them.

## Member or non-member: the symmetry argument

A member operator treats its left operand as the implicit object argument, and the implicit object argument never undergoes user-defined conversions. So a member `operator+` accepts conversions on the right but not on the left, and `2 + v` fails where `v + 2` works.

```cpp
struct Money {
  long cents;
  Money(long c) : cents(c) {}                  // implicit conversion from long
  Money operator+(const Money& o) const { return cents + o.cents; }
};

void demo(Money m) {
  Money a = m + 5;     // OK: 5 converts to Money for the parameter
  // Money b = 5 + m;  // ill-formed: 5 is not converted to the object argument
  (void)a;
}
```

The usual fix is a non-member, and the idiomatic non-member is a *hidden friend*: a `friend` function defined inside the class. It has the access a member would have, both operands get the same conversions, and because it is only found by argument-dependent lookup, it does not pollute overload sets for unrelated types.

```cpp
class Money {
  long cents_;
public:
  Money(long c) : cents_(c) {}
  friend Money operator+(Money a, Money b) { return a.cents_ + b.cents_; }
};

Money total(Money m) { return 5 + m; }   // OK: symmetric
```

The rule of thumb: operators that modify their left operand (`+=`, `<<=`, `=`, prefix `++`) are members; symmetric binary operators (`+`, `==`, `<=>`) are hidden friends or non-members; stream insertion `operator<<` cannot be a member of your class because the left operand is the stream.

## Calls, subscripts and arrows

`operator()` is the one operator with arbitrary arity and default arguments, which is what makes function objects and lambdas possible. Since C++23 it can be `static`, and the lambdas topic shows the matching `static` lambda syntax.

Since C++23, `operator[]` also takes any number of parameters, including zero, and may have default arguments. That is multidimensional subscripting, the access syntax `std::mdspan` uses.

```cpp
#include <cstddef>

struct Grid {
  int cells[4][4]{};
  int& operator[](std::size_t r, std::size_t c) { return cells[r][c]; }  // C++23
  static int operator()(int a, int b) { return a * b; }                // C++23
};

int demo() {
  Grid g;
  g[1, 2] = 5;              // calls operator[](1, 2)
  return g[1, 2] + Grid{}(2, 3);
}
```

To make room for that syntax, a comma expression directly inside square brackets was deprecated in C++20, and in C++23 the built-in subscript requires exactly one expression, so `arr[1, 2]` on a plain array is ill-formed. Clang rejects it; GCC still accepts it with a warning and treats it as the old comma expression, which is an extension.

`operator->` is unique because it is applied again to whatever it returns. The expression `x->m` becomes `(x.operator->())->m`, and if that result is itself a class object, its `operator->` is called, and so on until a raw pointer appears. This drill-down is what lets a smart pointer or a locking proxy return another proxy.

```cpp
#include <cstdio>

struct Raw   { int x = 42; };
struct Inner { Raw r;   Raw*   operator->() { std::puts("Inner"); return &r; } };
struct Outer { Inner i; Inner& operator->() { std::puts("Outer"); return i; } };

int read() { Outer o; return o->x; }   // prints Outer, then Inner; returns 42
```

`operator->*` gets no such treatment; it is an ordinary binary operator.

## Increment, decrement, and the dummy int

Prefix and postfix forms share a token, so the language tells them apart with a dummy parameter. `operator++()` is prefix; `operator++(int)` is postfix. When you write `x++`, the postfix function is called with the argument `0`. An explicit call `x.operator++(5)` passes 5, which nobody should rely on.

```cpp
struct Counter {
  int n = 0;
  Counter& operator++() { ++n; return *this; }               // prefix: return self
  Counter  operator++(int) { Counter old = *this; ++*this; return old; }  // postfix: copy
};
```

The conventional signatures follow the built-in operators: prefix returns an lvalue reference, postfix returns the old value by value. That copy is why prefix increment is the habit for iterators. Nothing in the language enforces these return types; they are convention.

## Operators that lose their built-in guarantees

Built-in `&&` and `||` evaluate the left operand first and skip the right one when the result is already known. Built-in comma evaluates left, discards it, then evaluates right. An overloaded version is a function call, so both operands are always evaluated.

```cpp
#include <cstdio>

struct B { bool v; };
B lhs() { std::puts("lhs"); return {false}; }
B rhs() { std::puts("rhs"); return {true}; }
bool operator&&(B a, B b) { return a.v && b.v; }

bool test() { return lhs() && rhs(); }   // prints lhs, then rhs: no short-circuit
```

C++17 recovered one piece. [over.match.oper] says that when an operator expression calls an overloaded operator, the operands are sequenced in the order prescribed for the built-in operator. So the left operand of an overloaded `&&`, `||` or comma is sequenced before the right one. The same rule makes overloaded `<<`, `>>` and subscript evaluate left to right, and overloaded assignment evaluate its right operand first. Before C++17 the order was unspecified. Short-circuiting is still gone, and it cannot be brought back.

> **Pitfall.** Overloading `&&`, `||` or the comma operator for a type that will appear in conditions silently changes code that looks like a guard, such as `p && p->ok()`. Expression-template libraries do it deliberately; ordinary types should not.

Unary `&` can also be overloaded, which is why generic code takes addresses with `std::addressof` rather than `&x`.

`operator new` and `operator delete` are overloadable too, but they are allocation functions, not operators applied to operands: a `new` expression calls them to obtain storage and then constructs the object itself. Their replacement and class-specific forms belong to dynamic-allocation-new-and-delete.

## User-defined literals

A literal operator gives a suffix meaning: `operator""_km` lets you write `12.5_km`. Suffixes that do not begin with an underscore are reserved for the standard library, as in `"abc"s` and `10ms`. C++23 deprecated the old spelling with a space between the quotes and the suffix, `operator"" _km`; in that form the suffix is a separate identifier, so a suffix such as `_Km` collides with the reserved-identifier rules.

The compiler chooses the operator from the kind of literal, and the permitted parameter lists are fixed:

- integer literal: `(unsigned long long)`, else the raw form `(const char*)`, else a numeric literal operator template `template <char...>`;
- floating literal: `(long double)`, else the raw form, else the template;
- string literal: `(const char*, std::size_t)`, or since C++20 a template whose parameter is a class-type non-type template parameter;
- character literal: `(char)` or the corresponding `char8_t`, `char16_t`, `char32_t` or `wchar_t` overload.

There is no conversion between these: if you only declare the `long double` form, `12_km` is ill-formed, because an integer literal never looks for it.

```cpp
constexpr long double operator""_km(long double v) { return v * 1000; }
constexpr long double operator""_km(unsigned long long v) { return v * 1000.0L; }

static_assert(12_km == 12000);    // needs the unsigned long long overload
static_assert(1.5_km == 1500);    // uses the long double overload
```

Literal operators are found by ordinary unqualified lookup, which is why the standard library puts its own in inline namespaces such as `std::literals::chrono_literals` that you bring in with a `using` directive.

## What to remember

- An overloaded operator is a function chosen by overload resolution; precedence, associativity and arity never change.
- `::`, `.`, `.*`, `?:`, `sizeof`, `alignof`, `typeid` and `noexcept` cannot be overloaded; `->*`, comma and `co_await` can.
- A non-member operator needs a class or enumeration parameter; `=`, `()`, `[]` and `->` must be members.
- C++23 allows `static operator()` and `static operator[]`, and multi-parameter `operator[]` with default arguments.
- Member operators do not convert their left operand; hidden friends give symmetric conversions and ADL-only visibility.
- `operator->` is reapplied to its result until a raw pointer appears; `operator->*` is not.
- Postfix `++` is `operator++(int)` and receives `0`.
- Overloaded `&&`, `||` and comma always evaluate both operands; since C++17 the left one is sequenced first.
- A literal operator only matches its own literal kind; `12_km` needs an integer or raw form.
