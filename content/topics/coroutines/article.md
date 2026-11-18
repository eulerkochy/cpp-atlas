---
title: "C++20 coroutines and C++23 std::generator"
summary: "How C++20 stackless coroutines compile into resumable state-machine frames, how promise_type, awaitables, and symmetric transfer govern suspension, and how C++23 std::generator and lifetime rules keep async code sound."
track: concurrency
minutes: 10
standard:
  - "[dcl.fct.def.coroutine]"
  - "[expr.await]"
  - "[coroutine.handle]"
  - "[coroutine.traits]"
  - "[coro.generator]"
cppreference:
  - title: "Coroutines (C++20)"
    path: "language/coroutines"
  - title: "Coroutine support library"
    path: "coroutine"
  - title: "std::coroutine_handle"
    path: "coroutine/coroutine_handle"
  - title: "std::coroutine_traits"
    path: "coroutine/coroutine_traits"
  - title: "std::suspend_always"
    path: "coroutine/suspend_always"
  - title: "std::suspend_never"
    path: "coroutine/suspend_never"
  - title: "std::noop_coroutine"
    path: "coroutine/noop_coroutine"
  - title: "std::generator"
    path: "coroutine/generator"
prerequisites:
  - object-lifetime-and-storage
  - lambdas
  - threads-jthread-and-locks
---

A C++20 coroutine is not a lightweight OS thread or a fiber with a separate stack. It is a compiler-transformed state machine whose suspension points and local variables live in a resumable **coroutine state** (frame), giving callers deterministic, zero-kernel-trap pausing and resumption.

## What makes a function a stackless coroutine

A function becomes a coroutine solely by its body containing `co_await`, `co_yield`, or `co_return`—the function signature (`Task fetch(int id)`) does not announce coroutine status. Because C++ coroutines are **stackless**, suspending a coroutine pauses only that function's own frame, storing parameters, locals that cross suspension points, the `promise` object, and a suspension-point index inside a compiler-generated coroutine state. Control returns cleanly to the immediate caller along the ordinary C++ call stack.

By default, the coroutine state is allocated dynamically via `operator new` (which `promise_type` may overload for arena or pool allocation). Under `[dcl.fct.def.coroutine]`, the compiler may perform **Heap Allocation eLision Optimization (HALO)**—placing the frame directly on the caller's stack—whenever it can prove the coroutine's lifetime nests strictly inside the caller and its size is statically known.

> **Mental model.** Calling a coroutine does not spawn background execution: it builds a state-machine frame, runs until its first suspension point, hands back the return object, and advances only when someone calls `handle.resume()`.

## The promise_type lifecycle from entry to final_suspend

When compiling a coroutine returning `R` with parameter types `Args...`, the compiler instantiates `std::coroutine_traits<R, Args...>::promise_type` (which defaults to `R::promise_type`). Entry and exit follow a fixed choreography:

1. Allocate the coroutine frame and move-or-copy parameter values into it.
2. Construct the `promise` inside the frame and invoke `promise.get_return_object()` (converting/storing the result for the caller).
3. Execute `co_await promise.initial_suspend()` (returning `std::suspend_always` for lazy tasks, or `std::suspend_never` for eager start).
4. Run the coroutine body; uncaught exceptions transfer to `promise.unhandled_exception()`, while `co_return` invokes `return_void()` or `return_value(expr)`.
5. Execute `co_await promise.final_suspend()`, which **must** be `noexcept`.

If `final_suspend()` returns `std::suspend_never`, the coroutine frame self-destructs immediately when control reaches the end—so any wrapper `Task` that later checks `handle.done()` or calls `handle.destroy()` in `~Task()` commits a use-after-free. Therefore, RAII `Task` types almost always suspend at `final_suspend()` (via `std::suspend_always` or a symmetric-transfer awaiter) so `~Task()` owns `handle.destroy()`.

```cpp
#include <coroutine>
#include <exception>
#include <utility>

struct Task {
    struct promise_type {
        std::coroutine_handle<> continuation = std::noop_coroutine();

        Task get_return_object() noexcept {
            return Task{std::coroutine_handle<promise_type>::from_promise(*this)};
        }
        std::suspend_always initial_suspend() noexcept { return {}; }
        struct FinalAwaiter {
            bool await_ready() noexcept { return false; }
            std::coroutine_handle<> await_suspend(
                std::coroutine_handle<promise_type> h) noexcept {
                return h.promise().continuation; // Symmetric tail transfer
            }
            void await_resume() noexcept {}
        };
        FinalAwaiter final_suspend() noexcept { return {}; }
        void return_void() noexcept {}
        void unhandled_exception() { std::terminate(); }
    };

    std::coroutine_handle<promise_type> handle;
    explicit Task(std::coroutine_handle<promise_type> h) noexcept : handle(h) {}
    Task(Task&& other) noexcept : handle(std::exchange(other.handle, {})) {}
    Task& operator=(Task&&) = delete;
    ~Task() { if (handle) handle.destroy(); }
};
```

## The awaitable protocol and symmetric transfer

Every `co_await expr` evaluates a three-step customization pipeline. First, if `promise_type` defines `await_transform`, the compiler transforms `expr` via `promise.await_transform(expr)`. Second, if the resulting awaitable provides a member or non-member `operator co_await`, that operator yields the awaiter. Third, the compiler calls `awaiter.await_ready()`: if `true`, execution skips suspension and calls `await_resume()` immediately; if `false`, the coroutine saves its registers and suspension index, enters the suspended state, and calls `awaiter.await_suspend(h)`.

The return type of `await_suspend(std::coroutine_handle<Promise> h)` governs what executes next:

