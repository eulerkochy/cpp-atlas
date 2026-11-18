---
title: "Callable wrappers"
summary: "std::function, move_only_function, copyable_function and function_ref are four answers to the question of how to store or pass a callable of unknown type. They differ in ownership, copyability and in whether the call signature can say const, noexcept or a reference qualifier. The invoke rules and the binders sit underneath all of them."
track: "utilities"
minutes: 15
standard:
  - "[func.def]"
  - "[func.require]"
  - "[func.invoke]"
  - "[func.bind]"
  - "[func.bind.partial]"
  - "[func.memfn]"
  - "[func.not.fn]"
  - "[refwrap]"
  - "[func.wrap]"
cppreference:
  - title: "std::function"
    path: "utility/functional/function"
  - title: "std::move_only_function"
    path: "utility/functional/move_only_function"
  - title: "std::copyable_function"
    path: "utility/functional/copyable_function"
  - title: "std::function_ref"
    path: "utility/functional/function_ref"
  - title: "std::invoke"
    path: "utility/functional/invoke"
  - title: "std::bind"
    path: "utility/functional/bind"
  - title: "std::bind_front, std::bind_back"
    path: "utility/functional/bind_front"
  - title: "std::reference_wrapper"
    path: "utility/functional/reference_wrapper"
  - title: "std::mem_fn"
    path: "utility/functional/mem_fn"
  - title: "std::not_fn"
    path: "utility/functional/not_fn"
prerequisites:
  - "lambdas"
  - "copy-and-move"
  - "forwarding-references-and-perfect-forwarding"
---

## The one idea

Every lambda has its own unnamed type, so two lambdas with the same signature cannot be stored in the same variable. A function template can accept any of them, but a data member, a container element or a virtual function signature needs one fixed type. A callable wrapper is that type. It erases the concrete callable type and keeps only the call signature, at the price of an indirect call and, sometimes, an allocation.

> **Mental model.** A wrapper is a small object holding a pointer to a type-specific table of functions (call, copy, move, destroy) and the callable itself. The four standard wrappers differ in which of those operations they support, and who owns the callable.

| Wrapper | Owns the callable | Copyable | Signature can carry | Standard |
| --- | --- | --- | --- | --- |
| `function` | yes | yes, so target must be copyable | return and parameters only | C++11 |
| `move_only_function` | yes | no, move only | `const`, `&`, `&&`, `noexcept` | C++23 |
| `copyable_function` | yes | yes | `const`, `&`, `&&`, `noexcept` | C++26 |
| `function_ref` | no, it refers | yes, trivially | `const`, `noexcept` | C++26 |

## std::function

`std::function<R(Args...)>` stores a copy of any callable that is copy constructible and invocable with those arguments, converting the result to `R`. It is copyable itself, which is exactly why the target must be copyable: a `std::function` holding a lambda that captured a `unique_ptr` does not compile.

An empty `function` (default constructed, or constructed from a null function pointer) throws `bad_function_call` when called, and converts to `false`.

```cpp
#include <functional>
#include <cstdio>

int main() {
  std::function<void()> f;
  try { f(); } catch (const std::bad_function_call&) { std::puts("empty"); }

  std::function<int()> counter = [n = 0]() mutable { return ++n; };
  const auto& view = counter;                    // a const reference to the wrapper
  std::printf("%d %d\n", view(), view());        // 1 2: the mutable lambda changed state
}
```

The second half of that program is the const-correctness hole. `function::operator()` is `const`, yet it calls the stored object as a non-const lvalue, so a `mutable` lambda mutates through a const reference. Nothing in the type warns you, and concurrent calls through const references race on the target even though every handle looks const.

The standard does not require `function` to avoid heap allocation for small targets. It only says implementations are encouraged to avoid it for small callables, and guarantees no exceptions when constructing from a function pointer or a `reference_wrapper`. Real libraries keep a small inline buffer of a few pointers; how large it is differs between them, so a lambda that captures a lot may allocate on one library and not on another.

