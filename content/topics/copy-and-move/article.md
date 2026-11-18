---
title: "Copy and move semantics"
summary: "How std::move grants permission without moving bytes, when user-declared special members suppress moves, why noexcept unlocks O(1) vector growth, and C++23 simpler implicit move."
track: "value-semantics"
minutes: 10
standard:
  - "[class.copy.ctor]"
  - "[class.copy.assign]"
  - "[class.dtor]"
  - "[utility.move]"
  - "[utility.exchange]"
  - "[utility.move.if.noexcept]"
  - "[class.copy.elision]"
cppreference:
  - title: "Copy constructors"
    path: "language/copy_constructor"
  - title: "Copy assignment operator"
    path: "language/copy_assignment"
  - title: "Move constructors"
    path: "language/move_constructor"
  - title: "Move assignment operator"
    path: "language/move_assignment"
  - title: "The rule of three/five/zero"
    path: "language/rule_of_three"
  - title: "std::move"
    path: "utility/move"
  - title: "std::move_if_noexcept"
    path: "utility/move_if_noexcept"
  - title: "std::exchange"
    path: "utility/exchange"
prerequisites:
  - "value-categories"
---

Copying duplicates an object's logical state so two independent owners emerge. Moving transfers ownership from an expiring source—typically copying a few stack pointers or descriptors and resetting the source to a benign empty state—without duplicating heap buffers. Misunderstanding where the compiler generates move operations, when `const` defeats them, or why `noexcept` governs `std::vector` performance turns intended moves into silent deep copies.

## What copying and moving actually do

Calling `std::move(x)` emits zero CPU instructions at runtime. Under `[utility.move]`, `std::move` is simply an unconditional cast to an rvalue reference (`static_cast<std::remove_reference_t<T>&&>(x)`), turning an lvalue expression into an **xvalue**. Only when that xvalue reaches a constructor or assignment operator—or a function overloaded on `T&&`—does any resource transfer actually occur.

> **Mental model.** `std::move` is a permission slip telling overload resolution that the source's resources may be pilfered; it never moves bytes by itself.

That permission slip is easily revoked by `const`. If `s` is declared `const std::string s = "payload";`, then `std::move(s)` produces `const std::string&&`. A move constructor takes non-const `std::string&&` because it must mutate the source, so `const std::string&&` cannot bind to it and silently binds to `const std::string&`, executing a full **copy constructor** instead.

> **Pitfall.** Calling `std::move` on a `const` object compiles cleanly and quietly invokes the copy constructor instead of moving, because `const T&&` cannot bind to a mutable `T&&` move parameter.

## Special member generation rules

C++ tracks six special member functions: default constructor, destructor, copy constructor, copy assignment operator, move constructor, and move assignment operator. Declaring one affects whether the compiler implicitly generates the others (`[class.copy.ctor]`, `[class.copy.assign]`).

| User declaration | Default ctor | Destructor | Copy operations | Move operations |
| --- | --- | --- | --- | --- |
| None | Defaulted | Defaulted | Defaulted | Defaulted |
| Any non-special ctor | Not declared | Defaulted | Defaulted | Defaulted |
| Destructor (`~T`) | Defaulted | User | Defaulted (deprecated if implicit) | Not declared (suppressed) |
| Copy ctor or copy assign | Same unless copy ctor | Defaulted | User / defaulted | Not declared (suppressed) |
| Move ctor or move assign | Same unless move ctor | Defaulted | Deleted | User / defaulted |

Two interactions catch experienced engineers off guard:

1. **Declaring a destructor suppresses implicit moves.** Even writing `~Buffer() = default;` in a class header disables implicit generation of both the move constructor and the move assignment operator. Any move request falls back to calling the copy constructor, silently turning O(1) transfers into O(N) deep copies—or failing to compile if a member such as `std::unique_ptr` is non-copyable.
2. **Declaring a move operation deletes copying.** Adding a custom move constructor (`T(T&&)`) marks both the copy constructor and copy assignment operator as implicitly `= delete` unless you explicitly declare or `= default` them.

Follow the **Rule of Zero** whenever possible: store resources in standard RAII wrappers (`std::unique_ptr`, `std::vector`, `std::string`) and declare none of the five ownership members. When building a low-level RAII handle directly, follow the **Rule of Five** and declare all five explicitly.

## Implementing move operations cleanly and exception-safely

A hand-written move operation must transfer ownership, leave the source safely destructible and assignable, and handle **self-move assignment** (`a = std::move(a)`, which generic sorting or partition algorithms can trigger). Standard library helper `std::exchange(obj, new_val)` from `<utility>` replaces a member with a null or sentinel value and returns its old value in one step:

