---
title: "Lock-free programming and ABA"
summary: "Lock-free code replaces mutual exclusion with compare-and-swap retry loops, which buys a progress guarantee and costs you memory reclamation. This page builds the Treiber stack, shows how the ABA problem and use-after-free break it, and surveys tagged pointers, hazard pointers, RCU and atomic shared_ptr as fixes."
track: "concurrency"
minutes: 15
standard:
  - "[intro.progress]"
  - "[intro.races]"
  - "[atomics.lockfree]"
  - "[atomics.order]"
  - "[atomics.types.operations]"
  - "[atomics.flag]"
  - "[util.smartptr.atomic]"
cppreference:
  - title: "std::atomic<T>::compare_exchange_weak, compare_exchange_strong"
    path: "atomic/atomic/compare_exchange"
  - title: "std::atomic<T>::is_always_lock_free"
    path: "atomic/atomic/is_always_lock_free"
  - title: "std::atomic<T>::is_lock_free"
    path: "atomic/atomic/is_lock_free"
  - title: "std::atomic_flag"
    path: "atomic/atomic_flag"
  - title: "std::atomic<std::shared_ptr>"
    path: "memory/shared_ptr/atomic2"
  - title: "std::memory_order"
    path: "atomic/memory_order"
  - title: "std::hardware_destructive_interference_size"
    path: "thread/hardware_destructive_interference_size"
prerequisites:
  - "atomics-and-memory-ordering"
  - "mutexes-and-locks"
  - "smart-pointers"
---

## The one idea

A lock-free data structure never makes one thread wait for another to leave a critical section. Instead, every thread reads the shared state, computes the new state privately, and tries to install it with a single compare-and-swap. If another thread got there first, the swap fails and the thread starts over. That one change gives a real progress guarantee, because a preempted thread can no longer stall everyone else. It also creates the hardest problem in the field: a thread that read a pointer can be stopped for an arbitrary time, and by the time it uses the pointer, the node may have been freed, reused, and put back.

> **Mental model.** A CAS loop is optimistic concurrency on one word. It proves only that the word holds the same bits it held when you read it, not that nothing happened in between. Everything else in lock-free programming, including ABA defences and memory reclamation schemes, exists to close that gap.

This page builds on atomics-and-memory-ordering, which covers `compare_exchange_weak` versus `compare_exchange_strong` and what each memory order means.

## Progress guarantees

Four levels of progress are usually distinguished:

- **Blocking**: a thread can be prevented from making progress indefinitely by another thread that is not running, for example one holding a mutex while preempted.
- **Obstruction-free**: a thread that runs in isolation, with all others paused, finishes in a bounded number of steps. Contention can cause livelock.
- **Lock-free**: whenever threads are running the operation, at least one of them finishes in a bounded number of steps. Individual threads can starve, but the system as a whole progresses.
- **Wait-free**: every thread finishes in a bounded number of its own steps, regardless of the others.

A Treiber stack's push is lock-free but not wait-free: a CAS only fails because some other thread's CAS succeeded, so someone always progresses, but an unlucky thread can lose every race. A `fetch_add` on hardware with an atomic add instruction, such as Arm's LSE `ldadd` or x86's `lock xadd`, is wait-free.

> **Standardese.** [intro.progress] calls executions of lock-free atomic functions lock-free executions, but it only *requires* the obstruction-free property: if only one thread is not blocked in a library function, its lock-free execution shall complete. That at least one of several concurrent lock-free executions completes is a *should*, because load-linked and store-conditional hardware can, in principle, make threads keep invalidating each other.

Whether a given `std::atomic<T>` is lock-free is up to the implementation. `is_always_lock_free` answers at compile time, `is_lock_free()` at run time, and only `std::atomic_flag` is guaranteed lock-free; C++20 added the aliases `std::atomic_signed_lock_free` and `std::atomic_unsigned_lock_free` for integer types that are. Results vary even on one machine. For a 16-byte struct on this page's arm64 test machine, Clang 21 reported `std::atomic` as always lock-free, while GCC 16 reported it as not lock-free and routed it through libatomic.

## CAS loops and the Treiber stack

The Treiber stack is a singly linked list whose head is an atomic pointer. Push links a new node in front of the current head and tries to swing the head to it. Pop reads the head and tries to swing it to the head's successor.

