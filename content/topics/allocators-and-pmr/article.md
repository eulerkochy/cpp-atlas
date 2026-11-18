---
title: "Allocators and polymorphic memory resources"
summary: "An allocator tells a container where its memory comes from, and allocator_traits fills in everything the allocator leaves out. This page covers the minimal allocator, rebinding, the propagation traits that decide what copy, move and swap do with allocator state, and the std::pmr design that puts the memory source behind a virtual interface."
track: "memory-model"
minutes: 15
standard:
  - "[allocator.requirements]"
  - "[allocator.traits]"
  - "[default.allocator]"
  - "[container.reqmts]"
  - "[container.alloc.reqmts]"
  - "[mem.res]"
  - "[mem.poly.allocator.class]"
  - "[mem.res.pool]"
  - "[mem.res.monotonic.buffer]"
  - "[allocator.uses]"
  - "[allocator.adaptor]"
cppreference:
  - title: "Allocator named requirement"
    path: "named_req/Allocator"
  - title: "std::allocator_traits"
    path: "memory/allocator_traits"
  - title: "std::pmr::memory_resource"
    path: "memory/memory_resource"
  - title: "std::pmr::polymorphic_allocator"
    path: "memory/polymorphic_allocator"
  - title: "std::pmr::monotonic_buffer_resource"
    path: "memory/monotonic_buffer_resource"
  - title: "std::pmr::unsynchronized_pool_resource"
    path: "memory/unsynchronized_pool_resource"
  - title: "std::scoped_allocator_adaptor"
    path: "memory/scoped_allocator_adaptor"
  - title: "std::allocator_traits::allocate_at_least"
    path: "memory/allocator_traits/allocate_at_least"
prerequisites:
  - "dynamic-allocation-new-and-delete"
  - "copy-and-move"
  - "sequence-containers"
---

## The one idea

An allocator is a small value that a container stores and asks for memory. It is not the memory itself, and it is not a heap; it is a handle to one. Two allocators compare equal when memory obtained from one can be released through the other. Everything interesting about allocators follows from that: a container may only hand its buffer to another container whose allocator could free it.

The container never calls the allocator directly. It goes through `std::allocator_traits<A>`, which supplies a default for almost every member, so a usable allocator needs only a handful of declarations.

> **Mental model.** Think of an allocator as a library card. Containers with equal cards can trade books freely. Containers with different cards must copy the books, because each library only takes back its own. The propagation traits answer one question: when a container is copied, moved or swapped, does its card go with the books?

## The minimal allocator and allocator_traits

The Allocator requirements in [allocator.requirements] are written as a long table, but almost every row has a default in `allocator_traits`. What you must write is `value_type`, `allocate`, `deallocate`, equality, and a converting constructor from the same template with another element type.

```cpp
#include <cstddef>
#include <list>
#include <new>
#include <vector>

template <class T>
struct Mini {
  using value_type = T;
  Mini() = default;
  template <class U> Mini(const Mini<U>&) noexcept {}
  T* allocate(std::size_t n) { return static_cast<T*>(::operator new(n * sizeof(T))); }
  void deallocate(T* p, std::size_t n) noexcept { ::operator delete(p, n * sizeof(T)); }
};
template <class T, class U>
bool operator==(const Mini<T>&, const Mini<U>&) { return true; }

std::vector<int, Mini<int>> v{1, 2, 3};
std::list<int, Mini<int>> l{1, 2, 3};   // rebinds Mini<int> to Mini<node>
```

Since C++20 `operator!=` is synthesized from `operator==`. `allocator_traits` provides `pointer` as `value_type*`, `size_type`, `max_size`, `construct` through `std::construct_at`, `destroy` through `std::destroy_at`, the propagation traits as `false_type`, and `is_always_equal` as `std::is_empty<A>`. A stateless allocator is therefore treated as always equal without saying so.

`std::allocator<T>` is the default. C++20 removed its `construct`, `destroy` and `rebind` members, which `allocator_traits` provides anyway, and made it usable in constant evaluation.

### Rebinding

A `std::list<int, A>` never allocates an `int`. It allocates nodes that contain an `int` and two pointers. It obtains an allocator for nodes with `allocator_traits<A>::rebind_alloc<Node>`, which defaults to replacing the first template argument, so `Mini<int>` becomes `Mini<Node>`. Then it constructs that allocator from the one you passed, which is why the converting constructor is required.

