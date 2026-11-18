---
title: "Threads and jthread"
summary: "A std::thread is an owning handle that you must join or detach before it dies, and it copies its arguments before the new thread starts. C++20's std::jthread joins for you and adds cooperative cancellation through stop tokens."
track: "concurrency"
minutes: 12
standard:
  - "[thread.thread.class]"
  - "[thread.thread.constr]"
  - "[thread.thread.destr]"
  - "[thread.thread.member]"
  - "[thread.thread.static]"
  - "[thread.thread.id]"
  - "[thread.jthread.class]"
  - "[thread.stoptoken]"
  - "[stopcallback]"
  - "[basic.stc.thread]"
  - "[basic.start.term]"
cppreference:
  - title: "std::thread"
    path: "thread/thread"
  - title: "std::thread::~thread"
    path: "thread/thread/~thread"
  - title: "std::jthread"
    path: "thread/jthread"
  - title: "std::stop_token"
    path: "thread/stop_token"
  - title: "std::stop_callback"
    path: "thread/stop_callback"
  - title: "std::thread::hardware_concurrency"
    path: "thread/thread/hardware_concurrency"
  - title: "std::ref, std::cref"
    path: "utility/functional/ref"
  - title: "Storage class specifiers (thread_local)"
    path: "language/storage_duration"
prerequisites:
  - "atomics-and-memory-ordering"
  - "raii-and-resource-management"
  - "lambdas"
---

## The one idea

A `std::thread` object is not the thread. It is a handle that may own one thread of execution, much as a `unique_ptr` may own one heap object. The handle is movable and not copyable, and while it owns a thread it is called *joinable*. Every joinable handle must give up ownership before it is destroyed, either by `join()`, which waits for the thread to finish, or by `detach()`, which lets it run on unowned. If you forget, the destructor does not guess which one you meant. It calls `std::terminate`.

C++20's `std::jthread` is the same handle with a different policy: its destructor asks the thread to stop and then joins it. That one change makes threads behave like any other RAII resource, and the stop request turns into a small, cooperative cancellation framework.

> **Mental model.** A thread handle is a debt. Constructing a joinable `std::thread` creates the debt, and only `join` or `detach` pays it. `std::jthread` pays it automatically, by asking politely and then waiting.

The rules about data races, happens-before and atomics are covered in atomics-and-memory-ordering. This page is about the thread objects themselves, and the two synchronization edges they create: the end of the constructor synchronizes with the start of the new thread's function, and the completion of the thread synchronizes with the return from `join()`.

## Constructing a thread: what gets copied, and where

The constructor takes a callable and arguments, and the new thread invokes the callable on them. The important detail is that every argument is first decay-copied *in the constructing thread*, and those copies are then passed to the function as rvalues in the new thread. Since C++23 the standard spells this as `invoke(auto(std::forward<F>(f)), auto(std::forward<Args>(args))...)` with the `auto` values materialized in the calling thread.

Three consequences follow. A function taking `int&` cannot be started with a plain `int` argument, because an rvalue copy cannot bind to a non-const lvalue reference. A function taking `const int&` compiles but receives a reference to the private copy, not to your variable. And if you really want to share the variable, you wrap it in `std::ref`, which produces a `reference_wrapper` that is copied cheaply and converts to `int&` at the call.

```cpp
#include <functional>
#include <thread>

void inc(int& n) { ++n; }

int main() {
  int x = 0;
  // std::thread bad(inc, x);       // ill-formed: the copy of x is an rvalue
  std::thread t(inc, std::ref(x));  // OK: inc sees x itself
  t.join();                         // join makes the write visible: x == 1
}
```

Exceptions thrown while copying the arguments surface in the constructing thread, which is the only place they could be handled. If the system cannot create a thread at all, the constructor throws `std::system_error` with `resource_unavailable_try_again`. Member functions work as usual through `std::invoke`, so `std::thread t(&Worker::run, &w, 5);` calls `w.run(5)`.

