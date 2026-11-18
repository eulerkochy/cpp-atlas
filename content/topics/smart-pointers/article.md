---
title: "Smart pointers"
summary: "unique_ptr makes single ownership a property of the type at no run-time cost, shared_ptr counts owners in a separate control block, and weak_ptr observes without owning. This page covers what each one stores, where the deleter lives, which operations are thread-safe, and the bugs that come from owning one object twice."
track: "memory-model"
minutes: 14
standard:
  - "[unique.ptr]"
  - "[unique.ptr.dltr]"
  - "[util.smartptr.shared]"
  - "[util.smartptr.shared.const]"
  - "[util.smartptr.shared.create]"
  - "[util.smartptr.weak]"
  - "[util.smartptr.enab]"
  - "[util.smartptr.atomic]"
  - "[smartptr.adapt]"
cppreference:
  - title: "std::unique_ptr"
    path: "memory/unique_ptr"
  - title: "std::shared_ptr"
    path: "memory/shared_ptr"
  - title: "std::shared_ptr constructors"
    path: "memory/shared_ptr/shared_ptr"
  - title: "std::make_shared, std::make_shared_for_overwrite"
    path: "memory/shared_ptr/make_shared"
  - title: "std::weak_ptr"
    path: "memory/weak_ptr"
  - title: "std::enable_shared_from_this"
    path: "memory/enable_shared_from_this"
  - title: "std::out_ptr_t"
    path: "memory/out_ptr_t"
prerequisites:
  - "raii-and-resource-management"
  - "copy-and-move"
  - "dynamic-allocation-new-and-delete"
---

## The one idea

A smart pointer is a class that owns an object and releases it in its destructor. The three standard ones differ in where the knowledge of ownership lives. For `std::unique_ptr<T, D>` it lives in the type: there is exactly one owner, the deleter is a template argument, and the object is a pointer plus whatever state the deleter needs. For `std::shared_ptr<T>` it lives in a separate heap object, the **control block**, which counts owners and remembers how to destroy the object. `std::weak_ptr<T>` points at the same control block without contributing to the owner count.

> **Mental model.** A `unique_ptr` is a raw pointer with a destructor and a deleted copy constructor. A `shared_ptr` is two raw pointers: one to the object you dereference, and one to a control block that decides when, and how, something gets destroyed. Those two pointers need not agree, and most of the surprises come from that.

The general case for tying resources to scopes is the topic on RAII; this page is about the specific tools.

## unique_ptr: ownership in the type

`unique_ptr` is move-only. Moving transfers the pointer and leaves the source null, which the standard guarantees, unlike moved-from states in general. The deleter is part of the type, so `unique_ptr<FILE, int(*)(FILE*)>` and `unique_ptr<FILE, Closer>` are different types.

The deleter is stored inside the `unique_ptr`. An empty class deleter, such as the default `std::default_delete<T>` or a captureless lambda, costs nothing in practice, because libstdc++, libc++ and MSVC all use the empty base optimization or `[[no_unique_address]]`. The standard does not promise a size. A function pointer deleter, by contrast, must be stored, so it makes the object two pointers wide on every mainstream ABI.

```cpp
#include <cstdio>
#include <memory>

struct Closer { void operator()(std::FILE* f) const { std::fclose(f); } };

using File  = std::unique_ptr<std::FILE, Closer>;               // stateless deleter
using FileP = std::unique_ptr<std::FILE, int (*)(std::FILE*)>;  // stores a function pointer

static_assert(sizeof(File) == sizeof(std::FILE*));     // holds on libstdc++ and libc++, not guaranteed
static_assert(sizeof(FileP) == 2 * sizeof(std::FILE*));  // the function pointer is stored
```

`unique_ptr<T[]>` is a separate partial specialization. Its default deleter calls `delete[]`, it provides `operator[]` instead of `operator*` and `operator->`, and it refuses conversions from pointers to derived types, because deleting an array through a base pointer is undefined. `std::make_unique<T[]>(n)` value-initializes the elements; C++20's `std::make_unique_for_overwrite` default-initializes them, which skips zeroing for trivial types.

### Incomplete types and the out-of-line destructor

`unique_ptr<T>` may be declared with an incomplete `T`, which is what makes it the standard pimpl member. But `default_delete<T>::operator()` requires a complete type, and the implicitly defined destructor of the enclosing class calls it wherever that destructor is defined. If the class's destructor is implicit, it is defined inline in every translation unit that destroys one, where `Impl` is incomplete, and the program is ill-formed.