```cpp
#include <atomic>
#include <optional>
#include <utility>

template <class T>
class TreiberStack {
  struct Node { T value; Node* next; };
  std::atomic<Node*> head_{nullptr};

public:
  void push(T v) {
    Node* n = new Node{std::move(v), head_.load(std::memory_order_relaxed)};
    // On failure, n->next is overwritten with the current head and we retry.
    while (!head_.compare_exchange_weak(n->next, n,
                                        std::memory_order_release,
                                        std::memory_order_relaxed)) {
    }
  }

  std::optional<T> pop() {            // broken under concurrency: see below
    Node* old = head_.load(std::memory_order_acquire);
    while (old && !head_.compare_exchange_weak(old, old->next,
                                               std::memory_order_acquire,
                                               std::memory_order_acquire)) {
    }
    if (!old) return std::nullopt;
    T v = std::move(old->value);
    delete old;                       // another popper may still be reading old->next
    return v;
  }
};
```

Push is correct as written. The node is private until the CAS publishes it, so the plain writes to `value` and `next` cannot race, and passing `n->next` as the expected value means a failed CAS refreshes it for free. Using `compare_exchange_weak` is right because the loop recomputes everything anyway, so a spurious failure costs one more iteration.

Pop is not correct, and the bug is not subtle once you look at the line that reads `old->next`. Between loading `old` and reading its `next` field, another thread can pop the same node and delete it. The first thread then reads freed memory, which is undefined behavior whether or not its CAS would later fail.

## The ABA problem

Even if nodes are never freed but are recycled through a free list, pop can corrupt the stack. The CAS compares only the pointer value, and a pointer value can come back.

```text
head -> A -> B -> C

T1: old = A, next = B          (then T1 is preempted)
T2: pop A, pop B, push A       (A is reused; B is gone)
    head -> A -> C
T1: CAS(head, A -> B) succeeds, because head is A again
    head -> B                  (B is not in the stack any more; C is lost)
```

This is the ABA problem: the value went from A to B and back to A, and a single-word CAS cannot tell. With node recycling there is also a data race, because T2's push writes `A->next` while T1 reads it, so the program has undefined behavior before the CAS even runs, unless `next` is itself atomic.

> **Pitfall.** ABA and unsafe reclamation are two different problems that happen to share a cause. A version tag stops the wrong CAS from succeeding, but it does nothing about T1 dereferencing a node that has already been returned to the allocator. Most real fixes solve reclamation, and ABA disappears with it because a node cannot be reused while anyone can still see it.

## Safe memory reclamation

**Tagged pointers.** Pair the pointer with a counter in one atomic word and increment the counter on every successful update. The CAS now fails if anything happened in between, even if the pointer came back. On 64-bit targets this needs a double-width CAS, such as `cmpxchg16b` on x86-64 or `casp` on Armv8.1, or spare pointer bits; whether `std::atomic` of a 16-byte struct is lock-free is implementation-specific. Tags only solve ABA, so the nodes must live in memory that is never returned to the operating system.

```cpp
#include <atomic>
#include <cstdint>

struct Node { int value; Node* next; };
struct Tagged { Node* ptr; std::uintptr_t tag; };   // 16 bytes on a 64-bit target

std::atomic<Tagged> head{Tagged{nullptr, 0}};

Node* pop() {
  Tagged old = head.load(std::memory_order_acquire);
  while (old.ptr) {
    Tagged desired{old.ptr->next, old.tag + 1};      // every successful pop bumps the tag
    if (head.compare_exchange_weak(old, desired, std::memory_order_acquire,
                                   std::memory_order_acquire))
      return old.ptr;                                // caller must not free it to the OS
  }
  return nullptr;
}
```

**Hazard pointers.** Before dereferencing a shared pointer, a thread publishes it in a per-thread slot that every other thread can read, then re-reads the source to confirm it has not changed. A thread that unlinks a node does not delete it; it retires it, and retired nodes are freed only once no hazard slot holds their address. The publish and the re-check need sequentially consistent ordering, or an equivalent fence, so that the retiring thread is guaranteed to see the hazard.

**RCU and epochs.** Readers announce only that they are inside a read-side critical section, which can be almost free. A writer unlinks the old version and waits for a grace period, after which every reader that could have seen it has left, and then frees it. Epoch-based reclamation is the same idea with explicit global epoch counters. Reads become very cheap; the cost is that one stalled reader delays all reclamation.

C++26 standardizes both of the last two in `<hazard_pointer>` and `<rcu>`, covered in hazard-pointers-and-rcu.

