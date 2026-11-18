---
title: "Smart pointers, control blocks, and allocators"
summary: "How unique_ptr achieves zero-overhead ownership, what a shared_ptr control block stores, and how allocator_traits and std::pmr decouple allocation strategy from container types."
track: memory-model
minutes: 9
standard:
  - "[unique.ptr]"
  - "[util.smartptr.shared]"
  - "[util.smartptr.weak]"
  - "[util.smartptr.enab]"
  - "[allocator.requirements]"
  - "[allocator.traits]"
  - "[mem.res]"
cppreference:
  - title: "std::unique_ptr"
    path: "memory/unique_ptr"
  - title: "std::make_unique"
    path: "memory/unique_ptr/make_unique"
  - title: "std::shared_ptr"
    path: "memory/shared_ptr"
  - title: "std::make_shared"
    path: "memory/shared_ptr/make_shared"
  - title: "std::weak_ptr"
    path: "memory/weak_ptr"
  - title: "std::enable_shared_from_this"
    path: "memory/enable_shared_from_this"
  - title: "std::allocator_traits"
    path: "memory/allocator_traits"
  - title: "std::pmr::polymorphic_allocator"
    path: "memory/polymorphic_allocator"
  - title: "std::pmr::memory_resource"
    path: "memory/memory_resource"
prerequisites:
  - raii-and-resource-management
  - object-lifetime-and-storage
  - copy-and-move
---

Raw `new` and `delete` mix two distinct responsibilities: obtaining memory and tracking who destroys the object. Modern C++ splits ownership models (`std::unique_ptr`, `std::shared_ptr`, `std::weak_ptr`) from allocation strategies (`std::allocator_traits`, `std::pmr::memory_resource`), giving you deterministic teardown without hidden runtime costs.

## Exclusive ownership and deleter footprint

`std::unique_ptr<T, Deleter>` models single, non-copyable ownership. Move operations transfer the wrapped pointer and null the source in two register instructions, and the destructor invokes `Deleter` if the stored pointer is non-null. Because the deleter is a template parameter baked into the type, the compiler optimizes empty stateless deleters—such as `std::default_delete<T>`, empty function objects, or captureless lambdas—via empty-base optimization or `[[no_unique_address]]`, making `sizeof(std::unique_ptr<T>) == sizeof(T*)`.

When you pass a function pointer (`void(*)(T*)`) or a stateful capturing lambda as `Deleter`, that state lives inside the `unique_ptr` itself, doubling or growing its footprint and changing its static type. For array buffers (`std::unique_ptr<T[]>`), the specialization provides `operator[]`, omits `*` and `->`, dispatches `delete[]`, and blocks derived-to-base pointer conversions because array indexing scales by `sizeof(Base)`. Since C++20, `std::make_unique_for_overwrite<T[]>(n)` lets you allocate large uninitialized arrays without paying for a forced zero-fill.

> **Mental model.** A `unique_ptr` with a stateless deleter compiles to a single machine pointer; only its deleted copy operations and deterministic destructor distinguish it from `T*`.

```cpp
#include <cstddef>
#include <memory>

struct HandleCloser {
    void operator()(int* p) const noexcept { delete p; }
};

void close_raw(int* p) noexcept { delete p; }

static_assert(sizeof(std::unique_ptr<int>) == sizeof(int*));
static_assert(sizeof(std::unique_ptr<int, HandleCloser>) == sizeof(int*));
static_assert(sizeof(std::unique_ptr<int, void(*)(int*)>) == 2 * sizeof(int*));

auto scratch = std::make_unique_for_overwrite<std::byte[]>(4096);
```

## Shared ownership and the control block

Unlike `unique_ptr`, `std::shared_ptr<T>` is always two pointers wide (`sizeof == 2 * sizeof(void*)`): the **stored pointer** returned by `get()` and a pointer to a heap-allocated **control block**. That control block holds four ingredients: an atomic strong reference count (`use_count`), an atomic weak reference count (`weak_count`), a type-erased deleter, and a copy of the allocator used to create the control block itself.

