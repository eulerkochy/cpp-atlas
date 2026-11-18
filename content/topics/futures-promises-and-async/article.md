---
title: "Futures, promises and async"
summary: "A future and its provider share one heap-allocated state that carries exactly one value or exception from one thread to another. This page covers promise, packaged_task and std::async, the launch-policy and destructor traps, the future_error cases, and why standard futures cannot be chained."
track: "concurrency"
minutes: 13
standard:
  - "[futures.state]"
  - "[futures.errors]"
  - "[futures.future.error]"
  - "[futures.promise]"
  - "[futures.unique.future]"
  - "[futures.shared.future]"
  - "[futures.async]"
  - "[futures.task]"
cppreference:
  - title: "std::future"
    path: "thread/future"
  - title: "std::promise"
    path: "thread/promise"
  - title: "std::shared_future"
    path: "thread/shared_future"
  - title: "std::packaged_task"
    path: "thread/packaged_task"
  - title: "std::async"
    path: "thread/async"
  - title: "std::launch"
    path: "thread/launch"
  - title: "std::future_errc"
    path: "thread/future_errc"
  - title: "std::future::get"
    path: "thread/future/get"
prerequisites:
  - "threads-and-jthread"
  - "condition-variables-and-waiting"
  - "exceptions-and-stack-unwinding"
  - "copy-and-move"
---

## The one idea

Every future-based handoff is built on one object you never name: the *shared state*. It is allocated by the producer side, and it holds a slot for either a value or an exception, a "ready" flag, and sometimes a deferred function waiting to run. The producer side is an *asynchronous provider*: a `std::promise`, a `std::packaged_task`, or the machinery behind `std::async`. The consumer side is an *asynchronous return object*: a `std::future` or a `std::shared_future`. Both sides hold references to the same shared state, and it is destroyed when the last reference is released.

Making the state ready synchronizes with whoever observes that it is ready, through `wait` or `get`. So a value set through a promise, and everything the producer wrote before setting it, is visible to the thread that gets it, with no extra locking.

> **Mental model.** A promise and its future are the two ends of a one-shot pipe that carries exactly one thing, a value or an exception. Each end can be used once, and if the sending end is dropped without sending, the pipe delivers a "broken promise" error instead.

## promise and future

A `std::promise<T>` creates the shared state. `get_future()` hands out the matching `std::future<T>`, and `set_value` or `set_exception` makes the state ready. In another thread, `future::get()` blocks until the state is ready and then returns the value or rethrows the exception.

```cpp
#include <future>
#include <thread>

int main() {
  std::promise<int> p;
  std::future<int> f = p.get_future();
  std::thread t([&p] { p.set_value(42); });   // the producer
  int v = f.get();                            // blocks until ready, then 42
  t.join();
  return v == 42 ? 0 : 1;
}
```

Each operation has a single-use rule, and breaking one throws `std::future_error`, whose `code()` compares equal to a `std::future_errc` value:

- calling `get_future()` a second time gives `future_already_retrieved`;
- setting a value or exception a second time gives `promise_already_satisfied`;
- using a promise that has no shared state, for example a moved-from one, gives `no_state`;
- destroying a promise whose state is not ready *abandons* the state: the promise stores a `future_error` with `broken_promise` and makes the state ready, so the waiting `get()` throws it instead of blocking forever.

```cpp
#include <future>
#include <iostream>

int main() {
  std::future<int> f;
  {
    std::promise<int> p;
    f = p.get_future();
  }   // p abandons the shared state here
  try {
    f.get();
  } catch (const std::future_error& e) {
    std::cout << (e.code() == std::future_errc::broken_promise) << '\n';   // 1
  }
}
```

`set_value_at_thread_exit` and `set_exception_at_thread_exit` store the result immediately but delay making the state ready until the current thread has destroyed its `thread_local` objects. They are the safe way to signal completion from a detached thread.

## get moves the value out, and then the future is empty

`std::future<T>::get()` is a one-time operation. It waits, then *moves* the value out of the shared state and releases the state, after which `valid()` is false. That is why `future<std::unique_ptr<T>>` works. The reference form `future<T&>` returns the reference, and `future<void>` returns nothing.

Calling `get`, or any member other than the destructor, move assignment, `share` and `valid`, on a future whose `valid()` is false is undefined behavior. The standard recommends that implementations throw `future_error` with `no_state` in that case, and libstdc++ does, but code must not rely on it.

> **Standardese.** [futures.unique.future] says that calling any member function other than the destructor, the move-assignment operator, `share` or `valid` on a `future` whose `valid() == false` is undefined, and adds as recommended practice that implementations detect this and throw `future_error` with `no_state`.

When several consumers need the result, call `share()` to convert the future into a `std::shared_future<T>`. A shared future is copyable, and its `get()` returns `const T&` and leaves the value in place, so it can be called any number of times. Give each thread its own copy of the `shared_future` rather than sharing one object between threads. If the state holds an exception, every `get()` rethrows the stored exception.

```cpp
#include <future>
#include <memory>

int main() {
  std::promise<std::unique_ptr<int>> p;
  std::future<std::unique_ptr<int>> f = p.get_future();
  p.set_value(std::make_unique<int>(3));
  std::unique_ptr<int> v = f.get();   // moved out; f.valid() is now false

  std::promise<int> q;
  std::shared_future<int> s = q.get_future().share();
  q.set_value(9);
  const int& a = s.get();
  const int& b = s.get();             // same object, still there: &a == &b
  return *v + a - b;
}
```

