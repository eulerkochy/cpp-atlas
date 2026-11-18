---
title: "Program startup and termination"
summary: "Before main runs, every static variable is zero- or constant-initialized and then dynamically initialized in a partly specified order. After it, std::exit unwinds that work in reverse, interleaved with atexit handlers, while quick_exit, abort and terminate each skip different parts."
track: "program-structure"
minutes: 14
standard:
  - "[basic.start.main]"
  - "[basic.start.static]"
  - "[basic.start.dynamic]"
  - "[basic.start.term]"
  - "[stmt.dcl]"
  - "[support.start.term]"
  - "[except.terminate]"
  - "[except.handle]"
cppreference:
  - title: "Main function"
    path: "language/main_function"
  - title: "Initialization (non-local variables)"
    path: "language/initialization"
  - title: "Constant initialization"
    path: "language/constant_initialization"
  - title: "std::exit"
    path: "utility/program/exit"
  - title: "std::atexit"
    path: "utility/program/atexit"
  - title: "std::quick_exit"
    path: "utility/program/quick_exit"
  - title: "std::abort"
    path: "utility/program/abort"
  - title: "std::terminate"
    path: "error/terminate"
prerequisites:
  - "object-lifetime-and-storage"
  - "translation-units-and-linkage"
  - "exceptions-and-stack-unwinding"
---

## The one idea

A C++ program does real work before `main` and after it. Before, every variable with static storage duration is initialized, in two phases with different guarantees. After, the objects that were constructed are destroyed in reverse, with functions registered through `std::atexit` slotted into the same reverse sequence.

The rules are sharp at the two extremes and vague in the middle. Static initialization is complete before any dynamic initialization begins. Within one translation unit, ordinary dynamic initialization follows definition order. Across translation units, the order is unspecified, and an implementation may even defer it until first use. On the way out, only `std::exit`, which returning from `main` calls, runs the full teardown. The other exits each skip a different part of it.

> **Mental model.** Startup is a stack being pushed: every completed static initialization, and every `atexit` registration, is pushed in the order it happened. `std::exit` pops the stack. `quick_exit` pops a different, smaller stack, and `abort` throws the stack away.

The object-lifetime-and-storage topic introduces storage durations and the cross-file initialization order fiasco. This topic goes into the phases themselves and into every way a program can end.

## `main` is special

[basic.start.main] gives `main` rules no other function has:

- Its return type must be declared as `int`. `auto main() -> int` is fine; `auto main()` with a deduced type is not.
- It may not be `inline`, `static`, `constexpr`, `consteval`, deleted, or a coroutine. A global variable named `main` is ill-formed, and so is a global function `main` attached to a named module.
- It may not be *used* by the program: no recursive call, no taking its address. GCC accepts both with only a `-Wpedantic` warning.
- Falling off the end is equivalent to `return 0;`. No other value-returning function gets that.
- `argv[argc]` is guaranteed to be a null pointer.

Returning from `main` first destroys `main`'s automatic objects, then calls `std::exit` with the returned value. That one detail separates `return 0;` from `std::exit(0);`, as the termination section shows.

A function-try-block on `main` cannot catch everything that happens around it. Exceptions from constructors of namespace-scope objects and from destructors of static objects happen outside `main`'s body, and [except.handle] says the handler does not see them.

## Static initialization: zero and constant

[basic.start.static] defines the first phase. A variable with static or thread storage duration is *constant-initialized* if its initialization is a constant expression; otherwise it is first *zero-initialized*. These two together are called static initialization, and all of it strongly happens before any dynamic initialization. In practice the values are in the executable image and no code runs.

This is the one cross-file order guarantee you get for free. A constant-initialized variable can be read safely from any dynamic initializer anywhere in the program.

```cpp
// file a.cpp
int f();
int x = f();          // dynamic initialization

// file b.cpp
int y = 5;            // constant initialization: done before any dynamic init
int f() { return y; } // so x is 5, whichever file runs first
```

C++20's `constinit` turns this into a checked promise: the variable must be constant-initialized or the program is ill-formed. Unlike `constexpr`, it does not make the variable `const`.

The standard also lets an implementation turn dynamic initialization into static initialization, as long as the variable ends with the value dynamic initialization would have given it, and no other variable changes before its own initialization. The standard's own example shows the consequence: another variable that reads it early may see either value.

```cpp
inline double fd() { return 1.0; }
extern double d1;
double d2 = d1;     // unspecified: 0.0 if d1 is still zero, 1.0 if d1 was done statically
double d1 = fd();   // dynamic in principle, but may be performed statically
```

GCC and Clang both print 0 for `d2` here, but the standard permits 1.

## Dynamic initialization: three orderings

Everything else is dynamic initialization, and [basic.start.dynamic] sorts non-block variables into three groups:

| Kind | Which variables | Order guarantee |
| --- | --- | --- |
| ordered | ordinary namespace-scope variables and static data members | definition order within one translation unit |
| partially ordered | inline variables that are not template specializations | before a later variable if defined before it in every file that defines that one |
| unordered | static data members of class templates and variable template specializations, unless explicitly specialized | none, even within one file |

Across translation units nothing is ordered. Initializations in different files happen in an unspecified order, and once the program has started a thread, which deferred initialization makes possible, they may even run on different threads.

```cpp
int next_id();

template <class T> struct Tag { static int id; };
template <class T> int Tag<T>::id = next_id();   // unordered

int first = next_id();                            // ordered, but not relative to Tag<T>::id
```

