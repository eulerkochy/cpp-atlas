---
title: "Dynamic allocation with new and delete"
summary: "A new-expression is two steps, a call to an allocation function and then initialization, and a delete-expression is the same two steps in reverse. This page follows both steps through exceptions, arrays, placement forms, replacement, class-specific operators and the mismatches that are undefined."
track: "memory-model"
minutes: 14
standard:
  - "[expr.new]"
  - "[expr.delete]"
  - "[basic.stc.dynamic]"
  - "[basic.stc.dynamic.allocation]"
  - "[basic.stc.dynamic.deallocation]"
  - "[new.delete]"
  - "[new.delete.placement]"
  - "[replacement.functions]"
  - "[class.free]"
cppreference:
  - title: "new expression"
    path: "language/new"
  - title: "delete expression"
    path: "language/delete"
  - title: "operator new, operator new[]"
    path: "memory/new/operator_new"
  - title: "operator delete, operator delete[]"
    path: "memory/new/operator_delete"
  - title: "std::nothrow"
    path: "memory/new/nothrow"
  - title: "std::destroying_delete_t"
    path: "memory/new/destroying_delete_t"
prerequisites:
  - "object-lifetime-and-storage"
  - "object-layout-and-alignment"
---

## The one idea

The word `new` names two different things. The **new-expression**, `new T(args)`, is a language construct. The **allocation function**, `operator new`, is an ordinary function that returns raw, uninitialized bytes. A new-expression calls an allocation function to get storage, then initializes an object in that storage, then hands you a pointer to the object. A delete-expression runs the destructor and then calls a **deallocation function**, `operator delete`, to give the bytes back.

> **Mental model.** `new T(args)` is roughly `void* raw = operator new(sizeof(T)); return ::new (raw) T(args);`, plus a hidden cleanup that frees `raw` if the constructor throws. `delete p` is `p->~T(); operator delete(p);`. You can customize the functions; you cannot customize the expressions.

Every rule on this page is about one of those steps: which function the expression picks, what the expression does around the call, or what happens when the two halves are not paired correctly. The lifetime rules for the object itself belong to the topic on object lifetime and storage.

## Allocation, then construction, then cleanup on failure

Since C++17 the call to the allocation function is sequenced before the evaluation of the arguments in the initializer. Before C++17 it was unspecified whether `operator new` ran before or after those arguments were evaluated.

If initialization exits with an exception, the new-expression looks up the deallocation function that matches the allocation function, calls it with the pointer, and lets the exception continue. The object never existed, so no destructor runs, but the memory is returned.

```cpp
#include <cstdio>
#include <cstddef>
#include <new>

struct T {
  T(int) { std::puts("ctor"); throw 1; }
  static void* operator new(std::size_t n) { std::puts("new"); return ::operator new(n); }
  static void operator delete(void* p) { std::puts("delete"); ::operator delete(p); }
};
int f() { std::puts("f"); return 0; }

int main() {
  try { new T(f()); } catch (int) { std::puts("caught"); }
}
// prints: new, f, ctor, delete, caught
```

The automatic cleanup only covers the window inside the expression. Once the expression has produced its pointer, nothing frees the memory unless you write a delete-expression or hand the pointer to an owner such as `std::unique_ptr`, which the topic on smart pointers covers.

The allocation function signals failure by throwing `std::bad_alloc`. Before throwing, the standard versions call the installed `std::new_handler` in a loop, which gives a program the chance to release a cache and retry.

## Arrays and the array cookie

`new T[n]` calls `operator new[]` and requests `n * sizeof(T)` bytes plus an unspecified overhead, which can differ from one call to the next. The pointer you receive is offset from the start of the allocated block by that overhead. If `n` is negative, or so large that the size overflows, the expression throws `std::bad_array_new_length` without calling the allocation function. `new T[0]` is valid and returns a distinct non-null pointer that you may not dereference.

The standard does not say what the overhead is for. In practice it holds the element count, because `delete[] p` must run `n` destructors and the pointer alone does not say what `n` is. The Itanium C++ ABI calls this the array cookie. It stores one when the element type has a non-trivial destructor, or when the class has an `operator delete[]` that takes a size, and stores none for other trivially destructible types. MSVC follows a similar rule.

