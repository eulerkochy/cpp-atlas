---
title: "Coroutine library and generators"
summary: "The <coroutine> header gives you a raw, non-owning handle to a coroutine frame and two trivial awaiters, and everything else is yours to build. This page builds a minimal generator and a minimal task on top of those pieces, then shows what C++23's std::generator does for you and where its lifetimes still bite."
track: "concurrency"
minutes: 15
standard:
  - "[coroutine.handle]"
  - "[coroutine.handle.resumption]"
  - "[coroutine.handle.observers]"
  - "[coroutine.noop]"
  - "[coroutine.trivial.awaitables]"
  - "[coro.generator]"
  - "[coro.generator.promise]"
  - "[range.elementsof]"
  - "[stmt.ranged]"
cppreference:
  - title: "std::coroutine_handle"
    path: "coroutine/coroutine_handle"
  - title: "std::coroutine_handle::resume"
    path: "coroutine/coroutine_handle/resume"
  - title: "std::coroutine_handle::done"
    path: "coroutine/coroutine_handle/done"
  - title: "std::noop_coroutine"
    path: "coroutine/noop_coroutine"
  - title: "std::suspend_always"
    path: "coroutine/suspend_always"
  - title: "std::generator"
    path: "coroutine/generator"
  - title: "std::generator::begin"
    path: "coroutine/generator/begin"
  - title: "std::ranges::elements_of"
    path: "ranges/elements_of"
prerequisites:
  - "coroutines"
  - "ranges-and-views"
  - "raii-and-resource-management"
---

## The one idea

The language part of coroutines, covered in the coroutines topic, decides *when* a function suspends and which promise methods run. The library part is small: a handle type that points at a coroutine frame, a way to get from the promise to the handle and back, a coroutine that does nothing, and two awaiters that always or never suspend. Generators, tasks and schedulers are ordinary classes that wrap a handle and manage its lifetime by hand.

> **Mental model.** A `std::coroutine_handle` is to a coroutine frame what a raw pointer is to a heap object. It is copyable, does not own anything, and every operation on it has a precondition about the state of the thing it points to. A return object such as a generator is the `unique_ptr` around it: it destroys the frame exactly once and is therefore move-only.

## coroutine_handle and its preconditions

`std::coroutine_handle<Promise>` knows the promise type and can reach the promise; `std::coroutine_handle<void>`, also spelled `std::coroutine_handle<>`, is the type-erased form that any typed handle converts to implicitly. Only the typed form has `promise()` and the static `from_promise(p)`, which recovers the handle from a reference to the promise. That is how `get_return_object` usually builds the return object. Both forms have `address()` and `from_address()` for passing the frame through C APIs as a `void*`, plus comparison and hashing. A default-constructed handle is null.

| Call | Precondition | If violated |
|---|---|---|
| `resume()` or `h()` | refers to a suspended coroutine not at its final suspend point | undefined behavior |
| `destroy()` | refers to a suspended coroutine, at any suspension point | undefined behavior |
| `done()` | refers to a suspended coroutine | undefined behavior |
| `promise()` | refers to a coroutine that has not been destroyed | undefined behavior |
| `from_promise(p)` | `p` is a reference to the promise object of a coroutine | undefined behavior |

`done()` returns true exactly when the coroutine is suspended at its final suspend point. It cannot tell you that a frame has been destroyed, because a destroyed frame no longer satisfies the precondition. If `final_suspend` does not suspend, the frame destroys itself when the body ends, and every copy of the handle becomes dangling at that moment. A handle-based design therefore almost always suspends at the final point and lets the owner call `destroy()`.

Resuming a coroutine from another thread is allowed; the handle is just an address. But two threads must never resume the same coroutine concurrently, and a resumer must not race with the owner's `destroy()`. Those are your synchronization problems, not the library's.

## noop_coroutine and the trivial awaitables

`std::noop_coroutine()` returns a `std::noop_coroutine_handle`, a handle to a coroutine that does nothing. Its `resume()` and `destroy()` have no effect, `done()` always returns false, and it converts to `std::coroutine_handle<>`. Its main use is as the "nothing to resume" value in symmetric transfer: an `await_suspend` that returns `std::noop_coroutine()` hands control back to whoever resumed the current coroutine.

```cpp
#include <coroutine>
#include <cstdio>

int main() {
  auto n = std::noop_coroutine();
  n.resume();                          // no effect
  n.destroy();                         // no effect
  std::printf("%d\n", n.done());       // prints 0, always
  std::coroutine_handle<> h = n;       // converts like any typed handle
  (void)h;
}
```

`std::suspend_always` and `std::suspend_never` are empty structs whose `await_ready` returns false and true respectively, with empty `await_suspend` and `await_resume`. All their members are `constexpr` and `noexcept`, which matters because `final_suspend` must not be potentially-throwing.

