---
title: "Exceptions and stack unwinding"
summary: "A throw creates an exception object in special storage, searches outward for the first handler whose type matches under a short list of rules, and destroys every automatic object on the way. When no handler matches, std::terminate runs, and whether anything was unwound first is up to the implementation."
track: "errors"
minutes: 13
standard:
  - "[except.pre]"
  - "[except.throw]"
  - "[except.ctor]"
  - "[except.handle]"
  - "[except.terminate]"
  - "[except.uncaught]"
  - "[propagation]"
  - "[except.nested]"
cppreference:
  - title: "Exceptions"
    path: "language/exceptions"
  - title: "throw expression"
    path: "language/throw"
  - title: "Handling exceptions (catch)"
    path: "language/catch"
  - title: "try block"
    path: "language/try"
  - title: "std::terminate"
    path: "error/terminate"
  - title: "std::exception_ptr"
    path: "error/exception_ptr"
  - title: "std::nested_exception"
    path: "error/nested_exception"
  - title: "std::uncaught_exceptions"
    path: "error/uncaught_exception"
prerequisites:
  - "raii-and-resource-management"
  - "inheritance-and-virtual-functions"
---

## The one idea

A `throw` does three separate things. It creates an **exception object**, a fresh object whose type is the static type of the operand. It then searches the dynamically enclosing `try` blocks, innermost first, for a handler whose type matches that object. Finally, if a handler is found, it **unwinds** the stack to that handler, destroying every automatic object whose scope is being left, and enters the handler.

Almost every surprise comes from forgetting that these are separate. The handler you write receives the exception object, not your operand. Matching ignores the conversions you would expect in a function call. And unwinding is only promised if a handler is actually found.

> **Mental model.** Throwing copies your operand into a hidden object. Catch clauses are tried top to bottom with a much stricter notion of "fits" than overload resolution. Destructors run on the way out only once a match is known to exist.

## The exception object and where it lives

The exception object is copy-initialized from the operand. Its type is the operand's static type with top-level cv-qualifiers removed and arrays and functions decayed to pointers, so `throw "abc"` throws a `const char*`. Throwing through a `Base&` that refers to a `Derived` throws a `Base`, sliced.

The storage is allocated in an unspecified way, and the standard says only that it is never obtained from the global allocation functions. Itanium-ABI implementations such as GCC and Clang use a runtime allocator with an emergency pool, so an out-of-memory condition can still be reported. The object lives until the last active handler for it exits by any means other than rethrowing, or until the last `std::exception_ptr` referring to it is destroyed, whichever is later.

The type must be complete, must not be abstract, and since the resolution of CWG 1863 it must be copy-constructible from a `const` lvalue, because `std::current_exception` may need to copy it. GCC 16 and Clang 21 do not diagnose a move-only exception type, so this is a rule that compilers happen not to enforce, not one you can rely on being harmless.

```cpp
#include <cstdio>

struct Base { virtual const char* name() const { return "Base"; } virtual ~Base() = default; };
struct Derived : Base { const char* name() const override { return "Derived"; } };

void rethrow_sliced(Base& b) { throw b; }   // exception object has type Base

int main() {
  Derived d;
  try { rethrow_sliced(d); }
  catch (Derived&) { std::puts("Derived"); }
  catch (Base& b)  { std::puts(b.name()); }   // prints Base
}
```

## How a handler matches

Handlers of a `try` block are examined in the order they appear, and the first match wins, even if a later one would fit better. For an exception object of type `E`, a handler of type `T`, `const T`, `T&` or `const T&` matches when:

- `T` and `E` are the same type, ignoring top-level cv-qualification;
- `T` is an unambiguous public base class of `E`;
- `T` is a pointer or pointer-to-member type, the handler is `T` or `const T&` (not a plain non-const reference), and `E` converts to `T` by a standard pointer conversion, a qualification conversion or a function pointer conversion; or
- `T` is a pointer or pointer-to-member type and `E` is `std::nullptr_t`.

