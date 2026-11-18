---
title: "Aggregates and designated initializers"
summary: "An aggregate is a type the compiler initializes member by member with no constructor in charge. Its definition was rewritten in every standard from C++11 to C++20, and C++20 added designated initializers, parenthesized aggregate initialization and deduction for aggregate templates."
track: "types-and-initialization"
minutes: 12
standard:
  - "[dcl.init.aggr]"
  - "[dcl.init.general]"
  - "[dcl.init.list]"
  - "[class.temporary]"
  - "[over.match.class.deduct]"
cppreference:
  - title: "Aggregate initialization"
    path: "language/aggregate_initialization"
  - title: "List-initialization"
    path: "language/list_initialization"
  - title: "std::is_aggregate"
    path: "types/is_aggregate"
  - title: "Class template argument deduction"
    path: "language/class_template_argument_deduction"
prerequisites:
  - "initialization-forms"
  - "reference-binding-and-temporaries"
---

## The one idea

An aggregate is a type with no constructor in charge of it. Initializing one does not call a function that decides what the members become. Instead the compiler walks the elements in declaration order, bases first and then non-static data members, and copy-initializes each one from the next initializer you supplied. Elements you leave out get their default member initializer if they have one, and are otherwise initialized from an empty brace list, which for scalars means zero.

That is why aggregates are attractive and why the rules are strict. Any feature that would let the class itself take part in initialization, such as a constructor, a virtual function or a private data member, disqualifies the type.

> **Mental model.** An aggregate is a list of named slots. Aggregate initialization fills the slots in order from your list and value-initializes the rest. No function of the class runs to decide anything, so there is nothing for access control or a constructor to enforce.

## What counts as an aggregate, standard by standard

Arrays are always aggregates. For classes the definition has moved in every revision, and code that compiled under one rule changes meaning under the next.

| Standard | What a class aggregate may not have |
| --- | --- |
| C++11 | user-provided constructors, default member initializers, private or protected non-static data members, base classes, virtual functions |
| C++14 | the same, except default member initializers are now allowed |
| C++17 | user-provided, explicit or inherited constructors; private or protected non-static data members; virtual functions; virtual, private or protected bases |
| C++20 | user-declared or inherited constructors; private or protected non-static data members; virtual functions; virtual, private or protected bases |

Several things never stopped a type from being an aggregate: member functions, static data members of any access, a user-declared destructor, and user-declared assignment operators. A lambda's closure type is explicitly not an aggregate. When in doubt, ask the compiler: the C++17 trait `std::is_aggregate_v<T>` reports the answer under whatever language mode you compile with, and a `static_assert` on it protects a type whose users depend on brace initialization.

The C++20 change, from P1008, closed a loophole. Before it, a class with a deleted or private defaulted constructor was still an aggregate, so braces bypassed the constructor entirely.

```cpp
struct NoDefault {
  NoDefault() = delete;
  int x;
};

// NoDefault n{};
// C++17: compiles, aggregate initialization ignores the deleted constructor
// C++20: ill-formed, the type has a user-declared constructor, so {} calls it
```

> **Pitfall.** Adding `S() = default;` to a struct in C++20 silently makes it a non-aggregate. `S{1, 2}` then stops compiling, because there is no constructor taking two arguments. Prefer default member initializers to a defaulted constructor when you want both defaults and aggregate syntax.

## Aggregate initialization and brace elision

Each element is copy-initialized from its initializer, so an explicit constructor of a member type cannot be used to convert it, and since the initializer is a braced list, narrowing is ill-formed. A reference member with no initializer and no default member initializer makes the program ill-formed. For a union, aggregate initialization initializes only the first member, unless a designator names another. Inside any braced list the initializer clauses are evaluated strictly left to right, each one sequenced before the next, which is a stronger guarantee than function arguments get.

```cpp
struct Opts {
  int a;
  int b = 5;
  int c;
};

Opts o{1};   // a is 1, b is 5 from its default member initializer, c is 0
```

When an element is itself an aggregate, its braces can be omitted. Brace elision lets the initializers flow into the subaggregate's elements in order, which is how `int m[2][2] = {1, 2, 3, 4};` and `std::array<int, 3> a = {1, 2, 3};` work: `std::array` is a struct wrapping a built-in array, and the inner braces are elided. Elision is only assumed when an initializer cannot initialize the element directly, and it breaks down when you write some braces but not all of them.

```cpp
#include <array>

struct P { int x, y; };

std::array<P, 2> ok1{{{1, 2}, {3, 4}}};   // all braces written
std::array<P, 2> ok2{P{1, 2}, P{3, 4}};   // each element is a P expression
// std::array<P, 2> bad{{1, 2}, {3, 4}};
// ill-formed: {1, 2} initializes the inner P[2] array, then {3, 4} is
// an extra initializer for a struct with one member
```

## Bases are elements too (C++17)

Since C++17 an aggregate may have public, non-virtual base classes. Each base is an element that comes before the data members, and it is initialized like any other element, with its own braces or through brace elision.

```cpp
struct Base { int b; };
struct Derived : Base { int d; };

Derived x{{1}, 2};   // x.b is 1, x.d is 2
Derived y{1, 2};     // the same, by brace elision
```

Because the base subobject is now initialized directly by aggregate initialization, rather than by `Derived`'s implicit constructor, access checks happen in the context of the code doing the initialization. A base with a protected default constructor used to work and now does not.