> **Standardese.** [coroutine.noop] says handles returned by different calls to `noop_coroutine` may or may not compare equal. Do not use `h == std::noop_coroutine()` as a test for "is this the no-op handle"; keep a flag or compare against a stored copy.

## A minimal generator, step by step

A generator needs four decisions. It suspends initially, so nothing runs until the consumer asks. Its `yield_value` stores the value in the promise and suspends. It suspends finally, so `done()` remains callable. Its owner destroys the frame. Exceptions are captured in `unhandled_exception` and rethrown to the consumer.

```cpp
#include <coroutine>
#include <cstdio>
#include <exception>
#include <utility>

template <class T>
class Gen {
public:
  struct promise_type {
    T value;
    std::exception_ptr error;
    Gen get_return_object() {
      return Gen{std::coroutine_handle<promise_type>::from_promise(*this)};
    }
    std::suspend_always initial_suspend() noexcept { return {}; }   // lazy start
    std::suspend_always final_suspend() noexcept { return {}; }     // keep frame for done()
    std::suspend_always yield_value(T v) { value = std::move(v); return {}; }
    void return_void() {}
    void unhandled_exception() { error = std::current_exception(); }
  };

  explicit Gen(std::coroutine_handle<promise_type> h) : h_(h) {}
  Gen(Gen&& o) noexcept : h_(std::exchange(o.h_, {})) {}
  Gen& operator=(Gen) = delete;
  ~Gen() { if (h_) h_.destroy(); }    // destroy works at any suspension point

  bool next() {                       // advance; false when finished
    h_.resume();
    if (h_.promise().error) std::rethrow_exception(h_.promise().error);
    return !h_.done();
  }
  const T& value() const { return h_.promise().value; }

private:
  std::coroutine_handle<promise_type> h_;
};

Gen<int> count_to(int n) {
  for (int i = 1; i <= n; ++i) co_yield i;
}

int main() {
  auto g = count_to(3);
  while (g.next()) std::printf("%d\n", g.value());   // 1 2 3
}
```

Calling `next()` again after it has returned false would resume a coroutine at its final suspend point, which is undefined behavior; a production generator guards against it. Stopping the loop early is fine, because the destructor destroys the suspended frame and runs the destructors of whatever locals were live at the `co_yield`. This design requires `T` to be default-constructible and copies every value into the promise; `std::generator` avoids both by storing a pointer to the yielded object instead.

## A minimal task with symmetric transfer

A task is a lazy coroutine that produces one value and resumes whoever awaited it. The awaiting side stores its own handle as the continuation and returns the child's handle, so starting the child is a transfer rather than a nested call. At the end, the child's final awaiter returns the continuation, which is `std::noop_coroutine()` if nobody is waiting.

```cpp
#include <coroutine>
#include <cstdio>
#include <exception>
#include <optional>
#include <utility>

template <class T>
class Task {
public:
  struct promise_type {
    std::optional<T> result;
    std::exception_ptr error;
    std::coroutine_handle<> continuation = std::noop_coroutine();

    Task get_return_object() {
      return Task{std::coroutine_handle<promise_type>::from_promise(*this)};
    }
    std::suspend_always initial_suspend() noexcept { return {}; }

    struct FinalAwaiter {
      bool await_ready() noexcept { return false; }
      std::coroutine_handle<> await_suspend(std::coroutine_handle<promise_type> h) noexcept {
        return h.promise().continuation;      // resume the awaiter as a tail call
      }
      void await_resume() noexcept {}
    };
    FinalAwaiter final_suspend() noexcept { return {}; }

    void return_value(T v) { result.emplace(std::move(v)); }
    void unhandled_exception() { error = std::current_exception(); }
  };

  bool await_ready() const noexcept { return false; }
  std::coroutine_handle<> await_suspend(std::coroutine_handle<> awaiting) noexcept {
    h_.promise().continuation = awaiting;
    return h_;                                 // start the child
  }
  T await_resume() {
    if (h_.promise().error) std::rethrow_exception(h_.promise().error);
    return std::move(*h_.promise().result);
  }

  T run() {                // for a non-coroutine caller, when the chain completes synchronously
    h_.resume();
    return await_resume();
  }

  explicit Task(std::coroutine_handle<promise_type> h) : h_(h) {}
  Task(Task&& o) noexcept : h_(std::exchange(o.h_, {})) {}
  ~Task() { if (h_) h_.destroy(); }

private:
  std::coroutine_handle<promise_type> h_;
};

Task<int> leaf(int x) { co_return x * 2; }
Task<int> parent() {
  int a = co_await leaf(10);
  int b = co_await leaf(a);
  co_return a + b;
}

int main() { std::printf("%d\n", parent().run()); }   // 60
```