```cpp
#include <memory>

// widget.h
struct Impl;
struct Widget {
  Widget();
  ~Widget();                 // declared here, defined where Impl is complete
  std::unique_ptr<Impl> p;
};

// widget.cpp
struct Impl { int x = 0; };
Widget::Widget() : p(std::make_unique<Impl>()) {}
Widget::~Widget() = default;  // default_delete<Impl> is instantiated here
```

The same applies to a move assignment operator, which also destroys the old `Impl`. `shared_ptr` has no such requirement, because its constructor captures the deleter into the control block while the type is complete.

## shared_ptr: the control block

The control block holds the strong count (the number of `shared_ptr` owners), the weak count, the deleter and the allocator. When the strong count reaches zero, the object is destroyed by the stored deleter. When the weak count also reaches zero, the control block itself is freed.

Because the deleter is type-erased in the control block, two `shared_ptr<T>` with different deleters have the same type. A less obvious consequence is that the deleter is chosen from the pointer type you passed to the constructor, not from `T`. A `shared_ptr<Base>` built from `new Derived` deletes a `Derived*`, so it calls the correct destructor even when `Base` has no virtual destructor. A `shared_ptr<void>` destroys its object correctly for the same reason.

```cpp
#include <cstdio>
#include <memory>

struct Base    { ~Base()    { std::puts("~Base"); } };     // not virtual
struct Derived : Base { ~Derived() { std::puts("~Derived"); } };

int main() {
  std::shared_ptr<Base> p(new Derived);
  p.reset();                         // prints ~Derived, ~Base
  // std::unique_ptr<Base> u(new Derived); would be undefined when u is destroyed,
  // because default_delete<Base> runs delete on a Base*
}
```

### make_shared trade-offs

`std::make_shared<T>(args...)` is recommended to perform a single allocation holding both the control block and the object. That halves the allocations and improves locality, and it was also the fix for exception-unsafe argument lists before C++17. The costs are real, though.

- The object's storage is part of the control block, so it cannot be returned until the last `weak_ptr` is gone, even though the object is destroyed when the last `shared_ptr` goes. A large object observed by a long-lived `weak_ptr` keeps its memory.
- You cannot supply a custom deleter.
- The constructor must be accessible from inside the library, so a class with a private constructor and a static factory cannot use it directly.
- It initializes with parentheses. Since C++20, parenthesized aggregate initialization makes aggregates work too.

C++20 added `make_shared<T[]>` for arrays and `make_shared_for_overwrite`. `std::allocate_shared` takes an allocator for the combined block.

### The aliasing constructor

`shared_ptr<T>(const shared_ptr<U>& owner, T* p)` shares `owner`'s control block but stores `p`. The result keeps the whole owner alive while pointing into it, which is how you hand out a `shared_ptr` to a member.

```cpp
#include <cstdio>
#include <memory>
#include <utility>

int main() {
  auto owner = std::make_shared<std::pair<int, int>>(1, 2);
  std::shared_ptr<int> second(owner, &owner->second);
  owner.reset();
  std::printf("%d %ld\n", *second, second.use_count());   // prints 2 1
}
```

Nothing checks that `p` lies inside the owned object. Aliasing an empty `shared_ptr` with a non-null `p` even yields a pointer that dereferences fine and has a `use_count()` of zero.

## Thread safety: the count, not the pointee

The control block's counts are updated atomically, so different `shared_ptr` objects that share ownership may be copied, assigned and destroyed concurrently in different threads. The standard words this narrowly: for data-race purposes, the member functions access only the `shared_ptr` and `weak_ptr` objects themselves, not the objects they point to.

That leaves two things unprotected. The pointee is an ordinary object, so concurrent unsynchronized writes to `*p` race. And a single `shared_ptr` object is an ordinary object too: one thread assigning to `g` while another copies `g` is a data race on `g`, even though the counts are atomic.

> **Pitfall.** "shared_ptr is thread-safe" is true of the reference count and false of everything else. Sharing one global `shared_ptr` that some thread reassigns needs a mutex or `std::atomic<std::shared_ptr<T>>`. The atomic specialization arrived in C++20 and deprecated the old `std::atomic_load` free functions, which C++26 removes. The topic on atomics and memory ordering covers the orderings.

## weak_ptr, cycles and enable_shared_from_this

Two objects that hold `shared_ptr`s to each other never reach a strong count of zero, so neither is destroyed. Break the cycle by making the back edge, typically child to parent or observer to subject, a `weak_ptr`. To use it, call `lock()`, which atomically returns either an owning `shared_ptr` or an empty one. `expired()` is only a hint in multithreaded code, since the answer can change before you act on it.

An object that wants a `shared_ptr` to itself cannot write `std::shared_ptr<T>(this)`, because that creates a second control block. Instead it derives publicly from `std::enable_shared_from_this<T>`, which holds a `weak_ptr` that the first owning `shared_ptr` constructor fills in. `shared_from_this()` locks it.

