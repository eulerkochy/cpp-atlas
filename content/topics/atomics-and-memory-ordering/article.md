---
title: "Atomics and memory ordering"
summary: "How C++ defines memory locations, data races, happens-before graphs, acquire-release synchronization, store buffering, and fences."
track: memory-model
minutes: 11
standard:
  - "[intro.memory]"
  - "[intro.races]"
  - "[atomics.order]"
  - "[atomics.types.generic]"
  - "[atomics.fences]"
  - "[atomics.ref.generic]"
cppreference:
  - title: "Memory model"
    path: "language/memory_model"
  - title: "std::atomic"
    path: "atomic/atomic"
  - title: "std::memory_order"
    path: "atomic/memory_order"
  - title: "std::atomic_ref"
    path: "atomic/atomic_ref"
  - title: "std::atomic_thread_fence"
    path: "atomic/atomic_thread_fence"
  - title: "std::atomic::compare_exchange_weak"
    path: "atomic/atomic/compare_exchange"
prerequisites:
  - "object-lifetime-and-storage"
  - "evaluation-order"
---

Locks protect critical sections at the cost of kernel waits or contention. Lock-free programming swaps coarse mutual exclusion for `std::atomic<T>` and explicit **memory ordering constraints**—contracts governing both how the compiler may reorder instructions and which hardware memory barriers must synchronize store buffers across cores.

## Memory locations, bit-fields, and data races

Thread safety in C++ begins at the granularity of a **memory location** (`[intro.memory]`). A memory location is either an object of scalar type (`int`, `double`, pointer) or a maximal sequence of adjacent non-zero-length bit-fields.

Two threads may access distinct memory locations concurrently with zero synchronization. Adjacent scalar struct members (`int a; int b;`) occupy separate memory locations, whereas adjacent non-zero bit-fields share a **single** memory location because CPUs update them via non-atomic read-modify-write instructions on the enclosing machine word:

```cpp
struct Flags {
    unsigned rx_ready : 4;
    unsigned          : 0; // Zero-width bit-field starts a new memory location
    unsigned tx_ready : 4;
};
```

Without the `: 0` separator, one thread writing `f.rx_ready = 1` while another writes `f.tx_ready = 2` triggers a **data race**. Under `[intro.races]`, two conflicting accesses (at least one write, at least one non-atomic) with no happens-before ordering cause **undefined behavior**—not merely a torn read.

When existing non-atomic aligned data needs temporary atomic access during a parallel phase without changing its stored type permanently, C++20 provides `std::atomic_ref<T>` (`[atomics.ref.generic]`), provided no non-atomic access overlaps the lifetime of the `atomic_ref` usage.

> **Standardese.** Per `[intro.races]`, a data race on any non-atomic variable poisons the entire execution with undefined behavior—even on architectures where aligned word reads and writes appear atomic at the assembly level.

## Sequenced-before, synchronizes-with, and happens-before

The C++ memory model guarantees visibility across threads by composing three partial-order relations:

- **Sequenced-before:** evaluation order within a single thread.
- **Synchronizes-with:** an inter-thread edge formed when an atomic release store (or release fence + relaxed store) writes a value read by an atomic acquire load (or relaxed load + acquire fence).
- **Happens-before:** the transitive closure of sequenced-before and synchronizes-with.

```text
Thread 1 (Producer)                        Thread 2 (Consumer)
  payload = 42;
       │  sequenced-before
       ▼
  ready.store(true, release) ──synchronizes-with──▶ while (!ready.load(acquire))
                                                           │  sequenced-before
                                                           ▼
                                                     assert(payload == 42);
```

Because `payload = 42` is sequenced-before `ready.store(true, release)`, and the acquire loop reads that `true` value, `payload = 42` **happens-before** `assert(payload == 42)`. Notice that a release-acquire chain also extends through **release sequences**: if intermediate threads perform atomic read-modify-write operations (`fetch_add`, `exchange`, `compare_exchange`) on `ready` with any ordering (even `relaxed`), an acquire load reading the final value in that modification chain still synchronizes with the initial release store (`[intro.races]`).

> **Mental model.** Release-acquire synchronization does not "flush CPU caches." It erects a one-way happens-before bridge: ordinary writes before a release store cannot sink past it, and ordinary reads after an acquire load cannot hoist ahead of it.

## The memory_order spectrum compared

Every `std::atomic` operation accepts one of the `std::memory_order` modes (`std::memory_order_seq_cst` by default):