```text
new S[3], S with a non-trivial destructor, Itanium ABI:

operator new[] returns  ->  [ cookie: 3 ][ S ][ S ][ S ]
the expression returns  ->               ^
delete[] reads the cookie just before this address
```

That layout explains why mismatched forms fail so badly. When there is a cookie, `delete p` on an array pointer destroys one element and passes the wrong address to the deallocation function, while `delete[] p` on a single object reads whatever precedes it as the count. Both are undefined whether or not the type has a destructor.

> **Pitfall.** "It worked for `int`" proves nothing. `int* p = new int[10]; delete p;` usually appears to work because there is no cookie and the allocator ignores the size, but the behavior is undefined, and sized deallocation or AddressSanitizer can expose it.

## Placement forms, matching delete and nothrow

Any extra arguments in `new (a, b) T` are passed to the allocation function after the size, so the expression calls `operator new(sizeof(T), a, b)`. The standard library provides one non-allocating form, `operator new(std::size_t, void*)`, which returns its pointer argument and may not be replaced. That is what people usually mean by placement new.

There is no placement delete-expression. A placement deallocation function, one whose extra parameter types are the same as the allocation function's, is called in exactly one situation: when the constructor throws inside a placement new-expression. If no matching deallocation function exists, nothing is freed.

```cpp
#include <cstdio>
#include <cstddef>
#include <new>

struct T {
  T() { throw 1; }
  static void* operator new(std::size_t n, int) { return ::operator new(n); }
  static void operator delete(void* p, int) { std::puts("placement delete"); ::operator delete(p); }
  static void operator delete(void* p) { std::puts("usual delete"); ::operator delete(p); }
};

int main() {
  try { new (42) T; } catch (int) {}   // prints: placement delete
}
```

`new (std::nothrow) T` calls the `nothrow_t` overload, which returns a null pointer instead of throwing. When the allocation function returns null, the new-expression skips initialization and yields null. The constructor is not covered: if it throws, the exception propagates as usual.

A class-specific `operator new` hides every global form for that class, including the non-allocating placement form. After declaring one, `new (buf) T` no longer compiles; write `::new (buf) T`, which is also why generic code always spells placement new with the leading `::`.

## Sized, aligned and destroying deallocation

C++14 added sized deallocation, `operator delete(void*, std::size_t)`, so an allocator can skip looking up the block size. C++17 added the `std::align_val_t` overloads for over-aligned types, described in the topic on object layout and alignment. The delete-expression chooses among these by a fixed procedure. Destroying deletes win if any are found. Then alignment-aware functions are preferred for over-aligned types. For class-specific functions the unsized one is preferred over the sized one. For the global functions the sized form is chosen when the type is complete, except that for `delete[]` it requires a class with a non-trivial destructor, since only then does the cookie record the count. In the remaining cases the choice is unspecified.

C++20 added **destroying delete**: a class-specific `operator delete` whose first parameter is `T*` and whose second is `std::destroying_delete_t`. When the delete-expression selects it, the expression does not call the destructor. The function receives a pointer to a live object and must destroy it itself. That suits variable-sized objects with a trailing buffer, and hierarchies that dispatch destruction on a stored tag instead of a virtual destructor.

```cpp
#include <cstdio>
#include <new>

struct S {
  ~S() { std::puts("~S"); }
  void operator delete(S* p, std::destroying_delete_t) {
    std::puts("destroying delete");
    p->~S();                 // remove this line and ~S never runs
    ::operator delete(p);
  }
};

int main() { delete new S; }  // prints: destroying delete, ~S
```

Class-specific allocation and deallocation functions are implicitly static members. A delete-expression looks up `operator delete` in the scope of the object's dynamic type when the destructor is virtual, because the lookup is done as part of the deleting destructor. So a derived class's `operator delete` is found even when you delete through a base pointer.

## Mismatches that are undefined

The pairing rules are strict, and the compiler usually cannot check them.

