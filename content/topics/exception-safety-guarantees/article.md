---
title: "Exception-safety guarantees"
summary: "How stack unwinding interacts with class invariants: the Abrahams guarantees, noexcept move optimization, copy-and-swap, and unwinding traps."
track: errors
minutes: 10
standard:
  - "[except]"
  - "[except.throw]"
  - "[except.spec]"
  - "[except.handle]"
  - "[except.terminate]"
  - "[class.dtor]"
cppreference:
  - title: "Exceptions"
    path: "language/exceptions"
  - title: "noexcept specifier"
    path: "language/noexcept_spec"
  - title: "Throwing exceptions"
    path: "language/throw"
  - title: "std::move_if_noexcept"
    path: "utility/move_if_noexcept"
  - title: "std::uncaught_exceptions"
    path: "error/uncaught_exception"
  - title: "std::terminate"
    path: "error/terminate"
prerequisites:
  - "raii-and-resource-management"
  - "copy-and-move"
---

Exceptions separate error detection from error handling across arbitrarily deep call stacks. That flexibility comes with a contract: whenever any expression inside a function throws, every object along the unwound path must remain in a valid state so destructors and enclosing error handlers can reason about what survived.

Exception safety is not a single yes-or-no boolean. David Abrahams formalized four distinct levels of guarantees a function can provide when an operation fails, ranging from zero failure modes down to broken invariants.

## The Abrahams exception-safety hierarchy

Every function in a well-designed C++ codebase sits at a deliberate rung on the exception-safety ladder.

| Guarantee | Observable state after throw | Resource leaks | Typical examples |
| --- | --- | --- | --- |
| Nothrow / Nofail | Operation always succeeds | Never | `swap`, `~T()`, `move` constructors |
| Strong | Identical to state before call | Never | `std::vector::push_back`, copy-and-swap |
| Basic | Valid invariants, unspecified values | Never | Multi-element `std::vector::insert`, `std::sort` |
| None | Broken invariants or leaked handles | Possible | Raw manual `new`/`delete` without RAII |

The **nothrow** (or **nofail**) guarantee promises that an operation never emits an exception—either because nothing inside it can fail, or because failures are absorbed internally. Without a nothrow foundation for `swap`, destructors, and pointer transfers, higher guarantees collapse.

The **strong guarantee** delivers transactional commit-or-rollback semantics: if an exception escapes, the program state rolls back completely as if the call never happened. Standard containers such as `std::vector::push_back` provide this guarantee whenever element relocation does not prevent it.

The **basic guarantee** is the mandatory baseline for almost all production C++ code. An exception may leave mutated objects holding partial updates—a vector might contain half of a batch, or a string might keep its new capacity—yet zero resources leak, class invariants hold, and every surviving object can still be inspected, assigned, or destroyed safely.

> **Mental model.** Strong exception safety is simply a two-phase transaction: perform every allocation or copy that might throw on isolated side state, then commit the result to `this` using exclusively `noexcept` operations.

## Stack unwinding and the exception object

When a `throw expr;` expression executes, the runtime first initializes an **exception object** in unspecified memory (never on the stack frame about to be torn down) by copy- or move-initializing from `expr`, potentially applying copy elision. Control then walks outward through enclosing scopes until a matching `catch` handler is found.

During this **stack unwinding**, automatic objects whose initialization has already completed are destroyed in exact reverse order of construction completion. Partially constructed aggregates and classes receive selective cleanup: if a constructor body or member initializer throws midway through constructing member `b` after member `a` succeeded, the destructor of `a` runs automatically, while the class's own destructor `~Class()` does **not** run because the object never finished beginning its lifetime.

> **Standardese.** Under `[except.throw]` and `[except.terminate]`, if no matching handler exists anywhere on the call stack, or if unwinding encounters a function marked `noexcept(true)`, the implementation calls `std::terminate()`—and it is implementation-defined whether stack unwinding even runs destructors before termination.

## Strong guarantee via copy-and-swap and commit phases

Writing `operator=` manually with raw resources easily violates even the basic guarantee:

```cpp
// Broken: if `new` throws, `data_` is left dangling!
RawBuffer& operator=(const RawBuffer& rhs) {
    delete[] data_;
    data_ = new std::byte[rhs.size_]; // throws std::bad_alloc -> UB on ~RawBuffer
    size_ = rhs.size_;
    return *this;
}
```

The idiomatic cure is **copy-and-swap**, which moves every fallible step (memory allocation and element copying) into the by-value parameter construction before executing a non-throwing swap:

```cpp
#include <algorithm>
#include <cstddef>
#include <memory>
#include <utility>

class PacketBuffer {
    std::unique_ptr<std::byte[]> data_;
    std::size_t size_ = 0;

public:
    PacketBuffer() = default;
    explicit PacketBuffer(std::size_t n)
        : data_(std::make_unique<std::byte[]>(n)), size_(n) {}

    PacketBuffer(const PacketBuffer& other)
        : data_(other.size_ ? std::make_unique<std::byte[]>(other.size_) : nullptr),
          size_(other.size_) {
        if (size_) std::copy_n(other.data_.get(), size_, data_.get());
    }

    PacketBuffer(PacketBuffer&&) noexcept = default;

    void swap(PacketBuffer& other) noexcept {
        using std::swap;
        swap(data_, other.data_);
        swap(size_, other.size_);
    }

    // Parameter construction may throw before entry; body is nothrow.
    PacketBuffer& operator=(PacketBuffer rhs) noexcept {
        swap(rhs);
        return *this;
    }
};
```