## packaged_task: a callable that fills a promise

`std::packaged_task<R(Args...)>` wraps a callable together with a shared state. Calling the task runs the callable and stores its return value, or the exception it throws, in the state. Like a promise, it hands out exactly one future. It is move-only, so it can be pushed into a work queue as `std::move(task)`, and a type-erasing wrapper that accepts move-only callables, such as C++23's `std::move_only_function`, can hold it.

Calling the task a second time throws `future_error` with `promise_already_satisfied`, because the state is already ready. `reset()` abandons the old state and creates a fresh one, so the task can run again with a new future. A task destroyed without ever being called abandons its state, and its future reports `broken_promise`.

```cpp
#include <future>
#include <thread>

int square(int x) { return x * x; }

int main() {
  std::packaged_task<int(int)> task(square);
  std::future<int> f = task.get_future();
  std::thread t(std::move(task), 7);   // the task runs on t and fills the state
  int r = f.get();                     // 49
  t.join();
  return r == 49 ? 0 : 1;
}
```

## std::async and its launch policies

`std::async(policy, f, args...)` decay-copies its arguments, as `std::thread` does, and returns a future for the result. The policy is a bitmask of `std::launch` values:

- `std::launch::async` runs the function as if on a new thread, with its own fresh `thread_local` objects. If no thread can be started, `async` throws `std::system_error` with `resource_unavailable_try_again`.
- `std::launch::deferred` stores the function in the shared state and runs nothing. The first call to `get` or `wait` on any future sharing that state runs it, synchronously, in the calling thread. If nobody ever asks, it never runs.
- Both bits, which is what you get when you omit the policy, let the implementation choose either one.

The default is a trap. Code written as if the work runs concurrently is not guaranteed to. Thread-local variables may belong to the calling thread, and a polling loop on `wait_for` can spin forever, because the timed waits never run a deferred function. They return `std::future_status::deferred` immediately instead.

```cpp
#include <chrono>
#include <future>

int main() {
  using namespace std::chrono_literals;
  auto f = std::async([] { return 42; });   // policy: async | deferred
  // while (f.wait_for(10ms) != std::future_status::ready) {}
  //   ^ never ends if the implementation chose deferred
  if (f.wait_for(0s) == std::future_status::deferred) {
    // nothing is running; get() below will run the function right here
  }
  return f.get();
}
```

If you need concurrency, say `std::launch::async`. If you want lazy evaluation, say `std::launch::deferred`. Leave the choice to the implementation only when you truly do not care.

## The blocking destructor of async futures

When `std::async` launches a thread, the standard requires that the thread's completion synchronize with the return of the first function that detects the state is ready or of the last function that releases the state, whichever comes first. In practice that means the destructor of the last future referring to such a state blocks until the task finishes. No other future does this: a future from a `promise` or a `packaged_task` releases its state without waiting.

The consequence is easy to miss when the future is a temporary:

```cpp
#include <chrono>
#include <cstdio>
#include <future>
#include <thread>

int main() {
  (void)std::async(std::launch::async, [] {
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    std::puts("a");
  });   // the temporary future's destructor waits here
  (void)std::async(std::launch::async, [] { std::puts("b"); });
}   // always prints a, then b: the two calls run one after the other
```

Since C++20 `std::async` is marked `[[nodiscard]]`, so compilers warn about the discarded result. The cast to `void` above silences the warning but not the waiting. To run work in the background, keep the future alive for as long as you want concurrency.

> **Pitfall.** The blocking destructor makes `std::async` futures behave differently from all others, which matters to code that stores futures generically. A container of futures from `std::async` waits for every task when it is destroyed. The same container filled from promises does not.

## Why standard futures do not chain

A `std::future` has no way to say "when this is ready, run that". The only ways to consume it are to block in `get` or `wait`, or to poll with `wait_for`. Composing asynchronous steps therefore costs a thread blocked in `get` per step, or a polling loop. The Concurrency TS proposed `future::then`, `when_all` and `when_any` under `std::experimental`, but they were never adopted into the standard. The common criticisms were that they left unclear which thread runs a continuation, and that every step needed its own heap-allocated, synchronized shared state.

C++26 takes a different route with `std::execution`, the senders and receivers model. A sender describes work without starting it, adaptors such as `then` and `when_all` compose senders into larger ones, and a scheduler decides where each piece runs. That model is the subject of the senders-and-receivers topic. Futures remain the simple tool for a single result handed from one thread to another.

## What to remember

- Promise, packaged_task and async write a shared state; future and shared_future read it. Making the state ready synchronizes with the thread that observes it.
- Each promise allows one `get_future` and one result. Violations throw `future_error` with `future_already_retrieved` or `promise_already_satisfied`.
- A promise or packaged_task destroyed without a result stores `broken_promise`, so `get()` throws rather than hangs.
- Exceptions travel through the shared state; `get()` rethrows them in the consuming thread.
- `future::get()` moves the value out and invalidates the future. Using an invalid future is undefined; libstdc++ throws `no_state`.
- `shared_future` is copyable, returns `const T&`, and can be read many times; give each thread its own copy.
- `packaged_task` runs once per state; a second call throws `promise_already_satisfied`, and `reset()` starts over.
- The default `std::async` policy may defer the work; timed waits then return `future_status::deferred` and never run it.
- The last future from an `async` that launched a thread blocks in its destructor, so discarded results serialize.
- Standard futures cannot chain. C++26 senders replace continuation-style composition.