Keeping the stored pointer separate from the control block unlocks two crucial features. First, converting `std::shared_ptr<Derived>` to `std::shared_ptr<Base>` works safely even when `Base` has a **non-virtual** destructor or uses multiple inheritance, because the control block's type-erased deleter remembers the original `Derived*` passed at construction while the stored pointer shifts to the `Base` subobject. Second, the **aliasing constructor** `std::shared_ptr<Member>(owner, &owner->member)` creates a handle pointing directly to a subobject while still keeping `owner`'s control block alive.

Prefer `std::make_shared<T>(args...)` or `std::allocate_shared<T>(alloc, args...)` whenever possible: both allocate a single contiguous block holding the control block alongside `T`'s storage, cutting allocation count in half and improving cache locality.

> **Pitfall.** Never construct two separate `shared_ptr` instances from the same raw pointer `T*`; each creates an independent control block and triggers double deletion. Notice too that `std::make_shared` fuses the control block and `T` into one allocation: although `~T()` runs immediately when the strong count drops to zero, the raw memory block cannot be freed until every surviving `weak_ptr` also expires.

```cpp
#include <memory>

struct Base { int tag = 1; }; // Intentionally non-virtual destructor
struct Derived : Base { int payload = 42; };

struct Session : std::enable_shared_from_this<Session> {
    std::shared_ptr<Session> share() { return shared_from_this(); }
};

void ownership_demo() {
    std::shared_ptr<Base> base = std::make_shared<Derived>();
    auto derived = std::make_shared<Derived>();
    // Aliasing constructor: points to member while sharing Derived's control block
    std::shared_ptr<int> alias(derived, &derived->payload);
    static_assert(sizeof(alias) == 2 * sizeof(void*));
}
```

## Weak observers and shared_from_this

`std::weak_ptr<T>` points to the control block without incrementing the strong count, breaking parent-child ownership cycles. Because another thread can drop the last `shared_ptr` immediately after `wp.expired()` returns `false`, never gate access on `expired()`. Always call `wp.lock()`, which atomically checks `use_count > 0` and increments it in one indivisible step, returning either an owning `shared_ptr<T>` or null.

Remember the thread-safety boundary of `shared_ptr`: control-block reference counts are atomic, so copying or destroying **distinct** `shared_ptr` instances sharing one control block across threads is race-free. Reading and writing the **same** `shared_ptr` object concurrently from two threads is still a data race; wrap shared handles in `std::atomic<std::shared_ptr<T>>` (C++20) rather than the deprecated `std::atomic_load` free functions.

When a managed object must hand out `shared_ptr` handles to `*this`, inherit publicly from `std::enable_shared_from_this<T>`. Its hidden `weak_this` member is populated by `shared_ptr` constructors *after* `T` finishes constructing. Calling `shared_from_this()` inside a constructor or on an object owned by the stack or `unique_ptr` throws `std::bad_weak_ptr` (well-defined since C++17).

## Allocator traits and propagation contracts

Standard containers do not invoke allocator methods directly; they talk through `std::allocator_traits<Alloc>`, which supplies defaults for `pointer`, `rebind_alloc`, `construct`, `destroy`, `max_size`, and C++23 `allocate_at_least`. `allocate_at_least(alloc, n)` returns an `allocation_result` containing `{ptr, count}`, allowing `std::vector` to adopt extra bucket capacity rounded up by slab allocators instead of wasting trailing bytes.

For stateful allocators—such as arenas or per-subsystem pools—four propagation traits govern container operations:

- **`propagate_on_container_copy_assignment` (POCCA)** decides whether `a = b` copies `b`'s allocator handle into `a`.
- **`propagate_on_container_move_assignment` (POCMA)** decides whether `a = std::move(b)` transfers `b`'s allocator handle so `a` can steal `b`'s buffer in constant time.
- **`propagate_on_container_swap` (POCS)** decides whether `swap(a, b)` exchanges allocator handles along with buffers.
- **`select_on_container_copy_construction(alloc)`** returns the allocator used by a freshly copy-constructed container.

