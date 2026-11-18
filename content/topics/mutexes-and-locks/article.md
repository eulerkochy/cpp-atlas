---
title: "Mutexes and locks"
summary: "A mutex turns a region of code into a critical section and creates happens-before between whoever unlocks and whoever locks next. This page covers the mutex kinds, the RAII lock wrappers, deadlock and std::lock, the undefined behavior that is easy to write, and one-time initialization."
track: "concurrency"
minutes: 13
standard:
  - "[thread.req.lockable]"
  - "[thread.mutex.requirements]"
  - "[thread.mutex.class]"
  - "[thread.mutex.recursive]"
  - "[thread.timedmutex.requirements]"
  - "[thread.sharedmutex.requirements]"
  - "[thread.lock.guard]"
  - "[thread.lock.scoped]"
  - "[thread.lock.unique]"
  - "[thread.lock.shared]"
  - "[thread.lock.algorithm]"
  - "[thread.once.callonce]"
  - "[stmt.dcl]"
cppreference:
  - title: "std::mutex"
    path: "thread/mutex"
  - title: "std::shared_mutex"
    path: "thread/shared_mutex"
  - title: "Named requirements: Lockable"
    path: "named_req/Lockable"
  - title: "std::scoped_lock"
    path: "thread/scoped_lock"
  - title: "std::unique_lock"
    path: "thread/unique_lock"
  - title: "std::lock"
    path: "thread/lock"
  - title: "std::call_once"
    path: "thread/call_once"
  - title: "Storage class specifiers (static local variables)"
    path: "language/storage_duration"
prerequisites:
  - "threads-and-jthread"
  - "atomics-and-memory-ordering"
  - "raii-and-resource-management"
---

## The one idea

A mutex is a token that at most one thread holds at a time. Code that runs only while holding it is a critical section, and two critical sections guarded by the same mutex never overlap. That is the half everyone knows. The other half is ordering: every `lock` and `unlock` on a given mutex falls into one total order, and each `unlock` synchronizes with the next `lock` that acquires the mutex. So whatever a thread wrote before unlocking is visible to whoever locks after it. That is why plain, non-atomic data guarded consistently by one mutex has no data race. The definitions of data race and happens-before are in atomics-and-memory-ordering.

> **Mental model.** A mutex guards an invariant, not a variable. Lock, find the invariant true, break it briefly, restore it, unlock. Every access to the data the invariant covers, reads included, must hold the same mutex.

The rest is plumbing: which kind of mutex, which RAII wrapper, how to lock several without deadlock, and the handful of mistakes the standard declares undefined.

## The mutex family and the Lockable requirements

The library describes lockable things by named requirements rather than by a base class, so your own types can take part.

| Requirement | Operations | Examples |
|---|---|---|
| *Cpp17BasicLockable* | `lock`, `unlock` | anything `lock_guard` accepts |
| *Cpp17Lockable* | adds `try_lock` | what `std::lock` and a multi-mutex `scoped_lock` need |
| *Cpp17TimedLockable* | adds `try_lock_for`, `try_lock_until` | `timed_mutex` |

The standard mutex types build on those:

- `std::mutex` is the plain exclusive mutex. Its default constructor is `constexpr`, so a namespace-scope `std::mutex` is constant-initialized and has no static initialization order problem.
- `std::recursive_mutex` lets the owning thread lock again; it must unlock as many times as it locked. The maximum depth is unspecified, and exceeding it makes `lock` throw `std::system_error` and `try_lock` return false.
- `std::timed_mutex` and `std::recursive_timed_mutex` add timed attempts.
- `std::shared_timed_mutex` (C++14) and `std::shared_mutex` (C++17) add a shared mode: many threads may hold `lock_shared` at once, but `lock` excludes everyone. There is no upgrade from shared to exclusive, and the standard does not specify whether readers or writers get priority.

None of these is copyable or movable. A mutex is an identity; its address is what threads agree on.

One detail of `try_lock` surprises people: [thread.mutex.requirements.mutex] allows it to fail even when no other thread owns the mutex. A failed `try_lock` also does not synchronize with anything. Use it to avoid blocking, never to learn what another thread is doing.

