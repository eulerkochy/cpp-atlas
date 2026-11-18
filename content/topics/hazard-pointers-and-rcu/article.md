---
title: "Hazard pointers and RCU"
summary: "C++26 adds two standard answers to the question of when a lock-free reader's object may be deleted. Hazard pointers protect individual objects and bound the garbage; RCU protects whole read-side regions and makes readers nearly free."
track: "cpp26"
minutes: 13
standard:
  - "[saferecl.general]"
  - "[saferecl.hp.general]"
  - "[saferecl.hp.base]"
  - "[saferecl.hp.holder]"
  - "[saferecl.hp.holder.mem]"
  - "[saferecl.rcu.general]"
  - "[saferecl.rcu.base]"
  - "[saferecl.rcu.domain]"
  - "[saferecl.rcu.domain.func]"
  - "[structure.specifications]"
cppreference:
  - title: "Standard library header <hazard_pointer>"
    path: "header/hazard_pointer"
  - title: "Standard library header <rcu>"
    path: "header/rcu"
  - title: "Concurrency support library"
    path: "thread"
  - title: "std::scoped_lock"
    path: "thread/scoped_lock"
  - title: "Named requirements: Lockable"
    path: "named_req/Lockable"
  - title: "std::atomic<std::shared_ptr>"
    path: "memory/shared_ptr/atomic2"
prerequisites:
  - "lock-free-programming-and-aba"
  - "atomics-and-memory-ordering"
  - "mutexes-and-locks"
---

## The one idea

A lock-free reader loads a pointer from an atomic and dereferences it. Meanwhile a writer swaps in a new object and wants to delete the old one. The writer cannot know whether some reader is still looking at it. Both C++26 facilities solve this the same way: the writer does not delete, it **retires** the object, and the library deletes it later, once no reader can still be using it. They differ in how readers announce that they are using something.

With **hazard pointers**, a reader publishes the address of each object it is about to use. Reclamation skips any retired object whose address is published. With **RCU** (read-copy update), a reader brackets its work in a **region of RCU protection**. Reclamation waits until every region that might have seen the old object has ended.

> **Mental model.** Hazard pointers say "do not free *this* object". RCU says "do not free *anything* I might have seen until I am done". The first costs a little on every protected object and keeps garbage bounded. The second costs almost nothing per read but lets one slow reader hold up every deletion.

This is C++26. Hazard pointers come from P2530R3 and RCU from P2545R4, both adopted in June 2023, which is why both feature-test macros, `__cpp_lib_hazard_pointer` and `__cpp_lib_rcu`, are `202306L`. The text here follows N5050, the final C++26 draft sent to the international ballot. That ballot was reported as not approved in October 2026, so check the status before you quote this as published ISO C++. No standard library you are likely to have ships either header yet. GCC 16's libstdc++ has neither `<hazard_pointer>` nor `<rcu>`, and libc++ 21 lists both feature-test macros as unimplemented. The reference implementations are in Meta's Folly library, whose `folly/synchronization/Hazptr.h` and RCU library provide supersets of these interfaces under their own names. The examples on this page were type-checked against a small mock of the draft interface, not against a real implementation.

## The reclamation problem in one picture

The lock-free-programming-and-aba topic shows how freeing a node too early leads both to use-after-free and to ABA, because a freed address can come back as a new node. Garbage collection would solve it, and C++ has none. Reference counting with `std::atomic<std::shared_ptr>` also solves it, but every reader then writes to a shared counter, which serializes readers on one cache line.

```text
reader                                 writer
p = src.load()        ----+
                          |            old = src.exchange(new_obj)
                          |            delete old       <- too early
p->field   <- use after free
```

Safe reclamation replaces `delete old` with `retire`, and makes the library responsible for the moment of deletion. [saferecl.general] describes the subclause as techniques that resolve exactly this access-deletion race.

## Hazard pointers: protect, then retire

A type becomes **hazard-protectable** by deriving publicly, non-virtually, and exactly once from `std::hazard_pointer_obj_base<T, D>`, where `D` is the deleter and defaults to `std::default_delete<T>`. A reader owns a `std::hazard_pointer`, obtained from `std::make_hazard_pointer()`, and calls `protect` on the atomic source.