If `POCMA` is `std::false_type` and two containers hold unequal allocators (`a.get_allocator() != b.get_allocator()`), `a = std::move(b)` **cannot** steal `b`'s heap buffer—`a`'s allocator could not legally free memory owned by `b`'s arena—so the container falls back to linear element-by-element moves into fresh allocations.

> **Standardese.** Under `[allocator.requirements]` and `[container.requirements]`, calling `swap` on two containers whose allocators compare unequal when `propagate_on_container_swap` is `std::false_type` causes **undefined behavior** rather than copying elements.

## Type-erased allocators with std::pmr

Template allocators bake allocation strategy into the container's static type: `std::vector<int, ArenaAlloc>` cannot be passed to a function expecting `std::vector<int>`. The `<memory_resource>` library erases the allocator type behind a virtual interface, `std::pmr::memory_resource` (`do_allocate`, `do_deallocate`, `do_is_equal`). Every `std::pmr::vector<int>` uses `std::pmr::polymorphic_allocator<int>`, which stores a single `memory_resource*` pointer, keeping the container's ABI uniform whether backed by a stack buffer (`monotonic_buffer_resource`), a thread-local pool (`unsynchronized_pool_resource`), or a mutex-protected pool (`synchronized_pool_resource`).

> **Pitfall.** `std::pmr::polymorphic_allocator` sets `POCCA`, `POCMA`, and `POCS` to `std::false_type`, and `select_on_container_copy_construction()` returns a handle to `std::pmr::get_default_resource()`. Move-assigning a `pmr::vector` backed by a stack arena into a `pmr::vector` bound to a different resource silently relocates elements one by one into the target's resource instead of stealing the buffer pointer.

```cpp
#include <array>
#include <cstddef>
#include <memory_resource>
#include <vector>

void pmr_arena_demo() {
    std::array<std::byte, 1024> stack_bytes{};
    std::pmr::monotonic_buffer_resource arena{
        stack_bytes.data(), stack_bytes.size(), std::pmr::null_memory_resource()
    };

    std::pmr::vector<int> local(&arena);
    local.push_back(10);
    local.push_back(20);

    std::pmr::vector<int> heap_vec; // Uses std::pmr::get_default_resource()
    heap_vec = std::move(local);    // POCMA is false: copies/moves elements, does NOT steal arena
}
```

The memory-management choices summarize cleanly across footprint, allocation count, and strategy propagation:

| Mechanism | Footprint | Heap Control Block | Type-Erased Strategy | Propagation / Safety Rule |
| --- | --- | --- | --- | --- |
| `unique_ptr<T>` | 1 pointer | None | No (deleter in type) | Move-only; stateless deleter has zero size cost |
| `shared_ptr<T>` | 2 pointers | Yes (atomic counts) | Yes (deleter + allocator) | `make_shared` fuses object and control block |
| `weak_ptr<T>` | 2 pointers | Observes control block | Yes | Always promote via `lock()`, never `expired()` |
| Custom `Allocator` | Zero or state | None | No (infects container type) | Check `POCMA` and `POCS` on stateful arenas |
| `pmr::polymorphic_allocator` | 1 pointer | None | Yes (`memory_resource*`) | Never propagates on copy, move-assign, or swap |

## What to remember

- Reach for `std::unique_ptr` by default; stateless deleters add zero size overhead over `T*`, while function-pointer deleters double the pointer size.
- A `std::shared_ptr` carries two pointers (stored pointer plus control block), making aliasing and non-virtual base destruction safe, while `make_shared` trades deferred memory release alongside `weak_ptr` for a single allocation.
- Promote `std::weak_ptr` strictly with `lock()`, and never call `shared_from_this()` inside constructors or on objects not yet adopted by a `shared_ptr`.
- Use `std::allocator_traits` in generic containers and watch `POCMA` and `POCS` whenever allocators carry state.
- `std::pmr` unifies container types across arenas and pools, but non-propagating `polymorphic_allocator` contracts turn cross-resource move assignment into element-by-element reallocation.