```cpp
#include <map>
#include <mutex>
#include <shared_mutex>
#include <string>

class Registry {
  mutable std::shared_mutex m_;
  std::map<std::string, int> items_;
public:
  int find(const std::string& k) const {
    std::shared_lock lock(m_);   // many readers at once
    auto it = items_.find(k);
    return it == items_.end() ? -1 : it->second;
  }
  void set(const std::string& k, int v) {
    std::unique_lock lock(m_);   // one writer, and no readers
    items_[k] = v;
  }
};
```

## Lock wrappers: lock_guard, unique_lock, scoped_lock, shared_lock

Calling `lock` and `unlock` by hand is fragile, because an exception or early return between them leaves the mutex locked. The wrappers tie ownership to scope.

- `std::lock_guard<M>` locks in its constructor and unlocks in its destructor. It is neither copyable nor movable. The `std::adopt_lock` tag makes it take over a mutex the thread already holds.
- `std::scoped_lock<Ms...>` (C++17) is the variadic successor. With one mutex it behaves like `lock_guard`; with several it locks them all through the deadlock-avoiding `std::lock` algorithm.
- `std::unique_lock<M>` is movable and may or may not own the mutex at any moment. It accepts `std::defer_lock`, `std::try_to_lock`, `std::adopt_lock` and timeouts, and offers `lock`, `unlock`, `owns_lock` and `release`, which gives up the association *without* unlocking. It is the type `std::condition_variable` requires, and it costs a flag and a branch more than `lock_guard`.
- `std::shared_lock<M>` (C++14) is the shared-mode counterpart of `unique_lock`, calling `lock_shared` and `unlock_shared`.

`unique_lock` checks its own state. Calling `unlock` when it does not own the mutex throws `std::system_error` with `operation_not_permitted`, and calling `lock` when it already owns throws with `resource_deadlock_would_occur`.

> **Pitfall.** A lock wrapper must be a named variable. `std::scoped_lock{m};` creates a temporary that locks and unlocks within that one statement. `std::unique_lock<std::mutex>(m);` is worse: the parentheses are redundant declarator parentheses, so it declares a new, default-constructed `unique_lock` named `m` that owns nothing and shadows the mutex. Both compile, and both leave the code that follows unprotected. GCC's `-Wparentheses` and Clang's `-Wvexing-parse` catch the second form.

## Deadlock and std::lock

Deadlock needs a cycle: thread 1 holds A and waits for B, while thread 2 holds B and waits for A. The classic cure is a global lock order, so a cycle cannot form. When the order is not knowable, as when transferring between two accounts chosen at run time, `std::lock(m1, m2, ...)` locks any number of *Cpp17Lockable* objects without deadlock. The standard leaves its algorithm unspecified, saying only that it uses `lock`, `try_lock` and `unlock` and avoids deadlock. Typical implementations lock one mutex, `try_lock` the rest, and on failure release everything and retry, starting with the mutex that could not be taken. If an exception escapes, every mutex it had locked is unlocked again.

```cpp
#include <mutex>

struct Account {
  std::mutex m;
  long balance = 0;
};

void transfer(Account& from, Account& to, long amount) {
  // Two threads calling transfer(a, b) and transfer(b, a) cannot deadlock.
  std::scoped_lock lock(from.m, to.m);   // uses the std::lock algorithm
  from.balance -= amount;
  to.balance += amount;
}
```

Before C++17 the same thing took two steps: `std::lock(a, b)` followed by two `lock_guard`s with `std::adopt_lock`, or two `unique_lock`s with `std::defer_lock` passed to `std::lock`. `std::try_lock(m1, m2, ...)` is the non-blocking relative: it returns -1 if it locked everything, or the zero-based index of the first argument it failed to lock, having unlocked the rest.

Note that `std::lock` only prevents deadlock among the mutexes passed to one call. A thread that already holds some other mutex can still be part of a cycle.

## Undefined behavior you can write in one line

The mutex requirements are stated as preconditions, and breaking a precondition of a standard library function is undefined behavior. Four cases account for most real bugs.

- Locking a `std::mutex`, `timed_mutex`, `shared_mutex` or `shared_timed_mutex` that the calling thread already owns. Many implementations deadlock, and a note in [thread.mutex.class] says one that detects it might report `resource_deadlock_would_occur`, but the standard promises neither.
- Calling `unlock` from a thread that does not own the mutex. A mutex is not a semaphore, and there is no handing it to another thread to release.
- Destroying a mutex while any thread owns it.
- Letting a thread end while it owns a mutex.