Rebinding must preserve identity. An allocator and its rebound copy must compare equal both ways, meaning memory from either can be freed by the other. A stateful allocator therefore carries the same state, typically a pointer to an arena, through every rebind.

## Stateful allocators and the propagation traits

When allocators carry state, unequal allocators can coexist, and each container operation has to decide what to do with them. Three traits make the decision, plus one function for copies.

| Operation | Trait or function | If it says no and the allocators differ |
|---|---|---|
| copy construction | `select_on_container_copy_construction()` | the returned allocator is used, whatever it is |
| copy assignment | `propagate_on_container_copy_assignment` (POCCA) | keep the target's allocator, copy elements into its memory |
| move assignment | `propagate_on_container_move_assignment` (POCMA) | keep the target's allocator, move elements one by one |
| swap | `propagate_on_container_swap` (POCS) | undefined behavior |

Move construction has no trait. It always move-constructs the allocator from the source, so the new container can adopt the source's buffer in constant time.

The move-assignment case explains a surprise in the standard containers' signatures. When POCMA is true, the target frees its own memory with its old allocator, takes the source's allocator, and steals the buffer. When POCMA is false but the allocators compare equal, it can steal the buffer anyway. When POCMA is false and they compare unequal, the target's allocator cannot free the source's buffer, so the target must allocate its own memory and move-assign or move-construct each element. That can throw. So `vector`'s move assignment is declared `noexcept(POCMA || is_always_equal)`, and for allocators that are neither, it is not `noexcept`.

```cpp
#include <memory_resource>
#include <type_traits>
#include <vector>

static_assert(std::is_nothrow_move_assignable_v<std::vector<int>>);
static_assert(!std::is_nothrow_move_assignable_v<std::pmr::vector<int>>);
static_assert(std::is_nothrow_move_constructible_v<std::pmr::vector<int>>);
```

> **Standardese.** [container.reqmts] says that when POCS is false, `swap` does not exchange the allocators, and the behavior is undefined unless the two allocators compare equal. Swap is specified as constant time and non-throwing for containers other than `std::array`, so it cannot fall back to copying elements the way move assignment does.

`std::allocator` has POCMA true and is always equal, which is why ordinary containers never meet these cases.

## std::pmr: the resource behind a pointer

C++17's `std::pmr` moves the memory source out of the allocator's type and behind a virtual interface. `std::pmr::memory_resource` has public non-virtual `allocate`, `deallocate` and `is_equal`, which call the private virtual `do_allocate`, `do_deallocate` and `do_is_equal`. `std::pmr::polymorphic_allocator<T>` is a thin allocator that stores a `memory_resource*` and forwards to it. Containers in `std::pmr`, such as `std::pmr::vector<T>`, are aliases for the ordinary templates with that allocator, so containers using different resources have the same type.

The surprising part is that `polymorphic_allocator` never propagates. All three propagation traits are false, and `select_on_container_copy_construction` returns a default-constructed allocator, which uses the current default resource rather than the source's resource.

```cpp
#include <memory_resource>
#include <vector>

void copy_does_not_follow() {
  std::pmr::monotonic_buffer_resource arena;
  std::pmr::vector<int> a({1, 2, 3}, &arena);
  std::pmr::vector<int> b = a;
  // b.get_allocator().resource() == std::pmr::get_default_resource(), not &arena
}
```

The design reflects how resources are used. A resource is usually scoped: a monotonic arena on the stack for one request, a pool for one subsystem. An object's resource is decided when the object is constructed and then never changes. If copying or assigning propagated the resource, a long-lived container could silently start pointing at an arena about to be destroyed. The cost is that `b = std::move(a)` between different resources copies element by element and may throw.

> **Pitfall.** Returning a `std::pmr::vector` by value from a function, or copying one into a member, does not keep the arena it was built in. The copy goes to the default resource, which is usually `new_delete_resource()`. Pass the resource explicitly, as in `std::pmr::vector<int> b(a, &arena);`.

## The standard resources

The library provides two global resources and three classes.