The implementation may also *defer* dynamic initialization until after `main` starts. If it does, a variable is initialized before the first odr-use of any non-inline function or variable defined in its translation unit. Whether that deferral happens is implementation-defined; mainstream toolchains initialize everything before `main`.

> **Pitfall.** Self-registering objects, such as a factory entry created by a namespace-scope constructor, are fragile for a separate reason. If they live in a static library and nothing references their object file, the linker never includes it, and the constructor never runs. That is linker behavior, not a C++ rule, so no language feature fixes it.

If a dynamic initializer of a non-block variable exits with an exception, `std::terminate` is called.

## Block-scope statics

A static local is the standard tool for controlled order. [stmt.dcl] says its dynamic initialization happens the first time control passes through its declaration. Since C++11 that initialization is thread-safe: a concurrent caller waits for the first one to finish. If the initializer throws, the variable is not initialized, and the next pass through the declaration tries again.

```cpp
int attempts = 0;
int init() { if (++attempts < 3) throw attempts; return attempts; }
int get() { static int v = init(); return v; }   // third call succeeds, then no more calls
```

Re-entering the declaration recursively while it is being initialized is undefined behavior, and in practice usually deadlocks or throws. A block-scope static that is constant-initialized never runs an initializer at all.

## Five ways to end a program

| Path | Automatic objects in the current thread | `atexit` handlers and static destructors | `at_quick_exit` handlers | C streams flushed |
| --- | --- | --- | --- | --- |
| `return` from `main` | destroyed (`main`'s own) | yes, interleaved in reverse | no | yes |
| `std::exit(status)` | not destroyed | yes, interleaved in reverse | no | yes |
| `std::quick_exit(status)` | not destroyed | no | yes, in reverse | implementation-defined |
| `std::abort()` | not destroyed | no | no | implementation-defined |
| `std::terminate()` | depends on why it was called | no, with the default handler | no | implementation-defined |

`std::exit` destroys the calling thread's thread-local objects, then runs static destructors and `atexit` handlers, then flushes and closes C streams, removes files made by `std::tmpfile`, and returns the status. Status 0 or `EXIT_SUCCESS` means success, `EXIT_FAILURE` means failure, and any other value has implementation-defined meaning.

```cpp
#include <cstdio>
#include <cstdlib>

struct T { const char* n; ~T() { std::printf("~%s\n", n); } };
T g{"global"};

int main() {
  T l{"local"};
  std::exit(0);     // prints ~global only: l is never destroyed
}
```

`std::quick_exit` (C++11) runs only the `at_quick_exit` handlers, in reverse order of registration, and then calls `std::_Exit`. No objects are destroyed. It exists for programs whose static destructors might race with or deadlock against still-running threads. `std::abort` ends the program abnormally, by way of `SIGABRT`, and runs nothing at all: neither destructors nor handlers.

`std::terminate` calls the current terminate handler, which by default calls `std::abort`. The runtime calls it when an exception escapes `main` or a thread's initial function, escapes a `noexcept` function, escapes a static initializer, a static destructor or an `atexit` handler, or escapes a destructor during stack unwinding. When no handler is found, [except.handle] makes it implementation-defined whether the stack is unwound first; GCC does not unwind, so destructors of `main`'s locals do not run. A terminate handler must not return.

> **Standardese.** [basic.start.term] says the call to `std::exit` is sequenced before the destructions and registered functions it causes, and that destroying statics and calling `atexit` functions are parts of that call. Returning from `main` is defined in [basic.start.main] as leaving `main` and then calling `std::exit` with the returned value.

## Destruction order and `atexit`

Static objects are destroyed in the reverse order in which their constructors, or their dynamic initializations, completed. A statically initialized object is destroyed as if it had been dynamically initialized in its place.

`atexit` handlers are not a separate stack run before or after the destructors. [basic.start.term] places each registration into the same sequence: if an object finishes initialization before a handler is registered, the handler runs before the object is destroyed, and if the registration comes first, the object is destroyed first.

```cpp
#include <cstdio>
#include <cstdlib>

struct T {
  const char* n;
  T(const char* s) : n(s) { std::printf("+%s ", n); }
  ~T() { std::printf("~%s ", n); }
};

void handler() { std::printf("handler "); }

T a("a");
int reg = (std::atexit(handler), 0);
T b("b");

int main() { std::printf("main "); }   // +a +b main ~b handler ~a
```

Two more teardown hazards are worth knowing. A function that contains a static local which has already been destroyed is still callable during later static destruction, but passing through that local's declaration is undefined behavior. And a detached thread that touches a destroyed static object, or uses most of the standard library, during or after static destruction has undefined behavior; this is the hazard `quick_exit` sidesteps.

## What to remember

- `main` must return `int`, may not be used, inlined, made static or constexpr, and falls off the end as `return 0;`.
- Returning from `main` destroys its locals and then calls `std::exit`; calling `std::exit` directly skips the locals.
- Zero and constant initialization happen before all dynamic initialization, so constant-initialized variables are safe everywhere; `constinit` enforces it.
- An implementation may perform dynamic initialization statically, which can change what an early reader sees.
- Dynamic initialization is ordered within a file, partially ordered for inline variables, unordered for template statics, and unordered across files.
- Static locals initialize on first pass, thread-safely, and retry after an exception.
- Static destructors and `atexit` handlers run as one reverse sequence of everything that completed.
- `quick_exit` runs only `at_quick_exit` handlers; `abort` runs nothing; `terminate` calls a handler that defaults to `abort`.
- Whether the stack unwinds before `terminate` for an uncaught exception is implementation-defined.