> **Pitfall.** Decay-copying happens to the argument as written, not to the parameter type. Passing a `char` array to a function taking `const std::string&` copies a `char*`, and the `std::string` is only built when the new thread calls the function. If the array was a local in a function that has already returned, the new thread reads a dead buffer. Convert explicitly, as `std::string(buf)`, so that the string is what gets copied.

## Joinable means you owe a join

A thread handle is joinable from successful construction until it is joined, detached, or moved from. A default-constructed handle is not joinable. Destroying a joinable `std::thread`, or move-assigning a new thread into one, calls `std::terminate`.

```cpp
#include <thread>

int main() {
  std::thread a([] {});
  std::thread b([] {});
  // a = std::move(b);   // would call std::terminate: a is still joinable
  a.join();
  a = std::move(b);      // fine: a is empty now, and takes over b's thread
  a.join();
}
```

The termination rule was a deliberate choice. Joining implicitly could deadlock an unwinding stack waiting on a thread that is waiting on the unwinding code; detaching implicitly could leave a thread running against destroyed locals. Neither is safe to do silently, so the standard refuses both.

> **Standardese.** [thread.thread.destr] says that if the handle is joinable when it is destroyed, `std::terminate` is called; otherwise the destructor has no effects. [thread.thread.member] adds that `join()` throws `std::system_error` with `resource_deadlock_would_occur` if a thread tries to join itself, and with `invalid_argument` if the handle is not joinable.

## Exceptions do not cross the thread boundary

An exception thrown by the thread's function cannot propagate into the thread that created it, because that thread is off doing something else. If the function exits with an uncaught exception, `std::terminate` is called, and no `try` block around the thread's constructor or `join()` can intercept it. To report failure to another thread, catch inside the thread function and hand over a `std::exception_ptr`, or use a `std::promise` or `std::packaged_task`, which carry exceptions to a future. The topic futures-promises-and-async covers that machinery.

```cpp
#include <exception>
#include <stdexcept>
#include <thread>

int main() {
  std::exception_ptr error;
  std::thread t([&] {
    try { throw std::runtime_error("boom"); }
    catch (...) { error = std::current_exception(); }  // capture, do not escape
  });
  t.join();                       // join orders the write to error before this
  if (error) { /* std::rethrow_exception(error) here, in the joining thread */ }
}
```

## std::jthread and cooperative cancellation

`std::jthread`, added in C++20, owns a `std::stop_source`. Its destructor calls `request_stop()` and then `join()` if the handle is joinable, and so does its move assignment before taking over the new thread. If the callable accepts a `std::stop_token` as its first parameter, the constructor passes the token from its stop source automatically; otherwise it calls the callable exactly as `std::thread` would.

```cpp
#include <chrono>
#include <stop_token>
#include <thread>

int main() {
  std::jthread worker([](std::stop_token st) {
    while (!st.stop_requested()) {
      std::this_thread::sleep_for(std::chrono::milliseconds(1));  // a unit of work
    }
  });
}   // ~jthread: request_stop(), then join(); main returns normally
```

Cancellation is cooperative. Nothing interrupts the thread; it must poll `stop_requested()`, or block in something that understands stop tokens, such as `std::condition_variable_any`'s waits, which condition-variables-and-waiting covers. The three types divide the work. A `std::stop_source` makes requests, a `std::stop_token` observes one shared stop state, and a `std::stop_callback` registers a function to run when stop is requested. `request_stop()` returns `true` only for the call that actually makes the request, and `stop_possible()` on a token is `false` when it has no stop state or when no source remains that could still request a stop.

A `std::stop_callback` runs its function synchronously in the thread that makes the successful `request_stop()` call. If stop has already been requested when the callback is constructed, the function runs immediately, in the constructing thread, before the constructor returns. The callback's destructor deregisters it, and if the callback is running on another thread at that moment, the destructor waits for it to finish. A callback that exits by an exception calls `std::terminate`.