- **`void`** keeps `h` suspended and returns control to whichever caller resumed `h`.
- **`bool`** keeps `h` suspended when `true`, or immediately resumes `h` when `false` (useful to close lock-free race windows).
- **`std::coroutine_handle<>`** triggers **symmetric transfer**: the compiler tail-calls `.resume()` on the returned handle (or `std::noop_coroutine()` to bounce back to the resumer) without pushing a new stack frame. Calling `continuation.resume()` inside a `void`-returning `await_suspend` consumes O(N) call stack frames across loops of `co_await` calls and risks stack overflow, whereas returning `continuation` runs in constant stack space.

> **Standardese.** Under `[expr.await]`, the coroutine state is already suspended *before* `await_suspend(h)` executes. If `await_suspend` hands `h` off to another thread pool or executor, that worker may resume and destroy `h` concurrently—so never touch `this`, `h.promise()`, or frame locals after publishing `h`.

## Lifetime hazards across suspension points

Because a suspended coroutine frequently outlives the full-expression that created it, two argument-passing idioms introduce silent dangling references:

First, **reference and view parameters**: if you declare `Task parse(const std::string& text)` or `Task parse(std::string_view text)` and call `auto t = parse(std::string("payload"));`, the coroutine frame stores a reference or pointer—not a copied `std::string`. At the semicolon, the temporary string is destroyed while `t` remains suspended, leaving a dangling handle on the first `resume()`. Asynchronous coroutines should accept owning values (`std::string`) in their parameter list.

Second, **lambda coroutine captures**: in `[x = 42]() -> Task { co_await std::suspend_always{}; use(x); }()`, captured `x` lives inside the lambda closure object, *not* in the coroutine's parameters. Only the closure's `this` pointer is copied into the coroutine frame. When the temporary lambda dies at the semicolon after returning `Task`, resuming `Task` reads a destroyed closure! Either keep the closure alive across the coroutine's entire lifetime or pass values as parameters to the lambda instead of capturing them.

> **Pitfall.** Coroutine frames copy or move declared function parameters, never the pointees behind `const T&`, `std::string_view`, `std::span`, or lambda captures. Any state read after a suspension point must be owned inside the frame or guaranteed to outlive the coroutine handle.

```cpp
#include <coroutine>
#include <string>

struct DemoTask {
    struct promise_type {
        DemoTask get_return_object() noexcept { return {}; }
        std::suspend_always initial_suspend() noexcept { return {}; }
        std::suspend_always final_suspend() noexcept { return {}; }
        void return_void() noexcept {}
        void unhandled_exception() {}
    };
};

// Safe: owns its own std::string inside the coroutine frame
DemoTask consume_owned(std::string payload) {
    co_await std::suspend_always{};
    (void)payload.size();
}

// Safe alternative for lambdas: pass captured data as an argument, not a capture
auto make_coro = [](int x) -> DemoTask {
    co_await std::suspend_always{};
    (void)x;
};
```

## C++23 std::generator and recursive co_yield

Writing a custom `promise_type` just to produce lazy sequences is verbose and error-prone. `co_yield expr` is pure syntax sugar for `co_await promise.yield_value(expr)`, and C++23 `<generator>` packages that pattern into `std::generator<Ref, V, Allocator>`, a standard synchronous `std::ranges::view` compatible with range pipelines.

Even better, C++23 `std::generator` solves the classic recursive-generator slowdown via `std::ranges::elements_of`. Yielding elements of a nested generator with a manual `for (auto x : child()) co_yield x;` loop incurs O(depth) trampoline hops on every yielded item. Calling `co_yield std::ranges::elements_of(child())` pushes the child coroutine onto an internal active-coroutine stack inside the root generator and transfers directly to the innermost leaf in O(1) per element.

```cpp
#include <generator>
#include <ranges>

std::generator<int> range_seq(int lo, int hi) {
    for (int i = lo; i < hi; ++i) {
        co_yield i;
    }
}

std::generator<int> chained_seq() {
    co_yield std::ranges::elements_of(range_seq(0, 3));
    co_yield std::ranges::elements_of(range_seq(10, 13));
}
```

Each promise customization hook maps cleanly to a distinct phase of the coroutine lifecycle:

| Customization Point | When Invoked | Key Invariant |
| --- | --- | --- |
| `initial_suspend()` | Right after `get_return_object()` | `suspend_always` builds lazy tasks; `suspend_never` runs eagerly |
| `final_suspend()` | After `return_*` or `unhandled_exception()` | Must be `noexcept`; suspending transfers `destroy()` ownership to caller |
| `await_transform(e)` | Before `operator co_await` on every `co_await e` | Lets promises intercept or wrap arbitrary awaited expressions |
| `yield_value(v)` | On every `co_yield v` | Lowers directly to `co_await promise.yield_value(v)` |
| `await_suspend(h)` | After `h` is suspended and `await_ready()` is false | Returning `coroutine_handle<>` triggers constant-stack symmetric transfer |

## What to remember

- A function is a coroutine solely because its body uses `co_await`, `co_yield`, or `co_return`; stackless frames store spilled locals without needing OS thread stacks.
- Make `final_suspend()` `noexcept` and suspend if an owning wrapper like `Task` later calls `handle.done()` or `handle.destroy()`.
- Prefer `std::coroutine_handle<>`-returning `await_suspend` for symmetric transfer so chained async continuations never overflow the call stack.
- Never touch `this`, `h.promise()`, or frame locals after handing `h` to another thread inside `await_suspend`, because the coroutine is already suspended and may finish concurrently.
- Pass asynchronous coroutine inputs by owning value—not `const T&`, `string_view`, or temporary lambda captures—and use C++23 `std::generator` with `std::ranges::elements_of` for synchronous lazy streams.
