---
title: "Initialization Forms in C++"
summary: "Decode default, value, zero, direct, copy, aggregate, and list initialization—and prevent the narrowing, most-vexing-parse, and initializer_list traps."
track: "types-and-initialization"
minutes: 9
standard:
  - "[dcl.init.general]"
  - "[dcl.init.aggr]"
  - "[dcl.init.list]"
  - "[over.match.list]"
cppreference:
  - title: "Initialization"
    path: "language/initialization"
  - title: "Default-initialization"
    path: "language/default_initialization"
  - title: "Value-initialization"
    path: "language/value_initialization"
  - title: "Zero-initialization"
    path: "language/zero_initialization"
  - title: "Direct-initialization"
    path: "language/direct_initialization"
  - title: "Copy-initialization"
    path: "language/copy_initialization"
  - title: "List-initialization"
    path: "language/list_initialization"
  - title: "Aggregate initialization"
    path: "language/aggregate_initialization"
prerequisites:
  - "translation-units-and-linkage"
---

Few languages offer as many ways to initialize a variable as C++: `int x;`, `int x{};`, `int x = 0;`, `int x(0);`, and `int x = {0};` look almost interchangeable on scalars, yet invoke completely distinct rules on classes, arrays, and containers. Knowing which syntax activates which initialization algorithm removes guesswork and eliminates silent bugs.

## The syntactic map of initialization

Under `[dcl.init.general]`, C++ selects an initialization algorithm purely from declaration syntax before checking constructors or conversions. Each form decides whether scalar bytes start zeroed, whether `explicit` constructors are eligible, and whether narrowing conversions are allowed.

| Form | Syntax example | Zeroes unmentioned scalars? | Allows `explicit` ctors? | Rejects narrowing? |
| --- | --- | --- | --- | --- |
| Default-initialization | `T x;` | No (indeterminate on stack) | Calls default ctor | Not applicable |
| Value-initialization | `T x{};` or `T()` | Yes, unless user-provided ctor | Calls default ctor | Not applicable |
| Zero-initialization | Static/thread-local baseline | Yes, recursively | No ctor invoked | Not applicable |
| Direct-initialization | `T x(a, b);` | Via chosen ctor | Yes | No |
| Copy-initialization | `T x = expr;` | Via chosen ctor | No | No |
| Direct-list-initialization | `T x{a, b};` | Empty members zeroed | Yes | Yes |
| Copy-list-initialization | `T x = {a, b};` | Empty members zeroed | No | Yes |
| Aggregate initialization | `Aggr p{.x = 1};` | Unmentioned fields `{}`-initialized | No user ctors allowed | Yes (for braced form) |

> **Mental model.** Syntax picks the ruleset first: parentheses choose direct-initialization, `=` chooses copy-initialization, braces choose list-initialization, and omitting an initializer chooses default-initialization.

## Default, value, and zero initialization

Writing `int n;` inside a function performs **default-initialization** (`[dcl.init.general]`): for non-class scalars with automatic storage duration, no initialization occurs at all, leaving `n` with an indeterminate value whose read causes Undefined Behavior (reclassified as erroneous behavior in C++26). For class types, default-initialization invokes the default constructor.

Writing `T x{};` or `T()` performs **value-initialization**. If `T` is a scalar, it is zero-initialized. If `T` is a class *without* a user-provided or deleted default constructor (including aggregates and classes with `T() = default;` declared inside the class body only when defaulted—wait carefully on that boundary: specifically, if the default constructor is neither user-provided nor deleted, the object is **zero-initialized first** and then default-initialized!). If `T` defines a user-provided default constructor `T() {}`, zero-initialization is skipped and any unmentioned scalar member remains indeterminate.

Meanwhile, **zero-initialization** applies automatically before any dynamic initialization to all variables with static or thread-local storage duration, guaranteeing deterministic starting bytes at program or thread startup.

```cpp
struct Plain {
    int count; // No user-provided constructor
};

struct Custom {
    int count;
    Custom() {} // User-provided constructor: skips pre-zeroing!
};

int check_zeroing() {
    Plain p{};  // Value-initialized: zero-initialized first -> p.count == 0
    Custom c{}; // Value-initialized: calls Custom::Custom(), c.count is indeterminate!
    (void)c;
    return p.count;
}
```

## Direct versus copy initialization

**Direct-initialization** (`T x(args);` or `static_cast<T>(expr)`) considers *all* constructors of `T`, including those marked `explicit`. **Copy-initialization** (`T x = expr;`, passing by value `f(arg)`, or `return expr;`) considers only non-`explicit` converting constructors and non-`explicit` conversion operators (`[dcl.init.general]`).

Since C++17 guaranteed copy elision, `T x = T(arg);` no longer requires an accessible copy or move constructor—the prvalue `T(arg)` initializes `x` directly in place—yet `T x = arg;` still rejects an `explicit` constructor taking `arg`.

One syntax hazard haunts direct-initialization with empty arguments: the **most vexing parse**. Because anything that *can* be parsed as a function declaration *must* be parsed as one, `Widget w();` declares a zero-argument function returning `Widget`, not a default-initialized object! Braces (`Widget w{};`) never parse as a function declaration and cleanly request value-initialization.

