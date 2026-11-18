---
title: "Senders and receivers (std::execution)"
summary: "C++26's std::execution describes asynchronous work as lazy sender values that complete on exactly one of three channels: value, error, or stopped. Algorithms compose senders, schedulers say where work runs, and nothing happens until a sender is connected to a receiver and started."
track: "cpp26"
minutes: 16
standard:
  - "[exec.async.ops]"
  - "[exec.recv]"
  - "[exec.opstate]"
  - "[exec.snd]"
  - "[exec.sched]"
  - "[exec.getcomplsigs]"
  - "[exec.then]"
  - "[exec.let]"
  - "[exec.when.all]"
  - "[exec.starts.on]"
  - "[exec.continues.on]"
  - "[exec.on]"
  - "[exec.sync.wait]"
  - "[exec.counting.scopes]"
  - "[exec.task]"
cppreference:
  - title: "Execution control library"
    path: "execution"
  - title: "std::execution::then"
    path: "execution/then"
  - title: "std::execution::let_value"
    path: "execution/let_value"
  - title: "std::execution::when_all"
    path: "execution/when_all"
  - title: "std::execution::on"
    path: "execution/on"
  - title: "std::stop_token"
    path: "thread/stop_token"
prerequisites:
  - "futures-promises-and-async"
  - "threads-and-jthread"
  - "coroutines"
  - "concepts-and-constraints"
  - "customization-points-and-niebloids"
---

## The one idea

A **sender** is a value that describes some asynchronous work but does not do it. You build bigger senders out of smaller ones with algorithms such as `then` and `when_all`, and the result is still just a description. Work starts only when a sender is **connected** to a **receiver**, which is the continuation that wants the result, and the resulting **operation state** is **started**. When the work finishes, it calls exactly one of three functions on the receiver: `set_value` with the results, `set_error` with one error, or `set_stopped` with nothing, meaning the work was cancelled.

That design replaces `std::future` for composable asynchrony. A future is eager: the work is already running, so the future needs a shared heap-allocated state and synchronization to hand the result over. A sender is lazy, so the whole pipeline can be assembled first, and the operation state can live in one object, often on the stack, with no allocation and no locks on the happy path.

This is C++26. The core is P2300R10, adopted in June 2024. C++26 also adds P3149R11 (async scopes, `spawn`, and `counting_scope`), P3552R3 (the `std::execution::task` coroutine type), P2079R10 (`parallel_scheduler`), P3175R3 (the reworked `on`), P3284R4 (`write_env` and `unstoppable`), P3481R5 (the three `bulk` variants), and P3557R3 (sender diagnostics computed with `constexpr` exceptions). P3187R1 removed `ensure_started` and `start_detached` from the design before it was adopted, and `split` is not in the final text either. Everything here follows N5050, the final C++26 draft sent to the international ballot. That ballot closed in October 2026 and was reported as not approved, so check the status before you quote this as published ISO C++.

No shipping standard library implements `<execution>`'s sender part yet. GCC 16's libstdc++ does not define `__cpp_lib_senders`, and Clang 21's libc++ does not either. The examples below are written against the N5050 names, and each was compiled and run with GCC 16 against NVIDIA's stdexec reference implementation by mapping `std::execution` to `stdexec`.

> **Mental model.** A sender is a recipe, a receiver is the plate it lands on, and `connect` plus `start` is cooking. The recipe can be copied, combined, and passed around, and no food exists until somebody starts the operation.

## The asynchronous operation contract

[exec.async.ops] states the rules that every sender, receiver, and algorithm relies on.

- An operation is started at most once, and once started it completes **exactly once**.
- It completes with one of three completion operations: a value completion with any number of arguments, an error completion with exactly one argument, or a stopped completion with none.
- The operation state must stay alive, at the same address, until the operation completes. Destroying it earlier is undefined behaviour, and library operation states cannot be copied or moved at all.
- A child operation completes before its parent does. That makes `std::execution` a **structured** concurrency model, in which lifetimes nest like function calls.

A sender advertises what it may complete with through its **completion signatures**, a type such as `completion_signatures<set_value_t(int), set_error_t(std::error_code), set_stopped_t()>`. Algorithms compute their own completion signatures from those of their children at compile time. That is how `when_all` knows what to pass on, and how `sync_wait` knows its return type. In C++26, a sender computes these with a `static consteval` member function template, and an invalid combination throws an exception during constant evaluation. That is how P3557 makes the diagnostics readable.

```text
  sender ──connect(receiver)──► operation state ──start()──► work runs
                                                               │
                         exactly one of: set_value(rcvr, vs...)
                                         set_error(rcvr, e)
                                         set_stopped(rcvr)
```

> **Standardese.** [exec.opstate.general] says that if an `operation_state` object is destroyed during the lifetime of its asynchronous operation, the behaviour is undefined. It also makes a program ill-formed if it copies or moves an operation state created by connecting a library-provided sender.

