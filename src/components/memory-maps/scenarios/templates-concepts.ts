import type { RadScenario } from "@/components/rad-debugger/types";

export const TEMPLATES_CONCEPTS_SCENARIOS: RadScenario[] = [
  {
    id: "concept-subsumption",
    label: "1. Concept Subsumption",
    subtitle: "Partial ordering of normalized atomic constraints for iterators",
    filename: "concept_subsumption.cpp",
    standard: "C++23",
    target: "Compiler Front-End",
    topicSlugs: ["concepts-and-constraints", "sfinae-and-concepts"],
    defaultBreakpoints: [8, 9, 10],
    quickWatches: [
      { expr: "winning_overload", note: "Most-constrained viable overload" },
      { expr: "subsumed", note: "Less-constrained concepts eliminated" },
    ],
    source: [
      "template <std::input_iterator It>         void fast_advance(It& it, ptrdiff_t n); // #1",
      "template <std::forward_iterator It>       void fast_advance(It& it, ptrdiff_t n); // #2",
      "template <std::bidirectional_iterator It> void fast_advance(It& it, ptrdiff_t n); // #3",
      "template <std::random_access_iterator It> void fast_advance(It& it, ptrdiff_t n); // #4",
      "template <std::contiguous_iterator It>    void fast_advance(It& it, ptrdiff_t n); // #5",
      "void dispatch() {",
      "  std::vector<int>::iterator v;   fast_advance(v, 4);",
      "  std::deque<int>::iterator d;    fast_advance(d, 4);",
      "  std::list<int>::iterator l;     fast_advance(l, -2);",
      "  std::istream_iterator<int> s;   fast_advance(s, 3);",
      "}",
    ],
    steps: [
      {
        id: "sub-vector",
        label: "vector<int>::iterator satisfies rank #5 (contiguous_iterator)",
        line: 7,
        verdict: { tone: "safe", label: "WINNER #5 · contiguous_iterator (O(1) ptr + n)" },
        clause: "[temp.constr.order] §13.5.4",
        summary:
          "std::vector<int>::iterator models all 5 concepts. Constraint normalization expands each concept into atomic constraints; contiguous_iterator subsumes all lower tiers, picking overload #5 unambiguously.",
        inlineHints: {
          7: { text: "maxRank=5 -> #5 contiguous_iterator wins", tone: "safe" },
        },
        registersTitle: "Constraint Lattice",
        registers: [
          { name: "maxRank", value: "5 (contiguous)", changed: true, tone: "safe" },
          { name: "viable set", value: "{#1, #2, #3, #4, #5}" },
          { name: "subsumes", value: "#5 ⊃ #4 ⊃ #3 ⊃ #2 ⊃ #1", tone: "info" },
          { name: "runtime cost", value: "O(1) pointer += n", tone: "safe" },
        ],
        watches: [
          {
            id: "w-it",
            expr: "It (deduced)",
            value: "std::vector<int>::iterator",
            type: "contiguous_iterator",
            changed: true,
            tone: "safe",
            badge: "RANK 5",
            children: [
              { id: "c1", expr: "input_iterator", value: "true (subsumed)", type: "atomic set", tone: "neutral" },
              { id: "c2", expr: "forward_iterator", value: "true (subsumed)", type: "atomic set", tone: "neutral" },
              { id: "c3", expr: "bidirectional_iterator", value: "true (subsumed)", type: "atomic set", tone: "neutral" },
              { id: "c4", expr: "random_access_iterator", value: "true (subsumed)", type: "atomic set", tone: "neutral" },
              { id: "c5", expr: "contiguous_iterator", value: "true (WINNER #5)", type: "std::to_address(it)", tone: "safe", changed: true },
            ],
          },
        ],
        memory: [
          {
            id: "ast-constraints",
            name: "Normalized Atomic Constraint Table",
            segment: "STATIC",
            baseAddress: "0x0000c0de00",
            status: "alive",
            statusLabel: "SUBSUMPTION RESOLVED",
            cells: [
              { offset: "R1", size: 8, label: "input_iterator", value: "satisfied (subsumed by R5)", hex: "01", state: "moved", address: "0x0000c0de01" },
              { offset: "R4", size: 8, label: "random_access", value: "satisfied (subsumed by R5)", hex: "04", state: "moved", address: "0x0000c0de04" },
              { offset: "R5", size: 8, label: "contiguous", value: "satisfied -> WINNER (#5)", hex: "05", state: "alive", address: "0x0000c0de05", changed: true },
            ],
          },
        ],
        callStack: [
          {
            id: "f-disp",
            fn: "fast_advance<vector<int>::iterator>",
            args: "n=4",
            file: "concept_subsumption.cpp",
            line: 5,
            addr: "0x0000c0de05",
            isCurrent: true,
            note: "Dispatched via contiguous_iterator (#5)",
          },
        ],
        disasmTitle: "Instantiated Lowering",
        disasm: [
          { addr: "0x401500", op: "add", operands: "rax, 0x10", comment: "O(1) raw pointer advance by 4 * sizeof(int)", active: true },
        ],
      },
      {
        id: "sub-deque",
        label: "deque<int>::iterator stops at rank #4 (not contiguous)",
        line: 8,
        verdict: { tone: "info", label: "WINNER #4 · random_access_iterator" },
        clause: "[iterator.concept.contiguous]",
        summary:
          "std::deque stores fixed-size segmented blocks, so it fails contiguous_iterator (#5). Subsumption selects #4 (random_access_iterator) for O(1) chunked jump.",
        inlineHints: {
          8: { text: "maxRank=4 -> #4 random_access wins", tone: "info" },
        },
        registersTitle: "Constraint Lattice",
        registers: [
          { name: "maxRank", value: "4 (random_access)", changed: true, tone: "info" },
          { name: "contiguous_iterator", value: "false (segmented blocks)", changed: true, tone: "danger" },
          { name: "runtime cost", value: "O(1) block-offset jump" },
        ],
        watches: [
          {
            id: "w-it",
            expr: "It (deduced)",
            value: "std::deque<int>::iterator",
            type: "random_access_iterator",
            changed: true,
            tone: "info",
            badge: "RANK 4",
            children: [
              { id: "c4", expr: "random_access_iterator", value: "true (WINNER #4)", type: "it + n", tone: "safe", changed: true },
              { id: "c5", expr: "contiguous_iterator", value: "false (eliminated)", type: "segmented", tone: "danger" },
            ],
          },
        ],
        memory: [
          {
            id: "ast-constraints",
            name: "Normalized Atomic Constraint Table",
            segment: "STATIC",
            baseAddress: "0x0000c0de00",
            status: "alive",
            statusLabel: "RANK #4 SELECTED",
            cells: [
              { offset: "R4", size: 8, label: "random_access", value: "satisfied -> WINNER (#4)", hex: "04", state: "alive", address: "0x0000c0de04", changed: true },
              { offset: "R5", size: 8, label: "contiguous", value: "FAILED: blocks non-contiguous", hex: "00", state: "dangling", address: "0x0000c0de05", changed: true },
            ],
          },
        ],
        callStack: [
          {
            id: "f-disp",
            fn: "fast_advance<deque<int>::iterator>",
            args: "n=4",
            file: "concept_subsumption.cpp",
            line: 4,
            addr: "0x0000c0de04",
            isCurrent: true,
          },
        ],
      },
      {
        id: "sub-list",
        label: "list<int>::iterator selects rank #3 (bidirectional_iterator)",
        line: 9,
        verdict: { tone: "info", label: "WINNER #3 · bidirectional_iterator (O(|n|))" },
        clause: "[iterator.concept.bidir]",
        summary:
          "Doubly linked list nodes support --it (bidirectional) but not it + n in O(1), so #4 and #5 are pruned cleanly during constraint checking and #3 wins.",
        inlineHints: {
          9: { text: "maxRank=3 -> #3 bidirectional wins", tone: "info" },
        },
        registersTitle: "Constraint Lattice",
        registers: [
          { name: "maxRank", value: "3 (bidirectional)", changed: true, tone: "info" },
          { name: "random_access", value: "false (no it + n)", tone: "danger" },
          { name: "runtime cost", value: "O(|n|) node hops" },
        ],
        watches: [
          {
            id: "w-it",
            expr: "It (deduced)",
            value: "std::list<int>::iterator",
            type: "bidirectional_iterator",
            changed: true,
            tone: "info",
            badge: "RANK 3",
          },
        ],
        memory: [
          {
            id: "ast-constraints",
            name: "Normalized Atomic Constraint Table",
            segment: "STATIC",
            baseAddress: "0x0000c0de00",
            status: "alive",
            statusLabel: "RANK #3 SELECTED",
            cells: [
              { offset: "R3", size: 8, label: "bidirectional", value: "satisfied -> WINNER (#3)", hex: "03", state: "alive", address: "0x0000c0de03", changed: true },
              { offset: "R4", size: 8, label: "random_access", value: "FAILED: no operator+", hex: "00", state: "dangling", address: "0x0000c0de04" },
            ],
          },
        ],
        callStack: [
          {
            id: "f-disp",
            fn: "fast_advance<list<int>::iterator>",
            args: "n=-2",
            file: "concept_subsumption.cpp",
            line: 3,
            addr: "0x0000c0de03",
            isCurrent: true,
          },
        ],
      },
      {
        id: "sub-istream",
        label: "istream_iterator<int> stops at rank #1 (input_iterator)",
        line: 10,
        verdict: { tone: "warn", label: "WINNER #1 · input_iterator (single pass)" },
        clause: "[iterator.concept.input]",
        summary:
          "Input stream iterators are single-pass only (no multi-pass guarantee), failing forward_iterator (#2) and above. Only #1 remains viable.",
        inlineHints: {
          10: { text: "maxRank=1 -> #1 input_iterator wins", tone: "warn" },
        },
        registersTitle: "Constraint Lattice",
        registers: [
          { name: "maxRank", value: "1 (input)", changed: true, tone: "warn" },
          { name: "forward_iterator", value: "false (single pass)", tone: "danger" },
          { name: "runtime cost", value: "O(n) forward only" },
        ],
        watches: [
          {
            id: "w-it",
            expr: "It (deduced)",
            value: "std::istream_iterator<int>",
            type: "input_iterator",
            changed: true,
            tone: "warn",
            badge: "RANK 1",
          },
        ],
        memory: [
          {
            id: "ast-constraints",
            name: "Normalized Atomic Constraint Table",
            segment: "STATIC",
            baseAddress: "0x0000c0de00",
            status: "alive",
            statusLabel: "RANK #1 SELECTED",
            cells: [
              { offset: "R1", size: 8, label: "input_iterator", value: "satisfied -> WINNER (#1)", hex: "01", state: "alive", address: "0x0000c0de01", changed: true },
              { offset: "R2", size: 8, label: "forward_iterator", value: "FAILED: no multi-pass", hex: "00", state: "dangling", address: "0x0000c0de02" },
            ],
          },
        ],
        callStack: [
          {
            id: "f-disp",
            fn: "fast_advance<istream_iterator<int>>",
            args: "n=3",
            file: "concept_subsumption.cpp",
            line: 1,
            addr: "0x0000c0de01",
            isCurrent: true,
          },
        ],
      },
    ],
  },
  {
    id: "sfinae-substitution",
    label: "2. SFINAE Immediate Context",
    subtitle: "Substitution failure in signature (SFINAE) vs body hard error",
    filename: "sfinae_immediate.cpp",
    standard: "C++23",
    target: "Template Instantiation",
    topicSlugs: ["sfinae"],
    defaultBreakpoints: [6, 8],
    quickWatches: [
      { expr: "Candidate #1", note: "Expression SFINAE overload" },
      { expr: "Candidate #2", note: "Fallback overload" },
    ],
    source: [
      "template <typename T>",
      "auto dump(const T& x) -> decltype(x.serialize(), void()) { x.serialize(); } // #1",
      "void dump(...) { /* fallback */ }                                          // #2",
      "struct Packet { void serialize() const; };",
      "void test_sfinae() {",
      "  Packet p{}; dump(p); // #1 succeeds",
      "  int n = 7;  dump(n); // #1 fails in immediate context -> pruned!",
      "  // Non-immediate error inside {} body is NEVER SFINAE!",
      "}",
    ],
    steps: [
      {
        id: "sfinae-ok",
        label: "dump(p): Packet::serialize() valid -> #1 selected over #2",
        line: 6,
        verdict: { tone: "safe", label: "SUBSTITUTED · #1 dump(const Packet&)" },
        clause: "[temp.deduct] §13.10.3",
        summary:
          "Substituting T = Packet into decltype(x.serialize(), void()) is well-formed. Overload resolution prefers #1 (exact template match) over ellipsis #2.",
        inlineHints: {
          6: { text: "#1 viable & beats ellipsis #2", tone: "safe" },
        },
        watches: [
          {
            id: "sf-c1",
            expr: "Candidate #1 (Packet)",
            value: "Viable -> WINNER",
            type: "void dump(const Packet&)",
            changed: true,
            tone: "safe",
            badge: "WINNER",
          },
          {
            id: "sf-c2",
            expr: "Candidate #2 (...)",
            value: "Viable (worst conversion rank)",
            type: "void dump(...)",
            tone: "neutral",
          },
        ],
        memory: [
          {
            id: "sf-table",
            name: "Template Candidate Set",
            segment: "STATIC",
            baseAddress: "0x0000c0de10",
            status: "alive",
            cells: [
              { offset: "01", size: 8, label: "#1 decltype(x.serialize())", value: "well-formed -> SELECTED", hex: "01", state: "alive", address: "0x0000c0de11", changed: true },
              { offset: "02", size: 8, label: "#2 ellipsis (...)", value: "eliminated (worse rank)", hex: "02", state: "moved", address: "0x0000c0de12" },
            ],
          },
        ],
        callStack: [
          {
            id: "f-sf",
            fn: "dump<Packet>",
            file: "sfinae_immediate.cpp",
            line: 2,
            addr: "0x0000c0de11",
            isCurrent: true,
          },
        ],
      },
      {
        id: "sfinae-prune",
        label: "dump(n): int has no .serialize() -> #1 silently pruned (SFINAE)",
        line: 7,
        verdict: { tone: "info", label: "SFINAE PRUNED · Fallback #2 dump(...) wins" },
        clause: "[temp.deduct]/8",
        summary:
          "Substituting T = int fails inside the signature's immediate context (decltype(x.serialize())). Rather than emitting a compile error, the compiler discards #1 from the overload set and calls #2.",
        inlineHints: {
          7: { text: "#1 pruned (no error) -> #2 dump(...)", tone: "info" },
        },
        watches: [
          {
            id: "sf-c1",
            expr: "Candidate #1 (int)",
            value: "Pruned in immediate context (not an error)",
            type: "SFINAE",
            changed: true,
            tone: "warn",
            badge: "SFINAE",
          },
          {
            id: "sf-c2",
            expr: "Candidate #2 (...)",
            value: "Selected fallback",
            type: "void dump(...)",
            changed: true,
            tone: "safe",
            badge: "WINNER",
          },
        ],
        memory: [
          {
            id: "sf-table",
            name: "Template Candidate Set",
            segment: "STATIC",
            baseAddress: "0x0000c0de10",
            status: "alive",
            cells: [
              { offset: "01", size: 8, label: "#1 decltype(x.serialize())", value: "SFINAE removed: int has no member serialize", hex: "00", state: "dangling", address: "0x0000c0de11", changed: true },
              { offset: "02", size: 8, label: "#2 ellipsis (...)", value: "only viable candidate -> WINNER", hex: "02", state: "alive", address: "0x0000c0de12", changed: true },
            ],
          },
        ],
        callStack: [
          {
            id: "f-sf",
            fn: "dump(...)",
            file: "sfinae_immediate.cpp",
            line: 3,
            addr: "0x0000c0de12",
            isCurrent: true,
          },
        ],
      },
    ],
  },
  {
    id: "requires-diagnostics",
    label: "3. Requires Diagnostics",
    subtitle: "C++20 immediate constraint failure vs 4-frame STL instantiation error",
    filename: "requires_diag.cpp",
    standard: "C++23",
    target: "Compiler Front-End",
    defaultBreakpoints: [5],
    source: [
      "template <typename T>",
      "concept Addable = requires(T a, T b) { a + b; };",
      "template <Addable T> T sum_constrained(T a, T b) { return a + b; }",
      "struct Tag {};",
      "void compile_check() {",
      "  // sum_constrained(Tag{}, Tag{}); // fails immediately at line 2!",
      "}",
    ],
    steps: [
      {
        id: "req-fail",
        label: "Constraint unsatisfied: stops at atomic requires(a + b)",
        line: 5,
        verdict: { tone: "danger", label: "CONSTRAINTS NOT SATISFIED · 1-line diagnostic" },
        clause: "[temp.constr.atomic] §13.5.1.2",
        summary:
          "Before instantiating sum_constrained's body, the compiler tests Addable<Tag>. The expression a + b is ill-formed, so compilation stops cleanly at the constraint definition instead of unwinding deep template internals.",
        inlineHints: {
          2: { text: "Constraint failed here: Tag + Tag ill-formed", tone: "danger" },
        },
        watches: [
          {
            id: "rq-1",
            expr: "Addable<Tag>",
            value: "false (expression a + b invalid)",
            type: "concept",
            changed: true,
            tone: "danger",
            badge: "UNSATISFIED",
          },
        ],
        memory: [
          {
            id: "rq-tab",
            name: "Diagnostic Depth Comparison",
            segment: "STATIC",
            baseAddress: "0x0000c0de20",
            status: "dangling",
            cells: [
              { offset: "C++20", size: 8, label: "requires clause", value: "1 frame (stops before instantiation)", hex: "01", state: "alive", address: "0x0000c0de20" },
              { offset: "Legacy", size: 8, label: "unconstrained template", value: "5+ frames inside body", hex: "05", state: "ub", address: "0x0000c0de28" },
            ],
          },
        ],
        callStack: [
          {
            id: "f-chk",
            fn: "sum_constrained<Tag> [constraint check]",
            file: "requires_diag.cpp",
            line: 2,
            addr: "0x0000c0de20",
            isCurrent: true,
            note: "Stopped before instantiating function body",
          },
        ],
      },
    ],
  },
];