The awaited `leaf(10)` is a temporary that lives until the end of the full-expression containing the `co_await`, which spans the whole suspension, so the child frame is still alive when `await_resume` reads its result. A real task library adds an executor, cancellation and a blocking `sync_wait`; `run()` here only works because nothing ever suspends waiting for an outside event.

## std::generator in C++23

`std::generator<Ref, V = void, Allocator = void>` in `<generator>` is a finished generator that is also a range. With the defaults, `generator<T>` has value type `remove_cvref_t<T>` and reference type `T&&`, so `generator<int>` yields `int&&`. A loop written `for (int& x : gen())` is therefore ill-formed; use a value or `auto&&`. To yield references without copies, name the reference type: `generator<const std::string&>` yields `const std::string&` and has value type `std::string`.

Yielding a prvalue binds it to the reference and suspends with the temporary still alive, so nothing is copied. Yielding an lvalue to a generator whose reference type is an rvalue reference copies it into the awaiter, which is the one case where `std::generator` makes a copy.

`co_yield std::ranges::elements_of(r)` yields every element of `r`. When `r` is another `std::generator` with the same yielded type, the inner generator is resumed directly through symmetric transfer, so recursive generators do not stack an iteration loop per level. For any other range, the elements' reference type must convert to the generator's yielded type, which surprises people with `generator<int>`.

```cpp
#include <generator>
#include <ranges>
#include <vector>

struct Node { int v; Node* l; Node* r; };

std::generator<int> inorder(const Node* n) {
  if (!n) co_return;
  co_yield std::ranges::elements_of(inorder(n->l));   // nested generator: direct transfer
  co_yield n->v;
  co_yield std::ranges::elements_of(inorder(n->r));
}

std::generator<int> evens() {
  std::vector<int> v{0, 2, 4};
  // co_yield std::ranges::elements_of(v);            // ill-formed: int& does not convert to int&&
  co_yield std::ranges::elements_of(v | std::views::as_rvalue);   // OK
}
```

A `std::generator` is a move-only `view` that models `input_range` only: it is not copyable, not a forward range, not sized and not common. `begin()` resumes the coroutine for the first time, and its precondition is that the coroutine is still at its initial suspend point, so calling `begin()` twice, including by iterating the same generator in two loops, is undefined behavior.

For allocation, a generator coroutine may take `std::allocator_arg_t` and an allocator as its first two parameters, and the promise's `operator new` uses that allocator for the frame. With `Allocator = void`, any allocator can be passed this way and is stored type-erased in the frame; with a concrete `Allocator`, only allocators convertible to it are accepted.

> **Pitfall.** GCC 16's libstdc++ ships `std::generator`, but Clang 21's libc++ does not yet have the header, so portable code may still need a fallback such as the hand-written generator above.

## Lifetime pitfalls with range-for

A generator taking a reference parameter keeps only the reference. When the generator object is stored in a variable, any temporary argument dies at the end of that declaration, before the body runs:

```cpp
#include <generator>
#include <string>

std::generator<char> chars(const std::string& s) { for (char c : s) co_yield c; }

void demo() {
  auto g = chars(std::string("hello"));     // the string dies here
  for (char c : g) (void)c;                 // undefined behavior

  for (char c : chars(std::string("hello"))) (void)c;   // OK since C++23
}
```

The second loop is safe only because of P2718, adopted for C++23: temporaries created in a range-for initializer now live until the end of the loop. Before C++23 that loop dangled too. The rule covers only the initializer of the loop itself, not a generator object created earlier, and GCC 16 applies it in `-std=c++23` mode, where `-fno-range-for-ext-temps` turns it off and AddressSanitizer then reports the use after scope. The safe habit has not changed: take generator parameters by value, or make sure the referent outlives the generator object.

> **Pitfall.** Range adaptors do not change any of this. Piping `chars(std::string("x")) | std::views::take(2)` into a loop is covered by the C++23 extension, but storing the pipeline in a variable first is not.

## What to remember

- `coroutine_handle` is a non-owning pointer to a frame; `resume`, `destroy`, `done` and `promise` all require a suspended, still-existing coroutine.
- `done()` is true only at the final suspend point, so suspend there if anyone will ask; resuming from there is undefined behavior.
- `noop_coroutine()` handles do nothing when resumed or destroyed, report `done() == false`, and need not compare equal to each other.
- `suspend_always` and `suspend_never` are constexpr, noexcept trivial awaiters.
- A generator suspends initially and finally, stores or points to the yielded value, and owns the handle as a move-only RAII type.
- A task stores its awaiter as a continuation and uses handle-returning `await_suspend` for both start and finish.
- `std::generator<T>` yields `T&&`; use `generator<const T&>` to yield references, and `elements_of` for nested generators.
- `elements_of` on a non-generator range needs its reference type to convert to the yielded type.
- `std::generator` is a move-only input view; calling `begin()` twice is undefined behavior.
- C++23 extends temporaries in a range-for initializer, but not for a generator stored in a variable first.
