---
title: "Condition variables and waiting"
summary: "A condition variable lets a thread sleep until some state guarded by a mutex changes, and it is only correct when the waiter rechecks a predicate and the notifier changes that predicate under the mutex. C++20 adds atomic waits, semaphores, latches and barriers for the cases a condition variable handles clumsily."
track: "concurrency"
minutes: 14
standard:
  - "[thread.condition]"
  - "[thread.condition.condvar]"
  - "[thread.condition.condvarany]"
  - "[thread.condvarany.intwait]"
  - "[thread.req.timing]"
  - "[atomics.wait]"
  - "[thread.sema]"
  - "[thread.latch]"
  - "[thread.barrier]"
cppreference:
  - title: "std::condition_variable"
    path: "thread/condition_variable"
  - title: "std::condition_variable::wait"
    path: "thread/condition_variable/wait"
  - title: "std::condition_variable_any::wait"
    path: "thread/condition_variable_any/wait"
  - title: "std::condition_variable::wait_for"
    path: "thread/condition_variable/wait_for"
  - title: "std::atomic<T>::wait"
    path: "atomic/atomic/wait"
  - title: "std::counting_semaphore, std::binary_semaphore"
    path: "thread/counting_semaphore"
  - title: "std::latch"
    path: "thread/latch"
  - title: "std::barrier"
    path: "thread/barrier"
prerequisites:
  - "mutexes-and-locks"
  - "threads-and-jthread"
  - "atomics-and-memory-ordering"
  - "chrono"
---

## The one idea

A condition variable does not hold a condition. It holds a queue of sleeping threads, and a notification is a nudge that says "something may have changed, go and look". Notifications are not stored: notifying a condition variable that nobody is waiting on does nothing at all. The condition itself is ordinary state, the *predicate*, guarded by a mutex, and the only correct way to use a condition variable is to check the predicate under that mutex, sleep if it is false, and check again on every wake.

> **Mental model.** The mutex protects the predicate, the predicate is the truth, and the condition variable is just an efficient way to sleep between checks. If your code would still be correct with `wait` replaced by "unlock, yield, relock", it is correct with `wait`.

## What wait actually does

`std::condition_variable::wait(lock)` takes a `std::unique_lock<std::mutex>` that the caller holds. It atomically releases the mutex and blocks. When it is unblocked, it reacquires the mutex before returning, so the caller always holds the lock again afterwards. Unblocking happens on `notify_one`, `notify_all`, or *spuriously*, for no reason at all. The standard permits spurious wakeups because some platforms' native primitives have them and because they make the implementation simpler.

The overload that takes a predicate, `wait(lock, pred)`, is exactly `while (!pred()) wait(lock);`. It checks before the first sleep, so if the predicate is already true, it returns without blocking and without needing any notification. Use it everywhere; the bare overload is a building block.

```cpp
#include <condition_variable>
#include <mutex>
#include <queue>

class Channel {
  std::mutex m_;
  std::condition_variable cv_;
  std::queue<int> q_;
public:
  void push(int v) {
    { std::lock_guard lk(m_); q_.push(v); }   // change the predicate under the mutex
    cv_.notify_one();
  }
  int pop() {
    std::unique_lock lk(m_);
    cv_.wait(lk, [&] { return !q_.empty(); });   // loop handles spurious wakeups
    int v = q_.front();
    q_.pop();
    return v;
  }
};
```

`std::condition_variable` accepts only `std::unique_lock<std::mutex>`, which lets implementations map it directly onto the platform's primitive. A `lock_guard` cannot be passed, because `wait` must unlock and relock it. All threads waiting on one condition variable at the same time must use the same mutex.

> **Standardese.** [thread.condition.condvar] makes it a precondition of `wait` that the lock is owned by the calling thread and that every concurrently waiting thread supplied the same mutex. It also says that if `wait` cannot reacquire the lock, `std::terminate` is called. [thread.condition] requires notifications and the parts of each wait to behave as if they happen in a single total order consistent with happens-before.

## Lost wakeups, and why the predicate needs the mutex

The atomic unlock-and-block step exists to close one gap: between the waiter's check of the predicate and its going to sleep, nobody may slip in a change and a notification. That guarantee only works if the notifier changes the predicate while holding the same mutex. Making the flag atomic is not a substitute.

