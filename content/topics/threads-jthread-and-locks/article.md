---
title: "Threads, jthread, cooperative stop, and locks"
summary: "Why raw std::thread terminates on destruction, how std::jthread and stop_token provide cooperative cancellation, and how RAII locks, condition variables, latches, barriers, and semaphores coordinate concurrent execution."
track: concurrency
minutes: 9
standard:
  - "[thread.thread.class]"
  - "[thread.jthread.class]"
  - "[thread.stoptoken]"
  - "[thread.mutex.requirements]"
  - "[thread.lock]"
  - "[thread.condition]"
  - "[thread.latch]"
  - "[thread.barrier]"
  - "[thread.sema]"
  - "[thread.once.callonce]"
cppreference:
  - title: "std::thread"
    path: "thread/thread"
  - title: "std::jthread"
    path: "thread/jthread"
  - title: "std::stop_token"
    path: "thread/stop_token"
  - title: "std::stop_source"
    path: "thread/stop_source"
  - title: "std::scoped_lock"
    path: "thread/scoped_lock"
  - title: "std::unique_lock"
    path: "thread/unique_lock"
  - title: "std::shared_mutex"
    path: "thread/shared_mutex"
  - title: "std::condition_variable_any"
    path: "thread/condition_variable_any"
  - title: "std::latch"
    path: "thread/latch"
  - title: "std::barrier"
    path: "thread/barrier"
  - title: "std::counting_semaphore"
    path: "thread/counting_semaphore"
prerequisites:
  - raii-and-resource-management
  - atomics-and-memory-ordering
---

Managing concurrency manually with raw OS threads breaks exception safety as soon as an early return or thrown exception leaves scope before `join()`. Modern C++ concurrency ties thread lifetime to RAII via `std::jthread`, pairs teardown with cooperative cancellation via `std::stop_token`, and layers deadlock-free lock wrappers and C++20 coordination primitives on top.

## The std::thread destructor trap and std::jthread

When a `std::thread` object is destroyed while still `joinable()`—meaning neither `join()` nor `detach()` was called—its destructor immediately invokes `std::terminate()`. The committee deliberately rejected implicit `detach()` (which leaves background workers reading destroyed stack locals) and implicit `join()` (which deadlocks if the worker waits on a condition the unwinding scope never fulfills). Even a simple helper function that creates a `std::thread`, throws an exception, and forgets a RAII wrapper aborts the process.

C++20 introduced `std::jthread` ("joining thread") to fix both lifetime and shutdown signaling. First, `~jthread()` automatically requests cancellation and joins the thread if `joinable()` is true. Second, `std::jthread` owns an internal `std::stop_source`. If your thread entry function takes `std::stop_token` as its first parameter, `std::jthread` automatically passes `get_stop_token()` without forcing you to allocate or wire a flag by hand.

> **Pitfall.** Always declare `std::jthread` as the **last** data member of any class holding mutexes, condition variables, or shared buffers used by that worker. Because class members are destroyed in reverse declaration order, placing `jthread` last guarantees `request_stop()` and `join()` complete *before* the mutex or queue is destroyed.

```cpp
#include <condition_variable>
#include <mutex>
#include <stop_token>
#include <thread>

class Worker {
    std::mutex mtx_;
    std::condition_variable_any cv_;
    bool ready_ = false;
    std::jthread thread_; // Declared LAST: stops and joins before mtx_/cv_ die

public:
    Worker()
        : thread_([this](std::stop_token st) {
              std::unique_lock lk(mtx_);
              if (!cv_.wait(lk, st, [this] { return ready_; })) {
                  return; // Stop requested while waiting
              }
          }) {}

    void signal_ready() {
        {
            std::scoped_lock lk(mtx_);
            ready_ = true;
        }
        cv_.notify_one();
    }
};
```

## Cooperative cancellation with stop_token

`std::stop_source`, `std::stop_token`, and `std::stop_callback` share a reference-counted atomic stop state. Calling `request_stop()` on the `stop_source` transitions the state once (atomically returning `true` only to the first caller) and wakes all observers holding matching `stop_token` copies. Unlike POSIX `pthread_cancel`, cancellation never injects asynchronous exceptions at arbitrary instructions; workers inspect `st.stop_requested()` at clean invariant boundaries and unwind destructors normally.

For blocking operations that cannot poll a boolean—such as waiting on a socket descriptor or an external C event loop—attach a `std::stop_callback`: its constructor registers a handler that executes when `request_stop()` fires. Crucially, if `stop_requested()` is **already** true when the `stop_callback` object is constructed, the callback runs synchronously inside the `stop_callback` constructor on the registering thread, guaranteeing zero missed cancellations.

> **Mental model.** A `stop_token` acts as a thread-safe, one-way cancellation channel with reactive callbacks—the caller requests shutdown, and the worker decides the safe point to unwind.

## Mutexes and RAII lock wrappers

Raw `mtx.lock()` and `mtx.unlock()` calls leak locked mutexes across early returns and exceptions. The standard library provides four RAII lock wrappers tailored to distinct locking patterns:

- **`std::lock_guard<M>`** acquires a single mutex on construction and releases it on destruction, with zero overhead and no move or manual-unlock methods.
- **`std::scoped_lock<Ms...>`** (C++17) generalizes `lock_guard` to variadic mutexes (`std::scoped_lock lk(m1, m2)`), using a deadlock-avoidance algorithm (`std::lock`) when given multiple locks while matching `lock_guard`'s zero overhead for a single mutex.
- **`std::unique_lock<M>`** supports deferred locking (`std::defer_lock`), timed or try locking (`std::try_to_lock`), adopting already-locked mutexes (`std::adopt_lock`), move transfer, manual `.unlock()`, and waiting on a `std::condition_variable`.
- **`std::shared_lock<SM>`** acquires shared reader access on `std::shared_mutex` or `std::shared_timed_mutex`, allowing concurrent readers while blocking exclusive `unique_lock` writers.

> **Pitfall.** Writing `std::scoped_lock(m1, m2);` or `std::unique_lock<std::mutex>(m);` without a variable name constructs an anonymous temporary that acquires the lock and immediately unlocks it at the semicolon, leaving the critical section unprotected.

| Lock Wrapper | Mutex Count | Movable & Deferrable | Manual Unlock | Primary Use Case |
| --- | --- | --- | --- | --- |
| `std::lock_guard` | Exactly 1 | No | No | Simple C++11 single-mutex critical section |
| `std::scoped_lock` | 0, 1, or many | No | No | Default single or deadlock-safe multi-mutex lock |
| `std::unique_lock` | 1 | Yes | Yes | Condition variables, lock transfer, early unlock |
| `std::shared_lock` | 1 shared mutex | Yes | Yes | Multiple concurrent readers with `shared_mutex` |

## Condition variables and spurious wakeups

`std::condition_variable` operates exclusively with `std::unique_lock<std::mutex>`, whereas `std::condition_variable_any` accepts any BasicLockable type (including `std::shared_lock` or custom locks) and provides stop-token-aware overloads such as `wait(lk, st, pred)`.

Calling bare `cv.wait(lk)` without a predicate invites two classic bugs: **lost wakeups** (the producer called `notify_one()` before the consumer reached `wait`, leaving the consumer sleeping forever) and **spurious wakeups** (operating-system futexes and scheduler signals may unblock a waiting thread even when no thread notified). Always pass a boolean predicate—`cv.wait(lk, [&] { return !queue.empty(); })`—which checks state under the lock in a loop before and after sleeping. When notifying, unlock the mutex before calling `notify_one()` or `notify_all()` whenever the condition variable itself remains alive, preventing the woken thread from immediately blocking on the still-held mutex.

> **Standardese.** Under `[thread.condition.condvar]`, `condition_variable::wait` may return spuriously without any notification; the predicate overload guarantees returning only when `bool(pred())` evaluates to `true` with `lock` reacquired (or, for `condition_variable_any::wait(lock, st, pred)`, when `st.stop_requested()` becomes `true`).

## Latches, barriers, semaphores, and call_once

C++20 added three lightweight coordination types alongside `std::call_once`:

- **`std::latch`** is a single-use downward counter (`count_down`, `wait`, `arrive_and_wait`). Any thread may call `count_down` multiple times, and waiting threads unblock once the counter reaches zero.
- **`std::barrier<CompletionFunction>`** coordinates reusable multi-phase work. When the phase arrival count reaches zero, the last arriving thread runs the completion step once before unblocking all participants and resetting the next phase (`arrive_and_wait`, `arrive_and_drop`). Under `[thread.barrier]`, `std::is_nothrow_invocable_v<CompletionFunction&>` is mandated (`noexcept`).
- **`std::counting_semaphore<LeastMaxValue>`** and **`std::binary_semaphore`** track available permits (`acquire`, `release`, `try_acquire`). Unlike `std::mutex`, semaphores impose **no thread ownership**: Thread A can `release()` a permit that Thread B later `acquire()`s, whereas unlocking a `std::mutex` from a thread that did not lock it is undefined behavior.
- **`std::once_flag` and `std::call_once`** guarantee exactly-once initialization per flag object across threads. Under `[thread.once.callonce]`, if an active invocation exits by throwing an exception, it counts as exceptional rather than returning, and another waiting invocation gets to retry.

```cpp
#include <barrier>
#include <latch>
#include <mutex>
#include <semaphore>
#include <shared_mutex>

void coordination_demo() {
    std::mutex a, b;
    {
        std::scoped_lock both(a, b); // Deadlock-free acquisition of two mutexes
    }

    std::shared_mutex rw;
    { std::shared_lock reader(rw); } // Concurrent reader access
    { std::unique_lock writer(rw); } // Exclusive writer access

    std::latch ready(1);
    ready.count_down();
    ready.wait();

    auto step_done = []() noexcept { /* runs once per phase */ };
    std::barrier phase(1, step_done);
    phase.arrive_and_wait();

    std::binary_semaphore signal{0};
    signal.release(); // Thread-agnostic signal: another thread may acquire()
    signal.acquire();
}
```

## What to remember

- Prefer `std::jthread` over `std::thread` so destructors request cancellation and join cleanly; declare `std::jthread` **last** among class members it touches.
- Pair `std::stop_token` with `std::condition_variable_any` or `std::stop_callback` for race-free cooperative shutdown without polling delays.
- Default to `std::scoped_lock` for simple or multi-mutex locking, reserve `std::unique_lock` for condition variables or deferred/manual unlocking, and always name your lock variable.
- Never call `condition_variable::wait(lk)` without a predicate; spurious and missed wakeups require checking shared state in a loop under the lock.
- Use `std::latch` for one-shot countdowns, `std::barrier` (with a `noexcept` completion callable) for phased work, and `std::binary_semaphore` instead of `std::mutex` when signaling across different threads.