- `std::pmr::new_delete_resource()` allocates with `::operator new` and is the initial default resource.
- `std::pmr::null_memory_resource()` throws `std::bad_alloc` from every allocation. As an upstream it turns "fell back to the heap" into an error.
- `std::pmr::monotonic_buffer_resource` hands out memory by bumping a pointer through an optional initial buffer, then through blocks of growing size obtained from its upstream. `deallocate` does nothing; everything is returned at once by `release()` or the destructor. It is not thread-safe.
- `std::pmr::unsynchronized_pool_resource` and `std::pmr::synchronized_pool_resource` keep pools of fixed-size blocks for a range of sizes and route larger requests to the upstream. The synchronized one may be used from several threads. `std::pmr::pool_options` tunes the largest pooled size and the chunk size.

`std::pmr::set_default_resource` changes what default-constructed polymorphic allocators use, for the whole program.

```cpp
#include <cstddef>
#include <memory_resource>
#include <vector>

int sum_small() {
  std::byte buf[1024];
  std::pmr::monotonic_buffer_resource arena(buf, sizeof buf, std::pmr::null_memory_resource());
  std::pmr::vector<int> v(&arena);
  for (int i = 0; i < 10; ++i) v.push_back(i);   // no heap; overflowing buf throws bad_alloc
  int s = 0;
  for (int x : v) s += x;
  return s;
}
```

## Uses-allocator construction and scoped_allocator_adaptor

A container of strings has two levels of allocation: the outer buffer and each string's characters. Uses-allocator construction is the protocol that passes the outer allocator down. A type opts in through `std::uses_allocator<T, Alloc>`, normally by having a nested `allocator_type`, and accepts the allocator either as a trailing constructor argument or after a leading `std::allocator_arg` tag. C++20 exposed the protocol through `std::uses_allocator_construction_args` and `std::make_obj_using_allocator`, and extended it to `std::pair` members.

`polymorphic_allocator::construct` always performs uses-allocator construction, so the elements of a `std::pmr::vector<std::pmr::string>` use the vector's resource with no further work.

```cpp
#include <memory_resource>
#include <string>
#include <vector>

bool nested_uses_arena() {
  std::pmr::monotonic_buffer_resource arena;
  std::pmr::vector<std::pmr::string> v(&arena);
  v.emplace_back("a string long enough to defeat the small buffer");
  return v[0].get_allocator().resource() == &arena;   // true
}
```

For allocators that do not do this themselves, C++11's `std::scoped_allocator_adaptor<Outer, Inner...>` wraps the outer allocator and performs uses-allocator construction of each element with the inner allocator. It predates `std::pmr` and is mostly seen in code that uses custom arena allocators without virtual dispatch.

## allocate_at_least (C++23)

Real allocators round requests up to a size class, so asking for 13 elements might return room for 16. C++23 lets the container learn that. `std::allocator_traits<A>::allocate_at_least(a, n)` returns a `std::allocation_result` holding `ptr` and `count`, with `count >= n`. It calls the allocator's own `allocate_at_least` if it has one, and otherwise returns `{a.allocate(n), n}`. `std::allocator` provides the member.

The obligation runs the other way on deallocation: pass `deallocate` a size between the requested `n` and the returned `count`, normally `count` itself. A `vector` that records the returned count as its capacity can absorb the extra slack before reallocating. Whether a given library uses it inside its containers is an implementation choice, and the standard resources do not offer it.

## What to remember

- Equal allocators can free each other's memory; that one rule decides when buffers may change hands.
- A minimal allocator needs `value_type`, `allocate`, `deallocate`, `==` and a converting constructor; `allocator_traits` supplies the rest.
- Node-based containers rebind the allocator to their node type, and rebound copies must compare equal.
- POCCA, POCMA and POCS decide whether the allocator follows the elements. Move construction always takes the source's allocator.
- Move assignment with unequal, non-propagating allocators moves element by element and may throw, so such containers are not nothrow move assignable.
- Swapping containers with unequal, non-propagating allocators is undefined.
- `polymorphic_allocator` never propagates, and copy construction uses the default resource, not the source's.
- `monotonic_buffer_resource` never frees until release; pool resources reuse blocks by size; `null_memory_resource` makes overflow an error.
- `polymorphic_allocator` performs uses-allocator construction, so nested pmr containers share the outer resource; `scoped_allocator_adaptor` does the same for other allocators.
- `allocate_at_least` (C++23) reports the real size of an allocation through `allocator_traits`.
