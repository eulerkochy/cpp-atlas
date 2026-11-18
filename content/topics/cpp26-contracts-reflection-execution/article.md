---
title: "C++26: Contracts, Reflection, Execution, and Erroneous Behavior"
summary: "How C++26 replaces fragile workarounds with language-level contracts (P2900), value-based static reflection (P2996), std::execution senders (P2300), and erroneous behavior (P2795)."
track: "cpp26"
minutes: 13
standard:
  - "[basic.contract]"
  - "[expr.reflect]"
  - "[meta.reflection]"
  - "[exec]"
  - "[basic.indet]"
cppreference:
  - title: "Contract assertions"
    path: "language/contracts"
  - title: "Function contract specifiers"
    path: "language/functions/function_contract_specifiers"
  - title: "Reflection operator"
    path: "language/operator_reflection"
  - title: "Reflection library"
    path: "meta/reflection"
  - title: "Execution control library"
    path: "execution"
  - title: "attribute: indeterminate"
    path: "language/attributes/indeterminate"
prerequisites:
  - "sfinae-and-concepts"
  - "atomics-and-memory-ordering"
---

C++26 closes four longstanding structural gaps in the language: executable function contracts (**P2900**), value-based static reflection (**P2996**), structured asynchronous execution (**P2300**), and eliminating time-travel undefined behavior from uninitialized automatic locals (**P2795**).

> **Mental model.** Each C++26 pillar moves an informal convention into checked language or library machinery: comments become `pre`/`post` contracts, macro boilerplate becomes `consteval` `std::meta::info` values, ad-hoc callbacks become lazy sender graphs, and uninitialized stack reads become bounded erroneous behavior.

## Contracts (P2900): pre, post, and contract_assert

P2900 introduces two contextual function contract specifiers—`pre(...)` and `post(result: ...)`—plus the statement keyword `contract_assert(...)`. Unlike `assert()` macros that vanish completely under `NDEBUG`, C++26 contract assertions remain valid C++ syntax in every build and execute according to one of **four evaluation semantics** configured externally by the toolchain:

- **`ignore`:** predicate is checked semantically at compile time (so invalid code still fails to compile) but not evaluated at runtime.
- **`observe`:** evaluates the predicate; on violation, invokes the violation handler and continues execution.
- **`enforce`:** evaluates the predicate; on violation, invokes the handler and terminates (`std::terminate` or aborting).
- **`quick_enforce`:** evaluates the predicate; on violation, terminates immediately without invoking the user-replaceable handler.

Every expression inside a contract predicate undergoes **constification**: variables named inside `pre`, `post`, or `contract_assert` are viewed as `const` so predicates cannot silently mutate program state. Furthermore, any by-value parameter referenced in a `post` condition must be declared `const` on the function definition so caller and callee never disagree about pre-mutation vs post-mutation values. The snippet matches GCC 16 (`-std=c++26 -fcontracts`):

```cpp
#include <contracts>

int clamp_positive(const int value, const int max_val)
    pre(max_val > 0)
    post(r: r >= 0 && r <= max_val)
{
    contract_assert(max_val != 0);
    if (value < 0) return 0;
    return value > max_val ? max_val : value;
}
```

> **Pitfall.** Writing `int clamp(int value, int max_val) post(r: r <= max_val)` without `const` on `max_val` is ill-formed under P2900 `[dcl.contract.func]`. Because the function body could modify a non-`const` by-value parameter, C++26 requires any parameter named in a `post` specifier to be `const` (or accessed through a reference whose binding is fixed).

## Static Reflection (P2996): ^^, std::meta::info, and splicing

For decades, serializing a `struct` or printing `enum` names required macros, external code generators, or fragile structured-binding tricks. P2996 introduces **value-based reflection**: the unary reflection operator `^^` yields a `consteval`-only scalar value of opaque type `std::meta::info`.

Because every reflected entity—type, non-static data member, enumerator, function, or template—has the single type `std::meta::info`, compile-time code uses ordinary `<meta>` functions and ranges rather than recursive template specializations. Pair reflection with **splicing** (`[:refl:]`) to turn a `std::meta::info` back into an entity or member access, and **expansion statements** (`template for`, P1306) to iterate across compile-time ranges. The example verifies cleanly under GCC 16 (`-std=c++26 -freflection`):

```cpp
#include <cstddef>
#include <meta>

struct Metrics {
    int requests;
    double latency_ms;
    bool healthy;
};

template <typename T>
constexpr std::size_t sum_field_bytes() {
    std::size_t total = 0;
    template for (constexpr auto member : std::define_static_array(
        std::meta::nonstatic_data_members_of(
            ^^T, std::meta::access_context::current())))
    {
        total += std::meta::size_of(member);
    }
    return total;
}

static_assert(sum_field_bytes<Metrics>() == sizeof(int) + sizeof(double) + sizeof(bool));

template <std::size_t Index, typename T>
constexpr auto get_field(const T& obj) {
    constexpr auto members = std::define_static_array(
        std::meta::nonstatic_data_members_of(
            ^^T, std::meta::access_context::current()));
    return obj.[:members[Index]:];
}
```

Notice `std::meta::access_context::current()`: reflection respects C++ access control by default, querying members visible from the caller's lexical scope unless explicitly given `access_context::unchecked()`.