```cpp
#include <atomic>
#include <hazard_pointer>
#include <string>

struct Config : std::hazard_pointer_obj_base<Config> {
  std::string name;
};

std::atomic<Config*> current{new Config()};

std::size_t reader() {                        // called often, in parallel
  std::hazard_pointer h = std::make_hazard_pointer();
  Config* p = h.protect(current);             // protection epoch starts
  return p->name.size();                      // *p cannot be reclaimed here
}                                             // ~hazard_pointer ends it

void writer(Config* fresh) {                  // called rarely
  Config* old = current.exchange(fresh);
  old->retire();                              // deleted once unprotected
}
```

The guarantee, informally, is that a retired object is not reclaimed while any hazard pointer has been associated with it continuously since before it was retired. The draft states this with **protection epochs**: every change of a hazard pointer's association ends one epoch and starts another, and an object only becomes *possibly-reclaimable* once every epoch that began before its retirement has ended.

Each object may be retired at most once, and the deleter must not throw. Retiring the same object twice is undefined behavior, as is calling `retire` through a base that is not part of a `T`. `retire` is `noexcept` and allocates nothing, because the deleter is stored inside the object's base. It may also perform reclamation of other objects on the spot, so a deleter that takes a lock the retiring thread already holds can deadlock.

> **Standardese.** [saferecl.hp.general] says the number of possibly-reclaimable objects "has an unspecified bound", and notes that the bound can depend on the number of hazard pointers and of retiring threads. That bound is the main thing hazard pointers buy you over RCU. The draft does not, however, say *when* reclamation happens, and C++26 has no function that forces it.

## What protect really does

`protect` is specified as a loop over `try_protect`. Written as a free function, the specification reads like this:

```cpp
#include <atomic>
#include <hazard_pointer>

template<class T>
T* protect_like(std::hazard_pointer& h, const std::atomic<T*>& src) {
  T* ptr = src.load(std::memory_order::relaxed);
  while (!h.try_protect(ptr, src)) {}   // retry until the source is stable
  return ptr;
}
```

`try_protect(ptr, src)` does four things in order. It remembers `old = ptr`, associates the hazard pointer with `*old`, reloads `ptr` from `src` with acquire ordering, and, if the value changed, clears the association. It returns whether the two values matched. The reload is the whole trick. Once the hazard pointer is published and `src` still holds the same address, any writer that removes the object must do so after the publication, so its later retirement cannot overlook it. If the value changed, the object may already be retired, and the reader must not trust it.

The `hazard_pointer` class distinguishes three states. A default-constructed or moved-from object is **empty** and owns nothing. An object from `make_hazard_pointer` owns a hazard pointer, which starts **unassociated**, and becomes **associated** after a successful `protect` or `reset_protection(p)`. `protect`, `try_protect` and `reset_protection` all have the precondition that the object is not empty.

```cpp
#include <atomic>
#include <hazard_pointer>

struct Node : std::hazard_pointer_obj_base<Node> { int value; };
std::atomic<Node*> slot{nullptr};

int peek() {
  std::hazard_pointer h;              // empty: owns no hazard pointer
  // h.protect(slot);                 // undefined behavior: precondition is !empty()
  h = std::make_hazard_pointer();     // may throw bad_alloc
  Node* p = h.protect(slot);
  int v = p ? p->value : 0;
  h.reset_protection();               // unassociated, but still owned
  return v;
}
```

> **Pitfall.** Creating a hazard pointer is the expensive part: it may allocate and may throw. P2530R3 reports about 4 ns to construct and destroy one in Folly, and under a nanosecond to protect with one that already exists. Hot loops should reuse a `hazard_pointer` and move it between objects with `reset_protection`, or hand-over-hand with two of them and `swap`. Swapping exchanges ownership without ending any protection epoch.

## RCU: regions instead of addresses

RCU readers publish nothing per object. A reader opens a region by locking an `rcu_domain`, reads whatever pointers it likes, and closes the region by unlocking. `rcu_domain` meets the *Cpp17Lockable* requirements, so the standard lock types work with it. The draft declares no constructor for it other than the deleted copy constructor, so in standard C++26 the only domain is the one returned by `std::rcu_default_domain()`. Regions nest, and `lock` and `unlock` never introduce a data race on the domain. `try_lock` is equivalent to `lock` and always returns `true`.

```cpp
#include <atomic>
#include <mutex>
#include <rcu>
#include <string>

struct Settings : std::rcu_obj_base<Settings> {
  std::string host;
};

std::atomic<Settings*> live{new Settings()};

std::string read_host() {
  std::scoped_lock region(std::rcu_default_domain());  // region of RCU protection
  return live.load(std::memory_order::acquire)->host;  // no retry, ever
}

void update(Settings* fresh) {
  Settings* old = live.exchange(fresh);
  old->retire();             // deleted after every region that might see old ends
}
```