| Memory order | Atomicity | Surrounding reordering constraints | Cross-thread total order |
| --- | --- | --- | --- |
| `relaxed` | Indivisible RMW and reads | None for unrelated memory accesses | Single atomic's modification order only |
| `acquire` | Indivisible read or RMW | Prevents later reads/writes hoisting ahead of load | Pairwise with matching `release` |
| `release` | Indivisible store or RMW | Prevents earlier reads/writes sinking past store | Pairwise with matching `acquire` |
| `acq_rel` | Indivisible RMW | Combines `acquire` and `release` on RMWs | Pairwise on read and write sides |
| `seq_cst` | Indivisible load, store, or RMW | Full `acquire`/`release` semantics plus global order | Single total modification order `S` |

Note that `memory_order::consume` (intended for hardware data-dependency ordering) has been discouraged since C++17; compilers treat it identically to `acquire`.

## Store buffering and why acquire-release is not seq_cst

Developers often assume `release` on stores paired with `acquire` on loads forbids all counter-intuitive outcomes. The **Store Buffering** litmus test proves otherwise—even on strongly ordered x86-64 CPUs!

Suppose `std::atomic<int> x{0}, y{0};` start at zero:

- **Thread 1:** `x.store(1, release); int r1 = y.load(acquire);`
- **Thread 2:** `y.store(1, release); int r2 = x.load(acquire);`

Can **both `r1 == 0` and `r2 == 0`** occur? **Yes.** Release forbids prior writes from sinking past the store, and acquire forbids subsequent reads from hoisting ahead of the load—yet **neither** prevents a following acquire load from moving *before* an earlier release store into a core's local store buffer! Each core buffers its own `1` store locally while its read misses the peer's buffer and observes `0`.

Replacing those operations with `std::memory_order::seq_cst` forces a single global order `S` across all `seq_cst` operations, making `r1 == 0 && r2 == 0` impossible.

> **Pitfall.** Sequential consistency holds **only** among `seq_cst` operations. Mixing `relaxed` or `acquire`/`release` operations into a `seq_cst` protocol breaks the global `S` ordering guarantees you relied on to prevent store-buffering anomalies.

## Compare-exchange loops and fences

Read-modify-write algorithms frequently build custom transitions using `compare_exchange_weak` or `compare_exchange_strong`:

```cpp
#include <atomic>

void atomic_update_max(std::atomic<int>& target, int candidate) noexcept {
    int current = target.load(std::memory_order::relaxed);
    while (current < candidate &&
           !target.compare_exchange_weak(
               current, candidate,
               std::memory_order::release,
               std::memory_order::relaxed)) {
        // On failure, `current` is reloaded with target's latest value.
    }
}
```

Use `compare_exchange_weak` inside retry loops because architectures with load-linked/store-conditional (ARM, POWER) may fail spuriously without extra retry loops inside the instruction sequence; use `compare_exchange_strong` for single-shot state flips where looping would cost extra boilerplate. Under C++17+, the failure memory order only needs to avoid `release` and `acq_rel` (`[atomics.types.operations]`).

When a reader loops many times checking a relaxed flag and only consumes shared data once ready, **`std::atomic_thread_fence`** avoids executing acquire barriers on every failed iteration:

```cpp
#include <atomic>

std::atomic<int> state{0};
int shared_data = 0;

void fence_publish() {
    shared_data = 99;
    std::atomic_thread_fence(std::memory_order::release);
    state.store(1, std::memory_order::relaxed);
}

int fence_consume() {
    if (state.load(std::memory_order::relaxed) == 1) {
        std::atomic_thread_fence(std::memory_order::acquire);
        return shared_data;
    }
    return 0;
}
```

> **Pitfall.** `std::atomic<BigStruct>` compiles quietly for arbitrary trivially copyable structs by falling back to an internal mutex shard table. Always verify `std::atomic<T>::is_always_lock_free` with `static_assert` when targeting real-time or lock-free paths.

## What to remember

- Two threads writing adjacent non-zero bit-fields share **one memory location** and create data-race UB unless separated by `: 0` or synchronized.
- **`relaxed`** guarantees atomicity and single-variable modification order (ideal for pure counters) without synchronizing surrounding non-atomic memory.
- Pair **`release`** stores with **`acquire`** loads to form `synchronizes-with` edges that carry non-atomic payload writes via `happens-before`.
- **`acquire`/`release`** still permits Store Buffering (`r1 == 0 && r2 == 0`); reach for **`seq_cst`** when a single global total order across distinct atomics is required.
- Prefer **`compare_exchange_weak`** in retry loops and verify **`is_always_lock_free`** before assuming hardware atomic instructions.