That is the whole list. There are no integral promotions, no arithmetic conversions and no user-defined conversions.

```cpp
#include <cstdio>

struct Base {};
struct Hidden : private Base {};

int main() {
  try { throw 42; }
  catch (long)   { std::puts("long"); }      // not taken: no int -> long here
  catch (...)    { std::puts("other"); }     // prints other

  try { throw Hidden{}; }
  catch (Base&)  { std::puts("base"); }      // not taken: Base is a private base
  catch (...)    { std::puts("other"); }     // prints other

  try { throw nullptr; }
  catch (int*)   { std::puts("int*"); }      // taken: nullptr_t matches any pointer handler
}
```

A `catch (...)` handler must be the last one in its `try` block, or the program is ill-formed. Putting a derived-class handler after a base-class handler is legal but dead code, and both GCC and Clang warn about it.

> **Pitfall.** GCC 16 and Clang 21 both let a handler of type `void*&` catch a thrown `int*`, which the standard does not allow: pointer conversions apply only to by-value and `const&` handlers, because a non-const reference to `void*` cannot refer to an `int*` object. Write pointer handlers by value if you ever need them.

### By value or by reference

A handler parameter is initialized from the exception object, which is an lvalue. Catching by value therefore copies, slices polymorphic exceptions to the handler's type, and runs a copy constructor that, if it throws, calls `std::terminate`. Catching by reference binds directly to the exception object, so virtual calls see the dynamic type and modifications are visible if the exception is rethrown. Catch class types by `const&`, or by `&` if you intend to modify them.

## Rethrowing: `throw;` versus `throw e;`

A bare `throw;` rethrows the exception object currently being handled. It does not copy, it does not slice, and it keeps the dynamic type. Writing `throw e;` creates a brand new exception object copy-initialized from `e`, using `e`'s static type.

```cpp
#include <cstdio>
#include <stdexcept>

int main() {
  try {
    try { throw std::out_of_range("index"); }
    catch (const std::exception& e) { throw; }   // same out_of_range object
  } catch (const std::out_of_range&) { std::puts("out_of_range"); }

  try {
    try { throw std::out_of_range("index"); }
    catch (const std::exception& e) { throw e; } // new std::exception, sliced
  } catch (const std::out_of_range&) { std::puts("out_of_range");
  } catch (const std::exception&)    { std::puts("exception"); }   // prints exception
}
```

A bare `throw;` evaluated when no exception is being handled calls `std::terminate`. It may appear in any function called from a handler, not only lexically inside one, which makes the "Lippincott function" idiom possible: a single function that rethrows and translates every exception type into an error code.

## Stack unwinding and function-try-blocks

Once a handler is found, control passes to it and every automatic object constructed since its `try` block was entered is destroyed in reverse order of construction. The same applies inside constructors: if a constructor throws, the fully constructed bases and members of that object are destroyed, but the object's own destructor never runs, because its lifetime never began. If the object was created by a `new` expression, the matching deallocation function is called. A delegating constructor is the exception: once the target constructor has finished, the object exists, and its destructor is called.

During unwinding, `std::uncaught_exceptions()` counts exceptions that have been thrown but whose handler has not yet been entered. A destructor that records the count at construction and compares it at destruction can tell whether it is running because of an exception, which is how scope guards decide between commit and rollback. The older `std::uncaught_exception()` returned a `bool` and could not tell nested cases apart; it was deprecated in C++17 and removed in C++20.

A **function-try-block** wraps an entire function body, including a constructor's member initializer list, in a `try`. It is the only way to see an exception thrown by a base or member initializer.

```cpp
#include <cstdio>
#include <stdexcept>

struct Member { Member() { throw std::runtime_error("member"); } };

struct Holder {
  Member m;
  Holder() try : m() {
  } catch (const std::exception& e) {
    std::printf("saw %s\n", e.what());
  }   // flowing off the end rethrows: Holder cannot be half-built
};

int main() {
  try { Holder h; } catch (const std::exception&) { std::puts("still thrown"); }
}
```