```cpp
#include <cstdio>
#include <memory>

struct Node : std::enable_shared_from_this<Node> {};

int main() {
  auto owned = std::make_shared<Node>();
  auto again = owned->shared_from_this();      // shares owned's control block
  Node stack_node;
  try { stack_node.shared_from_this(); }
  catch (const std::bad_weak_ptr&) { std::puts("bad_weak_ptr"); }   // since C++17
}
```

Before C++17 calling `shared_from_this()` on an object that no `shared_ptr` owned was undefined; since C++17 it throws `std::bad_weak_ptr`. It also fails inside the constructor, because no `shared_ptr` owns the object yet. C++17 added `weak_from_this()`, which returns an empty `weak_ptr` in that case instead of throwing.

## Smart pointers in interfaces

The signature should say what the function does with ownership.

| Parameter | Meaning |
|---|---|
| `T&` or `T*` | uses the object, no ownership involved; `T*` if it may be null |
| `std::unique_ptr<T>` by value | takes ownership; the caller must `std::move` |
| `std::unique_ptr<T>&` | may reseat the caller's pointer |
| `std::shared_ptr<T>` by value | keeps a share; move it into storage |
| `const std::shared_ptr<T>&` | might keep a share, decided inside |

Passing `shared_ptr` by value to a function that only reads the object costs two atomic operations for nothing. Returning a `unique_ptr` from a factory is the most flexible choice, because it converts implicitly to `shared_ptr`.

C++23 added `std::out_ptr` and `std::inout_ptr` for C APIs that return a resource through a `T**` parameter. `std::out_ptr(p)` resets `p` when the adapter is constructed, passes the address of a temporary pointer, and calls `p.reset(new_value)` when the adapter is destroyed at the end of the full-expression. `std::inout_ptr(p)` instead releases `p` without deleting, passing the old value in so the API can free or reallocate it. With a `shared_ptr`, `out_ptr` requires an explicit deleter argument, and `inout_ptr` is not allowed at all, because a `shared_ptr` cannot release ownership.

```cpp
#include <cstdlib>
#include <memory>

extern "C" int c_make(int** out);   // allocates *out with malloc

struct Free { void operator()(int* p) const { std::free(p); } };

void use() {
  std::unique_ptr<int, Free> p;
  c_make(std::out_ptr(p));          // p owns the result after this full-expression
}
```

## Owning one object twice

Almost every smart-pointer crash is two owners that do not know about each other.

- Constructing two `shared_ptr`s from the same raw pointer creates two control blocks, and each deletes the object.
- `std::shared_ptr<T>(this)` inside a member function does the same thing whenever the object is already owned.
- Wrapping `p.get()` in a new smart pointer double-deletes.
- A `unique_ptr` or `shared_ptr` to an object with automatic or static storage duration deletes something `new` never made.

> **Standardese.** [util.smartptr.shared.const] says that constructing a `shared_ptr` from a raw pointer `p` produces an object that owns `p` with `use_count() == 1`. Nothing in that specification consults any other `shared_ptr`, so two constructions from the same pointer give two owners that each believe they are alone, and [util.smartptr.shared.dest] then has each of them delete `p`. The second deletion is undefined.

The fixes are mechanical: create objects with `make_unique` or `make_shared` so a raw owning pointer never exists, pass `shared_ptr` copies rather than raw pointers when ownership must be shared, and use `enable_shared_from_this` for self-references.

## What to remember

- `unique_ptr` is move-only, a moved-from one is null, and its deleter is part of the type; empty deleters cost no space in practice, but the standard promises no size.
- `unique_ptr<T[]>` calls `delete[]`, has `operator[]`, and refuses derived-to-base conversions.
- A pimpl `unique_ptr<Impl>` needs the enclosing class's destructor, and move assignment, defined where `Impl` is complete.
- `shared_ptr` keeps the deleter in the control block, chosen from the constructor's pointer type, so `shared_ptr<Base>(new Derived)` destroys correctly without a virtual destructor.
- `make_shared` makes one allocation, but the object's memory outlives it until the last `weak_ptr` is gone.
- The aliasing constructor shares ownership with one object while pointing at another.
- Counts are atomic; the pointee and a single shared `shared_ptr` object are not. Use `std::atomic<std::shared_ptr<T>>` (C++20) for the latter.
- Break cycles with `weak_ptr` and `lock()`. `shared_from_this()` on an unowned object throws `bad_weak_ptr` since C++17.
- `out_ptr` and `inout_ptr` (C++23) adapt smart pointers to `T**` C APIs and update the pointer at the end of the full-expression.
- Never create a second owner from a raw pointer that already has one.
