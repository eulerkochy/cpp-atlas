---
title: "Parallel algorithms and execution policies"
summary: "Passing an execution policy to a standard algorithm grants the library permission to run your callbacks on several threads, interleaved within one thread, or both. This page explains what each policy permits, what that forbids in your code, why reduce is not accumulate, and what actually runs in parallel with GCC and Clang today."
track: "concurrency"
minutes: 14
standard:
  - "[execpol]"
  - "[algorithms.parallel.defns]"
  - "[algorithms.parallel.user]"
  - "[algorithms.parallel.exec]"
  - "[algorithms.parallel.exceptions]"
  - "[algorithms.parallel.overloads]"
  - "[numerics.defns]"
  - "[reduce]"
  - "[transform.reduce]"
  - "[accumulate]"
cppreference:
  - title: "Execution policy types"
    path: "algorithm/execution_policy_tag_t"
  - title: "Execution policy objects"
    path: "algorithm/execution_policy_tag"
  - title: "std::reduce"
    path: "algorithm/reduce"
  - title: "std::transform_reduce"
    path: "algorithm/transform_reduce"
  - title: "std::accumulate"
    path: "algorithm/accumulate"
  - title: "Algorithms library"
    path: "algorithm"
prerequisites:
  - "algorithms"
  - "threads-and-jthread"
  - "atomics-and-memory-ordering"
  - "lambdas"
---

## The one idea

An execution policy is not an instruction to parallelize. It is a permission slip. Passing `std::execution::par` to `std::sort` tells the library that it *may* run the comparisons on several threads, and in exchange you promise that your code is safe if it does. The library is free to run everything sequentially, and with one popular standard library on one popular platform, it silently does. What changes for certain is the contract: your callbacks lose ordering guarantees, and an exception escaping one of them ends the program.

> **Mental model.** The policy describes what the library is allowed to do to your function objects, and therefore what your function objects must tolerate. Choose the weakest permission your code can survive, and then check whether your toolchain uses it.

## The four policies

The policies live in `<execution>`. Each is an object of a distinct type, and `std::is_execution_policy_v<T>` identifies them. C++17 introduced three; C++20 added `unseq`.

| Policy | Threads | Within one thread |
|---|---|---|
| `seq` (`sequenced_policy`) | only the calling thread | indeterminately sequenced, never interleaved |
| `par` (`parallel_policy`) | calling thread or library-created threads | indeterminately sequenced |
| `par_unseq` (`parallel_unsequenced_policy`) | any threads the library chooses | unsequenced, may be interleaved |
| `unseq` (`unsequenced_policy`, C++20) | only the calling thread | unsequenced, may be interleaved |

*Indeterminately sequenced* means that two calls on the same thread do not overlap, though their order is unspecified. *Unsequenced* means they may overlap: the library may vectorize, starting the bodies of several invocations before finishing any of them, so that four calls become one SIMD loop iteration.

Even `seq` is not the same as calling the algorithm without a policy. `std::for_each(first, last, f)` applies `f` in order from `first` to `last`, while `std::for_each(std::execution::seq, first, last, f)` only promises that each call happens on the calling thread, in an unspecified order. The policy overloads also require forward iterators, change the exception rules described below, and `for_each` with a policy returns `void` rather than the function object.

## Element access functions and data races

[algorithms.parallel.defns] calls the functions an algorithm invokes on your behalf **element access functions**: iterator operations, operations on the elements that the algorithm's specification requires, such as comparison or assignment, and your function objects. All the rules are about them.

Under `par`, it is your job to make sure that element access functions do not race with each other. The library does not add any synchronization between invocations.

```cpp
#include <algorithm>
#include <atomic>
#include <execution>
#include <vector>

void demo(const std::vector<int>& v) {
  std::vector<int> evens;
  std::for_each(std::execution::par, v.begin(), v.end(), [&](int x) {
    if (x % 2 == 0) evens.push_back(x);       // data race: undefined behavior
  });

  std::atomic<int> count{0};
  std::for_each(std::execution::par, v.begin(), v.end(), [&](int x) {
    if (x % 2 == 0) count.fetch_add(1, std::memory_order_relaxed);   // fine
  });
}
```

