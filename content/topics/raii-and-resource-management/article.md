---
title: "RAII and Resource Management"
summary: "Bind every resource invariant to an object lifetime so deterministic destructors, stack unwinding, and the Rule of Zero eliminate leaks by construction."
track: classes
minutes: 9
standard:
  - "[basic.stc.auto]"
  - "[class.dtor]"
  - "[except.ctor]"
  - "[class.copy.ctor]"
  - "[class.copy.assign]"
  - "[smartptr]"
  - "[thread.lock.scoped]"
cppreference:
  - title: "RAII"
    path: "language/raii"
  - title: "The rule of three/five/zero"
    path: "language/rule_of_three"
  - title: "Destructors"
    path: "language/destructor"
  - title: "Exceptions"
    path: "language/exceptions"
  - title: "std::unique_ptr"
    path: "memory/unique_ptr"
  - title: "std::shared_ptr"
    path: "memory/shared_ptr"
  - title: "std::scoped_lock"
    path: "thread/scoped_lock"
  - title: "std::exchange"
    path: "utility/exchange"
prerequisites:
  - constructors-and-initialization-order
  - copy-and-move
---

Resource Acquisition Is Initialization (RAII) is C++'s foundational pattern for making leaks impossible by construction. Despite the awkward historical name, the rule has nothing to do with memory alone and everything to do with **invariants**: every acquisition of a finite resource—heap allocations, file descriptors, mutex locks, database transactions, or temporary flag mutations—must be paired with an automatic object whose lifetime governs that resource.

## Invariants bound to object lifetime