**`std::atomic<std::shared_ptr<T>>`.** Since C++20 the reference count itself solves reclamation: a popper holding a `shared_ptr` copy of the head keeps that node alive, so it cannot be freed or reused underneath it, and ABA cannot occur.

```cpp
#include <atomic>
#include <memory>
#include <optional>

template <class T>
class SharedStack {
  struct Node { T value; std::shared_ptr<Node> next; };
  std::atomic<std::shared_ptr<Node>> head_;

public:
  void push(T v) {
    auto n = std::make_shared<Node>(std::move(v), head_.load());
    while (!head_.compare_exchange_weak(n->next, n)) {}
  }
  std::optional<T> pop() {
    std::shared_ptr<Node> old = head_.load();       // our reference keeps *old alive
    while (old && !head_.compare_exchange_weak(old, old->next)) {}
    if (!old) return std::nullopt;
    return std::move(old->value);
  }
};
```

It is simple and correct, but not necessarily lock-free: libstdc++ in GCC 16 reports `is_lock_free()` as false, and Clang 21's libc++ does not yet provide the specialization at all. Destroying a long chain of such nodes is also recursive and can overflow the stack.

## Memory orders in a CAS loop

A CAS takes two orders: one for success, when it is a read-modify-write, and one for failure, when it is only a load. Pick each by asking what the thread does next with what it read.

In push, success must be `release`, so that a popper's acquire sees the node's contents; failure can be `relaxed`, because the reloaded head is only stored into the private node. In pop, success needs `acquire` to read the value that push published. Failure also needs `acquire`, because the loop immediately dereferences the reloaded pointer to read `next`. Writing `relaxed` there is a classic bug that works on x86 and fails on Arm.

The failure order may not be `release` or `acq_rel`, since a failed CAS writes nothing; violating that precondition is undefined behavior. Until C++17 it also could not be stronger than the success order. P0418 removed that restriction, so success `relaxed` with failure `acquire` is valid today. If you pass only one order, the failure order is derived from it: `acq_rel` becomes `acquire`, `release` becomes `relaxed`, and the others stay as they are.

> **Pitfall.** GCC 16 still warns with `-Winvalid-memory-model` that a failure order "cannot be stronger than success". The warning reflects the pre-C++17 rule. The program is valid; the warning is a reason to check your orders, not proof of a bug.

## Contention, false sharing and linearizability

Lock-free is a progress property, not a speed property. Under heavy contention every thread hammers the same cache line, each failed CAS still has to take the line exclusively, and throughput can collapse below that of a mutex, which lets one thread run a batch of operations while the others sleep. Node-based structures also allocate on every push, and the reclamation scheme adds work to every access: a hazard pointer costs a sequentially consistent store per dereference. A sharded design, a per-thread buffer, or a plain `std::mutex` around a `std::vector` often wins.

False sharing makes it worse. Two atomics that are logically independent but share a cache line, such as a queue's head and tail indices, interfere as if they were one variable. This is a performance problem, not a correctness one: separate objects are separate memory locations and never race. Pad hot atomics apart with `alignas(std::hardware_destructive_interference_size)`, as described in atomics-and-memory-ordering.

The correctness criterion for a concurrent object is usually **linearizability**: every operation appears to take effect at a single instant between its call and its return, so the history is equivalent to some sequential history that respects real-time order. For the Treiber stack, the linearization point of a successful push or pop is its successful CAS, and of a pop that finds the stack empty, the load that read null. The C++ standard does not define linearizability. It gives you happens-before and the single total order of `seq_cst` operations, and a linearizability argument is built on top of those.

## What to remember

- Lock-free means some thread always progresses; wait-free means every thread does. CAS retry loops are lock-free, not wait-free.
- The standard requires only obstruction-freedom from lock-free atomics and merely encourages more; only `atomic_flag` is guaranteed lock-free.
- In a Treiber pop, reading `old->next` after another thread freed `old` is undefined behavior before ABA even arises.
- ABA is a CAS succeeding because a value came back; version tags fix ABA but not reclamation.
- Hazard pointers, RCU and epochs fix reclamation by delaying frees until no reader can hold the pointer; C++26 standardizes the first two.
- `atomic<shared_ptr>` avoids ABA through reference counting but is not lock-free in libstdc++.
- Choose the failure order by what you do with the reloaded value; it may not be `release` or `acq_rel`, and since C++17 it may be stronger than the success order.
- Lock-free structures can be slower than a mutex under contention; pad independent hot atomics to avoid false sharing.