Here `rhs` acts as a temporary staging buffer. If copying throws `std::bad_alloc`, `*this` stays untouched—delivering both the strong guarantee and safe self-assignment (`buf = buf`) without extra branches.

When full copy-and-swap would duplicate megabytes across multiple containers, split work into **prepare** and **commit** phases: build new nodes or buffers in local state first, then commit via `noexcept` swaps or pointer transfers.

## Why noexcept controls vector reallocation

Marking a move constructor `noexcept` directly governs standard container performance. During `std::vector::push_back` reallocation, preserving the strong guarantee requires keeping old elements intact until all elements land in the new buffer. If `T`'s move constructor might throw, moving element #3 irreversibly alters the source buffer before element #5 throws.

Therefore `std::vector` relocates elements via `std::move_if_noexcept`, inspecting `std::is_nothrow_move_constructible_v<T>`:

```cpp
#include <string>
#include <type_traits>
#include <utility>

struct FragileMove {
    std::string label;
    FragileMove(FragileMove&& other) : label(std::move(other.label)) {} // NOT noexcept
    FragileMove(const FragileMove&) = default;
};

struct FastMove {
    std::string label;
    FastMove(FastMove&&) noexcept = default;
    FastMove(const FastMove&) = default;
};

static_assert(!std::is_nothrow_move_constructible_v<FragileMove>);
static_assert(std::is_nothrow_move_constructible_v<FastMove>);
```

> **Pitfall.** Defining a custom move constructor without `noexcept` silently forces `std::vector` to copy every element instead of moving on reallocation whenever a copy constructor exists—turning expected pointer swaps into expensive deep allocations.

For generic wrappers, write **conditional `noexcept`** expressions rather than guessing: `Wrapper(Wrapper&& other) noexcept(std::is_nothrow_move_constructible_v<T>)`. Meanwhile, move-only types (`std::unique_ptr`, or custom non-copyable handles) still get moved during `std::vector` growth because copying is unavailable, though leaving their move constructors non-`noexcept` downgrades `push_back` from the strong guarantee to the basic guarantee.

## Destructors, function-try-blocks, and uncaught_exceptions

Since C++11, every destructor is **implicitly `noexcept(true)`** unless a non-static member or base subobject has a potentially throwing destructor or the destructor explicitly declares `noexcept(false)` (`[class.dtor]`). Throwing an exception out of an implicitly `noexcept` destructor—whether during normal scope exit or during stack unwinding—immediately triggers `std::terminate()`.

Even if a destructor explicitly specifies `noexcept(false)`, letting an exception escape while another exception is already unwinding (`std::uncaught_exceptions() > 0`) still invokes `std::terminate()`. Destructors must therefore swallow, log, or assert on internal failures rather than emitting exceptions.

Two specialized language features interact closely with unwinding:

1. **Constructor function-try-blocks** wrap member initializers so you can log or translate exceptions thrown by bases or members. However, per `[except.handle]`, a `catch` block on a constructor or destructor cannot suppress the exception silently: reaching the closing brace without throwing a different exception or calling `return` (invalid in constructors) **implicitly rethrows** the active exception.

2. **`std::uncaught_exceptions()`** (plural, C++17) returns the count of active exceptions currently in flight on the calling thread—replacing the deprecated C++98 `bool std::uncaught_exception()`, which could not tell whether an exception was thrown *inside* a scope guard's lifetime when the guard itself was created during an outer stack unwind:

```cpp
#include <exception>
#include <utility>

template <class Fn>
class RollbackGuard {
    Fn rollback_;
    int entry_count_ = std::uncaught_exceptions();

public:
    explicit RollbackGuard(Fn fn) : rollback_(std::move(fn)) {}
    RollbackGuard(const RollbackGuard&) = delete;

    ~RollbackGuard() {
        if (std::uncaught_exceptions() > entry_count_) {
            rollback_();
        }
    }
};
```

Comparing the exit count against the entry snapshot lets transaction guards distinguish new failures from pre-existing outer unwinds cleanly.

> **Pitfall.** Placing a `try { ... } catch (...) {}` function-try-block on a constructor does not prevent the caller from receiving an exception; if execution reaches the end of the handler, C++ automatically rethrows.

## What to remember

- The **basic guarantee** (no leaks, valid invariants) is the non-negotiable minimum for all C++ types; achieve it effortlessly by owning resources through RAII handles.
- Achieve the **strong guarantee** by performing every potentially throwing allocation or copy on temporary state first, then committing via `noexcept` swaps or pointer transfers.
- Always mark user-declared move constructors and move assignment operators `noexcept` when they cannot throw, or `std::move_if_noexcept` will force containers like `std::vector` back into copying.
- Destructors are implicitly `noexcept(true)` since C++11; never let exceptions escape a destructor, and use `std::uncaught_exceptions()` (plural) to detect new unwinds inside scope guards.
- A constructor function-try-block can observe or translate a member-initializer exception, never swallow it.