```cpp
#include <mutex>

std::mutex m;

void helper() { std::lock_guard lk(m); /* ... */ }

void api() {
  std::lock_guard lk(m);
  helper();   // undefined behavior: m is a std::mutex and this thread owns it
}
```

> **Standardese.** [thread.mutex.requirements.mutex] makes "the calling thread does not own the mutex" a precondition of `lock` for the non-recursive types and "the calling thread owns the mutex" a precondition of `unlock`. [thread.mutex.class] separately says that the behavior is undefined if a program destroys a mutex owned by any thread, or if a thread terminates while owning one.

`std::recursive_mutex` makes the first case legal, but it usually hides a design problem: a function that is entered with the invariant already broken. Splitting the code into a public function that locks and a private one that assumes the lock is held is almost always cleaner.

## call_once and thread-safe statics

Lazy one-time initialization has two standard forms. The first is a block-scope static. Since C++11, if several threads reach the declaration at once, one initializes the variable and the rest wait for it to finish. If the initializer throws, the variable is not initialized, and the next thread to arrive tries again. Re-entering the declaration recursively while it is being initialized is undefined behavior. In testing for this page, the GCC 16 build hung, while the Clang build with libc++ aborted with a diagnostic.

```cpp
struct Config { int verbosity = 1; };

Config& config() {
  static Config c;   // initialized exactly once, thread-safe since C++11
  return c;
}
```

The second is `std::call_once` with a `std::once_flag`, for when the state is not a single static, for example a member of an object. All calls on one flag are ordered. The call that runs the callable and returns normally is a *returning* execution, and it synchronizes with every *passive* call that finds the work already done. If the callable throws, the execution is *exceptional*: the exception propagates to that caller, the flag stays unset, and a later call runs the callable again.

```cpp
#include <mutex>
#include <vector>

class Table {
  std::once_flag built_;
  std::vector<int> data_;
public:
  const std::vector<int>& get() {
    std::call_once(built_, [this] { data_.assign(1024, 0); });
    return data_;   // every caller sees the fully built vector
  }
};
```

## Granularity, and calling code you do not control

A mutex serializes everything it covers, so hold it for the shortest stretch that keeps the invariant intact. Prepare values before locking, and do slow work such as I/O and allocation-heavy formatting after unlocking. Splitting one big lock into several finer ones increases concurrency, but every extra mutex is another edge in the lock-order graph.

The most dangerous thing to do under a lock is to call code you did not write: a callback, a virtual function, a signal or observer list. That code might take a lock of its own, which creates a lock-order cycle you cannot see, or call back into your object and relock a non-recursive mutex. Copy what the callback needs while holding the lock, unlock, then call.

```cpp
#include <functional>
#include <mutex>
#include <vector>

class Notifier {
  std::mutex m_;
  std::vector<std::function<void(int)>> listeners_;
public:
  void publish(int v) {
    std::vector<std::function<void(int)>> copy;
    {
      std::lock_guard lk(m_);
      copy = listeners_;      // snapshot under the lock
    }
    for (auto& f : copy) f(v);   // unknown code runs with no lock held
  }
};
```

The same reasoning rules out returning a pointer or reference to guarded data from a locked accessor. Once the lock is released, the caller holds a path into the data that no mutex protects.

## What to remember

- Each `unlock` synchronizes with the next `lock` of the same mutex; that is what makes guarded non-atomic data race-free.
- Lockable types are defined by requirements: *BasicLockable* (`lock`, `unlock`), *Lockable* (adds `try_lock`), *TimedLockable* (adds timed tries).
- `try_lock` may fail spuriously, and a failed `try_lock` synchronizes with nothing.
- `std::mutex` has a `constexpr` constructor. Mutexes are neither copyable nor movable.
- Prefer `scoped_lock`; use `unique_lock` when you need to unlock early, move ownership, or wait on a condition variable; use `shared_lock` for readers.
- A lock wrapper that is a temporary, or a parenthesized declaration, protects nothing.
- `std::lock` and multi-mutex `scoped_lock` avoid deadlock among their arguments; the algorithm is unspecified.
- Relocking a non-recursive mutex, unlocking one you do not own, destroying one that is owned, and exiting a thread while owning one are all undefined behavior.
- Block-scope static initialization is thread-safe since C++11, retries after an exception, and is undefined if it recurses.
- `call_once` retries after an exceptional execution and synchronizes the returning execution with all passive calls.
- Never call unknown code while holding a lock. Snapshot, unlock, then call.