```cpp
#include <cstdio>
#include <stop_token>

int main() {
  std::stop_source src;
  bool first = src.request_stop();   // true: this call made the request
  bool again = src.request_stop();   // false: stop was already requested
  std::stop_callback cb(src.get_token(), [] { std::puts("callback"); });
  // "callback" was printed by the constructor, in this thread
  std::printf("%d %d\n", first, again);   // 1 0
}
```

Callbacks are how you wire a stop request into code that blocks elsewhere, for instance by closing a socket or notifying a condition variable when stop is requested.

## Detaching, thread ids and hardware_concurrency

`detach()` gives up ownership and lets the thread run to completion on its own. It is rarely what you want. A detached thread cannot be joined, so nothing tells you when it has finished with the objects it references, and lambdas that capture locals by reference become dangling as soon as the enclosing function returns. Shutdown is worse: when `main` returns, static objects are destroyed while detached threads may still be running. [basic.start.term] makes any use of the standard library that does not happen before that destruction undefined behavior, so a detached thread that is still writing to `std::cout` during shutdown is undefined behavior. If you must detach, signal completion with `std::notify_all_at_thread_exit` or a promise's `set_value_at_thread_exit`, which fire after the thread's `thread_local` objects are destroyed.

Each thread has a `std::thread::id`, available from `get_id()` on the handle or `std::this_thread::get_id()` inside the thread. A non-joinable handle reports a default-constructed id, which represents no thread. Ids are totally ordered, hashable, and printable, but the id of a finished thread may be reused for a new one.

`std::thread::hardware_concurrency()` returns the number of hardware thread contexts as a hint, and returns 0 when the value is not computable or not well defined. Code that sizes a thread pool from it should clamp the result to at least 1.

## thread_local objects and thread exit

A variable declared `thread_local` has thread storage duration: each thread gets its own instance, created for that thread and destroyed when the thread ends. A block-scope `thread_local` is initialized the first time each thread passes through its declaration. For a namespace-scope `thread_local` with dynamic initialization, it is implementation-defined whether initialization happens at thread start or is deferred until the first use in that thread.

Constructed `thread_local` objects are destroyed, in reverse order of construction, as part of the thread returning from its initial function or calling `std::exit`. That destruction is part of the thread's completion, so it happens before `join()` returns. In the main thread, all `thread_local` destructors finish before any static object is destroyed. A thread that ends through `std::terminate` or `std::quick_exit` does not run them.

```cpp
#include <cstdio>
#include <thread>

struct Noisy { ~Noisy() { std::puts("dtor"); } };

int main() {
  std::thread t([] {
    thread_local Noisy n;   // one per thread, constructed on first pass here
    std::puts("body");
  });
  t.join();                 // "body", then "dtor", both before join returns
  std::puts("joined");
}
```

> **Pitfall.** A `thread_local` destructor that touches another `thread_local`, or a static, can run after that object is gone. Treat thread exit like program exit: destruction order is reverse construction order within the thread, and anything outside that order is your problem.

## What to remember

- Destroying or move-assigning over a joinable `std::thread` calls `std::terminate`. Join or detach every thread.
- Arguments are decay-copied in the constructing thread and passed as rvalues. Use `std::ref` to share, and convert pointers to owning types before the copy.
- An exception escaping a thread function calls `std::terminate`. Carry errors across with `exception_ptr`, promises or `packaged_task`.
- Thread construction synchronizes with the start of the thread, and thread completion synchronizes with the return of `join()`.
- `std::jthread` (C++20) requests stop and joins in its destructor and passes a `stop_token` if the callable takes one.
- Cancellation is cooperative. `request_stop()` returns true once, and a `stop_callback` runs in the requesting thread, or immediately if stop was already requested.
- Detached threads cannot be waited for; using the standard library after static destruction begins is undefined behavior.
- `hardware_concurrency()` may return 0. Thread ids of finished threads may be reused.
- `thread_local` objects are destroyed at thread exit, before `join()` returns, and before statics in the main thread.