- Memory from `new` must be released by `delete`, memory from `new[]` by `delete[]`, and memory from `malloc` by `free`. Any crossing is undefined.
- Deleting through a pointer to a base class requires a virtual destructor in the base. Without one, `delete base_ptr` is undefined even if the derived class adds no members and has a trivial destructor.
- `delete[]` through a pointer to a base class is undefined even with a virtual destructor. The static and dynamic element types must match.
- Deleting a pointer to an incomplete class type whose complete type has a non-trivial destructor or a class-specific deallocation function was undefined through C++23; C++26 makes it ill-formed.

> **Standardese.** [expr.delete] says that in a single-object delete, if the static type of the object differs from its dynamic type, the static type must be a base class of the dynamic type and must have a virtual destructor, or the behavior is undefined. In an array delete, if the dynamic type differs from the static type, the behavior is undefined.

## Replacing the global operators, and elision

A program may define its own versions of the replaceable global allocation and deallocation functions in [new.delete]. The definitions must be at global scope, not `inline` and not `static`, and they replace the library's versions for the whole program. The default behaviors are specified so that a minimal replacement covers almost everything: the nothrow and array forms are defined to call `operator new(std::size_t)`, and the sized, nothrow and array deallocation forms are defined to call `operator delete(void*)`. The aligned forms are a separate family, so a replacement that wants to see every allocation must also define those.

```cpp
#include <cstdlib>
#include <new>

int calls = 0;
void* operator new(std::size_t n) {
  ++calls;
  if (void* p = std::malloc(n ? n : 1)) return p;
  throw std::bad_alloc{};
}
void operator delete(void* p) noexcept { std::free(p); }
void operator delete(void* p, std::size_t) noexcept { std::free(p); }

int main() {
  void* a = ::operator new[](16);          // default operator new[] calls the one above
  void* b = ::operator new(16, std::nothrow);
  ::operator delete[](a);
  ::operator delete(b, std::nothrow);
  return calls;                            // 2
}
```

A replacement must still meet the library's requirements: a throwing `operator new` throws `std::bad_alloc` on failure and never returns null, and every returned pointer must be suitably aligned and distinct from every other live allocation.

### Allocation elision

C++14 adopted N3664, which lets an implementation omit a call to a replaceable global allocation function made by a new-expression, providing the storage some other way, or extend one allocation to cover another whose lifetime it contains. The permission applies even when you have replaced `operator new` with a function that has side effects. Both GCC 16 and Clang 21 at `-O2` remove the pair in `int* p = new int(1); delete p;`, so a counting replacement such as the one in this section sees zero calls instead of one.

The permission covers only new-expressions. A direct call to `::operator new` is an ordinary function call and is never elided, so benchmarks that count allocations through a replacement should use direct calls or defeat the optimizer. `std::allocator::allocate` is specified to obtain memory from `::operator new` while leaving unspecified when and how often it calls it, which gives library containers the same freedom; libc++ makes use of it.

C++20 builds on the same idea for constant evaluation: a new-expression in a constant expression never calls an allocation function at all, which is what lets `constexpr` code use `std::vector` transiently.

## What to remember

- A new-expression allocates, then initializes; a delete-expression destroys, then deallocates. Since C++17 allocation is sequenced before the initializer's arguments.
- If the constructor throws, the matching deallocation function runs automatically; for placement new it is the placement delete with the same extra parameters, and if none exists nothing is freed.
- `new T[n]` may request extra bytes; the Itanium ABI stores a count cookie when `T` has a non-trivial destructor. Mixing `delete` and `delete[]` is undefined for every type.
- `std::nothrow` only covers allocation; a throwing constructor still throws.
- A class-specific `operator new` hides global placement new; generic code writes `::new`.
- Replacing `operator new(size_t)` and `operator delete(void*)` covers the nothrow, array and sized forms, but not the aligned ones.
- Destroying delete (C++20) receives a live object and must call the destructor itself.
- Deleting through a base pointer needs a virtual destructor; `delete[]` through a base pointer is always undefined.
- Since C++14 allocations made by new-expressions may be elided or merged, even when `operator new` is replaced.
