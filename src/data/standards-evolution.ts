export const STANDARD_ERAS = [
  "C++11",
  "C++14",
  "C++17",
  "C++20",
  "C++23",
  "C++26",
] as const;

export type StandardEra = (typeof STANDARD_ERAS)[number];

export interface StandardMilestone {
  id: string;
  era: StandardEra;
  category: "language" | "library";
  title: string;
  clause: string;
  paper: string;
  shift: string;
  code: string;
  topicSlug: string;
  cpprefPath: string;
}

export const STANDARDS_MILESTONES: StandardMilestone[] = [
  // ---------------------------------------------------------------------------
  // C++11
  // ---------------------------------------------------------------------------
  {
    id: "cpp11-value-categories",
    era: "C++11",
    category: "language",
    title: "Value category taxonomy & rvalue references",
    clause: "[basic.lval]",
    paper: "N3055",
    shift:
      "Split expressions along identity and movability into glvalue, prvalue, and xvalue so rvalue references (T&&) can steal resources safely from expiring objects.",
    code: `#include <utility>

struct Buffer {
    int* ptr = nullptr;
    Buffer() = default;
    Buffer(Buffer&& other) noexcept : ptr(other.ptr) {
        other.ptr = nullptr;
    }
};

Buffer make_buffer();

void consume(Buffer b) {
    (void)b;
}

void transfer_resource() {
    Buffer named;
    consume(std::move(named)); // std::move casts lvalue -> xvalue so Buffer&& runs
}`,
    topicSlug: "value-categories",
    cpprefPath: "language/value_category",
  },
  {
    id: "cpp11-constexpr",
    era: "C++11",
    category: "language",
    title: "Generalized constant expressions (constexpr)",
    clause: "[dcl.constexpr]",
    paper: "N2235",
    shift:
      "Moved pure computations from template metaprogramming hacks into typed compile-time functions and variables guaranteed usable inside constant expressions.",
    code: `constexpr int factorial(int n) {
    return n <= 1 ? 1 : n * factorial(n - 1);
}

constexpr int fact5 = factorial(5);
static_assert(fact5 == 120, "Evaluated at compile time");`,
    topicSlug: "constant-expressions",
    cpprefPath: "language/constexpr",
  },
  {
    id: "cpp11-lambdas",
    era: "C++11",
    category: "language",
    title: "Lambda expressions & closure types",
    clause: "[expr.prim.lambda]",
    paper: "N2927",
    shift:
      "Replaced handwritten functor structs with inline lexical closures whose unnamed compiler-generated class holds captured state as data members.",
    code: `#include <algorithm>
#include <vector>

int count_above(const std::vector<int>& xs, int threshold) {
    return static_cast<int>(std::count_if(
        xs.begin(), xs.end(),
        [threshold](int v) { return v > threshold; }
    ));
}`,
    topicSlug: "lambdas",
    cpprefPath: "language/lambda",
  },
  {
    id: "cpp11-memory-model",
    era: "C++11",
    category: "library",
    title: "Multi-threaded memory model & std::atomic",
    clause: "[intro.multithread]",
    paper: "N2429",
    shift:
      "Defined threads, data races as undefined behavior, and happens-before synchronization edges via std::atomic and explicit memory orders.",
    code: `#include <atomic>

struct Channel {
    int payload = 0;
    std::atomic<bool> ready{false};

    void publish(int v) {
        payload = v;
        ready.store(true, std::memory_order_release);
    }

    bool try_consume(int& out) {
        if (!ready.load(std::memory_order_acquire)) return false;
        out = payload; // Sequenced after acquire-load sees release-store
        return true;
    }
};`,
    topicSlug: "atomics-and-memory-ordering",
    cpprefPath: "atomic/memory_order",
  },
  {
    id: "cpp11-unique-ptr",
    era: "C++11",
    category: "library",
    title: "Exclusive ownership with std::unique_ptr",
    clause: "[unique.ptr]",
    paper: "N1856",
    shift:
      "Replaced broken copy-transfers-ownership semantics of std::auto_ptr with move-only RAII ownership enforceable at zero size overhead.",
    code: `#include <memory>
#include <utility>

struct Handle { int fd; };

std::unique_ptr<Handle> acquire_handle(int fd) {
    return std::unique_ptr<Handle>(new Handle{fd});
}

void transfer_owner() {
    auto owner = acquire_handle(3);
    auto next_owner = std::move(owner); // owner becomes nullptr
    (void)next_owner;
}`,
    topicSlug: "smart-pointers-and-allocators",
    cpprefPath: "memory/unique_ptr",
  },
  {
    id: "cpp11-perfect-forwarding",
    era: "C++11",
    category: "library",
    title: "std::move & std::forward perfect forwarding",
    clause: "[forward]",
    paper: "N2951",
    shift:
      "Combined template argument deduction on T&& with reference-collapsing rules so std::forward preserves lvalue or rvalue category across wrappers.",
    code: `#include <utility>

void sink(int&) {}
void sink(int&&) {}

template <class T>
void relay(T&& arg) {
    sink(std::forward<T>(arg));
}

void demo_relay() {
    int x = 10;
    relay(x);  // T deduces as int&, forwards lvalue
    relay(20); // T deduces as int, forwards rvalue
}`,
    topicSlug: "forwarding-references-and-perfect-forwarding",
    cpprefPath: "utility/forward",
  },

  // ---------------------------------------------------------------------------
  // C++14
  // ---------------------------------------------------------------------------
  {
    id: "cpp14-return-deduction",
    era: "C++14",
    category: "language",
    title: "Function auto & decltype(auto) return deduction",
    clause: "[dcl.type.auto.deduct]",
    paper: "N3638",
    shift:
      "Enabled compilers to deduce return types from return statements while decltype(auto) preserves exact reference and cv-qualifiers in forwarding wrappers.",
    code: `#include <utility>

template <class Container>
decltype(auto) first_element(Container&& c) {
    return std::forward<Container>(c)[0]; // Preserves reference if operator[] returns T&
}

int read_first() {
    int arr[2] = {7, 9};
    first_element(arr) = 42;
    return arr[0];
}`,
    topicSlug: "type-deduction-auto-decltype",
    cpprefPath: "language/auto",
  },
  {
    id: "cpp14-generic-lambdas",
    era: "C++14",
    category: "language",
    title: "Generic lambdas with auto parameters",
    clause: "[expr.prim.lambda.closure]",
    paper: "N3649",
    shift:
      "Turned a closure's operator() into a member function template when parameters use auto, letting one lambda accept arbitrary types without a named template.",
    code: `int sum_pairs() {
    auto add = [](const auto& a, const auto& b) {
        return a + b;
    };
    return add(3, 4) + static_cast<int>(add(1.5, 2.5));
}`,
    topicSlug: "lambdas",
    cpprefPath: "language/lambda",
  },
  {
    id: "cpp14-relaxed-constexpr",
    era: "C++14",
    category: "language",
    title: "Relaxed constexpr functions with locals & loops",
    clause: "[dcl.constexpr]",
    paper: "N3652",
    shift:
      "Lifted C++11's single-return restriction so constexpr functions can declare mutable local variables, run loops, and branch like ordinary imperative code.",
    code: `constexpr int sum_up_to(int limit) {
    int acc = 0;
    for (int i = 1; i <= limit; ++i) {
        acc += i;
    }
    return acc;
}

static_assert(sum_up_to(10) == 55, "Imperative constexpr loop");`,
    topicSlug: "constant-expressions",
    cpprefPath: "language/constexpr",
  },
  {
    id: "cpp14-make-unique",
    era: "C++14",
    category: "library",
    title: "Exception-safe std::make_unique",
    clause: "[unique.ptr.create]",
    paper: "N3656",
    shift:
      "Closed the exception-safety gap in calls like f(unique_ptr(new A), unique_ptr(new B)) by wrapping allocation and ownership inside one atomic factory call.",
    code: `#include <memory>

struct Node {
    int id;
    Node(int i) : id(i) {}
};

std::unique_ptr<Node> build_node(int id) {
    return std::make_unique<Node>(id);
}`,
    topicSlug: "smart-pointers-and-allocators",
    cpprefPath: "memory/unique_ptr/make_unique",
  },
  {
    id: "cpp14-transparent-lookup",
    era: "C++14",
    category: "library",
    title: "Heterogeneous associative lookup (is_transparent)",
    clause: "[associative.reqmts]",
    paper: "N3657",
    shift:
      "Allowed ordered containers with transparent comparators such as std::less<> to search by compatible key views without allocating temporary std::string keys.",
    code: `#include <functional>
#include <map>
#include <string>

bool has_key(const std::map<std::string, int, std::less<>>& m, const char* key) {
    return m.find(key) != m.end(); // No temporary std::string constructed
}`,
    topicSlug: "containers-and-iterator-invalidation",
    cpprefPath: "utility/functional/less_void",
  },
  {
    id: "cpp14-shared-locking",
    era: "C++14",
    category: "library",
    title: "Shared reader-writer locks (std::shared_timed_mutex)",
    clause: "[thread.sharedtimedmutex]",
    paper: "N3659",
    shift:
      "Added multiple-reader / single-writer synchronization primitives so concurrent readers share access via std::shared_lock while writers acquire exclusive locks.",
    code: `#include <mutex>
#include <shared_mutex>

struct ConfigCache {
    mutable std::shared_timed_mutex mtx;
    int revision = 0;

    int read() const {
        std::shared_lock<std::shared_timed_mutex> lock(mtx);
        return revision;
    }

    void bump() {
        std::unique_lock<std::shared_timed_mutex> lock(mtx);
        ++revision;
    }
};`,
    topicSlug: "threads-jthread-and-locks",
    cpprefPath: "thread/shared_timed_mutex",
  },

  // ---------------------------------------------------------------------------
  // C++17
  // ---------------------------------------------------------------------------
  {
    id: "cpp17-guaranteed-elision",
    era: "C++17",
    category: "language",
    title: "Guaranteed copy elision & prvalue materialization",
    clause: "[class.copy.elision]",
    paper: "P0135R1",
    shift:
      "Redefined prvalues as unmaterialized initialization instructions rather than temporary objects, mandating zero-copy construction directly into destination storage.",
    code: `struct Immovable {
    int value;
    explicit Immovable(int v) : value(v) {}
    Immovable(const Immovable&) = delete;
    Immovable(Immovable&&) = delete;
};

Immovable make_immovable() {
    return Immovable(99); // Guaranteed direct initialization, no move needed
}`,
    topicSlug: "copy-elision",
    cpprefPath: "language/copy_elision",
  },
  {
    id: "cpp17-structured-bindings",
    era: "C++17",
    category: "language",
    title: "Structured bindings decomposition",
    clause: "[dcl.struct.bind]",
    paper: "P0217R3",
    shift:
      "Introduced declarative binding of subobjects or tuple-like elements to named identifiers bound directly to a hidden decomposed object.",
    code: `#include <map>
#include <string>

bool insert_once(std::map<std::string, int>& counts, const std::string& k) {
    auto [it, inserted] = counts.emplace(k, 1);
    if (!inserted) ++(it->second);
    return inserted;
}`,
    topicSlug: "initialization-forms",
    cpprefPath: "language/structured_binding",
  },
  {
    id: "cpp17-eval-order",
    era: "C++17",
    category: "language",
    title: "Strict expression evaluation order",
    clause: "[intro.execution]",
    paper: "P0145R3",
    shift:
      "Sequenced postfix expressions, shift chains, and assignments left-to-right (or right-to-left for =) so chained calls and index updates no longer have unspecified order.",
    code: `#include <map>

int update_entry(std::map<int, int>& table, int key) {
    // RHS of '=' is guaranteed sequenced before table[key] lookup
    return table[key] = static_cast<int>(table.size());
}`,
    topicSlug: "evaluation-order",
    cpprefPath: "language/eval_order",
  },
  {
    id: "cpp17-launder",
    era: "C++17",
    category: "library",
    title: "std::launder & placement-new object identity",
    clause: "[ptr.launder]",
    paper: "P0137R1",
    shift:
      "Separated pointer provenance from raw storage reuse so replacement objects with const or reference members remain reachable without stale devirtualization.",
    code: `#include <new>

struct ConstBox {
    const int id;
};

int reuse_const_box() {
    alignas(ConstBox) unsigned char storage[sizeof(ConstBox)];
    ConstBox* first = new (storage) ConstBox{1};
    first->~ConstBox();
    new (storage) ConstBox{2};
    return std::launder(first)->id; // Must launder to observe id == 2
}`,
    topicSlug: "object-lifetime-and-storage",
    cpprefPath: "utility/launder",
  },
  {
    id: "cpp17-variant",
    era: "C++17",
    category: "library",
    title: "Type-safe discriminated union (std::variant)",
    clause: "[variant]",
    paper: "P0088R3",
    shift:
      "Provided a stack-allocated sum type tracking its active alternative safely in the type system instead of error-prone tagged C unions.",
    code: `#include <string>
#include <variant>

using Result = std::variant<int, std::string>;

int extract_or_zero(const Result& r) {
    return std::visit([](const auto& val) -> int {
        if constexpr (std::is_same_v<decltype(val), const int&>) {
            return val;
        }
        return 0;
    }, r);
}`,
    topicSlug: "vocabulary-types-and-format",
    cpprefPath: "utility/variant",
  },
  {
    id: "cpp17-string-view",
    era: "C++17",
    category: "library",
    title: "Non-owning std::string_view & std::optional",
    clause: "[string.view]",
    paper: "P0220R1",
    shift:
      "Standardized borrowed pointer-plus-length string slices and nullable value wrappers so APIs avoid heap allocations when inspecting read-only text or absent values.",
    code: `#include <optional>
#include <string_view>

std::optional<std::string_view> trim_prefix(std::string_view sv, std::string_view pfx) {
    if (sv.size() < pfx.size() || sv.substr(0, pfx.size()) != pfx) {
        return std::nullopt;
    }
    sv.remove_prefix(pfx.size());
    return sv;
}`,
    topicSlug: "strings-views-and-spans",
    cpprefPath: "string/basic_string_view",
  },

  // ---------------------------------------------------------------------------
  // C++20
  // ---------------------------------------------------------------------------
  {
    id: "cpp20-concepts",
    era: "C++20",
    category: "language",
    title: "Concepts, requires-clauses & subsumption",
    clause: "[temp.constr.order]",
    paper: "P0734R0",
    shift:
      "Replaced brittle SFINAE traits with named boolean constraints participating directly in overload partial ordering via atomic-constraint subsumption.",
    code: `#include <concepts>

template <typename T>
concept SignedInt = std::integral<T> && std::signed_integral<T>;

template <std::integral T>
constexpr int classify(T) { return 1; }

template <SignedInt T>
constexpr int classify(T) { return 2; } // Subsumes std::integral

static_assert(classify(-7) == 2);`,
    topicSlug: "sfinae-and-concepts",
    cpprefPath: "language/constraints",
  },
  {
    id: "cpp20-coroutines",
    era: "C++20",
    category: "language",
    title: "Stackless coroutines (co_await, co_yield, co_return)",
    clause: "[dcl.fct.def.coroutine]",
    paper: "P0912R5",
    shift:
      "Added compiler-synthesized heap/elided coroutine frames controlled by promise_type hooks, enabling suspension without OS thread stacks.",
    code: `#include <coroutine>

struct Task {
    struct promise_type {
        Task get_return_object() { return {}; }
        std::suspend_never initial_suspend() noexcept { return {}; }
        std::suspend_never final_suspend() noexcept { return {}; }
        void return_void() noexcept {}
        void unhandled_exception() {}
    };
};

Task ping() {
    co_await std::suspend_never{};
    co_return;
}`,
    topicSlug: "coroutines",
    cpprefPath: "language/coroutines",
  },
  {
    id: "cpp20-spaceship",
    era: "C++20",
    category: "language",
    title: "Three-way comparison (operator<=>)",
    clause: "[expr.spaceship]",
    paper: "P0515R3",
    shift:
      "Collapsed six relational boilerplates into defaulted operator<=> plus compiler-synthesized rewritten candidates for <, <=, >, >=, and !=.",
    code: `#include <compare>

struct SemVer {
    int major;
    int minor;
    auto operator<=>(const SemVer&) const = default;
};

static_assert(SemVer{2, 0} > SemVer{1, 9});
static_assert(SemVer{2, 0} == SemVer{2, 0});`,
    topicSlug: "overload-resolution",
    cpprefPath: "language/operator_comparison",
  },
  {
    id: "cpp20-ranges",
    era: "C++20",
    category: "library",
    title: "Composable std::ranges views & niebloids",
    clause: "[ranges.syn]",
    paper: "P0896R4",
    shift:
      "Replaced unchecked iterator pairs with constrained ranges, lazy view pipelines via operator|, and ADL-proof niebloid function objects.",
    code: `#include <ranges>
#include <vector>

int sum_even_squares(const std::vector<int>& nums) {
    int total = 0;
    for (int v : nums
               | std::views::filter([](int x) { return x % 2 == 0; })
               | std::views::transform([](int x) { return x * x; })) {
        total += v;
    }
    return total;
}`,
    topicSlug: "ranges-views-and-niebloids",
    cpprefPath: "ranges",
  },
  {
    id: "cpp20-span",
    era: "C++20",
    category: "library",
    title: "Contiguous non-owning std::span",
    clause: "[views.span]",
    paper: "P0122R7",
    shift:
      "Unified raw arrays, std::array, and std::vector parameters into one bounds-aware pointer+size view with optional compile-time static extent.",
    code: `#include <span>

int sum_bytes(std::span<const int> items) {
    int acc = 0;
    for (int v : items.subspan(0, items.size())) {
        acc += v;
    }
    return acc;
}`,
    topicSlug: "strings-views-and-spans",
    cpprefPath: "container/span",
  },
  {
    id: "cpp20-jthread",
    era: "C++20",
    category: "library",
    title: "RAII std::jthread & cooperative stop_token",
    clause: "[thread.jthread]",
    paper: "P0660R10",
    shift:
      "Fixed std::thread's destructor std::terminate trap by automatically requesting cancellation and joining on scope exit.",
    code: `#include <stop_token>
#include <thread>

void run_worker() {
    std::jthread worker([](std::stop_token st) {
        while (!st.stop_requested()) {
            break;
        }
    });
} // Automatically calls request_stop() and join()`,
    topicSlug: "threads-jthread-and-locks",
    cpprefPath: "thread/jthread",
  },

  // ---------------------------------------------------------------------------
  // C++23
  // ---------------------------------------------------------------------------
  {
    id: "cpp23-deducing-this",
    era: "C++23",
    category: "language",
    title: "Explicit object parameters (deducing this)",
    clause: "[dcl.fct]",
    paper: "P0847R7",
    shift:
      "Let member functions declare an explicit 'this Self&&' first parameter, unifying const/ref overloads and replacing CRTP boilerplate.",
    code: `#include <utility>

struct Cell {
    int data = 0;

    template <class Self>
    auto&& get(this Self&& self) {
        return std::forward<Self>(self).data;
    }
};

int read_cell() {
    const Cell c{42};
    return c.get(); // Self deduced as const Cell&
}`,
    topicSlug: "crtp-and-deducing-this",
    cpprefPath: "language/member_functions",
  },
  {
    id: "cpp23-implicit-move",
    era: "C++23",
    category: "language",
    title: "Simpler implicit move for move-eligible returns",
    clause: "[class.copy.elision]",
    paper: "P2266R3",
    shift:
      "Unified implicit-move rules so any move-eligible local or parameter in return, co_return, or throw behaves directly as an xvalue during overload resolution.",
    code: `struct Sink {};
struct Source {
    operator Sink() const& = delete;
    operator Sink() && { return {}; }
};

Sink convert(Source s) {
    return s; // Move-eligible parameter picks operator Sink() && in C++23
}`,
    topicSlug: "copy-and-move",
    cpprefPath: "language/return",
  },
  {
    id: "cpp23-range-for-lifetime",
    era: "C++23",
    category: "language",
    title: "Range-based for temporary lifetime extension",
    clause: "[stmt.ranged]",
    paper: "P2718R0",
    shift:
      "Extended all temporaries created inside a range-based for initializer expression until the loop finishes, curing chained accessor dangling bugs.",
    code: `#include <vector>

struct Holder {
    std::vector<int> items{1, 2, 3};
    const std::vector<int>& get() const { return items; }
};

int sum_holder() {
    int total = 0;
    for (int x : Holder{}.get()) { // Holder temporary lives across whole loop in C++23
        total += x;
    }
    return total;
}`,
    topicSlug: "reference-binding-and-temporaries",
    cpprefPath: "language/range-for",
  },
  {
    id: "cpp23-expected",
    era: "C++23",
    category: "library",
    title: "std::expected<T, E> monadic error handling",
    clause: "[expected]",
    paper: "P0323R12",
    shift:
      "Standardized a sum type holding either an expected value T or error E with monadic combinators (and_then, transform, or_else) for exception-free pipelines.",
    code: `#include <expected>

enum class ParseErr { empty };

std::expected<int, ParseErr> parse_port(bool ok) {
    if (!ok) return std::unexpected(ParseErr::empty);
    return 8080;
}

int resolve_port(bool ok) {
    return parse_port(ok)
        .transform([](int p) { return p + 1; })
        .value_or(80);
}`,
    topicSlug: "optional-expected-and-error-codes",
    cpprefPath: "utility/expected",
  },
  {
    id: "cpp23-print",
    era: "C++23",
    category: "library",
    title: "Compile-time checked std::print & std::println",
    clause: "[print.fun]",
    paper: "P2093R14",
    shift:
      "Combined compile-time checked format strings with direct Unicode-aware terminal output, eliminating iostream state flags and printf type mismatches.",
    code: `#include <print>

void log_metric(int count, double ms) {
    std::println("Processed {} items in {:.2f} ms", count, ms);
}`,
    topicSlug: "vocabulary-types-and-format",
    cpprefPath: "io/print",
  },
  {
    id: "cpp23-start-lifetime-as",
    era: "C++23",
    category: "library",
    title: "std::start_lifetime_as implicit object creation",
    clause: "[obj.lifetime]",
    paper: "P2590R2",
    shift:
      "Gave low-level deserialization and DMA buffers a defined abstract-machine primitive to begin implicit-lifetime object existence in-place without UB.",
    code: `#include <memory>

struct PacketHeader {
    unsigned int magic;
    unsigned int length;
};

unsigned int read_magic(const void* wire_bytes) {
    const auto* hdr = std::start_lifetime_as<PacketHeader>(wire_bytes);
    return hdr->magic;
}`,
    topicSlug: "object-lifetime-and-storage",
    cpprefPath: "memory/start_lifetime_as",
  },

  // ---------------------------------------------------------------------------
  // C++26
  // ---------------------------------------------------------------------------
  {
    id: "cpp26-contracts",
    era: "C++26",
    category: "language",
    title: "Contract assertions (pre, post, contract_assert)",
    clause: "[basic.contract]",
    paper: "P2900R14",
    shift:
      "Moved preconditions, postconditions, and inline assertions into checked language syntax with constified predicates and selectable evaluation semantics.",
    code: `#include <contracts>

int clamp_nonneg(const int value, const int limit)
    pre(limit >= 0)
    post(r: r >= 0 && r <= limit)
{
    contract_assert(limit >= 0);
    if (value < 0) return 0;
    return value > limit ? limit : value;
}`,
    topicSlug: "cpp26-contracts-reflection-execution",
    cpprefPath: "language/contracts",
  },
  {
    id: "cpp26-static-reflection",
    era: "C++26",
    category: "language",
    title: "Value-based static reflection (^^ and [:refl:])",
    clause: "[expr.reflect]",
    paper: "P2996R13",
    shift:
      "Replaced macro serialization and recursive template traits with first-class consteval std::meta::info values queried via ^^ and spliced back with [:refl:].",
    code: `#include <cstddef>
#include <meta>

struct Metric {
    int count;
    double latency;
};

consteval std::size_t member_count() {
    return std::meta::nonstatic_data_members_of(
        ^^Metric, std::meta::access_context::current()
    ).size();
}

static_assert(member_count() == 2);`,
    topicSlug: "cpp26-contracts-reflection-execution",
    cpprefPath: "language/operator_reflection",
  },
  {
    id: "cpp26-erroneous-behavior",
    era: "C++26",
    category: "language",
    title: "Erroneous behavior & [[indeterminate]]",
    clause: "[basic.indet]",
    paper: "P2795R5",
    shift:
      "Replaced uninitialized-local undefined behavior with bounded erroneous behavior unless a buffer explicitly opts back in via [[indeterminate]].",
    code: `#include <cstddef>

int bounded_erroneous_read() {
    int uninit; // Erroneous value in C++26: deterministic runtime, no UB time travel
    return uninit;
}

std::byte raw_scratch() {
    [[indeterminate]] std::byte page[1024]; // Explicit opt-out for uninitialized scratch
    page[0] = std::byte{0x42};
    return page[0];
}`,
    topicSlug: "cpp26-contracts-reflection-execution",
    cpprefPath: "language/attributes/indeterminate",
  },
  {
    id: "cpp26-execution",
    era: "C++26",
    category: "library",
    title: "std::execution senders, receivers & schedulers",
    clause: "[exec]",
    paper: "P2300R10",
    shift:
      "Standardized composable lazy async task graphs connecting schedulers, senders, and receivers across three completion channels without eager allocations.",
    code: `// C++26 P2300R10 standard library syntax (<execution>)
#include <execution>
#include <thread>
#include <utility>

int run_async_graph(std::execution::scheduler auto sched) {
    namespace ex = std::execution;
    auto work = ex::schedule(sched)
        | ex::then([] { return 21; })
        | ex::then([](int v) { return v * 2; });
    auto [res] = std::this_thread::sync_wait(std::move(work)).value();
    return res;
}`,
    topicSlug: "cpp26-contracts-reflection-execution",
    cpprefPath: "execution",
  },
  {
    id: "cpp26-inplace-vector",
    era: "C++26",
    category: "library",
    title: "std::inplace_vector<T, N> fixed-capacity storage",
    clause: "[inplace.vector]",
    paper: "P0843R14",
    shift:
      "Delivered a resizable contiguous sequence container backed entirely by inline storage inside the object, eliminating heap allocations and pointer chasing.",
    code: `#include <inplace_vector>

int build_inline_batch() {
    std::inplace_vector<int, 4> batch;
    batch.push_back(10);
    batch.push_back(20);
    return batch.front() + batch.back();
}`,
    topicSlug: "containers-and-iterator-invalidation",
    cpprefPath: "container/inplace_vector",
  },
  {
    id: "cpp26-function-ref",
    era: "C++26",
    category: "library",
    title: "Non-owning std::function_ref callable view",
    clause: "[func.wrap.ref]",
    paper: "P0792R14",
    shift:
      "Added a lightweight two-pointer type-erased view over any callable, eliminating std::function heap allocations and template code bloat for callbacks.",
    code: `#include <functional>

int apply_twice(std::function_ref<int(int)> fn, int x) {
    return fn(fn(x));
}

int test_callback() {
    return apply_twice([](int v) { return v + 3; }, 10);
}`,
    topicSlug: "lambdas",
    cpprefPath: "utility/functional/function_ref",
  },
];