`target<T>()` returns a pointer to the held object if its type is exactly `T`, and null otherwise. It is rarely worth using; if you need to know what is inside, a wrapper is the wrong tool.

## move_only_function and the qualified signature

C++23 added `std::move_only_function` for the cases `function` rejects. It owns a callable that may be move only, such as a lambda holding a `unique_ptr`, and the wrapper itself can only be moved. It also fixes the hole: the cv-qualifiers, ref-qualifier and `noexcept` of the signature become those of its `operator()`, and the stored callable must be invocable with exactly that qualification.

```cpp
#include <functional>
#include <memory>
#include <cstdio>

int main() {
  auto p = std::make_unique<int>(4);
  std::move_only_function<int()> a = [p = std::move(p)] { return *p; };   // OK: move only target
  std::printf("%d\n", a());

  std::move_only_function<int() const> b = [] { return 1; };              // OK: callable const
  // std::move_only_function<int() const> c = [n = 0]() mutable { return ++n; };
  //   ill-formed: a mutable lambda is not invocable as const
  std::printf("%d\n", b());
}
```

Calling an empty `move_only_function` is undefined behavior, not an exception, so test it before calling when it can be empty. It is also the right wrapper for a task queue: queue elements are invoked once and moved, never copied.

> **Standardese.** In [func.wrap], the signature template parameter of `move_only_function` is `R(Args...) cv ref noexcept(noex)`. The target must be invocable with that qualification: with a `const` in the signature it is called as a const object, with `&` as an lvalue, with `&&` as an rvalue, and with no ref-qualifier it must work as both an lvalue and an rvalue. The wrapper's own `operator()` carries the same qualifiers.

### C++26: copyable_function and function_ref

`std::copyable_function` is `move_only_function` with copyability: same signature qualifiers, same undefined behavior when empty, but the target must be copy constructible, and the wrapper is copyable. It replaces `function` where you want the const-correct signature.

`std::function_ref` is a non-owning view of a callable: trivially copyable, typically two pointers in size, and it never allocates. It suits a parameter that is only used during the call. The danger is the same as for `string_view`: if the referenced callable dies first, the call is undefined behavior, and binding it to a temporary lambda and keeping it past the statement is the classic mistake.

```cpp
#include <functional>
#include <cstdio>

#if defined(__cpp_lib_function_ref)
int apply_twice(std::function_ref<int(int)> f, int x) { return f(f(x)); }
#else
template <class F> int apply_twice(F f, int x) { return f(f(x)); }
#endif

int main() {
  int k = 5;
  std::printf("%d\n", apply_twice([&](int a) { return a + k; }, 1));  // 11
}
```

Both are C++26 library features. GCC 16 provides them in `-std=c++26` mode, while the libc++ shipped with the Clang used to cross-check this page does not yet, so check your library.

## std::invoke and the INVOKE rules

Every wrapper, `std::thread`, `std::apply` and the binders define what it means to call something by a single rule, called INVOKE. For an ordinary callable, it is just `f(args...)`. For a pointer to member, the first argument is the object, which may be given as an object, a reference, a pointer or smart pointer, or a `reference_wrapper`.

```cpp
#include <functional>
#include <memory>
#include <cstdio>

struct S {
  int val = 3;
  int add(int a) const { return a + val; }
};

int main() {
  S s;
  std::printf("%d %d %d\n",
    std::invoke(&S::add, s, 1),                // member function on an object
    std::invoke(&S::add, &s, 2),               // ... on a pointer
    std::invoke(&S::val, std::ref(s)));        // data member through reference_wrapper
  static_assert(std::is_same_v<std::invoke_result_t<int S::*, S>, int&&>);   // rvalue object
}
```

A pointer to a data member behaves like a function from object to member, and the value category follows the object: invoked on an rvalue it gives an rvalue reference, on a const lvalue a const lvalue reference. `std::invoke_r` (C++23) additionally converts the result. Generic code that calls user callables should use `std::invoke`, since `f(args...)` fails for member pointers.

