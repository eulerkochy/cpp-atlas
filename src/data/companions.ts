import { CompanionOverlay, QuizQuestion } from "@/types/cpp";

export const COMPANION_OVERLAYS: CompanionOverlay[] = [
  {
    id: "value-categories",
    primaryPath: "language/value_category",
    cppPaths: [
      "language/value_category",
      "language/copy_elision",
      "language/implicit_conversion",
      "language/string_literal",
      "language/operator_incdec",
    ],
    title: "Value Semantics & C++17 Value Categories",
    shortTitle: "Value categories",
    subtitle:
      "Replace circular 'left-of-equals' rules with the two independent axes of every C++ expression: identity and movability.",
    standardEra: "C++11 → C++17 → C++23",
    primaryClauses: [
      "[basic.lval]",
      "[conv.rval]",
      "[class.copy.elision]",
      "[dcl.type.decltype]",
    ],
    mentalModelOneLiner:
      "A prvalue in C++17+ is not an object in memory—it is an unmaterialized recipe to initialize a target slot.",
    cppconFraming: {
      talkAngle:
        "Show how C++17 reversed the arrow: previously prvalues were temporary objects we tried to elide away; now prvalues only become objects when materialization is forced.",
      audienceTrap:
        "Conflating an identifier's declared type (Widget&&) with its expression value category (lvalue inside the function body).",
      stageTakeaway:
        "Never write return std::move(local); — it turns an implicit move-eligible lvalue into an explicit xvalue that blocks NRVO.",
    },
    memoryMapTitle: "C++17 Value Category Taxonomy & Materialization",
    memoryMapDescription:
      "Click any category node or real C++ expression to inspect identity, movability, and when the compiler materializes stack bytes.",
    memoryMapAudioSummary:
      "C++17 classifies every expression along two orthogonal axes: glvalue (has identity, you can take its address or distinguish it from another object) and rvalue (eligible to be moved from). An lvalue has identity and cannot be moved from implicitly; a prvalue has no identity yet because it is an unmaterialized initialization recipe; an xvalue sits at the intersection of both—an expiring object that already occupies memory and can have its resources pilfered. Temporary materialization conversion converts a prvalue into an xvalue only at the exact boundary where an object identity is required, such as binding a reference or accessing a member.",
    sections: [
      {
        id: "two-axes",
        title: "Identity vs. movability",
        clause: "[basic.lval] §7.2.1",
        summary:
          "Every expression lands in one of three primary leaves—lvalue, xvalue, or prvalue—defined by combining two properties.",
        prose: [
          "Forget 'left side vs right side of an assignment'. In modern C++, an expression is classified by two orthogonal questions: Does evaluation determine the identity of an existing object or function (glvalue)? And may its resources be reused because nothing else observes it afterward (rvalue)?",
          "An lvalue has identity but is not movable. A prvalue ('pure rvalue') is an unmaterialized computation or initializer with no address of its own. An xvalue ('eXpiring value') is the overlap: an object that already exists in memory whose lifetime is about to end or was explicitly cast via std::move.",
        ],
        codeExample: {
          caption: "Type vs. value category orthogonality",
          code: `void consume(Widget& w);   // binds lvalues
void consume(Widget&& w);  // binds rvalues (xvalue or prvalue)

void relay(Widget&& param) {
    // 'param' has type Widget&&, yet the expression 'param' is an LVALUE
    // because it has a name and an addressable location.
    consume(param);            // calls consume(Widget&)
    consume(std::move(param)); // xvalue -> calls consume(Widget&&)
}`,
        },
        keyTakeaway:
          "Named rvalue references are always lvalues inside expressions; only unnamed rvalue references (like std::move's return value) are xvalues.",
      },
      {
        id: "deferred-materialization",
        title: "C++17 deferred temporary materialization",
        clause: "[conv.rval] & [class.copy.elision]",
        summary:
          "Guaranteed copy elision is no longer an optimizer privilege—it falls directly out of redefining prvalues as initializers.",
        prose: [
          "Prior to C++17, Widget w = Widget(42); conceptually created a temporary Widget, called the move constructor into w, and then allowed the compiler to elide that move—which still forced Widget's move constructor to be accessible.",
          "C++17 fixed this at the grammar level. Widget(42) is a prvalue initialization recipe passed down to w's storage slot. No temporary object exists unless something forces temporary materialization ([conv.rval]), such as binding to const Widget& or reading .field on a temporary.",
        ],
        codeExample: {
          caption: "Non-copyable, non-movable type returned by value",
          code: `struct Locked {
    int token;
    explicit Locked(int t) : token(t) {}
    Locked(const Locked&) = delete;
    Locked(Locked&&) = delete;
};

Locked make_locked() {
    return Locked{99}; // Legal since C++17: initializes caller slot directly
}

Locked x = make_locked(); // Zero moves, zero copies required`,
        },
        keyTakeaway:
          "Prvalue chains (make() -> make() -> variable) collapse into a single in-place construction at the final destination.",
      },
    ],
    standardEvolution: [
      {
        standard: "C++11",
        summary:
          "Introduced xvalues and formal 5-category taxonomy to support move semantics while preserving C++98 copy elision rules.",
      },
      {
        standard: "C++17",
        summary:
          "Redefined prvalues as unmaterialized initializers and added temporary materialization conversion ([conv.rval]), making prvalue copy elision mandatory.",
        beforeCode: "// C++14: fails if move ctor is deleted\nNonMovable x = make();",
        afterCode: "// C++17+: mandatory in-place init\nNonMovable x = make();",
      },
      {
        standard: "C++23",
        summary:
          "P2266R3 simplified implicit move rules in return statements so move-eligible expressions automatically treat locals as xvalues even when returning by rvalue reference.",
      },
    ],
    quizzes: [
      {
        id: "vc-q1",
        companionId: "value-categories",
        canonicalPath: "language/string_literal",
        topicTitle: "Value Semantics & C++17 Value Categories",
        trapLevel: "standard-lawyer",
        standardClause: "[lex.string] §5.13.5",
        prompt:
          "What is the value category and exact type of the string literal expression \"cppcon\"?",
        code: `auto p = &"cppcon";`,
        options: [
          "prvalue of type const char*",
          "lvalue of type const char[7]",
          "prvalue of type const char[7]",
          "xvalue of type const char(&)[7]",
        ],
        correctIndex: 1,
        explanation:
          "Unlike numeric literals such as 42 (which are prvalues), string literals have static storage duration in read-only memory. They are lvalues of array type const char[N] including the null terminator, which is why taking &\"cppcon\" compiles cleanly.",
        cppconNote:
          "Great opening warm-up slide at CppCon: 80% of the room picks prvalue by analogy with integer literals.",
      },
      {
        id: "vc-q2",
        companionId: "value-categories",
        canonicalPath: "language/value_category",
        topicTitle: "Value Semantics & C++17 Value Categories",
        trapLevel: "subtle",
        standardClause: "[dcl.type.decltype] §9.2.9.6",
        prompt:
          "Given int x = 10; what are the deduced types of a and b below?",
        code: `int x = 10;
decltype(x)   a = x;
decltype((x)) b = x;`,
        options: [
          "a is int, b is int",
          "a is int&, b is int&",
          "a is int, b is int&",
          "a is int, b is int&&",
        ],
        correctIndex: 2,
        explanation:
          "decltype has two rules: on an unparenthesized id-expression (x), it yields the declared type (int). Wrapping parentheses turns (x) into a general expression, where decltype yields T& for lvalues, T&& for xvalues, and T for prvalues.",
      },
      {
        id: "vc-q3",
        companionId: "value-categories",
        canonicalPath: "language/copy_elision",
        topicTitle: "Value Semantics & C++17 Value Categories",
        trapLevel: "cppcon-stage",
        standardClause: "[class.copy.elision] §11.9.6",
        prompt:
          "In C++17 and later, what happens when returning a named local variable via return std::move(buf);?",
        code: `std::string build() {
    std::string buf = "long heap string...";
    return std::move(buf);
}`,
        options: [
          "Faster than return buf; because it forces a move instead of a copy",
          "Prevents NRVO and forces a move construction instead of zero-cost in-place construction",
          "Undefined behavior because buf is destroyed before the move finishes",
          "Triggers guaranteed C++17 copy elision",
        ],
        correctIndex: 1,
        explanation:
          "NRVO (Named Return Value Optimization) only applies when the return operand is the plain name of an automatic local variable. Wrapping it in std::move(buf) changes the expression to a function call yielding an xvalue, blocking NRVO and forcing an actual move constructor call (-Wpessimizing-move).",
        cppconNote:
          "Emphasize: plain return buf; already moves implicitly if NRVO doesn't happen, so std::move here can only hurt.",
      },
      {
        id: "vc-q4",
        companionId: "value-categories",
        canonicalPath: "language/value_category",
        topicTitle: "Value Semantics & C++17 Value Categories",
        trapLevel: "standard-lawyer",
        standardClause: "[expr.ref] §7.6.1.5",
        prompt:
          "Given struct S { int m; }; and a function S make_s();, what is the value category of make_s().m?",
        code: `struct S { int m; };
S make_s();
// What is make_s().m ?`,
        options: [
          "lvalue",
          "prvalue",
          "xvalue",
          "Ill-formed because make_s() is unmaterialized",
        ],
        correctIndex: 2,
        explanation:
          "Member access E1.E2 on a prvalue E1 first triggers temporary materialization ([conv.rval]), turning make_s() into a temporary xvalue. A non-static data member access on an rvalue yields an xvalue designating that subobject.",
      },
      {
        id: "vc-q5",
        companionId: "value-categories",
        canonicalPath: "language/operator_incdec",
        topicTitle: "Value Semantics & C++17 Value Categories",
        trapLevel: "subtle",
        standardClause: "[expr.pre.incr] & [expr.post.incr]",
        prompt:
          "For built-in int i = 0;, which expression is well-formed C++?",
        code: `int i = 0;`,
        options: [
          "&(i++)",
          "(i++) = 5",
          "++ ++i",
          "int& r = i++;",
        ],
        correctIndex: 2,
        explanation:
          "Built-in prefix ++i modifies i and yields an lvalue referring to i, so chaining ++ ++i mutates i twice validly. Built-in postfix i++ produces a prvalue copy of the old value, which cannot have its address taken, be assigned to, or bind to a non-const lvalue ref.",
      },
    ],
    podcastPrompts: [
      "Debate why teaching 'lvalue means left-hand side of =' actively breaks programmers once const variables and std::move enter the picture.",
      "Walk through how C++17 deferred materialization makes non-movable types like std::atomic<int> returnable by value.",
      "Quiz each other on why \"hello\" is an lvalue and why return std::move(local) is a classic performance pessimization.",
    ],
  },
  {
    id: "memory-model",
    primaryPath: "language/memory_model",
    cppPaths: [
      "language/memory_model",
      "atomic/memory_order",
      "atomic/atomic",
      "atomic/atomic_thread_fence",
    ],
    title: "The C++ Memory Model, Happens-Before & Atomics",
    shortTitle: "Memory model & atomics",
    subtitle:
      "Understand the abstract machine contract between your source code, the optimizer, and hardware store buffers.",
    standardEra: "C++11 → C++20",
    primaryClauses: [
      "[intro.memory]",
      "[intro.races]",
      "[atomics.order]",
      "[atomics.fences]",
    ],
    mentalModelOneLiner:
      "Release/acquire does not flush CPU caches—it builds a happens-before bridge so ordinary writes before release become visible after acquire.",
    cppconFraming: {
      talkAngle:
        "Show that compiler reordering and CPU store buffers exist independently; memory_order constrains BOTH the compiler optimizer and hardware fence instructions emitted.",
      audienceTrap:
        "Assuming memory_order_seq_cst is required on every atomic flag, or conversely thinking memory_order_relaxed prevents adjacent non-atomic writes from reordering across it.",
      stageTakeaway:
        "A single unsynchronized data race on a non-atomic variable poisons the entire execution with Undefined Behavior—even if the hardware reads an intact word.",
    },
    memoryMapTitle: "Multi-Core Litmus Test & Synchronization Simulator",
    memoryMapDescription:
      "Compare Message Passing and Store Buffering under Non-Atomic UB, relaxed, acquire/release, and seq_cst across cores and store buffers.",
    memoryMapAudioSummary:
      "In the C++ abstract machine, two threads accessing the same memory location where at least one is a non-atomic write and neither happens-before the other creates a data race, which is Undefined Behavior. To establish inter-thread ordering without heavy mutexes, a release store on one thread pairs with an acquire load reading that stored value on another thread, forming a synchronizes-with edge. Everything sequenced before the release store now happens-before everything sequenced after the acquire load. However, store buffering—where two threads write to separate atomics and read each other's atomics—can still observe both reads returning zero under acquire/release because store buffers delay visibility; preventing that requires memory_order_seq_cst.",
    sections: [
      {
        id: "memory-locations",
        title: "Memory locations & the bit-field trap",
        clause: "[intro.memory] §6.7.1",
        summary:
          "Thread safety starts with what the standard considers a distinct memory location.",
        prose: [
          "Before C++11, C++ had no standard notion of threads; concurrency lived inside POSIX or Win32 headers while compilers happily hoisted loads out of loops. C++11 introduced the abstract memory model.",
          "Crucially, two adjacent scalar struct members (like int a; int b;) are separate memory locations and can be mutated concurrently by two threads. Adjacent non-zero-width bit-fields (int b : 5; int c : 11;), however, share ONE memory location—concurrently mutating b and c on different threads is a silent data race!",
        ],
        codeExample: {
          caption: "Zero-width bit-field separator ([intro.memory])",
          code: `struct Packed {
    unsigned a : 4;
    unsigned   : 0; // Forces next bit-field into a new memory location
    unsigned b : 4;
};
// Thread 1 mutating p.a and Thread 2 mutating p.b is now race-free.`,
        },
        keyTakeaway:
          "Bit-fields inside the same sequence share a single read-modify-write word and therefore share one C++ memory location.",
      },
      {
        id: "happens-before",
        title: "Sequenced-before, synchronizes-with, happens-before",
        clause: "[intro.races] & [atomics.order]",
        summary:
          "Three relations build the mathematical partial order that guarantees another core sees your payload.",
        prose: [
          "Within one thread, evaluation order gives sequenced-before. Across threads, an atomic store with memory_order_release that is read by an atomic load with memory_order_acquire establishes a synchronizes-with edge.",
          "Transitively chaining sequenced-before and synchronizes-with gives happens-before. Notice what memory_order_relaxed lacks: relaxed atomics avoid data-race UB on the atomic variable itself and obey single-variable modification order, yet establish zero happens-before ordering for surrounding non-atomic data.",
        ],
        codeExample: {
          caption: "Classic publication via acquire/release",
          code: `int payload = 0;
std::atomic<bool> ready{false};

// Thread 1 (Producer)
payload = 42;                                  // (1) sequenced-before (2)
ready.store(true, std::memory_order_release);  // (2) synchronizes-with (3)

// Thread 2 (Consumer)
while (!ready.load(std::memory_order_acquire)) {} // (3)
assert(payload == 42);                            // Guaranteed! (1) happens-before (4)`,
        },
        keyTakeaway:
          "Release prevents prior memory accesses from moving after the store; acquire prevents subsequent memory accesses from moving before the load.",
      },
    ],
    standardEvolution: [
      {
        standard: "C++11",
        summary:
          "Defined the abstract memory model, std::atomic<T>, 6 memory orders, and formal data-race Undefined Behavior.",
      },
      {
        standard: "C++20",
        summary:
          "Added std::atomic_ref<T>, wait/notify on atomics, and discouraged memory_order_consume in favor of acquire until hardware dependency tracking matures.",
      },
    ],
    quizzes: [
      {
        id: "mm-q1",
        companionId: "memory-model",
        canonicalPath: "language/memory_model",
        topicTitle: "The C++ Memory Model, Happens-Before & Atomics",
        trapLevel: "standard-lawyer",
        standardClause: "[intro.memory] §6.7.1",
        prompt:
          "In struct S { int x : 4; int y : 4; };, Thread 1 writes s.x = 1 and Thread 2 concurrently writes s.y = 2. What does the C++ standard say?",
        code: `struct S { int x : 4; int y : 4; } s{};
// Thread 1: s.x = 1;
// Thread 2: s.y = 2;`,
        options: [
          "Well-defined because x and y are distinct member names",
          "Undefined behavior due to a data race on a shared memory location",
          "Well-defined on 64-bit architectures only",
          "Implementation-defined torn read",
        ],
        correctIndex: 1,
        explanation:
          "Contiguous non-zero-length bit-fields belong to the same memory location ([intro.memory]). Compilers compile s.x = 1 as a non-atomic read-modify-write of the containing word, racing directly with Thread 2.",
      },
      {
        id: "mm-q2",
        companionId: "memory-model",
        canonicalPath: "atomic/memory_order",
        topicTitle: "The C++ Memory Model, Happens-Before & Atomics",
        trapLevel: "cppcon-stage",
        standardClause: "[atomics.order] §33.5.4",
        prompt:
          "Two atomics x and y start at 0. Thread 1 runs x.store(1, release); r1 = y.load(acquire); and Thread 2 runs y.store(1, release); r2 = x.load(acquire);. Can BOTH r1 == 0 and r2 == 0 happen?",
        code: `std::atomic<int> x{0}, y{0};
// T1: x.store(1, std::memory_order_release); int r1 = y.load(std::memory_order_acquire);
// T2: y.store(1, std::memory_order_release); int r2 = x.load(std::memory_order_acquire);`,
        options: [
          "No—acquire/release forces a single global order across x and y",
          "Yes—store buffers allow each core's acquire load to bypass its own prior release store",
          "No—only memory_order_relaxed allows r1 == 0 && r2 == 0",
          "Undefined behavior because x and y are accessed without a mutex",
        ],
        correctIndex: 1,
        explanation:
          "Acquire/release establishes pairwise happens-before ONLY when an acquire load actually reads a value written by a release store on the SAME atomic. Neither release prevents a following acquire load from reordering ahead of it (even on x86-64 TSO!). Only memory_order_seq_cst provides a single total order preventing r1 == 0 && r2 == 0.",
        cppconNote:
          "Classic Store Buffering (SB) litmus test—crucial for showing why acquire/release is NOT sequentially consistent.",
      },
      {
        id: "mm-q3",
        companionId: "memory-model",
        canonicalPath: "atomic/memory_order",
        topicTitle: "The C++ Memory Model, Happens-Before & Atomics",
        trapLevel: "subtle",
        standardClause: "[atomics.order]",
        prompt:
          "Thread 1 executes data = 42; flag.store(true, relaxed); while Thread 2 loops until flag.load(relaxed) and reads data. Why can assert(data == 42) fail?",
        code: `// T1: data = 42; flag.store(true, std::memory_order_relaxed);
// T2: while (!flag.load(std::memory_order_relaxed)) {}
//     assert(data == 42);`,
        options: [
          "Only on ARM; x86 forbids this bug",
          "There is a data race on data (Undefined Behavior) because relaxed creates no synchronizes-with edge",
          "flag itself can tear and read partially written bits",
          "The while loop is an infinite loop unless volatile is added",
        ],
        correctIndex: 1,
        explanation:
          "memory_order_relaxed prevents a data race ONLY on flag itself. It establishes zero happens-before relationship for data, so both the compiler (even on x86!) and CPU may reorder data = 42 after flag.store(true). Conflicting non-atomic access on data is full Undefined Behavior.",
      },
      {
        id: "mm-q4",
        companionId: "memory-model",
        canonicalPath: "atomic/atomic_thread_fence",
        topicTitle: "The C++ Memory Model, Happens-Before & Atomics",
        trapLevel: "cppcon-stage",
        standardClause: "[atomics.fences] §33.5.11",
        prompt:
          "How can two threads safely synchronize non-atomic payload publication using relaxed atomic loads/stores plus fences?",
        code: `// T1: payload = 42;  /* A */;  flag.store(true, std::memory_order_relaxed);
// T2: if (flag.load(std::memory_order_relaxed)) { /* B */; use(payload); }`,
        options: [
          "Put atomic_thread_fence(acquire) at A and release at B",
          "Put atomic_thread_fence(release) at A and acquire at B",
          "Fences cannot synchronize with relaxed atomic operations",
          "Replace payload with volatile int",
        ],
        correctIndex: 1,
        explanation:
          "A release fence followed by a relaxed store X synchronizes-with a relaxed load reading X followed by an acquire fence ([atomics.fences]). This pattern shines when looping over many items and fencing only once on success.",
      },
      {
        id: "mm-q5",
        companionId: "memory-model",
        canonicalPath: "atomic/atomic",
        topicTitle: "The C++ Memory Model, Happens-Before & Atomics",
        trapLevel: "subtle",
        standardClause: "[atomics.order] §33.5.4",
        prompt:
          "When using std::atomic<int> x{0}; solely as a shared telemetry counter incremented from 8 threads (x.fetch_add(1, order)), which memory order is sufficient for accurate final totals?",
        options: [
          "memory_order_seq_cst is required so increments don't get lost",
          "memory_order_acq_rel is required for read-modify-write atomicity",
          "memory_order_relaxed is sufficient because all operations on a single atomic share one total modification order",
          "Non-atomic volatile int is faster and equally safe",
        ],
        correctIndex: 2,
        explanation:
          "Atomicity (indivisible read-modify-write so increments never lose updates) holds for EVERY memory_order including relaxed. You only need acquire/release/seq_cst when ordering OTHER memory operations relative to the counter.",
      },
    ],
    podcastPrompts: [
      "Explain why 'flushing CPU caches' is a misleading mental model for acquire/release, and reframe it around store buffers and happens-before edges.",
      "Walk listeners through the Store Buffering litmus test where acquire/release still permits both threads to read zero.",
      "Compare bit-field sharing in [intro.memory] and why volatile is never a replacement for std::atomic.",
    ],
  },
  {
    id: "object-lifetime",
    primaryPath: "language/lifetime",
    cppPaths: [
      "language/lifetime",
      "language/raii",
      "utility/launder",
      "memory/unique_ptr",
      "numeric/bit_cast",
      "language/range-for",
      "language/reference_initialization",
    ],
    title: "Object Lifetime, Storage Duration & RAII",
    shortTitle: "Object lifetime & RAII",
    subtitle:
      "Separate raw memory allocation from object existence, master scope-bound RAII, and dodge dangling temporary traps.",
    standardEra: "C++11 → C++17 → C++20 → C++23",
    primaryClauses: [
      "[basic.life]",
      "[basic.stc]",
      "[class.temporary]",
      "[stmt.ranged]",
    ],
    mentalModelOneLiner:
      "Allocating bytes does not create an object, and freeing bytes is not what destroys one—lifetime begins at initialization and ends at destruction or storage reuse.",
    cppconFraming: {
      talkAngle:
        "Show the two timelines side by side: storage duration (how long the bytes exist) vs. object lifetime (when the typed object is legally alive inside those bytes).",
      audienceTrap:
        "Assuming temporary lifetime extension propagates through accessor methods like auto& x = make_container().front(); inside range-for loops.",
      stageTakeaway:
        "Use C++20 std::bit_cast instead of pointer-punning reinterpret_cast, and verify C++23 P2718 before trusting chained temporaries in range-for.",
    },
    memoryMapTitle: "Virtual Address Space & Scope Lifetime Scrubber",
    memoryMapDescription:
      "Step line-by-line through stack frames, heap allocations, temporary materialization, and destructor unwind in reverse order.",
    memoryMapAudioSummary:
      "In C++, storage duration and object lifetime are distinct concepts. Storage duration governs when raw memory exists—static, thread-local, automatic on the stack, or dynamic on the heap—while object lifetime begins only when initialization completes and ends when the destructor starts or the storage is reused. Binding a temporary directly to a const lvalue reference or rvalue reference extends its lifetime to the reference's scope, but chaining through a member function or accessor stops lifetime extension cold, creating a classic dangling reference before C++23's range-for fix (P2718R0). Meanwhile, placement-new reusing storage that contained const or reference subobjects requires std::launder so the optimizer does not reuse cached values from the previous object.",
    sections: [
      {
        id: "storage-vs-lifetime",
        title: "Storage duration is not object lifetime",
        clause: "[basic.life] §6.7.3",
        summary:
          "Raw bytes on the stack or from malloc do not become a C++ object until lifetime begins.",
        prose: [
          "When you allocate raw aligned storage (alignas(Widget) std::byte buf[sizeof(Widget)];), storage exists, yet zero Widget objects live there. Accessing a Widget* pointing to buf before placement-new construction is Undefined Behavior.",
          "C++20 softened one long-standing C interop pain point with Implicit-Lifetime Types ([intro.object]): malloc or std::start_lifetime_as (C++23) can implicitly begin the lifetime of trivial aggregates/arrays so C network buffers no longer rely on theoretical UB.",
        ],
        codeExample: {
          caption: "Why std::launder exists for const members",
          code: `struct Node { const int id; };
Node* p = new Node{1};
// Reuse p's storage with placement new:
new (p) Node{2};
// Compiler may legally assume p->id is STILL 1 because 'id' is const!
int safe_id = std::launder(p)->id; // Guaranteed 2 ([ptr.launder])`,
        },
        keyTakeaway:
          "Compilers track pointer provenance and const member immutability; std::launder tells the optimizer a fresh object replaced the old one at that address.",
      },
      {
        id: "temporary-dangling",
        title: "Temporary lifetime extension & the range-for cliff",
        clause: "[class.temporary] & [stmt.ranged]",
        summary:
          "Direct reference binding extends one temporary; chained member calls drop it at the semicolon.",
        prose: [
          "Writing const std::string& s = make_name(); extends the materialized temporary string to match s's scope. Write const char* p = make_name().c_str(); or auto& item : get_wrapper().items() in C++11–C++20, and the outer temporary wrapper is destroyed BEFORE the loop body even begins!",
          "C++23 paper P2718R0 finally fixed range-based for loops by extending the lifetime of ALL temporaries in the range-initializer expression until the loop finishes—matching what every developer already assumed.",
        ],
        codeExample: {
          caption: "Pre-C++23 range-for dangling temporary",
          code: `struct Wrapper { std::vector<int> items{1, 2, 3}; };
Wrapper make_wrapper();

// Pre-C++23: UB! Wrapper temporary dies before loop starts!
// C++23 (P2718R0): Well-defined! All temporaries in range-init extend across loop.
for (int v : make_wrapper().items) {
    use(v);
}`,
        },
        keyTakeaway:
          "Whenever a function returns a reference or view into a temporary receiver (std::string_view, std::span, or .items), check whether you are pre-C++23.",
      },
    ],
    standardEvolution: [
      {
        standard: "C++17",
        summary:
          "Introduced std::launder in <new> for placement-new over objects with const/reference members.",
      },
      {
        standard: "C++20",
        summary:
          "Introduced Implicit-Lifetime Types ([intro.object]) and std::bit_cast<To>(from) to eliminate strict-aliasing UB.",
      },
      {
        standard: "C++23",
        summary:
          "P2718R0 extended lifetime of all temporaries inside range-based for initializers; added std::start_lifetime_as.",
      },
    ],
    quizzes: [
      {
        id: "ol-q1",
        companionId: "object-lifetime",
        canonicalPath: "language/range-for",
        topicTitle: "Object Lifetime, Storage Duration & RAII",
        trapLevel: "cppcon-stage",
        standardClause: "[stmt.ranged] & P2718R0",
        prompt:
          "Under C++17/C++20 rules, what happens in for (int x : make_holder().vec) if make_holder() returns a Holder by value?",
        code: `struct Holder { std::vector<int> vec{1, 2, 3}; };
Holder make_holder();
for (int x : make_holder().vec) { /* ... */ }`,
        options: [
          "Safe in C++17 because the range-for __range reference extends Holder",
          "Undefined behavior in C++17/C++20 because __range binds to .vec, leaving the Holder temporary to die before the loop body",
          "Does not compile because vector cannot be copied",
          "Extends Holder only when using auto&& x",
        ],
        correctIndex: 1,
        explanation:
          "In C++11–C++20, the range-for desugaring binds auto&& __range = make_holder().vec;. Because __range binds to the member subobject rather than the whole Holder temporary, the Holder temporary is destroyed at the semicolon of the __range declaration! C++23 (P2718R0) patched this rule specifically for range-for.",
        cppconNote:
          "One of the most famous real-world C++ bugs—even standard committee members tripped on it.",
      },
      {
        id: "ol-q2",
        companionId: "object-lifetime",
        canonicalPath: "utility/launder",
        topicTitle: "Object Lifetime, Storage Duration & RAII",
        trapLevel: "standard-lawyer",
        standardClause: "[basic.life] & [ptr.launder]",
        prompt:
          "After destroying and placement-new constructing a struct containing a const int member in the same storage, how must you access the new object through the old pointer p?",
        code: `struct X { const int n; };
X* p = new X{1};
p->~X();
new (p) X{2};`,
        options: [
          "p->n directly is always valid once placement new completes",
          "std::launder(p)->n is required because X contains a const non-static data member",
          "reinterpret_cast<X*>(p)->n avoids the requirement",
          "Reusing storage containing a const member is impossible even with std::launder",
        ],
        correctIndex: 1,
        explanation:
          "[basic.life]/8 states an old pointer automatically refers to the new object ONLY if the type has no const or reference non-static data members (among other rules). Otherwise, you must obtain the new pointer via placement new's return value or std::launder(p).",
      },
      {
        id: "ol-q3",
        companionId: "object-lifetime",
        canonicalPath: "language/raii",
        topicTitle: "Object Lifetime, Storage Duration & RAII",
        trapLevel: "subtle",
        standardClause: "[stmt.jump] & [class.dtor]",
        prompt:
          "In a single block { Guard a; Guard b; }, in what order are destructors invoked upon normal exit or an exception thrown after b is constructed?",
        options: [
          "a then b (construction order)",
          "b then a (strict reverse order of construction)",
          "Unspecified by the standard",
          "Destructors are skipped if an exception unwinds",
        ],
        correctIndex: 1,
        explanation:
          "Automatic local objects and class member subobjects are ALWAYS destroyed in exact reverse order of construction completion (LIFO), enabling dependent RAII guards like b holding a handle into a.",
      },
      {
        id: "ol-q4",
        companionId: "object-lifetime",
        canonicalPath: "numeric/bit_cast",
        topicTitle: "Object Lifetime, Storage Duration & RAII",
        trapLevel: "standard-lawyer",
        standardClause: "[basic.lval] §7.2.1/11 & [bit.cast]",
        prompt:
          "Which method inspects the IEEE-754 bit pattern of a float as a uint32_t without violating C++ strict aliasing rules?",
        code: `float f = 3.14f;`,
        options: [
          "uint32_t bits = *reinterpret_cast<uint32_t*>(&f);",
          "union Pun { float f; uint32_t u; } p{f}; uint32_t bits = p.u;",
          "auto bits = std::bit_cast<uint32_t>(f);",
          "*(uint32_t*)(void*)&f",
        ],
        correctIndex: 2,
        explanation:
          "Reading a float through a uint32_t* via reinterpret_cast violates strict aliasing ([basic.lval]), and reading an inactive union member is UB in C++ (unlike C99). C++20 std::bit_cast<uint32_t>(f) (or std::memcpy pre-C++20) is completely well-defined and constexpr.",
      },
    ],
    podcastPrompts: [
      "Contrast raw storage duration with actual C++ object lifetime—and why malloc doesn't invoke constructors.",
      "Walk through why range-based for loops with temporary wrappers dangled for 12 years until C++23 P2718.",
      "Explain why strict aliasing breaks pointer-punning casts and how std::bit_cast solves it cleanly.",
    ],
  },
  {
    id: "move-and-forwarding",
    primaryPath: "utility/move",
    cppPaths: [
      "utility/move",
      "utility/forward",
      "utility/move_if_noexcept",
      "language/move_constructor",
      "language/reference",
      "container/vector",
    ],
    title: "Move Semantics, Forwarding References & Reference Collapsing",
    shortTitle: "Move & perfect forwarding",
    subtitle:
      "Master pointer-stealing ownership transfer, noexcept reallocation cliffs in std::vector, and T&& template deduction.",
    standardEra: "C++11 → C++20 → C++23",
    primaryClauses: [
      "[dcl.ref]",
      "[temp.deduct.call]",
      "[class.copy.ctor]",
      "[utility.syn]",
    ],
    mentalModelOneLiner:
      "T&& is a forwarding reference ONLY when T is a deduced template parameter of that exact function—not std::vector<T>&&.",
    cppconFraming: {
      talkAngle:
        "Show the exact 24-byte stack footprint of std::vector: copying duplicates the heap allocation, moving copies 3 pointers and nulls the source.",
      audienceTrap:
        "Forgetting noexcept on a custom move constructor, forcing std::vector::push_back to fall back to O(N) deep copies for exception safety.",
      stageTakeaway:
        "Universal reference collapsing has one simple rule: '&' is infectious (& + anything = &). Only && + && yields &&.",
    },
    memoryMapTitle: "Stack/Heap Move Layout & Reference Collapsing Lab",
    memoryMapDescription:
      "Compare std::vector copy vs. move pointer transfer, then test T&& deduction across lvalues, const lvalues, and rvalues.",
    memoryMapAudioSummary:
      "Moving an owning container like std::vector does not move heap elements; it copies the 24-byte stack control block (begin, end, capacity pointers) into the destination and resets the source pointers to null in O(1) time. However, to preserve the strong exception guarantee during std::vector reallocation, std::vector calls std::move_if_noexcept—meaning if your user-defined move constructor is missing noexcept, vector silently copies every element instead of moving! Meanwhile, forwarding references (T&& or auto&&) leverage reference collapsing ([dcl.ref]): when an lvalue Widget passes to template<class T> void f(T&&), T deduces to Widget&, and Widget& && collapses to Widget&, letting std::forward<T> preserve the caller's exact value category.",
    sections: [
      {
        id: "noexcept-cliff",
        title: "The noexcept move constructor cliff",
        clause: "[utility.move.if.noexcept] & [vector.capacity]",
        summary:
          "A single missing keyword silently turns O(1) vector moves back into O(N) deep copies.",
        prose: [
          "std::vector::push_back promises the strong exception guarantee: if reallocation fails halfway through migrating elements from the old buffer to the new buffer, the vector remains unchanged.",
          "If moving element #50 out of 100 throws an exception, the old buffer already has 49 moved-from husks that cannot be rolled back. Therefore std::vector uses std::move_if_noexcept—it moves ONLY when the move constructor is noexcept (or when no copy constructor exists).",
        ],
        codeExample: {
          caption: "noexcept unlocks fast vector growth",
          code: `struct Buffer {
    int* data = nullptr;
    Buffer(Buffer&& other) noexcept   // <-- omit noexcept and vector COPIES!
        : data(std::exchange(other.data, nullptr)) {}
    Buffer(const Buffer& other);
};`,
        },
        keyTakeaway:
          "Always mark user-defined move constructors and move assignment operators noexcept whenever they cannot throw.",
      },
      {
        id: "forwarding-vs-rvalue",
        title: "Forwarding reference vs. rvalue reference & collapsing",
        clause: "[temp.deduct.call] & [dcl.ref]",
        summary:
          "Why std::vector<T>&& rejects lvalues even inside a function template.",
        prose: [
          "The syntax T&& means 'rvalue reference' everywhere EXCEPT when T is a deduced type parameter of that function template (or auto&&). Any cv-qualifier (const T&&) or wrapper (std::vector<T>&&) disables the forwarding-reference rule and becomes a plain rvalue reference.",
          "When T&& IS a forwarding reference and receives an lvalue of type X, template deduction makes an intentional exception: T deduces to X&. Then reference collapsing fires: X& + && collapses to X&. Passing an rvalue deduces T = X, leaving X&&.",
        ],
        codeExample: {
          caption: "Reference collapsing matrix",
          code: `template <class T>
void relay(T&& arg) {
    sink(std::forward<T>(arg));
}

Widget w;
relay(w);            // T = Widget&,  arg = Widget&  (lvalue)
relay(Widget{});     // T = Widget,   arg = Widget&& (xvalue after forward)
relay(std::move(w)); // T = Widget,   arg = Widget&&`,
        },
        keyTakeaway:
          "Any single & in a reference collapse (& &, & &&, && &) yields &; only && + && stays &&.",
      },
    ],
    standardEvolution: [
      {
        standard: "C++11",
        summary:
          "Added rvalue references, reference collapsing, std::move, std::forward, and noexcept move detection.",
      },
      {
        standard: "C++23",
        summary:
          "Added Deducing This (explicit object parameters: void f(this Self&& self)) eliminating quadrupled &/const&/&&/const&& overloads, plus std::forward_like.",
      },
    ],
    quizzes: [
      {
        id: "mf-q1",
        companionId: "move-and-forwarding",
        canonicalPath: "utility/move_if_noexcept",
        topicTitle: "Move Semantics, Forwarding References & Reference Collapsing",
        trapLevel: "cppcon-stage",
        standardClause: "[vector.modifiers] & [utility.move.if.noexcept]",
        prompt:
          "Widget defines BOTH a copy constructor and a non-noexcept move constructor. What does std::vector<Widget>::push_back invoke on existing elements during buffer growth?",
        code: `struct Widget {
    Widget(const Widget&);
    Widget(Widget&&); // Note: NOT marked noexcept
};`,
        options: [
          "The move constructor, because std::vector always moves existing items",
          "The copy constructor, via std::move_if_noexcept, to preserve the strong exception guarantee",
          "Compile error: move constructors must be noexcept to live in std::vector",
          "memcpy bitwise relocation",
        ],
        correctIndex: 1,
        explanation:
          "Because Widget has a copy constructor and its move constructor might throw, std::move_if_noexcept yields const Widget& so std::vector copies elements safely into the new buffer before freeing the old buffer.",
      },
      {
        id: "mf-q2",
        companionId: "move-and-forwarding",
        canonicalPath: "utility/forward",
        topicTitle: "Move Semantics, Forwarding References & Reference Collapsing",
        trapLevel: "standard-lawyer",
        standardClause: "[temp.deduct.call] §13.10.3.2",
        prompt:
          "Which function parameter is actually a forwarding (universal) reference?",
        options: [
          "template<class T> void f(std::vector<T>&& v);",
          "template<class T> void f(const T&& v);",
          "template<class T> struct Box { void push(T&& v); };",
          "auto&& x = expr;",
        ],
        correctIndex: 3,
        explanation:
          "std::vector<T>&& and const T&& are plain rvalue references. Box<T>::push(T&&) is NOT deduced at the push() call site because T was already fixed by Box<T>! Only auto&& (or a template function's own deduced T&&) is a forwarding reference.",
        cppconNote:
          "Box<T>::push(T&&) is a notorious class-template surprise (think std::vector<T>::push_back(T&&)).",
      },
      {
        id: "mf-q3",
        companionId: "move-and-forwarding",
        canonicalPath: "language/reference",
        topicTitle: "Move Semantics, Forwarding References & Reference Collapsing",
        trapLevel: "subtle",
        standardClause: "[dcl.ref] §9.3.4.3",
        prompt:
          "Given using LRef = int&; and using RRef = int&&;, what type does LRef&& collapse to?",
        options: [
          "int&&",
          "int&",
          "int",
          "Ill-formed: references to references are always illegal",
        ],
        correctIndex: 1,
        explanation:
          "While writing int& && directly in source is illegal, forming a reference to a reference through type aliases, decltype, or template substitution collapses via [dcl.ref]: if either reference is an lvalue reference (&), the result is an lvalue reference (int&).",
      },
      {
        id: "mf-q4",
        companionId: "move-and-forwarding",
        canonicalPath: "language/move_constructor",
        topicTitle: "Move Semantics, Forwarding References & Reference Collapsing",
        trapLevel: "subtle",
        standardClause: "[lib.types.movedfrom]",
        prompt:
          "After std::string b = std::move(a);, what operations are guaranteed valid on the moved-from string a?",
        options: [
          "a is guaranteed to be empty (a.empty() == true)",
          "Only destruction and reassignment are valid; calling a.clear() is UB",
          "a is in a valid but unspecified state: all operations with no preconditions (like a.empty(), a.clear(), a = \"new\", ~string) are valid",
          "Using a in any way after std::move is Undefined Behavior",
        ],
        correctIndex: 2,
        explanation:
          "Standard library types leave moved-from objects in a valid but unspecified state ([lib.types.movedfrom]). While small-string optimization means a might NOT even be empty, you may safely inspect size(), call clear(), reassign, or destroy a.",
      },
    ],
    podcastPrompts: [
      "Break down what std::vector actually puts on the stack versus the heap, and why moving a million-element vector costs three pointer assignments.",
      "Tell the story of the missing noexcept move constructor and how std::move_if_noexcept quietly saves exception safety at the cost of speed.",
      "Clarify why Box<T>::push(T&&) is NOT a forwarding reference even though T&& looks identical.",
    ],
  },
  {
    id: "templates-and-concepts",
    primaryPath: "language/constraints",
    cppPaths: [
      "language/constraints",
      "language/requires",
      "iterator",
      "concepts",
      "language/dependent_name",
    ],
    title: "C++20 Concepts, Subsumption & Overload Resolution",
    shortTitle: "Concepts & subsumption",
    subtitle:
      "Move beyond SFINAE enable_if hacks to algebraic atomic constraints, concept subsumption lattices, and readable diagnostics.",
    standardEra: "C++17 → C++20 → C++23",
    primaryClauses: [
      "[temp.constr]",
      "[temp.constr.order]",
      "[expr.prim.req]",
      "[temp.res]",
    ],
    mentalModelOneLiner:
      "Only named concepts participate in atomic constraint subsumption—writing identical raw requires expressions twice produces two distinct atoms and an ambiguous overload!",
    cppconFraming: {
      talkAngle:
        "Visualize overload selection as a DAG lattice: std::contiguous_iterator subsumes random_access_iterator, which subsumes bidirectional_iterator, letting std::ranges pick the fastest algorithm cleanly.",
      audienceTrap:
        "Writing requires requires(...) — the first keyword introduces a constraint clause, the second starts a boolean requires-expression.",
      stageTakeaway:
        "If two constrained overloads ever tie with 'ambiguous call', check whether you wrote an ad-hoc boolean expression instead of composing named concepts.",
    },
    memoryMapTitle: "C++20 Concept Subsumption Lattice & Overload Resolver",
    memoryMapDescription:
      "Pick a concrete iterator type to trace satisfied atomic constraints, pruned candidates, and the most-constrained winner under [temp.constr.order].",
    memoryMapAudioSummary:
      "C++20 concepts normalize constraints into conjunctions and disjunctions of atomic constraints. Subsumption ([temp.constr.order]) compares two constrained overloads: if constraint P logically implies constraint Q strictly because every atomic constraint in Q appears inside P from the exact same named concept definition, then P subsumes Q and wins overload resolution without ambiguity. Writing raw boolean requires clauses inline—like requires sizeof(T) > 4 && std::integral<T> vs requires std::integral<T>—works only for the shared named concept; repeating raw expressions creates separate atomic identities that never subsume each other. Meanwhile, requires-expressions check syntactic validity and return-type constraints at compile time without ever evaluating runtime operands.",
    sections: [
      {
        id: "atomic-subsumption",
        title: "Named concepts & atomic constraint identity",
        clause: "[temp.constr.atomic] & [temp.constr.order]",
        summary:
          "Why identical-looking requires clauses still trigger ambiguous overload errors.",
        prose: [
          "During overload resolution, the compiler converts constrained templates into Disjunctive/Conjunctive Normal Form of atomic constraints—each tied to its exact source-code token position and parameter mapping.",
          "If overload A writes template<class T> requires (std::integral<T> && sizeof(T) >= 4) and overload B writes template<class T> requires (std::integral<T> && sizeof(T) >= 4 && alignof(T) >= 4), the sizeof(T) >= 4 expression in A and B came from TWO separate source locations, so neither subsumes the other! Wrapping sizeof(T) >= 4 in a named concept Wide<T> shares one atomic identity.",
        ],
        codeExample: {
          caption: "Subsumption works ONLY through shared named concepts",
          code: `template <class T>
concept SignedInt = std::integral<T> && std::is_signed_v<T>;

void dispatch(std::integral auto x); // Q: atomic(std::integral)
void dispatch(SignedInt auto x);     // P: atomic(std::integral) && atomic(is_signed)

dispatch(42); // P subsumes Q -> unambiguously calls SignedInt overload!`,
        },
        keyTakeaway:
          "Always factor reusable predicates into named concept declarations if you want overloads to partially order by specificity.",
      },
      {
        id: "requires-requires",
        title: "The requires requires idiom decoded",
        clause: "[temp.constr.decl] & [expr.prim.req]",
        summary:
          "Two identical keywords side-by-side perform two completely different jobs in the grammar.",
        prose: [
          "The first requires introduces a requires-clause (expecting a constant boolean expression). The second requires opens a requires-expression—an unevaluated compile-time check returning true if every nested expression compiles.",
          "For real libraries, prefer defining a named concept above the function rather than embedding anonymous requires requires directly on every signature.",
        ],
        codeExample: {
          caption: "Clean named concept vs. inline requires-requires",
          code: `template <class R>
concept Reservable = requires(R& r, std::size_t n) {
    r.reserve(n);       // simple requirement: must compile (not evaluated)
    { r.capacity() } -> std::convertible_to<std::size_t>; // compound requirement
};`,
        },
        keyTakeaway:
          "Inside a requires-expression, expressions are unevaluated operands—side effects never run, and compound requirements validate return type concepts.",
      },
    ],
    standardEvolution: [
      {
        standard: "C++17",
        summary:
          "Added if constexpr to discard untaken compile-time branches, reducing SFINAE tag-dispatch boilerplate.",
      },
      {
        standard: "C++20",
        summary:
          "Added concepts, requires-clauses, requires-expressions, abbreviated function templates (auto parameters), and standard <concepts> / <iterator> hierarchies.",
      },
    ],
    quizzes: [
      {
        id: "tc-q1",
        companionId: "templates-and-concepts",
        canonicalPath: "language/constraints",
        topicTitle: "C++20 Concepts, Subsumption & Overload Resolution",
        trapLevel: "cppcon-stage",
        standardClause: "[temp.constr.atomic] §13.5.1.2",
        prompt:
          "Why does calling f(42) fail with an ambiguity error in the snippet below?",
        code: `template <class T> requires (sizeof(T) >= 2)
void f(T) {}

template <class T> requires (sizeof(T) >= 2 && std::integral<T>)
void f(T) {}

// f(42); -> Ambiguous! Why?`,
        options: [
          "sizeof(T) >= 2 is not a constant expression",
          "The two sizeof(T) >= 2 expressions are distinct atomic constraints, so the second overload does not subsume the first",
          "std::integral<T> cannot combine with sizeof",
          "Subsumption only works for class templates, not function templates",
        ],
        correctIndex: 1,
        explanation:
          "Subsumption is syntactic/structural, NOT mathematical theorem proving. Because sizeof(T) >= 2 was written twice inline instead of factored into a single named concept, the compiler treats them as two unrelated atomic constraints.",
        cppconNote:
          "Best single-slide demonstration of what 'atomic constraint normalization' actually means in C++20.",
      },
      {
        id: "tc-q2",
        companionId: "templates-and-concepts",
        canonicalPath: "language/requires",
        topicTitle: "C++20 Concepts, Subsumption & Overload Resolution",
        trapLevel: "subtle",
        standardClause: "[expr.prim.req] §7.5.7",
        prompt:
          "Inside concept HasFoo = requires(T t) { t.foo(); };, what happens if t.foo() throws or mutates global state?",
        options: [
          "It runs at startup during static initialization",
          "Nothing—a requires-expression is an unevaluated operand evaluated purely at compile time for validity",
          "Only constexpr functions are permitted inside requires",
          "It compiles only if T is default-constructible",
        ],
        correctIndex: 1,
        explanation:
          "Operands of a requires-expression are unevaluated (just like sizeof or decltype). Function parameters like (T t) don't even require T to be constructible or movable—they are hypothetical declarations used solely for type checking.",
      },
      {
        id: "tc-q3",
        companionId: "templates-and-concepts",
        canonicalPath: "language/requires",
        topicTitle: "C++20 Concepts, Subsumption & Overload Resolution",
        trapLevel: "standard-lawyer",
        standardClause: "[expr.prim.req.nested] §7.5.7.4",
        prompt:
          "Inside requires(T x) { requires std::same_as<T, int>; }, what happens if you forget the inner 'requires' keyword and write just std::same_as<T, int>;?",
        code: `template <class T>
concept OnlyInt = requires(T x) {
    std::same_as<T, int>; // Missing nested 'requires'!
};`,
        options: [
          "Same meaning—the compiler checks if std::same_as<T, int> evaluates to true",
          "Only checks that the expression std::same_as<T, int> is well-formed (always true for bool!), accepting double and std::string too!",
          "Syntax error at compile time",
          "Converts x to int",
        ],
        correctIndex: 1,
        explanation:
          "Without the nested 'requires', a line in a requires-expression is a simple requirement: it checks ONLY whether the expression compiles, NOT whether its boolean value is true! Since std::same_as<double, int> validly yields false (type bool), OnlyInt<double> evaluates to true!",
        cppconNote:
          "One of the deadliest C++20 concept bugs in production code—always use nested `requires` for boolean value checks.",
      },
      {
        id: "tc-q4",
        companionId: "templates-and-concepts",
        canonicalPath: "language/dependent_name",
        topicTitle: "C++20 Concepts, Subsumption & Overload Resolution",
        trapLevel: "standard-lawyer",
        standardClause: "[temp.res] §13.8",
        prompt:
          "When calling a dependent member function template on a type parameter T inside a generic function, why is `.template` needed in t.template get<0>()?",
        code: `template <class T>
auto read(T& t) {
    return t.template get<0>();
}`,
        options: [
          "To tell the linker to emit weak symbols",
          "So phase-1 parsing treats '<' as a template argument list instead of a less-than comparison operator",
          "Only required in C++11, removed in C++20",
          "To force explicit specialization",
        ],
        correctIndex: 1,
        explanation:
          "During phase-1 template parsing, the compiler does not yet know what T is, so it assumes t.get is a non-template member and parses '<' as less-than (`(t.get < 0) > ()`). Adding `.template` disambiguates the grammar.",
      },
    ],
    podcastPrompts: [
      "Explain why C++20 concepts are not dynamic interfaces or Rust traits, and how atomic constraint subsumption differs from boolean logic.",
      "Share the infamous missing-nested-requires bug where OnlyInt<double> quietly evaluates to true.",
      "Trace how std::ranges::advance uses iterator concept subsumption to pick O(1) pointer arithmetic over O(N) increments.",
    ],
  },
];

export const ALL_QUIZZES: QuizQuestion[] = COMPANION_OVERLAYS.flatMap(
  (companion) => companion.quizzes
);

const COMPANION_BY_PATH = new Map<string, CompanionOverlay>();
for (const companion of COMPANION_OVERLAYS) {
  for (const p of companion.cppPaths) {
    COMPANION_BY_PATH.set(p, companion);
  }
}

export function getCompanionForPath(
  cleanPath: string
): CompanionOverlay | undefined {
  return COMPANION_BY_PATH.get(cleanPath);
}

export function getCompanionById(id: string): CompanionOverlay | undefined {
  return COMPANION_OVERLAYS.find((c) => c.id === id);
}