```cpp
#include <atomic>
#include <condition_variable>
#include <mutex>

std::mutex m;
std::condition_variable cv;
std::atomic<bool> ready{false};

void waiter() {
  std::unique_lock lk(m);
  cv.wait(lk, [] { return ready.load(); });   // may sleep forever
}

void setter() {
  ready = true;      // not under m: no data race, but...
  cv.notify_one();   // ...this can land between waiter's check and its sleep
}
```

Here is the losing interleaving. The waiter takes the mutex and sees `ready == false`. Before it blocks, the setter stores `true` and notifies; nobody is waiting yet, so the notification evaporates. The waiter then blocks, and nothing will ever wake it. If the setter had locked `m` around the store, it could not have run between the check and the block, because the waiter holds `m` for that whole stretch. The lock can be released before `notify_one` is called; it only has to cover the change.

## Notify inside or outside the lock

Both placements are correct if the predicate was changed under the mutex. Notifying after unlocking avoids waking a thread that will immediately block again on the mutex the notifier still holds, though many implementations already avoid that cost. Notifying while still holding the lock has one real advantage: object lifetime.

The destructor of a condition variable requires that no thread is blocked on it, and of course nobody may call `notify_one` on a destroyed one. If the waiter owns the condition variable, it may see the predicate become true, return, and destroy the condition variable while the notifier is still about to call `notify_one`. Notifying under the lock prevents this, because the waiter cannot return from `wait` until it reacquires the mutex, which is after the notification has finished.

```cpp
#include <condition_variable>
#include <mutex>
#include <thread>

void run() {
  std::mutex m;
  std::condition_variable cv;
  bool done = false;
  std::thread([&] {
    std::lock_guard lk(m);
    done = true;
    cv.notify_one();   // under the lock: run() cannot return before this finishes
  }).detach();
  std::unique_lock lk(m);
  cv.wait(lk, [&] { return done; });
}   // cv and m are destroyed here
```

Move the `notify_one` after the lock is released and this function may destroy `cv` while the detached thread is still about to use it, which is undefined behavior. Detaching is rarely a good idea, as threads-and-jthread explains, but the same pattern appears whenever a waiter owns the synchronization object.

## condition_variable_any and stop tokens

`std::condition_variable_any` works with any *Cpp17BasicLockable*, such as a `std::shared_lock`, a `std::unique_lock` over a mutex type other than `std::mutex`, or your own type. It is usually somewhat heavier, since it may need an internal mutex of its own.

In C++20 it gained the only stop-aware waits in the library. `wait(lock, stoken, pred)` registers for the duration of the call to be woken when stop is requested on `stoken`, and then behaves as `while (!stoken.stop_requested()) { if (pred()) return true; wait(lock); } return pred();`. The result is the predicate's value, so a `false` return means "woken by a stop request, and the condition still does not hold". There are matching `wait_for` and `wait_until` overloads, all of which require a predicate.

```cpp
#include <condition_variable>
#include <mutex>
#include <queue>
#include <stop_token>
#include <thread>

std::mutex m;
std::condition_variable_any cv;
std::queue<int> jobs;

void worker(std::stop_token st) {
  while (true) {
    std::unique_lock lk(m);
    if (!cv.wait(lk, st, [] { return !jobs.empty(); }))
      return;                       // stop requested and no job is waiting
    jobs.pop();                     // ... process the job ...
  }
}

int main() {
  std::jthread t(worker);   // ~jthread requests stop, which wakes the wait
}
```

## Timed waits and clocks

`wait_until(lock, abs_time)` returns `std::cv_status::timeout` if the deadline has passed when it returns, and `no_timeout` otherwise, which includes spurious wakeups. `wait_for(lock, rel_time)` is specified as `wait_until(lock, std::chrono::steady_clock::now() + rel_time)`, so it measures elapsed time and is immune to someone changing the wall clock. A deadline expressed as a `system_clock` time point, by contrast, tracks adjustments to that clock. The clock types themselves belong to the chrono topic.

The predicate forms return `bool`, and on timeout they return the *predicate's value*, not `false`. A condition that became true just as the deadline expired is reported as success.

```cpp
#include <chrono>
#include <condition_variable>
#include <mutex>

std::mutex m;
std::condition_variable cv;
bool ready = false;

bool wait_ready() {
  std::unique_lock lk(m);
  // true if ready became true in time, or happened to be true at the deadline
  return cv.wait_for(lk, std::chrono::milliseconds(50), [] { return ready; });
}
```