Blocking synchronization, such as a `std::mutex`, is allowed under `par`, but waiting for something that another element access function must do is not safe. The threads the library creates only promise *parallel forward progress*: an invocation that has not started may not start until yours finishes, so a spin-wait on it can hang forever.

Under `par_unseq` and `unseq`, interleaving on one thread rules out locking altogether. If two invocations on the same thread both reach `lock()`, the second blocks waiting for the first, which cannot continue because they are the same thread. The standard captures this by calling functions that synchronize with other invocations, such as mutex locking and unlocking, **vectorization-unsafe**, and forbids calling them from element access functions under the unsequenced policies. Memory allocation and deallocation are explicitly exempted.

> **Standardese.** [algorithms.parallel.exec] says element access functions invoked with `parallel_unsequenced_policy` may execute unordered in unspecified threads and are unsequenced with respect to one another within each thread, and that vectorization-unsafe standard library functions may not be invoked by user code called from such an algorithm. The same restriction applies to `unsequenced_policy`.

## Exceptions call std::terminate

With any of the four standard policies, if an element access function exits via an uncaught exception, `std::terminate` is called. This includes `seq`. A `try` block around the algorithm call never sees the exception. The one exception the algorithm itself can throw is `std::bad_alloc`, when it cannot get temporary memory needed for parallelization.

```cpp
#include <algorithm>
#include <execution>
#include <stdexcept>
#include <vector>

void demo(std::vector<int>& v) {
  try {
    std::for_each(std::execution::seq, v.begin(), v.end(), [](int) {
      throw std::runtime_error("boom");      // std::terminate is called
    });
  } catch (...) {
    // never reached
  }
}
```

The Parallelism TS that preceded C++17 collected exceptions into an `exception_list`; the standard dropped that design. Both libstdc++ and libc++ call `std::terminate` on this page's machine, including libstdc++ when it runs the algorithm serially. If your callbacks can throw, catch inside the lambda and record the failure, or use the non-policy overload.

## reduce is not accumulate

`std::accumulate` is a left fold: it computes `((init + a) + b) + c` in exactly that order. It has no policy overload, because a left fold cannot be split. `std::reduce`, added in C++17, computes a **generalized sum**: [numerics.defns] lets it group the operands in any way and reorder them in any way. The result equals the left fold only if the operation is associative and commutative over the values involved.

```cpp
#include <functional>
#include <numeric>
#include <vector>

int demo() {
  std::vector<int> v{1, 2, 3};
  int a = std::accumulate(v.begin(), v.end(), 10, std::minus<>{});  // ((10-1)-2)-3 == 4
  int r = std::reduce(v.begin(), v.end(), 10, std::minus<>{});      // unspecified result
  return a + r;
}
```

That freedom applies even without a policy argument, and implementations use it. Summing ten million random `float` values on this page's machine, `std::accumulate` returned about 4.9909e12, libstdc++'s sequential `std::reduce` returned 5.0002e12 because it keeps several partial sums, and libc++'s `std::reduce(std::execution::par, ...)` returned 5.0001e12, while its sequential `reduce` matched `accumulate`. All of these results are valid. Floating-point addition is commutative but not associative, so a parallel floating-point reduction is not reproducible across libraries, thread counts or even runs.

The scans make a finer distinction. `std::inclusive_scan` and `std::exclusive_scan` use a *generalized noncommutative sum*: they may regroup but must keep the order, so their operation needs to be associative but not commutative. `std::partial_sum`, like `accumulate`, is strictly left to right and has no policy overload.

> **Pitfall.** The accumulator type of `reduce` and `accumulate` is the type of `init`, not the element type. `std::reduce(v.begin(), v.end(), 0)` over a `std::vector<double>` adds into an `int` and truncates at every step. Write `0.0`, or call the two-iterator overload, which uses a value-initialized element type.

`std::transform_reduce` fuses a transformation with a reduction, which is how you express an inner product, a count, or a sum of squares in parallel without an intermediate container. Its two-range form defaults to `std::plus<>` for the reduction and `std::multiplies<>` for the transformation, so it is the parallel replacement for `std::inner_product`. The same associativity and commutativity requirement applies to its reduction operation.