## bind, bind_front, bind_back and lambdas

`std::bind` copies the callable and the bound arguments, and `_1`, `_2` placeholders select the call arguments. Bound arguments are stored by decay copy: `std::ref` is how you ask for a reference. Extra call arguments are silently discarded, and a nested bind expression as an argument is itself evaluated.

```cpp
#include <functional>
#include <cstdio>

int sub(int a, int b) { return a - b; }

int main() {
  using namespace std::placeholders;
  int x = 1;
  auto by_value = std::bind(sub, x, 0);
  auto by_ref   = std::bind(sub, std::ref(x), 0);
  x = 5;
  std::printf("%d %d\n", by_value(), by_ref());       // 1 5
  std::printf("%d\n", std::bind(sub, _2, _1)(1, 10)); // 9: sub(10, 1)
}
```

`bind_front(f, args...)` and `bind_back(f, args...)` (C++20 and C++23) bind only leading or trailing arguments, forward everything else, and propagate the callable's noexcept-ness and value categories. They have no placeholders, no nested-bind magic, and no silent argument dropping. With `bind_front(sub, 10)(3)` giving `sub(10, 3)` and `bind_back(sub, 10)(3)` giving `sub(3, 10)`.

Prefer a lambda over all of them. A lambda says what it captures, works with overloaded names and templates, and is visible to the optimizer. `bind` struggles with overloaded functions, because the name does not pick an overload by itself. Reach for `bind_front` when you really need partial application of a callable you do not want to wrap, and for `bind` mainly in legacy code.

## reference_wrapper, mem_fn and not_fn

`std::reference_wrapper<T>` is a copyable, assignable object that refers to a `T`. Unlike a built-in reference, assignment *rebinds* it. `std::ref` and `std::cref` create one, and it is callable when `T` is.

```cpp
#include <functional>
#include <cstdio>

int main() {
  int a = 1, b = 2;
  std::reference_wrapper<int> r = a;
  r = b;                              // rebinds r to b; a is unchanged
  r.get() = 7;                        // writes b
  std::printf("%d %d\n", a, b);       // 1 7
}
```

`std::mem_fn(&S::add)` turns a member pointer into an ordinary callable object taking the object as its first argument, which is mostly useful when an API expects a plain callable and you have only a member pointer. `std::not_fn(f)` returns a callable that negates the result of `f` and forwards the arguments, replacing the removed `not1` and `not2`.

## Cost model

A call through any wrapper is an indirect call that the compiler usually cannot inline, so it costs a few nanoseconds and breaks optimization across the boundary. Constructing a `function`, `move_only_function` or `copyable_function` may allocate if the target does not fit the library's inline buffer; `function_ref` never allocates. A template parameter `F&&` has no wrapper cost at all but instantiates code per callable and cannot be stored in a member of fixed type.

A workable rule: take a template parameter or `function_ref` for a callable used during the call, store a `move_only_function` for a callable you keep, and use `function` or `copyable_function` only when the stored object must be copied.

## What to remember

- A wrapper erases the callable's type and keeps its signature, at the cost of an indirect call and a possible allocation.
- `std::function` requires a copyable target, throws `bad_function_call` when empty, and its `const operator()` can still mutate a `mutable` target.
- `move_only_function` (C++23) accepts move-only targets and puts `const`, `&`, `&&` and `noexcept` in the signature; calling it empty is undefined behavior.
- `copyable_function` and `function_ref` are C++26; the second is a non-owning view and can dangle.
- INVOKE handles member pointers with objects, pointers and `reference_wrapper`; generic code should call `std::invoke`.
- `bind` stores decayed copies, so use `std::ref` for references; `bind_front` and `bind_back` have no placeholders; a lambda is usually clearer.
- `reference_wrapper` rebinds on assignment.