[thread.req.timing] lets every timeout be late by an unspecified amount, for scheduling and resource reasons, so a timed wait is a lower bound on the delay, never an exact one.

## Lighter tools: atomic wait, semaphores, latches and barriers

C++20 added primitives that cover common patterns without a mutex.

`std::atomic<T>::wait(old)` blocks while the atomic's value equals `old`, and `notify_one` or `notify_all` wakes it. It is introduced in atomics-and-memory-ordering. Unlike a condition variable, it compares the value itself, so it returns at once if the value already differs and it never returns spuriously with the value unchanged. It can miss a change that is undone before it looks again, which is fine when you only wait for a value to move on.

`std::counting_semaphore<LeastMaxValue>` holds a counter. `acquire` blocks until the counter is positive and decrements it, `release(n)` adds `n`, and `try_acquire`, `try_acquire_for` and `try_acquire_until` are the non-blocking and timed forms; `try_acquire` is allowed to fail spuriously. A semaphore has no owner, so any thread may release it, which is exactly what a mutex forbids. `std::binary_semaphore` is `counting_semaphore<1>`. `max()` may be larger than the template argument, but releasing past `max()` is undefined behavior.

```cpp
#include <semaphore>

std::counting_semaphore<4> slots(4);   // at most four concurrent downloads

void download() {
  slots.acquire();
  // ... use one of the four slots ...
  slots.release();
}
```

`std::latch` is a single-use countdown. `count_down(n)` decrements, `wait` blocks until the count reaches zero, and `arrive_and_wait` does both. Decrementing below zero is undefined behavior, and a latch cannot be reset. Curiously, `try_wait` may return `false` "with very low probability" even after the count has reached zero.

`std::barrier<CompletionFunction>` is the reusable version, built around phases. Each participant calls `arrive_and_wait`; when the expected number have arrived, the completion function runs once on one of the arriving threads, and then everyone is released into the next phase. `arrive_and_drop` arrives and removes the caller from future phases. The completion function must be callable without throwing.

```cpp
#include <barrier>
#include <cstdio>
#include <thread>
#include <vector>

int main() {
  int phase = 0;
  std::barrier sync(3, [&]() noexcept { std::printf("phase %d done\n", ++phase); });
  std::vector<std::jthread> workers;
  for (int i = 0; i < 3; ++i)
    workers.emplace_back([&] {
      for (int step = 0; step < 2; ++step) {
        // ... this thread's share of the step ...
        sync.arrive_and_wait();   // nobody starts the next step until all finish
      }
    });
}   // prints "phase 1 done", then "phase 2 done"
```

> **Pitfall.** These primitives synchronize, but they do not protect data. A barrier orders the steps of different threads; it does not make two threads writing the same object inside one step race-free. Each still needs its own discipline: disjoint data or a mutex.

## Choosing a tool

- Waiting for arbitrary state guarded by a mutex: `condition_variable` with a predicate.
- The same, but with a non-`unique_lock` lock or with stop-token cancellation: `condition_variable_any`.
- Waiting for one atomic value to change: `atomic::wait` and `notify`.
- Limiting concurrency, or signalling between threads with no ownership: `counting_semaphore`.
- One-shot "everyone is ready" or "all work is done": `latch`.
- Repeated lock-step phases among a fixed group: `barrier`.
- Waiting for a single result, possibly an exception: a future, covered in futures-promises-and-async.

## What to remember

- Notifications are not remembered. A notify with no waiter does nothing.
- `wait` atomically unlocks and blocks, reacquires before returning, and may wake spuriously. Always use the predicate form.
- Change the predicate while holding the mutex, even if it is atomic; otherwise the wakeup can be lost.
- Notifying inside or outside the lock is correct; inside also protects a condition variable whose owner may destroy it on return.
- All concurrent waiters on one condition variable must use the same mutex.
- `condition_variable_any` takes any lockable and, since C++20, stop tokens; its stop-aware waits return the predicate's value.
- `wait_for` measures with `steady_clock`. Timed predicate waits return the predicate on timeout, and every timeout may be late.
- `atomic::wait` compares values and never returns spuriously with an unchanged value.
- Semaphores have no owner; latches are single-use; barriers repeat by phase and run a `noexcept` completion step.