## Composing with algorithms

Sender factories start a chain: `just(vs...)` completes with values, `just_error(e)` with an error, `just_stopped()` with a stop, and `schedule(sch)` completes on a scheduler's execution resource. Sender adaptors take a sender and return a new one, and each has a pipeable form, so `s | then(f)` means `then(s, f)`.

- `then(f)` calls `f` with the values and sends its result as a value. `upon_error(f)` and `upon_stopped(f)` do the same for the other two channels, turning them back into values.
- `let_value(f)` calls `f` with the values, and `f` returns a *sender*. That sender is connected and started, and its completion becomes the completion of the whole thing. This is the monadic bind, and it is how you write "then do this asynchronous thing next". `let_error` and `let_stopped` exist too.
- `when_all(s1, s2, ...)` starts all of its children and completes with all of their values concatenated. If any child fails or is stopped, it asks the others to stop and forwards the first error or the stop.
- `into_variant`, `stopped_as_optional`, and `stopped_as_error` reshape completions. `bulk`, `bulk_chunked`, and `bulk_unchunked` run a function over an index range.

A sender consumer finally runs the chain. `std::this_thread::sync_wait(s)` connects `s` to its own receiver, starts it, and blocks the calling thread until it completes.

```cpp
#include <execution>
#include <cstdio>

namespace ex = std::execution;

int main() {
  bool ran = false;
  ex::sender auto work =
      ex::when_all(ex::just(1), ex::just(2.5))
    | ex::then([&](int i, double d) { ran = true; return i + d; })
    | ex::let_value([](double sum) { return ex::just(sum * 2); });

  std::printf("%d\n", ran);                         // prints 0: nothing has run yet
  auto [result] = std::this_thread::sync_wait(std::move(work)).value();
  std::printf("%d %.1f\n", ran, result);            // prints 1 7.0
}
```

`sync_wait` returns `std::optional<std::tuple<Values...>>`. A value completion produces an engaged optional, and a stopped completion produces an empty one. An error is thrown: an `exception_ptr` is rethrown as is, an `error_code` is thrown as `std::system_error`, and any other error type is thrown as itself. `sync_wait` requires the sender to have **exactly one** value completion signature, because otherwise it could not name a single tuple type. `sync_wait(just_stopped())` is therefore ill-formed, and so is a sender that might send either an `int` or a `string`. `sync_wait_with_variant` handles that case.

> **Pitfall.** `then` with a callable that returns a sender does not run that sender. It sends the sender object as a value, so the result type of `sync_wait(just() | then([] { return just(42); }))` holds a sender, not an `int`. Use `let_value` whenever the callable returns more work.

## A sender by hand

Writing a sender shows how little machinery there is. This one completes on a different channel depending on its input.

```cpp
#include <execution>
#include <cstdio>
#include <system_error>
#include <utility>

namespace ex = std::execution;

struct parse_sender {
  using sender_concept = ex::sender_tag;
  int input;

  template <class Self, class... Env>
  static consteval auto get_completion_signatures() {
    return ex::completion_signatures<ex::set_value_t(int),
                                     ex::set_error_t(std::error_code),
                                     ex::set_stopped_t()>{};
  }

  template <class Rcvr>
  struct op {
    using operation_state_concept = ex::operation_state_tag;
    Rcvr rcvr;
    int input;
    void start() & noexcept {
      if (input > 0)       ex::set_value(std::move(rcvr), input * 2);
      else if (input == 0) ex::set_stopped(std::move(rcvr));
      else ex::set_error(std::move(rcvr), std::make_error_code(std::errc::invalid_argument));
    }
  };

  template <class Rcvr>
  op<Rcvr> connect(Rcvr rcvr) && { return {std::move(rcvr), input}; }
};

int main() {
  auto r1 = std::this_thread::sync_wait(parse_sender{21});   // optional<tuple<int>> holding 42
  auto r2 = std::this_thread::sync_wait(parse_sender{0});    // empty optional: stopped
  std::printf("%d %d\n", std::get<0>(*r1), r2.has_value());  // prints 42 0
  try {
    std::this_thread::sync_wait(parse_sender{-1});
  } catch (const std::system_error&) {                       // the error_code arrives as system_error
    std::puts("invalid argument");
  }
}
```

The completion functions are `noexcept`, and `start` is too. Errors travel through `set_error`, not through exceptions thrown out of `start`. The operation state holds the receiver by value. Because `sync_wait` keeps the operation state on its own stack frame until completion, nothing here is heap-allocated.

## Where work runs: schedulers

A **scheduler** is a lightweight handle to an execution resource such as a thread pool, an event loop, or a GPU stream. Its only required operation is `schedule(sch)`, which returns a sender that completes on that resource. Standard schedulers include `run_loop`'s scheduler (the loop `sync_wait` drives), `inline_scheduler`, `task_scheduler` (a type-erased scheduler), and `parallel_scheduler`, obtained from `get_parallel_scheduler()`, which guarantees parallel forward progress and has a replaceable backend.