> **Standardese.** [except.handle] says that if control reaches the end of a handler of a constructor's or destructor's function-try-block, the current exception is rethrown. Referring to a non-static member or base of the object inside such a handler is undefined behavior, because those subobjects have already been destroyed.

For an ordinary function, flowing off the end of a function-try-block handler is like flowing off the end of the body: fine for `void`, undefined behavior for a function that should return a value, and an implicit `return 0;` in `main`.

## When `std::terminate` is called

The standard lists the situations in [except.terminate]. The ones you meet in practice are:

- no matching handler exists for a thrown exception;
- an exception tries to leave a function with a non-throwing exception specification, including any destructor not explicitly marked `noexcept(false)`;
- a function called directly by the unwinding machinery, such as a destructor of a local being destroyed or the copy constructor of a by-value handler parameter, exits via an exception;
- `throw;` is evaluated with no exception being handled;
- an exception escapes the initialization or destruction of a variable with static or thread storage duration, a function registered with `std::atexit`, or the initial function of a `std::thread`.

When no matching handler is found, it is **implementation-defined** whether the stack is unwound before `std::terminate` is called. GCC and Clang with the Itanium ABI search for a handler first and do not unwind at all if none exists, so destructors of locals in `main` do not run. That is why an RAII object can never be relied on to flush a log on an uncaught exception, and why a `catch (...)` in `main` matters.

```cpp
#include <cstdio>

struct Flush { ~Flush() { std::puts("flushed"); } };

int main() {
  Flush f;
  throw 1;   // std::terminate; with GCC and Clang, "flushed" is never printed
}
```

## Carrying exceptions across boundaries

`std::exception_ptr` is a shared-ownership handle to an exception object. `std::current_exception()` inside a handler returns one referring to the exception being handled, or to a copy of it, which is the reason for the copy-constructibility rule. `std::rethrow_exception(p)` throws that object again somewhere else, for example on another thread. `std::promise::set_exception` and `std::async` use exactly this mechanism, as described in the futures-promises-and-async topic.

`std::nested_exception` captures the current exception when it is constructed. `std::throw_with_nested(e)` throws an object of a type derived from both `e`'s type and `std::nested_exception`, so a high-level error can carry its low-level cause. `std::rethrow_if_nested(e)` rethrows that cause if `e` has one, and otherwise does nothing.

```cpp
#include <cstdio>
#include <exception>
#include <stdexcept>

int main() {
  try {
    try { throw std::runtime_error("disk full"); }
    catch (...) { std::throw_with_nested(std::logic_error("save failed")); }
  } catch (const std::logic_error& e) {
    std::puts(e.what());                            // save failed
    try { std::rethrow_if_nested(e); }
    catch (const std::runtime_error& cause) { std::puts(cause.what()); }   // disk full
  }
}
```

## What to remember

- A `throw` copy-initializes an exception object of the operand's static type; throwing through a base reference slices.
- Handlers are tried in order; the first match wins, and `catch (...)` must come last.
- Matching allows exact type, unambiguous public base, pointer and qualification conversions, and `nullptr_t` to pointer; nothing else.
- Catch by reference; by value copies, slices, and can terminate if the copy throws.
- `throw;` rethrows the same object; `throw e;` throws a new, possibly sliced, copy.
- Unwinding destroys automatic objects in reverse order and fully built subobjects of a failing constructor; the failing object's destructor never runs.
- A constructor's function-try-block handler always rethrows when it reaches its end.
- With no matching handler, whether the stack unwinds is implementation-defined, and GCC and Clang do not unwind.
- `exception_ptr`, `throw_with_nested` and `uncaught_exceptions` let exceptions be stored, chained and detected.