```cpp
#include <execution>
#include <functional>
#include <numeric>
#include <vector>

double dot(const std::vector<double>& a, const std::vector<double>& b) {
  return std::transform_reduce(std::execution::par, a.begin(), a.end(), b.begin(), 0.0);
}

long long sum_squares(const std::vector<int>& v) {
  return std::transform_reduce(std::execution::par_unseq, v.begin(), v.end(), 0LL,
                               std::plus<>{}, [](int x) { return 1LL * x * x; });
}
```

## Iterator requirements and missing overloads

Every policy overload takes forward iterators, even where the non-policy version accepts input or output iterators. A parallel algorithm must be able to split the range and visit parts of it more than once, which a single-pass `std::istream_iterator` cannot support. Passing one violates the algorithm's requirements; GCC 16 compiled such a call without complaint, so do not rely on a diagnostic.

Many algorithms have no policy overload at all:

- numeric folds with a fixed order: `accumulate`, `inner_product`, `partial_sum`, and also `iota`;
- binary searches on sorted ranges: `lower_bound`, `upper_bound`, `equal_range`, `binary_search`;
- heap operations `push_heap`, `pop_heap`, `make_heap` and `sort_heap`, although `is_heap` and `is_heap_until` have one;
- `next_permutation`, `prev_permutation`, `shuffle`, `sample`, `copy_backward` and `move_backward`;
- every algorithm in `std::ranges`, which in C++23 accept no policy argument.

Writing `std::accumulate(std::execution::par, first, last, 0)` is simply ill-formed, because no overload matches. The replacements are `reduce`, `transform_reduce`, `inclusive_scan` and `exclusive_scan`.

## What actually runs in parallel

The standard specifies permissions, so a library that ignores the policy is conforming. What happens in practice depends on the library, and on this page's arm64 macOS machine the results were as follows.

**libstdc++ (GCC 16).** The parallel algorithms come from Intel's PSTL code and need oneTBB for real threads. At configuration time, libstdc++ checks `__has_include(<tbb/tbb.h>)`; if the header is found, it selects the TBB backend and you must link with `-ltbb`. If it is not found, it quietly selects a serial backend. TBB was not installed on the test machine, so `std::for_each(std::execution::par, ...)` over ten million elements ran entirely on the calling thread. It compiled without a warning and defined `__cpp_lib_parallel_algorithm`.

**libc++ (Clang 21).** The policies are still behind `-fexperimental-library`; without that flag, `std::execution::par` does not exist. With it, the macOS build uses a libdispatch backend, and the same loop ran on 11 different threads. libc++ implements only a subset of the policy overloads: `sort`, `stable_sort`, `for_each`, `transform`, `reduce`, `transform_reduce`, `find`, `count` and others compiled, but `inclusive_scan`, `nth_element`, `adjacent_find` and `partial_sort` with a policy did not.

MSVC's standard library has its own native implementation, which was not tested here. The practical lesson is to measure. Check thread usage and timing on your real toolchain, because a parallel call that silently runs serially still pays for the stricter contract, and a parallel call over a few thousand cheap elements can be slower than the serial loop because of task startup and the reduction step.

## What to remember

- A policy grants permission; the library may still run sequentially, and libstdc++ without TBB does.
- `seq` and `par` keep invocations on one thread from overlapping; `par_unseq` and `unseq` allow interleaving, so no locks inside them.
- Data races between element access functions are your responsibility; the library adds no synchronization.
- An exception escaping an element access function calls `std::terminate` under every standard policy, including `seq`.
- `reduce` may regroup and reorder, so the operation must be associative and commutative; floating-point results are not reproducible.
- `accumulate` is a strict left fold and has no policy overload; use `reduce` or `transform_reduce`.
- The type of `init` is the accumulator type, for `reduce` as for `accumulate`.
- Policy overloads need forward iterators; binary searches, heap operations, permutations and ranges algorithms have no policy overloads in C++23.
- With Clang's libc++, parallel algorithms need `-fexperimental-library` and only a subset is implemented.