The guarantee is in [saferecl.rcu.general]. If the evaluation that retired an object does not strongly happen before the start of a region, the end of that region strongly happens before the deleter runs. A region that started after the retirement cannot have seen the old pointer, so it does not delay anything. Readers never retry, and a reader may see either the old or the new object. That is the "copy" in read-copy update: writers build a new version and swap it in, and they never modify an object that readers can still reach.

For types you cannot change, `std::rcu_retire(p, d)` schedules `d(p)` without an intrusive base. The price is that it may allocate, and it may throw `bad_alloc` or whatever the deleter's move constructor throws. `rcu_obj_base<T, D>::retire` is `noexcept` because its deleter lives in the object. Either way, scheduled deleters may run concurrently with one another, must not throw, and each runs at most once.

## Waiting: rcu_synchronize and rcu_barrier

Two blocking functions are easy to confuse. `rcu_synchronize()` waits until every region that might already be running has ended. Formally, it waits for each region whose opening lock the call does not strongly happen before. It does not run or wait for deleters. `rcu_barrier()` waits until every deleter scheduled before the call has actually run. The draft adds a note that neither implies the other.

```cpp
#include <rcu>

struct Item : std::rcu_obj_base<Item> { int v; };

void shutdown(Item* last) {
  last->retire();
  std::rcu_synchronize();  // all old readers are gone; last may still exist
  std::rcu_barrier();      // now its deleter has run
}
```

Use `rcu_synchronize` when you want to reuse or modify the old object yourself instead of retiring it, the classic RCU update. Use `rcu_barrier` at shutdown, before destroying anything a pending deleter might touch.

> **Pitfall.** Never call `rcu_synchronize` from inside a region on the same domain. The lock that opened your region is sequenced before the call, so the call must wait for that region to close, and it never will, because the close comes after the call returns. The thread blocks forever. `rcu_barrier` inside a region has the same hazard as soon as a deleter it must wait for is held back by that region.

## Choosing between them

P2545R4 offers a rough rule: hazard pointers are a scalable replacement for reference counting, and RCU is a scalable replacement for reader-writer locking.

| Property | `atomic<shared_ptr>` | Hazard pointers | RCU |
|---|---|---|---|
| Reader cost | a shared counter write | a published address per object | almost nothing |
| Unreclaimed garbage | none | bounded | unbounded while a reader stalls |
| Reader must retry | no | if the source changed | never |
| Reclamation | immediate | deferred | deferred |
| Reader may block | yes | yes, it only pins its objects | it delays all reclamation |

Choose hazard pointers when readers hold objects for a long or unpredictable time, when you traverse a structure with a few pointers at a time, or when memory must stay bounded. Choose RCU when reads are short and frequent, when a reader touches many objects in one pass, or when updates are rare enough that holding garbage for a while is harmless. Choose neither when the data is small and reads are rare. A mutex is simpler, and simplicity is a correctness feature.

Neither facility fixes your algorithm. They only make *deletion* safe. Writers still need their own synchronization with each other, usually a mutex or a compare-and-swap, and RCU readers still need at least an acquire load to see a fully constructed object. `try_protect` performs its own acquire reload.

## What to remember

- Both facilities replace `delete` with `retire`: the library reclaims the object once no reader can still be using it.
- A hazard-protectable or rcu-protectable type has exactly one public, non-virtual base of `hazard_pointer_obj_base<T, D>` or `rcu_obj_base<T, D>`.
- `make_hazard_pointer` may allocate and throw. A default-constructed `hazard_pointer` is empty, and protecting with it is undefined behavior.
- `try_protect` publishes, reloads with acquire ordering, and clears the protection if the source changed. `protect` loops until it succeeds.
- Retiring an object twice, or a deleter that throws, is undefined behavior. Hazard pointers bound the unreclaimed garbage, and RCU does not.
- `rcu_domain` is *Cpp17Lockable*. Use `std::scoped_lock` on `rcu_default_domain()`. `try_lock` always returns `true`, and regions nest.
- `rcu_synchronize` waits for pre-existing readers, `rcu_barrier` waits for scheduled deleters, and neither implies the other. Calling either inside your own region can block forever.
- `rcu_retire` may allocate and throw, while the intrusive `retire` members are `noexcept`.
- C++26 has no custom hazard-pointer domains and no forced cleanup. GCC 16 and libc++ 21 ship neither header, and Folly is the reference implementation.