## Structured concurrency with std::execution (P2300)

P2300 standardizes a zero-overhead asynchronous model in `<execution>` built from three composable roles:

```text
Scheduler ──schedule()──▶ Sender (lazy graph) ──connect(sender, receiver)──▶ Operation State ──start()──▶ Receiver
                                                                                                         ├─ set_value(...)
                                                                                                         ├─ set_error(err)
                                                                                                         └─ set_stopped()
```

- **Schedulers** are lightweight handles to execution contexts (thread pools, event loops, GPU queues); calling `schedule(sched)` returns a sender representing work starting on that context.
- **Senders** describe asynchronous computations lazily without allocating or starting threads when built. Every sender completes on exactly one of three channels: value (`set_value`), error (`set_error`), or cooperative cancellation (`set_stopped`).
- **Receivers** handle those three completion signals. Calling `std::execution::connect(sender, receiver)` produces an immovable `operation_state` that embeds intermediate state inline; work runs only when `start(op)` executes.

Algorithms such as `then`, `let_value`, `when_all`, `bulk`, `on`, and `upon_error` compose pipelines declaratively, and `std::this_thread::sync_wait` blocks at the root edge to collect results. Because standard library vendors are actively staging P2300 implementations (GCC 16's `<execution>` currently ships C++17 parallel policies and not yet P2300 sender adaptors), the following example illustrates the standardized C++26 P2300R10 library syntax:

```cpp
// C++26 P2300R10 standard library syntax (<execution>)
#include <execution>
#include <thread>
#include <utility>

int run_pipeline(std::execution::scheduler auto sched) {
    namespace ex = std::execution;
    auto graph =
        ex::schedule(sched)
        | ex::then([] { return 21; })
        | ex::then([](int v) { return v * 2; });

    auto [answer] = std::this_thread::sync_wait(std::move(graph)).value();
    return answer;
}
```

> **Pitfall.** Constructing `ex::schedule(sched) | ex::then(work)` schedules nothing and allocates no work items on its own. Without connecting to a receiver and calling `start`, or passing the graph to a consumer such as `std::this_thread::sync_wait`, the pipeline remains an inert description.

## Erroneous Behavior (P2795) and [[indeterminate]]

Before C++26, reading an uninitialized automatic local scalar (`int x; return x;`) triggered **Undefined Behavior (UB)**. Under aggressive optimization, UB allowed compilers to assume the path was unreachable and delete downstream bounds checks or error handlers.

P2795 eliminates that hazard by introducing **Erroneous Behavior (EB)**: a bug category strictly weaker than UB. When an automatic variable without an initializer is read before being written, C++26 specifies that the object holds an implementation-determined **erroneous value** (typically zero-initialized or deterministic pattern-filled by the compiler). The program remains buggy and compilers or sanitizers are encouraged to diagnose it, yet runtime execution stays well-defined—preventing arbitrary time-travel miscompilations.

When a hot path genuinely needs raw uninitialized storage (for instance, a large stack scratch buffer overwritten piecemeal), annotate the declaration with `[[indeterminate]]`, verified in GCC 16 (`-std=c++26`):

```cpp
#include <cstddef>

int erroneous_read() {
    int count;    // C++26: initialized to an erroneous value; reading is EB, not UB
    return count;
}

std::byte fast_scratch() {
    [[indeterminate]] std::byte buffer[4096]; // Opts out: reading before write remains UB
    buffer[0] = std::byte{0x2A};
    return buffer[0];
}
```

> **Standardese.** Under C++26 `[basic.indet]`, automatic storage duration objects without `[[indeterminate]]` never have indeterminate values—reading them prior to assignment produces erroneous behavior rather than undefined behavior `[intro.abstract]`.

## Comparing the four C++26 additions

| Feature | Paper | Primary mechanism | Verification in GCC 16 |
| --- | --- | --- | --- |
| Contracts | P2900R14 | `pre`, `post`, `contract_assert`, four semantics | Compiles with `-std=c++26 -fcontracts` |
| Static Reflection | P2996 + P1306 | `^^`, `std::meta::info`, `[:r:]`, `template for` | Compiles with `-std=c++26 -freflection` |
| `std::execution` | P2300R10 | Senders, receivers, schedulers, `sync_wait` | P2300 library rollouts pending |
| Erroneous Behavior | P2795R5 | Bounded EB on uninitialized locals, `[[indeterminate]]` | `[[indeterminate]]` compiles with `-std=c++26` |

## What to remember

- P2900 contracts keep predicates constified, require `const` on value parameters named in `post`, and separate assertion syntax from build-time evaluation semantics (`ignore`, `observe`, `enforce`, `quick_enforce`).
- P2996 static reflection represents program entities as `consteval` `std::meta::info` values created with `^^`, inspected via `<meta>`, iterated with `template for`, and turned back into code with splices `[:r:]`.
- P2300 `std::execution` builds lazy async graphs over schedulers, senders, and three-channel receivers (`set_value`, `set_error`, `set_stopped`) without heap allocation until connected and started.
- P2795 turns reads of uninitialized automatic locals into well-defined erroneous behavior, reserving pre-C++26 indeterminate UB strictly for declarations marked `[[indeterminate]]`.