Manual `acquire()` / `release()` pairs fail whenever a function grows an early `return`, a `break`, or a call that throws an exception. RAII replaces cleanup branches across every exit path with one invariant maintained inside a class boundary: the constructor acquires the resource (or throws before the object's lifetime ever begins), and the destructor releases it deterministically when the enclosing scope ends (`[basic.stc.auto]`).

> **Mental model.** An object either owns a valid resource handle or never finished constructing. Because C++ guarantees destructors run on normal scope exit, early return, and exception unwinding alike, cleanup becomes a structural property of lexical scope rather than caller discipline.

That principle scales beyond pointers to arbitrary state transitions. A `std::scoped_lock` acquires one or more mutexes in its constructor and unlocks them in reverse on exit without deadlock (`[thread.lock.scoped]`). A state-saving guard can capture a numeric flag or locale on construction and restore it unconditionally when destroyed.

## Deterministic destruction and stack unwinding

C++ defines exact destruction order at every boundary (`[class.dtor]`):

- **Block scope:** automatic variables are destroyed in the exact reverse order their constructors completed.
- **Class members and bases:** non-static data members are destroyed in reverse declaration order, followed by direct non-virtual base classes in reverse base-specifier order, and finally virtual bases in reverse initialization order.

Stack unwinding preserves this guarantee when exceptions fly.

> **Standardese.** Under `[except.ctor]`, if an exception exits a constructor before its closing brace, the object's lifetime never began, so its own destructor does not run; however, every already-constructed base subobject and data member is destroyed immediately in reverse order.

```cpp
#include <stdexcept>

struct Channel {
    explicit Channel(int id) {
        if (id < 0) throw std::runtime_error("invalid channel");
    }
    ~Channel() = default;
};

struct Bridge {
    Channel rx;
    Channel tx;
    Bridge(int in_id, int out_id) : rx(in_id), tx(out_id) {}
    // If tx throws, ~rx() runs automatically; ~Bridge() never executes.
};
```

In contrast, letting an exception escape a destructor is catastrophic. Since C++11, user-declared destructors are implicitly `noexcept(true)` unless explicitly annotated `noexcept(false)` or inheriting a throwing member/base destructor (`[class.dtor]`). Throwing out of a `noexcept` destructor—or throwing a second exception while stack unwinding is already active—invokes `std::terminate()` immediately. Keep destructors non-throwing, logging or swallowing teardown failures safely when necessary.

## The Rule of Zero and the Rule of Five

Separating business logic from low-level ownership yields two complementary rules that govern special member functions.

The **Rule of Zero** applies to virtually all application classes: compose your type from existing RAII handles (`std::string`, `std::vector`, `std::unique_ptr`, `std::jthread`) and declare *no* destructor, copy constructor, copy assignment operator, move constructor, or move assignment operator. The compiler automatically synthesizes optimal, exception-safe special members by forwarding to each member.

The **Rule of Five** applies strictly to low-level wrapper classes that directly manage a raw resource handle (such as an OS file descriptor). Because the compiler cannot guess how to duplicate or relinquish a raw `int` handle, declaring a custom destructor requires explicitly specifying all five special members (`~T`, copy ctor, copy assign, move ctor, move assign)—either implementing or `= delete`-ing copying while writing a `noexcept` move with `std::exchange`.

```cpp
#include <utility>
#include <vector>

class UniqueFd {
    int fd_ = -1;
public:
    explicit UniqueFd(int fd = -1) noexcept : fd_(fd) {}
    ~UniqueFd() {
        if (fd_ >= 0) { /* close(fd_) */ }
    }

    UniqueFd(const UniqueFd&) = delete;
    UniqueFd& operator=(const UniqueFd&) = delete;

    UniqueFd(UniqueFd&& other) noexcept
        : fd_(std::exchange(other.fd_, -1)) {}

    UniqueFd& operator=(UniqueFd&& other) noexcept {
        if (this != &other) {
            if (fd_ >= 0) { /* close(fd_) */ }
            fd_ = std::exchange(other.fd_, -1);
        }
        return *this;
    }
};

struct Session { // Rule of Zero: inherits move-only semantics cleanly
    UniqueFd socket;
    std::vector<int> backlog;
};
```

> **Pitfall.** Writing `~Widget() = default;` inside a class body counts as a **user-declared destructor** (`[class.copy.ctor]`). That single line silently suppresses implicit move constructor and move assignment generation, causing moves on `Widget` to fall back to expensive copies, and marks implicit copy generation deprecated (`[depr.impldec]`).

## Ownership vocabulary: unique_ptr, shared_ptr, and locks

Express ownership intent directly in the type system so readers and compilers verify lifetime contracts at compile time. Choosing the right standard handle clarifies both lifetime semantics and runtime cost:

| Handle type | Ownership model | Overhead vs raw handle | Typical use case |
| --- | --- | --- | --- |
| `std::unique_ptr<T, D>` | Exclusive, move-only | Zero with stateless deleter | Polymorphic objects, C handles |
| `std::shared_ptr<T>` | Shared reference count | Control block + atomic count | Graph/async shared lifetimes |
| `std::weak_ptr<T>` | Non-owning observer | Shares control block existence | Cache entries, breaking cycles |
| `std::scoped_lock<Ms...>` | Lexical multi-mutex guard | Stack-only RAII frame | Deadlock-free critical sections |

For C APIs such as `std::FILE*`, prefer a stateless functor deleter over a function pointer. Passing `&std::fclose` as the deleter type `int(*)(std::FILE*)` stores an extra 8-byte pointer inside every `std::unique_ptr`, whereas a stateless callable `struct FileCloser` collapses to zero bytes via empty base optimization or `[[no_unique_address]]`:

```cpp
#include <cstdio>
#include <memory>

struct FileCloser {
    void operator()(std::FILE* f) const noexcept {
        if (f) std::fclose(f);
    }
};

using UniqueFile = std::unique_ptr<std::FILE, FileCloser>;
static_assert(sizeof(UniqueFile) == sizeof(std::FILE*));
```

Always allocate with `std::make_unique` or `std::make_shared` rather than bare `new`. Beyond removing `new`/`delete` from user code, `std::make_shared` combines the control block and managed object into one allocation, and before C++17 calling `f(std::unique_ptr<A>(new A), may_throw())` risked leaking `A` if `may_throw()` ran between `new A` and `unique_ptr` construction.

## Failure modes: self-assignment, noexcept, and premature exit

Even well-written RAII wrappers break along three edge boundaries. First, **self-move assignment** (`a = std::move(a)`) and **self-copy assignment** (`a = a`) can occur in generic algorithms (`std::sort`, `std::swap` fallbacks). Guard resource release in `operator=` or implement copy-and-swap / move-and-swap so self-assignment remains safe. Second, mark move operations `noexcept`: containers like `std::vector` rely on `std::move_if_noexcept` to preserve the strong exception guarantee, falling back to `O(N)` copies if a move constructor can throw. Third, avoid abrupt termination calls (`std::abort()`, `std::_Exit()`, or `std::exit()` while stack locals remain live): `std::exit()` runs `thread_local` and static destructors, **never** unwinding automatic stack frames (`[basic.start.term]`). Return cleanly from `main` instead so every scope unwinds.

## What to remember

- Bind every resource invariant—not just heap memory—to an object whose constructor establishes validity and whose destructor releases it.
- Destructors run in reverse construction order; if a constructor throws, already-constructed bases and members unwind while the enclosing destructor does not run.
- Destructors are implicitly `noexcept`; never allow exceptions to escape a destructor.
- Follow the **Rule of Zero** in domain classes; follow the **Rule of Five** only in dedicated single-resource wrappers, using `std::exchange` and `noexcept` on moves.
- Never write `~T() = default;` gratuitously—a user-declared destructor suppresses implicit move operations.
