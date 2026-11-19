import type { RadScenario } from "@/components/rad-debugger/types";

export type SwapCallMode = "two-step" | "qualified";

export function buildOverloadLookupScenarios(swapMode: SwapCallMode): RadScenario[] {
  const isTwoStep = swapMode === "two-step";

  return [
    {
      id: "conversion-ranks",
      label: "1. Conversion Ranks & Ambiguity",
      subtitle: "Exact Match -> Promotion -> Standard -> Ambiguous Tie",
      filename: "overload_ranks.cpp",
      standard: "C++23",
      target: "Compiler Front-End",
      topicSlugs: ["overload-resolution"],
      defaultBreakpoints: [7, 8, 9],
      quickWatches: [
        { expr: "conversion_rank", note: "Winning sequence rank" },
      ],
      source: [
        "void log_val(int);    void log_val(long);    // #1 vs #2",
        "void scale(int);      void scale(double);    // #1 vs #2",
        "void pick(long);      void pick(double);     // #1 vs #2",
        "void probe() {",
        "  int n = 7;  char ch = 'A';",
        "  log_val(n);   // Exact Match beats Standard (int -> long)",
        "  scale(ch);    // Integral Promotion (char->int) beats Standard (char->double)",
        "  // pick(n);   // AMBIGUOUS: int->long and int->double are both Standard!",
        "}",
      ],
      steps: [
        {
          id: "ov-exact",
          label: "log_val(n): Exact Match beats Standard Conversion",
          line: 6,
          verdict: { tone: "safe", label: "WINNER · log_val(int) [Exact Match]" },
          clause: "[over.ics.rank] §12.2.4.3",
          summary:
            "Both log_val(int) and log_val(long) are viable, but Exact Match (Identity) strictly outranks Standard Conversion (int -> long).",
          inlineHints: {
            6: { text: "Exact Match -> log_val(int) wins", tone: "safe" },
          },
          registersTitle: "Overload Ranking",
          registers: [
            { name: "Arg type", value: "int (lvalue -> prvalue)" },
            { name: "#1 log_val(int)", value: "Exact Match (WINNER)", changed: true, tone: "safe" },
            { name: "#2 log_val(long)", value: "Standard Conversion (loses)" },
          ],
          watches: [
            { id: "c1", expr: "log_val(int)", value: "Exact Match -> WINNER", type: "rank 1", tone: "safe", changed: true, badge: "WINNER" },
            { id: "c2", expr: "log_val(long)", value: "Standard (int -> long)", type: "rank 4", tone: "neutral" },
          ],
          memory: [
            {
              id: "ov-tbl",
              name: "Candidate Viability Table",
              segment: "STATIC",
              baseAddress: "0x0000c0de40",
              status: "alive",
              cells: [
                { offset: "#1", size: 8, label: "log_val(int)", value: "Exact Match (Identity) -> WINNER", hex: "01", state: "alive", address: "0x0000c0de41", changed: true },
                { offset: "#2", size: 8, label: "log_val(long)", value: "Standard Conversion (eliminated)", hex: "04", state: "moved", address: "0x0000c0de42" },
              ],
            },
          ],
          callStack: [
            { id: "f-ov", fn: "probe -> log_val(int)", file: "overload_ranks.cpp", line: 6, addr: "0x0000c0de41", isCurrent: true },
          ],
        },
        {
          id: "ov-promo",
          label: "scale('A'): Promotion (char->int) beats Standard (char->double)",
          line: 7,
          verdict: { tone: "safe", label: "WINNER · scale(int) [Integral Promotion]" },
          clause: "[conv.prom] §7.3.7",
          summary:
            "char -> int is an Integral Promotion (rank 3), which strictly beats Standard Conversion char -> double (rank 4).",
          inlineHints: {
            7: { text: "Promotion (char->int) beats Standard (char->double)", tone: "safe" },
          },
          registersTitle: "Overload Ranking",
          registers: [
            { name: "Arg type", value: "char ('A')" },
            { name: "#1 scale(int)", value: "Promotion -> WINNER", changed: true, tone: "safe" },
            { name: "#2 scale(double)", value: "Standard (loses)" },
          ],
          watches: [
            { id: "c1", expr: "scale(int)", value: "Promotion (char -> int) -> WINNER", type: "rank 3", tone: "safe", changed: true, badge: "WINNER" },
            { id: "c2", expr: "scale(double)", value: "Standard (char -> double)", type: "rank 4", tone: "neutral" },
          ],
          memory: [
            {
              id: "ov-tbl",
              name: "Candidate Viability Table",
              segment: "STATIC",
              baseAddress: "0x0000c0de40",
              status: "alive",
              cells: [
                { offset: "#1", size: 8, label: "scale(int)", value: "Integral Promotion -> WINNER", hex: "03", state: "alive", address: "0x0000c0de41", changed: true },
                { offset: "#2", size: 8, label: "scale(double)", value: "Standard Conversion (eliminated)", hex: "04", state: "moved", address: "0x0000c0de42" },
              ],
            },
          ],
          callStack: [
            { id: "f-ov", fn: "probe -> scale(int)", file: "overload_ranks.cpp", line: 7, addr: "0x0000c0de41", isCurrent: true },
          ],
        },
        {
          id: "ov-ambig",
          label: "pick(n): pick(long) and pick(double) tie at Standard rank -> Ambiguous!",
          line: 8,
          verdict: { tone: "danger", label: "AMBIGUOUS · int->long vs int->double tie" },
          clause: "[over.match.best] §12.2.4",
          summary:
            "Neither int -> long nor int -> double is considered better in C++'s standard conversion ranking; compilation stops with an ambiguous overload error.",
          inlineHints: {
            8: { text: "ERROR: call to 'pick' is ambiguous", tone: "danger" },
          },
          registersTitle: "Overload Ranking",
          registers: [
            { name: "#1 pick(long)", value: "Standard (int->long)", tone: "danger" },
            { name: "#2 pick(double)", value: "Standard (int->double)", tone: "danger" },
            { name: "Verdict", value: "TIE -> Compile Error", changed: true, tone: "danger" },
          ],
          watches: [
            { id: "c1", expr: "pick(long)", value: "Standard Conversion (TIED)", type: "rank 4", tone: "danger", badge: "TIE" },
            { id: "c2", expr: "pick(double)", value: "Standard Conversion (TIED)", type: "rank 4", tone: "danger", badge: "TIE" },
          ],
          memory: [
            {
              id: "ov-tbl",
              name: "Candidate Viability Table",
              segment: "STATIC",
              baseAddress: "0x0000c0de40",
              status: "dangling",
              cells: [
                { offset: "#1", size: 8, label: "pick(long)", value: "Standard rank (TIED)", hex: "04", state: "ub", address: "0x0000c0de41", changed: true },
                { offset: "#2", size: 8, label: "pick(double)", value: "Standard rank (TIED)", hex: "04", state: "ub", address: "0x0000c0de42", changed: true },
              ],
            },
          ],
          callStack: [
            { id: "f-ov", fn: "probe [overload error]", file: "overload_ranks.cpp", line: 8, addr: "0x0000c0de41", isCurrent: true },
          ],
        },
      ],
    },
    {
      id: "adl-two-step-swap",
      label: "2. Two-Step swap & ADL",
      subtitle: "Unqualified swap(a, b) with ADL vs qualified std::swap(a, b) trap",
      filename: "adl_swap.cpp",
      standard: "C++23",
      target: "Name Lookup + ADL",
      topicSlugs: ["name-lookup-and-adl"],
      defaultBreakpoints: [8],
      quickWatches: [
        { expr: "ADL scope", note: "Associated namespaces added" },
      ],
      source: [
        "namespace buf {",
        "  struct Slab { int* data; std::size_t n; };",
        "  void swap(Slab& a, Slab& b) noexcept { std::swap(a.data, b.data); }",
        "}",
        "void shuffle(buf::Slab& a, buf::Slab& b) {",
        isTwoStep
          ? "  using std::swap; swap(a, b); // Unqualified -> ADL inspects namespace buf!"
          : "  std::swap(a, b);             // Qualified -> SUPPRESSES ADL!",
        "}",
      ],
      steps: [
        {
          id: "adl-step1",
          label: isTwoStep
            ? "Unqualified lookup + ADL finds buf::swap(Slab&, Slab&)!"
            : "Qualified std::swap suppresses ADL -> calls generic 3-move std::swap!",
          line: 6,
          verdict: isTwoStep
            ? { tone: "safe", label: "ADL FOUND · buf::swap (O(1) pointer swap)" }
            : { tone: "danger", label: "ADL SUPPRESSED · Generic std::swap (3 moves)" },
          clause: isTwoStep ? "[basic.lookup.argdep] §6.5.4" : "[basic.lookup.qual] §6.5.5",
          summary: isTwoStep
            ? "Unqualified swap(a, b) combines ordinary lookup (std::swap<T>) with ADL's associated namespace buf, selecting the specialized non-template buf::swap over generic std::swap<T>."
            : "Qualifying with std:: disables Argument-Dependent Lookup entirely. Even though buf::swap is faster and customized, the compiler never looks in namespace buf!",
          inlineHints: {
            6: {
              text: isTwoStep
                ? "ADL adds namespace buf -> buf::swap wins!"
                : "Qualified std:: bypassed buf::swap!",
              tone: isTwoStep ? "safe" : "danger",
            },
          },
          registersTitle: "Lookup Scopes",
          registers: [
            { name: "Ordinary lookup", value: isTwoStep ? "std::swap<T> (via using)" : "Strictly ::std" },
            { name: "ADL active?", value: isTwoStep ? "YES (adds ns buf)" : "NO (qualified name)", changed: true, tone: isTwoStep ? "safe" : "danger" },
            { name: "Winner", value: isTwoStep ? "buf::swap(Slab&, Slab&)" : "std::swap<buf::Slab>", changed: true, tone: isTwoStep ? "safe" : "danger" },
          ],
          watches: [
            {
              id: "adl-buf",
              expr: "buf::swap(Slab&, Slab&)",
              value: isTwoStep ? "FOUND by ADL -> WINNER" : "NOT SEEN (ADL disabled)",
              type: "non-template",
              changed: true,
              tone: isTwoStep ? "safe" : "danger",
              badge: isTwoStep ? "WINNER" : "BYPASSED",
            },
            {
              id: "adl-std",
              expr: "std::swap<buf::Slab>",
              value: isTwoStep ? "Eliminated (template loses to non-template)" : "ONLY CANDIDATE (3 moves)",
              type: "template<T>",
              tone: isTwoStep ? "neutral" : "warn",
            },
          ],
          memory: [
            {
              id: "adl-set",
              name: "Candidate Set",
              segment: "STATIC",
              baseAddress: "0x0000c0de50",
              status: isTwoStep ? "alive" : "dangling",
              cells: [
                { offset: "ADL", size: 8, label: "buf::swap(Slab&, Slab&)", value: isTwoStep ? "Included & wins [over.match.best]" : "Never discovered (qualified call)", hex: isTwoStep ? "01" : "00", state: isTwoStep ? "alive" : "ub", address: "0x0000c0de51", changed: true },
                { offset: "STD", size: 8, label: "std::swap<buf::Slab>", value: isTwoStep ? "Viable fallback" : "Selected by default", hex: "02", state: isTwoStep ? "moved" : "alive", address: "0x0000c0de52" },
              ],
            },
          ],
          callStack: [
            { id: "f-adl", fn: isTwoStep ? "buf::swap" : "std::swap<buf::Slab>", file: "adl_swap.cpp", line: 6, addr: "0x0000c0de51", isCurrent: true },
          ],
        },
      ],
    },
    {
      id: "spaceship-rewrite",
      label: "3. C++20 operator<=> Rewriting",
      subtitle: "Synthesizing <, >, != and reversed candidates for 10 == item",
      filename: "spaceship_rewrite.cpp",
      standard: "C++23",
      target: "Overload Rewrite",
      topicSlugs: ["operator-overloading"],
      defaultBreakpoints: [5, 6],
      source: [
        "struct Item {",
        "  int id;",
        "  auto operator<=>(const Item&) const = default;",
        "  bool operator==(int rhs) const { return id == rhs; }",
        "};",
        "void compare(Item a, Item b) {",
        "  bool lt = a < b;      // rewritten to (a <=> b) < 0",
        "  bool eq = 10 == a;    // reversed to a.operator==(10)!",
        "}",
      ],
      steps: [
        {
          id: "op-rw",
          label: "C++20 synthesizes reversed & rewritten relational candidates",
          line: 8,
          verdict: { tone: "safe", label: "REWRITTEN · 10 == a -> a.operator==(10)" },
          clause: "[over.match.oper] §12.2.2.3",
          summary:
            "With C++20 operator rewriting, writing operator== once enables symmetric comparisons like 10 == a (reversed candidate), while defaulting operator<=> generates all 4 relational operators (<, <=, >, >=) + operator==.",
          inlineHints: {
            7: { text: "Rewritten: (a <=> b) < 0", tone: "safe" },
            8: { text: "Reversed: a.operator==(10)", tone: "safe" },
          },
          watches: [
            { id: "rw-1", expr: "a < b", value: "(a <=> b) < 0", type: "rewritten", tone: "safe", changed: true },
            { id: "rw-2", expr: "10 == a", value: "a.operator==(10)", type: "reversed", tone: "safe", changed: true },
          ],
          memory: [
            {
              id: "rw-tbl",
              name: "Synthesized Operator Candidates",
              segment: "STATIC",
              baseAddress: "0x0000c0de60",
              status: "alive",
              cells: [
                { offset: "01", size: 8, label: "a < b", value: "Item::operator<=>(const Item&) < 0", hex: "01", state: "alive", address: "0x0000c0de61" },
                { offset: "02", size: 8, label: "10 == a", value: "Item::operator==(int) [reversed]", hex: "02", state: "alive", address: "0x0000c0de62" },
              ],
            },
          ],
          callStack: [
            { id: "f-rw", fn: "compare", file: "spaceship_rewrite.cpp", line: 8, addr: "0x0000c0de62", isCurrent: true },
          ],
        },
      ],
    },
    {
      id: "two-phase-lookup",
      label: "4. Two-Phase Template Lookup",
      subtitle: "Non-dependent base hiding in Phase 1 vs this->count in Phase 2",
      filename: "two_phase.cpp",
      standard: "C++23",
      target: "Two-Phase Lookup",
      topicSlugs: ["dependent-names-and-two-phase-lookup"],
      defaultBreakpoints: [5],
      source: [
        "template <typename T> struct Base { int count = 10; };",
        "template <typename T> struct Derived : Base<T> {",
        "  int get() {",
        "    // return count;     // Phase 1 error: Base<T> is dependent!",
        "    return this->count;  // Deferred to Phase 2 instantiation!",
        "  }",
        "};",
      ],
      steps: [
        {
          id: "tp-defer",
          label: "this->count makes lookup dependent -> deferred to Phase 2",
          line: 5,
          verdict: { tone: "safe", label: "PHASE 2 RESOLVED · this->count found in Base<T>" },
          clause: "[temp.dep] §13.8.3",
          summary:
            "In Phase 1 (template definition), the compiler refuses to inspect dependent base class Base<T> (since an explicit specialization could exist later). Prefixing `this->` marks `count` as dependent, deferring lookup to Phase 2 instantiation.",
          inlineHints: {
            5: { text: "this-> marks count dependent -> Phase 2 finds Base<T>::count", tone: "safe" },
          },
          watches: [
            { id: "tp-1", expr: "unqualified count", value: "Phase 1 non-dependent (ignores Base<T>)", type: "lookup error", tone: "danger" },
            { id: "tp-2", expr: "this->count", value: "Phase 2 dependent -> Base<T>::count", type: "int", tone: "safe", changed: true },
          ],
          memory: [
            {
              id: "tp-tbl",
              name: "Two-Phase Lookup Schedule",
              segment: "STATIC",
              baseAddress: "0x0000c0de70",
              status: "alive",
              cells: [
                { offset: "P1", size: 8, label: "Phase 1 (definition)", value: "Resolves non-dependent names only", hex: "01", state: "moved", address: "0x0000c0de71" },
                { offset: "P2", size: 8, label: "Phase 2 (instantiation)", value: "Resolves this->count + dependent ADL", hex: "02", state: "alive", address: "0x0000c0de72", changed: true },
              ],
            },
          ],
          callStack: [
            { id: "f-tp", fn: "Derived<int>::get [Phase 2]", file: "two_phase.cpp", line: 5, addr: "0x0000c0de72", isCurrent: true },
          ],
        },
      ],
    },
  ];
}