Three adaptors move work between schedulers, and they differ in where the **continuation** runs:

| Adaptor | Starts the work on | Code after it runs on |
| --- | --- | --- |
| `starts_on(sch, s)` | `sch` | wherever `s` completed, normally `sch` |
| `s \| continues_on(sch)` | wherever `s` starts | `sch` |
| `on(sch, s)` | `sch` | the scheduler the whole operation was started on |

`on` is the one to reach for when you want to "run this over there and come back". It finds that resource through the receiver's environment, so under `sync_wait` it returns to the `run_loop` on the waiting thread.

```cpp
#include <execution>
#include <thread>

namespace ex = std::execution;

bool continuation_on_caller(ex::scheduler auto pool, bool use_on) {
  auto caller = std::this_thread::get_id();
  auto here = [caller] { return std::this_thread::get_id() == caller; };
  if (use_on) {
    auto [b] = std::this_thread::sync_wait(ex::on(pool, ex::just()) | ex::then(here)).value();
    return b;                          // true: on() transferred back to sync_wait's run_loop
  }
  auto [b] = std::this_thread::sync_wait(ex::starts_on(pool, ex::just()) | ex::then(here)).value();
  return b;                            // false when pool is a thread pool: then ran on the pool
}
```

Algorithms ask a sender's attributes and a receiver's environment for things like the completion scheduler, the stop token, and an allocator, through queries such as `get_completion_scheduler<set_value_t>`, `get_stop_token`, and `get_allocator`. `read_env(q)` is a sender that completes with the value of query `q` in the current environment, and `write_env(s, env)` changes the environment seen by `s`.

## Cancellation and structured lifetimes

Cancellation is cooperative. A receiver's environment carries a stop token. An operation that can be cancelled checks it or registers a callback, and when stop is requested it completes with `set_stopped`. `when_all` gives its children an `inplace_stop_token` of its own, and requests stop on it as soon as one child fails. `unstoppable(s)` hides the stop token from `s`.

Because every operation completes exactly once and children finish before parents, there is no "fire and forget" in the core model. Work that should outlive the current scope must be **associated** with an async scope. A `counting_scope` counts the operations associated with it. `spawn(s, scope.get_token())` starts `s` eagerly inside the scope, and `spawn_future` does the same but returns a sender for the result. `scope.join()` is a sender that completes when every associated operation has finished. This is what replaced `start_detached` and `ensure_started`, which let work escape without anybody waiting for it.

> **Pitfall.** Destroying a `counting_scope` that has been used but not joined calls `std::terminate`, even if its operations happen to have finished. Before it goes out of scope, `close()` it and wait for `scope.join()`, with `sync_wait` or `co_await`.

Coroutines integrate in both directions. Inside a coroutine whose promise uses `with_awaitable_senders`, `co_await s` suspends until `s` completes and produces its value. An error is thrown, and a stop ends the coroutine without resuming it. `std::execution::task<T>`, from P3552, is a lazy coroutine type that is itself a sender. Its default error completion is `set_error_t(std::exception_ptr)`, it carries an `inplace_stop_token`, and by default it resumes on the scheduler it was started on.

## What is available today

| Implementation | Status |
| --- | --- |
| GCC 16 libstdc++ | No sender support. `__cpp_lib_senders` is not defined. |
| Clang 21 libc++ | No sender support. |
| NVIDIA stdexec | Reference implementation in namespace `stdexec`, tracking the draft closely. |
| Beman `execution` and `task` | Implementations of the C++26 wording from the Beman project. |

The tested stdexec revision differs from N5050 in small ways. Its `sync_wait` lives in `stdexec`, not in `std::this_thread`. Its `exec` namespace still provides `ensure_started`, `start_detached`, and `split` as extensions, along with `exec::static_thread_pool`. None of the code on this page uses those extensions.

## What to remember

- Senders are lazy descriptions. Nothing runs until `connect` and `start`, usually done for you by `sync_wait`, `spawn`, or `co_await`.
- Every operation completes exactly once, on one of three channels: value (any number of arguments), error (exactly one), or stopped (none).
- The operation state must outlive the operation, and destroying it early is undefined behaviour.
- `then` maps values to a value, and `let_value` maps values to a new sender that it runs. Returning a sender from `then` does not run it.
- `sync_wait` needs exactly one value signature. It returns `optional<tuple<...>>`, gives an empty optional when stopped, and throws on error, turning an `error_code` into `system_error`.
- `starts_on` changes where work begins, `continues_on` changes where the continuation runs, and `on` goes over and comes back.
- Detached work goes through an async scope such as `counting_scope`. `ensure_started` and `start_detached` are gone.
- GCC 16 and Clang 21 do not ship it. Use stdexec or Beman.