```cpp
struct Port {
    explicit Port(int p) : value(p) {}
    int value;
};

void check_explicit() {
    Port a(8080);   // Direct-init: explicit ctor allowed
    Port b{443};    // Direct-list-init: explicit ctor allowed
    // Port c = 80; // Error: copy-init cannot use explicit Port(int)
    // Port d = {80}; // Error: copy-list-init cannot use explicit Port(int)
    (void)a;
    (void)b;
}
```

## List initialization, narrowing, and greedy initializer_list

Braced initialization (`{...}`)—**list-initialization** (`[dcl.init.list]`)—solves the most vexing parse and enforces a vital safety rule: **narrowing conversions are ill-formed**. Converting `double` to `int`, or `int` to `char` when the source is not a constant expression whose value fits in `char`, fails to compile.

Yet list-initialization carries two infamous traps:

1. **Copy-list-initialization still checks `explicit`.** `Port p = {80};` fails to compile whenever `Port(int)` is `explicit`.
2. **Greedy `std::initializer_list` constructors.** Under `[over.match.list]`, braced overload resolution runs in two phases: first, the compiler searches *only* constructors taking `std::initializer_list`. Normal constructors are examined only if **no** viable `initializer_list` constructor exists (or if the braces are empty `{}`, which prefers the default constructor).

> **Standardese.** Under `[over.match.list]`, `T{...}` with a non-empty braced-init-list resolves in two stages: stage one considers exclusively `std::initializer_list` constructors; only when none is viable does stage two consider all constructors of `T`.

```cpp
#include <vector>

void check_vector_braces() {
    std::vector<int> five_ones(5, 1);  // Size 5: {1, 1, 1, 1, 1} (normal ctor)
    std::vector<int> two_elems{5, 1};  // Size 2: {5, 1} (greedy initializer_list!)
    std::vector<int> empty_vec{};      // Size 0: empty {} picks default ctor

    constexpr int small = 65;
    char ok_char{small};               // Valid: constant expression 65 fits in char
    // int bad{3.14};                  // Error: narrowing conversion from double to int
    (void)five_ones;
    (void)two_elems;
    (void)empty_vec;
    (void)ok_char;
}
```

> **Pitfall.** Writing `std::vector<int> v{10, 2};` constructs a 2-element vector `[10, 2]`, not ten copies of `2`. Always use parentheses `v(10, 2)` when passing element-count or capacity arguments to types that also offer an `initializer_list` constructor.

## Aggregates and C++20 changes

An **aggregate** (`[dcl.init.aggr]`) is an array or a simple class with no private or protected direct non-static data members, no virtual functions, no virtual/private/protected base classes, and—crucially in C++20—**no user-declared or inherited constructors**. Prior to C++20, writing `S() = default;` kept `S` an aggregate because the constructor was not user-provided; C++20 closed that loophole, making `S{42}` ill-formed whenever *any* constructor is explicitly declared (`= default` or `= delete` included).

C++20 also added two expressive capabilities for aggregates:

- **Designated initializers:** `Config cfg{.port = 8080, .tls = true};` initializes named members in exact declaration order. Out-of-order designators, mixing positional and designated elements, nested `.a.b`, and array `[0]` designators are ill-formed in standard C++. Unmentioned members are initialized from their default member initializers or `{}`.
- **Parenthesized aggregate initialization:** `Point p(1, 2);` works for aggregates in C++20 (without narrowing rejection), finally enabling `std::make_unique<Point>(1, 2)` and `emplace_back(1, 2)` without manually writing a constructor.

> **Pitfall.** Adding `MyPod() = delete;` or `MyPod() = default;` inside a struct in C++20 removes its aggregate status (`std::is_aggregate_v<MyPod>` becomes `false`), breaking `MyPod{1, 2}` aggregate initialization for every caller.

```cpp
#include <memory>
#include <type_traits>

struct Opts {
    int port = 80;
    bool tls = false;
};

struct NotAggregate {
    NotAggregate() = default; // User-declared ctor removes aggregate status in C++20+
    int x;
};

static_assert(std::is_aggregate_v<Opts>);
static_assert(!std::is_aggregate_v<NotAggregate>);

void check_cpp20_aggregates() {
    Opts o{.tls = true};                 // Valid: .port gets default 80, .tls becomes true
    auto p = std::make_unique<Opts>(443, true); // C++20 parenthesized aggregate init
    (void)o;
    (void)p;
}
```

## What to remember

- Declaration syntax dictates the initialization algorithm before constructor lookup runs (`T x;` default, `T x{};` value, `T x(a);` direct, `T x = a;` copy, `T x{a};` direct-list).
- Copy-initialization (`= expr` and `= {expr}`) rejects `explicit` constructors; direct forms (`(...)` and `{...}`) allow them.
- Braced list-initialization forbids narrowing conversions and avoids the most vexing parse, yet prefers `std::initializer_list` constructors whenever non-empty braces match.
- Value-initialization zeroes non-user-provided classes before calling defaulted constructors, whereas a user-provided `T() {}` skips zeroing unmentioned scalar fields.
- In C++20+, any user-declared constructor (`= default` or `= delete` included) disqualifies a class from being an aggregate, while true aggregates support ordered `.member = val` designated initializers and `(args...)` initialization.