```cpp
struct Guarded { protected: Guarded() = default; };
struct Open : Guarded {};

Open a;      // fine: Open's implicit default constructor may call it
// Open b{};
// fine in C++14, where Open was not an aggregate;
// ill-formed since C++17: Guarded() is initialized from {} outside the class
```

## Designated initializers (C++20)

C++20 lets you name the members you initialize: `P p{.x = 1, .y = 2};`. The feature looks like C's, but it is deliberately narrower.

- Designators must appear in declaration order. C allows any order; GCC rejects out-of-order designators and Clang accepts them with a warning.
- Either every initializer clause is designated or none is. You cannot write `{.x = 1, 2}`.
- Only direct non-static data members can be named. There are no nested designators such as `.inner.y`, no array designators such as `[2] = 5`, and no way to name a base class.
- Each member may be designated at most once.

Members you skip are initialized as in ordinary aggregate initialization, from their default member initializer or from `{}`. For a union, a designator selects which member becomes active, and only one may be given.

```cpp
struct Inner { int y; };
struct Outer { int x; Inner in; int z = 7; };
union Num { int i; float f; };

Outer a{.x = 1, .in{2}};    // z is 7
Outer b{.in = {3}};         // x is 0, z is 7
Num n{.f = 1.5f};           // f is the active member
// Outer c{.z = 1, .x = 2}; // ill-formed: out of declaration order
// Outer d{.x = 1, 2};      // ill-formed: mixes designated and positional
```

Designators combined with default member initializers give C++ something close to named arguments. A function taking an options struct by value can be called with only the fields that differ from the defaults, and the names document the call site. Designated lists also take part in overload resolution: [over.ics.list] allows a designated list to convert to a parameter only if that parameter's aggregate type can be initialized from it, so the designator names select the overload.

```cpp
#include <string>

struct Conn { std::string host; int port = 80; int timeout = 30; };
int connect(Conn c) { return c.port + c.timeout; }

struct ByName { int name; };
struct ById   { int id; };
int find(ByName) { return 1; }
int find(ById)   { return 2; }

int a = connect({.host = "db", .timeout = 5});   // port stays 80
int b = find({.id = 7});                         // calls find(ById)
```

> **Standardese.** [dcl.init.aggr] defines the explicitly initialized elements of a designated list as exactly the named members, requires the designators to name members in declaration order, and initializes every other element as if no designator were present. Compilers accept several C forms as extensions; pass `-pedantic` to have them flagged.

## Parenthesized aggregate initialization (C++20)

P0960 made `T(args...)` work for aggregates. When no constructor matches, which for an aggregate means always unless it is a single argument of the same type, the elements are initialized from the parenthesized list. That is what lets `std::make_unique<P>(1, 2)` and `v.emplace_back(1, 2)` construct aggregates, since library code spells construction with parentheses. Arrays work too: `int a[](1, 2, 3);` declares three ints.

The two spellings are not interchangeable. Parentheses do not forbid narrowing, do not perform brace elision, and do not accept designators. Most importantly, a temporary bound to a reference member is not lifetime-extended.

```cpp
struct Ref { const int& r; };

constexpr int braces() { Ref a{42}; return a.r; }
static_assert(braces() == 42);   // the temporary lives as long as a

// constexpr int parens() { Ref b(42); return b.r; }
// static_assert(parens() == 42);
// rejected: the temporary died at the end of the declaration of b,
// so reading b.r is undefined behavior
```

> **Pitfall.** [class.temporary] lists a temporary bound to a reference element of an aggregate initialized from a parenthesized list as an exception to lifetime extension. `Ref b(42);` compiles and leaves `b.r` dangling, while `Ref a{42};` is safe.

## Deduction for aggregate templates (C++20)

Class template argument deduction normally works from constructors and deduction guides, which an aggregate template does not have. In C++17 you had to write a guide by hand, as `std::array` does. C++20 adds an aggregate deduction candidate, synthesized from the element types, so `Pair p{1, 2.0};` deduces `Pair<int, double>`. GCC 16 and Clang 21 also use it for the parenthesized form `Pair p(1, 2.0);`.

```cpp
#include <type_traits>

template <class T, class U>
struct Pair { T first; U second; };

Pair p{1, 2.0};   // C++20: Pair<int, double>, no guide needed
static_assert(std::is_same_v<decltype(p), Pair<int, double>>);
```

The class-template-argument-deduction topic covers how the candidate set is built and how brace elision interacts with it.

## What to remember

- An aggregate is an array or a class whose initialization no constructor controls; its elements are bases, then data members.
- C++14 allowed default member initializers, C++17 allowed public bases, and C++20 banned every user-declared constructor.
- Omitted elements use their default member initializer, otherwise they are initialized from `{}`.
- Brace elision lets inner braces disappear, but `std::array<P, 2>{{1, 2}, {3, 4}}` fails; write all braces or none.
- Since C++17 a base's protected default constructor makes `Derived{}` ill-formed.
- Designators must follow declaration order, cannot be mixed with positional clauses, and cannot nest or index.
- Parenthesized aggregate init allows narrowing and does not extend the lifetime of temporaries bound to reference members.
- C++20 deduces template arguments for aggregate templates without deduction guides.