```cpp
#include <cstddef>
#include <utility>

class Buffer {
    int* data_ = nullptr;
    std::size_t size_ = 0;

public:
    Buffer() = default;
    explicit Buffer(std::size_t n) : data_(n ? new int[n]{} : nullptr), size_(n) {}
    ~Buffer() { delete[] data_; }

    Buffer(const Buffer&) = delete;
    Buffer& operator=(const Buffer&) = delete;

    Buffer(Buffer&& other) noexcept
        : data_(std::exchange(other.data_, nullptr)),
          size_(std::exchange(other.size_, 0)) {}

    Buffer& operator=(Buffer&& other) noexcept {
        if (this == &other) {
            return *this;
        }
        delete[] data_;
        data_ = std::exchange(other.data_, nullptr);
        size_ = std::exchange(other.size_, 0);
        return *this;
    }
};
```

Wait before reading anything out of a moved-from standard library object. Under `[lib.types.movedfrom]`, a moved-from standard type is guaranteed to be in a **valid but unspecified state**: you can destroy it, assign a fresh value to it, or invoke precondition-free observers such as `clear()`, while assuming `vec.empty()` without checking is a logic bug unless a specific type documents it (like `std::unique_ptr`, which guarantees `get() == nullptr`).

## The noexcept cliff and std::move_if_noexcept

Containers such as `std::vector` enforce the **strong exception guarantee** during reallocation (`push_back` or `reserve`): if migrating elements from the old buffer to the new buffer throws an exception midway, the original vector must remain completely intact.

If moving element `k` threw after elements `0` through `k - 1` had already been moved from, rolling back could itself throw. To prevent data loss, `std::vector` moves elements via `std::move_if_noexcept` (`[utility.move.if.noexcept]`), which yields `T&&` **only** when `std::is_nothrow_move_constructible_v<T>` is true—or when `T` is not copy-constructible at all. Otherwise, it returns `const T&` and forces `std::vector` to copy every element!

```cpp
#include <type_traits>
#include <utility>

struct ThrowingMove {
    ThrowingMove(const ThrowingMove&) {}
    ThrowingMove(ThrowingMove&&) {} // Missing noexcept!
};

struct SafeMove {
    SafeMove(const SafeMove&) {}
    SafeMove(SafeMove&&) noexcept {}
};

static_assert(std::is_same_v<decltype(std::move_if_noexcept(std::declval<ThrowingMove&>())),
                             const ThrowingMove&>);
static_assert(std::is_same_v<decltype(std::move_if_noexcept(std::declval<SafeMove&>())),
                             SafeMove&&>);
```

Compiler-defaulted move constructors (`= default`) automatically compute `noexcept` from their members and bases. Hand-written move constructors and move assignment operators must spell `noexcept` explicitly.

## Implicit move on return from C++11 through C++23

When returning a named automatic variable or function parameter by value (`return local;`), compilers try copy elision first if permitted. When elision does not occur—for example, returning a function parameter or converting a local variable to another type—`[class.copy.elision]` performs **implicit move**: overload resolution runs a first pass treating the returned local or parameter as an rvalue, falling back to an lvalue only if no viable rvalue match exists.

C++23 (P2266R3) simplified these rules cleanly around **move-eligible** expressions in `return`, `co_return`, and `throw`. Previously, implicit move only applied to constructors returning the exact type or compatible types under awkward special-case wording, failing on user-defined rvalue conversion operators or returning rvalue references:

```cpp
struct Output {};
struct Builder {
    operator Output() && { return Output{}; }
    operator Output() const& = delete;
};

Output finalize(Builder b) {
    return b; // Compiles in C++23 (P2266R3); failed in C++20
}
```

> **Standardese.** Under `[class.copy.elision]`, an id-expression naming an automatic variable or parameter in a `return` or `throw` statement is move-eligible, so overload resolution treats it as an rvalue first without needing `std::move`.

## What to remember

- `std::move` casts an lvalue to an xvalue (`T&&`) at compile time; calling it on a `const` object produces `const T&&` and silently copies.
- Any user-declared destructor or copy operation suppresses implicit move generation; any user-declared move operation deletes implicit copy operations.
- Always mark non-throwing move constructors and move assignment operators `noexcept` so `std::move_if_noexcept` lets containers move instead of copy during reallocation.
- Leave moved-from objects valid, destructible, and self-move safe using `std::exchange`, and omit `std::move` on `return local;` so NRVO and C++23 implicit move both work cleanly.
