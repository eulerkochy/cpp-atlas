"use client";

import { useState } from "react";
import { CppCodeBlock } from "@/components/CppCodeBlock";
import { Button } from "@/components/ui/button";
import { Window } from "@/components/Window";
import { cn } from "@/lib/utils";

type PhaseId = 1 | 2 | 3;
type SwapCallMode = "two-step" | "qualified";
type ConversionTier =
  | "Exact Match"
  | "Qualification"
  | "Promotion"
  | "Standard"
  | "User-defined"
  | "Ambiguous"
  | "None";

interface CandidateRow {
  id: string;
  signature: string;
  origin: string;
  phase1Tag: string;
  phase1Included: boolean;
  viable: boolean;
  conversionTier: ConversionTier;
  conversionDetail: string;
  phase3Role: "winner" | "ambiguous" | "trap-winner" | "eliminated" | "bypassed";
  phase3Tag: string;
}

interface LookupScenario {
  id: string;
  label: string;
  title: string;
  clause: string;
  caption: string;
  callSite: string;
  argSummary: string;
  ordinaryLookup: string;
  adlScope: string;
  adlActive: boolean;
  code: string;
  verdictTone: "right" | "wrong";
  phaseSummary: Record<PhaseId, { heading: string; detail: string }>;
  activeLadderTiers: ConversionTier[];
  candidates: CandidateRow[];
}

const CONVERSION_LADDER: {
  tier: Exclude<ConversionTier, "None">;
  note: string;
}[] = [
  { tier: "Exact Match", note: "Identity, lvalue-to-rvalue, array-to-pointer" },
  { tier: "Qualification", note: "T* to const T*, T& to const T& (sub-rank)" },
  { tier: "Promotion", note: "char/short/bool to int, float to double" },
  { tier: "Standard", note: "int to long, int to double, Derived* to Base*" },
  { tier: "User-defined", note: "Converting constructor or operator T()" },
  { tier: "Ambiguous", note: "Tie across best conversion sequences" },
];

const PHASES: { id: PhaseId; short: string; label: string }[] = [
  { id: 1, short: "Phase 1", label: "Unqualified + ADL Lookup" },
  { id: 2, short: "Phase 2", label: "Viable Candidates & Conversion Ranks" },
  { id: 3, short: "Phase 3", label: "Best Viable / Ambiguity Verdict" },
];

function buildSwapScenario(mode: SwapCallMode): LookupScenario {
  const isTwoStep = mode === "two-step";
  return {
    id: "swap-adl",
    label: "2. Two-step swap",
    title: "Two-Step std::swap Customization vs. Qualified Trap",
    clause: isTwoStep ? "[basic.lookup.argdep]" : "[basic.lookup.qual]",
    caption: isTwoStep ? "swap_two_step.cpp" : "swap_qualified_trap.cpp",
    callSite: isTwoStep ? "using std::swap; swap(a, b);" : "std::swap(a, b);",
    argSummary: "a: buf::Slab& (lvalue), b: buf::Slab& (lvalue)",
    ordinaryLookup: isTwoStep
      ? "Unqualified lookup finds std::swap<T> brought into scope by using std::swap;"
      : "Qualified lookup searches strictly inside namespace std",
    adlScope: isTwoStep
      ? "ADL active: inspects buf::Slab -> adds associated namespace buf and class buf::Slab"
      : "ADL disabled: qualified name std::swap suppresses Argument-Dependent Lookup",
    adlActive: isTwoStep,
    code: isTwoStep
      ? `#include <cstddef>
#include <utility>

namespace buf {
struct Slab {
    int* ptr;
    std::size_t bytes;

    friend void swap(Slab& a, Slab& b) noexcept {
        std::swap(a.ptr, b.ptr);
        std::swap(a.bytes, b.bytes);
    }
};
} // namespace buf

template <class T>
void exchange_items(T& a, T& b) {
    using std::swap; // Fallback for built-ins and std types
    swap(a, b);      // Unqualified call enables ADL into buf
}`
      : `#include <cstddef>
#include <utility>

namespace buf {
struct Slab {
    int* ptr;
    std::size_t bytes;

    friend void swap(Slab& a, Slab& b) noexcept {
        std::swap(a.ptr, b.ptr);
        std::swap(a.bytes, b.bytes);
    }
};
} // namespace buf

template <class T>
void exchange_items(T& a, T& b) {
    std::swap(a, b); // Qualified call disables ADL; misses buf::swap!
}`,
    verdictTone: isTwoStep ? "right" : "wrong",
    phaseSummary: {
      1: {
        heading: isTwoStep
          ? "Unqualified lookup + ADL gather both candidates"
          : "Qualified lookup locks out namespace buf",
        detail: isTwoStep
          ? "using std::swap introduces std::swap<T> via ordinary lookup, while unqualified swap(a, b) triggers ADL on buf::Slab and uncovers the hidden friend in namespace buf."
          : "Writing std::swap(a, b) makes the callee a qualified-id. Under [basic.lookup.qual], ADL never inspects buf::Slab, so buf::swap never enters the candidate set.",
      },
      2: {
        heading: isTwoStep
          ? "Both candidates tie at Exact Match"
          : "Only std::swap<buf::Slab> reaches viability",
        detail: isTwoStep
          ? "buf::swap(Slab&, Slab&) and std::swap<buf::Slab>(Slab&, Slab&) both bind lvalue Slab& directly with Identity Exact Match on both arguments."
          : "std::swap<buf::Slab> binds both lvalues with Exact Match. Custom buf::swap cannot compete because Phase 1 never discovered it.",
      },
      3: {
        heading: isTwoStep
          ? "Winner: buf::swap(Slab&, Slab&) via non-template tie-breaker"
          : "Trap: std::swap<buf::Slab> wins by default",
        detail: isTwoStep
          ? "Conversion ranks tie, so [over.match.best]/2 prefers the non-template hidden friend buf::swap over the template specialization std::swap<buf::Slab>."
          : "std::swap performs three generic move/copy assignments instead of O(1) pointer exchange (and fails outright for non-movable types).",
      },
    },
    activeLadderTiers: ["Exact Match"],
    candidates: [
      {
        id: "buf-swap",
        signature: "friend void swap(Slab& a, Slab& b) noexcept",
        origin: "buf::Slab (hidden friend in namespace buf)",
        phase1Tag: isTwoStep ? "Found via ADL" : "Missed (ADL disabled)",
        phase1Included: isTwoStep,
        viable: isTwoStep,
        conversionTier: isTwoStep ? "Exact Match" : "None",
        conversionDetail: isTwoStep
          ? "Arg 1: Slab& -> Slab& (Identity), Arg 2: Slab& -> Slab& (Identity)"
          : "Never evaluated because qualified lookup skipped namespace buf",
        phase3Role: isTwoStep ? "winner" : "bypassed",
        phase3Tag: isTwoStep ? "Winner (non-template)" : "Not discovered",
      },
      {
        id: "std-swap",
        signature: "template<class T> void std::swap(T& a, T& b)",
        origin: "namespace std (deduced T = buf::Slab)",
        phase1Tag: isTwoStep
          ? "Found via using-decl"
          : "Found via qualified std::",
        phase1Included: true,
        viable: true,
        conversionTier: "Exact Match",
        conversionDetail:
          "Arg 1: Slab& -> Slab& (Identity), Arg 2: Slab& -> Slab& (Identity)",
        phase3Role: isTwoStep ? "eliminated" : "trap-winner",
        phase3Tag: isTwoStep
          ? "Runner-up (template loses tie)"
          : "Trap Winner (ADL bypassed)",
      },
    ],
  };
}

const STATIC_SCENARIOS: Record<
  "hidden-friend" | "forwarding-ref" | "init-list" | "ambiguous",
  LookupScenario
> = {
  "hidden-friend": {
    id: "hidden-friend",
    label: "1. Hidden friend",
    title: "Hidden Friend operator== Discovered Solely via ADL",
    clause: "[basic.lookup.argdep]",
    caption: "hidden_friend_adl.cpp",
    callSite: "lhs == rhs",
    argSummary: "lhs: const net::Guid& (lvalue), rhs: const net::Guid& (lvalue)",
    ordinaryLookup:
      "Member lookup in net::Guid finds nothing; ordinary unqualified lookup sees only global operator==(const Token&, const Token&)",
    adlScope:
      "ADL active: inspects associated class net::Guid and associated namespace net -> reveals inline hidden friend",
    adlActive: true,
    code: `#include <cstdint>

struct Token { int tag; };
inline bool operator==(const Token&, const Token&) { return true; }

namespace net {
struct Guid {
    std::uint64_t hi, lo;

    // Hidden friend: invisible to net::operator== or ordinary lookup.
    friend bool operator==(const Guid& a, const Guid& b) {
        return a.hi == b.hi && a.lo == b.lo;
    }
};
} // namespace net

bool same_guid(const net::Guid& lhs, const net::Guid& rhs) {
    return lhs == rhs; // Found exclusively via ADL in namespace net
}`,
    verdictTone: "right",
    phaseSummary: {
      1: {
        heading: "ADL unlocks the hidden friend inside net::Guid",
        detail:
          "Ordinary lookup sees only global operator==(Token, Token) and cannot see inline friends inside net::Guid. ADL examines both net::Guid operands, enters associated namespace net and class net::Guid, and exposes the hidden friend.",
      },
      2: {
        heading: "Global Token overload eliminated; Guid friend is Exact Match",
        detail:
          "net::Guid has no implicit conversion to const Token&, dropping ::operator==(Token, Token). The hidden friend binds both const net::Guid& arguments directly (Identity Exact Match).",
      },
      3: {
        heading: "Winner: hidden friend operator==(const Guid&, const Guid&)",
        detail:
          "Hidden friends stay invisible to unrelated calls and qualified net::operator== lookups, shrinking overload sets while guaranteeing clean ADL matching.",
      },
    },
    activeLadderTiers: ["Exact Match"],
    candidates: [
      {
        id: "guid-friend",
        signature: "friend bool operator==(const Guid& a, const Guid& b)",
        origin: "net::Guid (hidden friend, ADL-only)",
        phase1Tag: "Found via ADL",
        phase1Included: true,
        viable: true,
        conversionTier: "Exact Match",
        conversionDetail:
          "Arg 1 & 2: const net::Guid& -> const net::Guid& (Identity)",
        phase3Role: "winner",
        phase3Tag: "Winner (ADL-only)",
      },
      {
        id: "guid-rewritten",
        signature: "bool operator==(const Guid& b, const Guid& a) [C++20 reversed]",
        origin: "Synthesized reversed candidate [over.match.oper]",
        phase1Tag: "Synthesized via ADL",
        phase1Included: true,
        viable: true,
        conversionTier: "Exact Match",
        conversionDetail:
          "Arg 1 & 2: Exact Match (loses C++20 rewrite tie-breaker to direct op)",
        phase3Role: "eliminated",
        phase3Tag: "Eliminated (rewritten tie)",
      },
      {
        id: "token-eq",
        signature: "bool operator==(const Token&, const Token&)",
        origin: "Global scope (ordinary lookup)",
        phase1Tag: "Found (Unqualified)",
        phase1Included: true,
        viable: false,
        conversionTier: "None",
        conversionDetail: "Eliminated: no conversion from net::Guid to const Token&",
        phase3Role: "eliminated",
        phase3Tag: "Eliminated in Phase 2",
      },
    ],
  },
  "forwarding-ref": {
    id: "forwarding-ref",
    label: "3. Forwarding ref",
    title: "Forwarding Reference T&& Beating const Widget& on Mutable Lvalue",
    clause: "[over.ics.rank]",
    caption: "forwarding_ref_rank.cpp",
    callSite: "f(w);",
    argSummary: "w: Widget (non-const lvalue)",
    ordinaryLookup:
      "Unqualified lookup collects f(const Widget&) and template<class T> f(T&&) from enclosing scope",
    adlScope:
      "Associated class Widget / enclosing scope already searched; template argument deduction synthesizes f<Widget&>(Widget&)",
    adlActive: true,
    code: `struct Widget {
    int id = 7;
};

int f(const Widget&) { return 1; } // #1: non-template

template <class T>
int f(T&&) { return 2; }           // #2: forwarding reference

int dispatch() {
    Widget w;
    return f(w); // Deduces T = Widget& -> #2 beats #1!
}`,
    verdictTone: "right",
    phaseSummary: {
      1: {
        heading: "Template deduction produces f<Widget&>(Widget&)",
        detail:
          "Because w is an lvalue of type Widget, forwarding reference rule [temp.deduct.call]/3 deduces T = Widget&. Reference collapsing (Widget& && -> Widget&) forms specialization f<Widget&>(Widget&).",
      },
      2: {
        heading: "Non-const Widget& outranks const Widget& inside Exact Match",
        detail:
          "Both overloads achieve Exact Match, yet [over.ics.rank]/3.2.6 ranks direct binding to non-const Widget& strictly better than binding to more cv-qualified const Widget&.",
      },
      3: {
        heading: "Winner: template<class T> f(T&&) defeats non-template f(const Widget&)",
        detail:
          "Conversion rank ALWAYS runs before the non-template tie-breaker in [over.match.best]/2. Because f<Widget&>(Widget&) wins on qualification rank, the non-template tie-breaker is never consulted.",
      },
    },
    activeLadderTiers: ["Exact Match", "Qualification"],
    candidates: [
      {
        id: "fwd-template",
        signature: "int f<Widget&>(Widget&&&)  ->  int f<Widget&>(Widget&)",
        origin: "Function template specialization (T = Widget&)",
        phase1Tag: "Found + Deduced",
        phase1Included: true,
        viable: true,
        conversionTier: "Exact Match",
        conversionDetail:
          "Direct lvalue ref binding: Widget -> Widget& (zero cv added)",
        phase3Role: "winner",
        phase3Tag: "Winner (less cv-qualified)",
      },
      {
        id: "const-ref-nontemplate",
        signature: "int f(const Widget&)",
        origin: "Non-template overload",
        phase1Tag: "Found (Unqualified)",
        phase1Included: true,
        viable: true,
        conversionTier: "Qualification",
        conversionDetail:
          "Exact Match sub-rank: adds const qualification (Widget -> const Widget&)",
        phase3Role: "eliminated",
        phase3Tag: "Runner-up (worse cv-rank)",
      },
    ],
  },
  "init-list": {
    id: "init-list",
    label: "4. initializer_list",
    title: "Braced Initialization Hijacked by std::initializer_list Constructor",
    clause: "[over.match.list]",
    caption: "init_list_hijack.cpp",
    callSite: "Widget{10, 20}",
    argSummary: "braced-init-list {10, 20} (element types: int, int)",
    ordinaryLookup:
      "Constructor lookup on class Widget invokes two-pass list-initialization rules ([over.match.list])",
    adlScope:
      "Constructor call inspects Widget member constructors only (Pass 1 checks initializer_list ctors first)",
    adlActive: false,
    code: `#include <initializer_list>

struct Widget {
    Widget(int count, int value) {}         // #1: two-int ctor
    Widget(std::initializer_list<int>) {}   // #2: init-list ctor
};

Widget make_widget() {
    // Pass 1 of [over.match.list] matches #2 and never tries #1.
    // Use Widget(10, 20) with parentheses to call #1.
    return Widget{10, 20};
}`,
    verdictTone: "right",
    phaseSummary: {
      1: {
        heading: "Pass 1 selects only std::initializer_list constructors",
        detail:
          "Under [over.match.list]/1, braced initialization of a class with any initializer_list constructor restricts Pass 1 exclusively to initializer_list constructors. Widget(int, int) is held back for Pass 2.",
      },
      2: {
        heading: "Pass 1 finds Widget(std::initializer_list<int>) viable",
        detail:
          "Each braced element (10, 20) converts from int to int via Identity Exact Match. Because Pass 1 succeeds with a viable candidate, Pass 2 never executes.",
      },
      3: {
        heading: "Winner: Widget(std::initializer_list<int>) hijacks the call",
        detail:
          "Widget{10, 20} invokes the initializer_list constructor every time—just like std::vector<int>{10, 20} yields 2 elements instead of 10 copies of 20.",
      },
    },
    activeLadderTiers: ["Exact Match"],
    candidates: [
      {
        id: "ctor-init-list",
        signature: "Widget(std::initializer_list<int>)",
        origin: "Widget constructor (Pass 1 of [over.match.list])",
        phase1Tag: "Found (Pass 1 init-list)",
        phase1Included: true,
        viable: true,
        conversionTier: "Exact Match",
        conversionDetail:
          "List elements: 10 (int -> int Exact), 20 (int -> int Exact)",
        phase3Role: "winner",
        phase3Tag: "Winner (Pass 1 hijack)",
      },
      {
        id: "ctor-two-ints",
        signature: "Widget(int count, int value)",
        origin: "Widget constructor (Pass 2 fallback only)",
        phase1Tag: "Deferred to Pass 2",
        phase1Included: false,
        viable: false,
        conversionTier: "None",
        conversionDetail:
          "Never ranked because Pass 1 already produced a viable initializer_list match",
        phase3Role: "bypassed",
        phase3Tag: "Bypassed (use parentheses)",
      },
    ],
  },
  ambiguous: {
    id: "ambiguous",
    label: "5. Ambiguous call",
    title: "Ambiguous Standard Conversions: g(long) vs. g(double)",
    clause: "[over.best.ics]",
    caption: "ambiguous_standard_conv.cpp",
    callSite: "g(42);",
    argSummary: "42: int (prvalue)",
    ordinaryLookup:
      "Unqualified lookup finds both void g(long) and void g(double) at enclosing scope",
    adlScope:
      "ADL yields zero extra namespaces: fundamental type int has no associated namespaces or classes",
    adlActive: false,
    code: `void g(long n);   // #1: integral conversion (int -> long)
void g(double x); // #2: floating-integral conversion (int -> double)

void dispatch() {
    g(42); // ERROR: call of overloaded 'g(int)' is ambiguous
}`,
    verdictTone: "wrong",
    phaseSummary: {
      1: {
        heading: "Both overloads enter from ordinary lookup; ADL is empty",
        detail:
          "Argument 42 has fundamental type int, which contributes zero associated namespaces. Unqualified lookup collects g(long) and g(double).",
      },
      2: {
        heading: "Both candidates rank equally at Standard Conversion",
        detail:
          "Neither conversion is an Integral or Floating Promotion ([conv.prom] promotes smaller types to int, or float to double). Both int -> long and int -> double sit in the Standard Conversion tier.",
      },
      3: {
        heading: "Ill-formed: Ambiguous call between g(long) and g(double)",
        detail:
          "Under [over.best.ics] and [over.ics.rank], all Standard Conversions in the Conversion sub-rank tie. Neither candidate is better, so compilation halts with an ambiguity error.",
      },
    },
    activeLadderTiers: ["Standard", "Ambiguous"],
    candidates: [
      {
        id: "g-long",
        signature: "void g(long n)",
        origin: "Enclosing scope",
        phase1Tag: "Found (Unqualified)",
        phase1Included: true,
        viable: true,
        conversionTier: "Standard",
        conversionDetail:
          "int -> long via Integral Conversion [conv.integral] (NOT a promotion)",
        phase3Role: "ambiguous",
        phase3Tag: "Ambiguous tie",
      },
      {
        id: "g-double",
        signature: "void g(double x)",
        origin: "Enclosing scope",
        phase1Tag: "Found (Unqualified)",
        phase1Included: true,
        viable: true,
        conversionTier: "Standard",
        conversionDetail:
          "int -> double via Floating-Integral Conversion [conv.fpint] (NOT a promotion)",
        phase3Role: "ambiguous",
        phase3Tag: "Ambiguous tie",
      },
    ],
  },
};

type ScenarioId =
  | "hidden-friend"
  | "swap-adl"
  | "forwarding-ref"
  | "init-list"
  | "ambiguous";

const SCENARIO_ORDER: { id: ScenarioId; label: string }[] = [
  { id: "hidden-friend", label: "1. Hidden friend" },
  { id: "swap-adl", label: "2. Two-step swap" },
  { id: "forwarding-ref", label: "3. Forwarding ref" },
  { id: "init-list", label: "4. initializer_list" },
  { id: "ambiguous", label: "5. Ambiguous call" },
];

export function OverloadLookupMap() {
  const [scenarioId, setScenarioId] = useState<ScenarioId>("hidden-friend");
  const [phase, setPhase] = useState<PhaseId>(1);
  const [swapMode, setSwapMode] = useState<SwapCallMode>("two-step");

  const scenario =
    scenarioId === "swap-adl"
      ? buildSwapScenario(swapMode)
      : STATIC_SCENARIOS[scenarioId];

  const activePhaseSummary = scenario.phaseSummary[phase];

  function selectScenario(nextId: ScenarioId) {
    setScenarioId(nextId);
    setPhase(1);
  }

  return (
    <Window
      as="section"
      aria-label="Overload resolution and ADL simulator"
      title="overload-adl.sim"
      actions={
        <span className="font-mono text-xs text-ink-soft">
          {scenario.clause}
        </span>
      }
      bodyClassName="p-5 sm:p-7"
    >
      <div className="mb-5">
        <h3 className="font-display text-2xl font-[450] tracking-[-0.02em] text-ink">
          Overload Resolution &amp; ADL Pipeline
        </h3>
        <p className="mt-1 text-sm text-ink-soft">
          Choose a C++ resolution trap and step through name lookup, viability
          filtering, and conversion ranking.
        </p>
      </div>

      <div
        role="group"
        aria-label="Overload resolution scenarios"
        className="mb-5 flex flex-wrap gap-2"
      >
        {SCENARIO_ORDER.map((item) => {
          const isSelected = scenarioId === item.id;
          return (
            <Button
              key={item.id}
              type="button"
              size="xs"
              variant={isSelected ? "default" : "outline"}
              aria-pressed={isSelected}
              onClick={() => selectScenario(item.id)}
              className={cn(
                "font-mono text-xs cursor-pointer",
                isSelected && "bg-sun text-ink border-ink/30 hover:bg-sun/90"
              )}
            >
              {item.label}
            </Button>
          );
        })}
      </div>

      <div className="mb-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-paper px-4 py-2.5">
          <div className="min-w-0">
            <div className="text-xs font-medium text-ink">{scenario.title}</div>
            <div className="mt-0.5 font-mono text-[11px] text-ink-soft">
              Call: <span className="text-ink">{scenario.callSite}</span>
            </div>
          </div>

          {scenarioId === "swap-adl" ? (
            <div
              role="group"
              aria-label="Swap call qualification toggle"
              className="flex flex-wrap gap-1.5"
            >
              <Button
                type="button"
                size="xs"
                variant={swapMode === "two-step" ? "default" : "outline"}
                aria-pressed={swapMode === "two-step"}
                onClick={() => setSwapMode("two-step")}
                className={cn(
                  "font-mono text-xs cursor-pointer",
                  swapMode === "two-step" &&
                    "bg-sun text-ink border-ink/30 hover:bg-sun/90"
                )}
              >
                using std::swap; swap(a, b)
              </Button>
              <Button
                type="button"
                size="xs"
                variant={swapMode === "qualified" ? "default" : "outline"}
                aria-pressed={swapMode === "qualified"}
                onClick={() => setSwapMode("qualified")}
                className={cn(
                  "font-mono text-xs cursor-pointer",
                  swapMode === "qualified" &&
                    "bg-sun text-ink border-ink/30 hover:bg-sun/90"
                )}
              >
                std::swap(a, b) trap
              </Button>
            </div>
          ) : null}
        </div>

        <CppCodeBlock caption={scenario.caption} code={scenario.code} />
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-paper p-2">
        <div
          role="group"
          aria-label="Overload resolution phases"
          className="flex flex-wrap gap-1.5"
        >
          {PHASES.map((p) => {
            const isCurrent = phase === p.id;
            return (
              <Button
                key={p.id}
                type="button"
                size="xs"
                variant={isCurrent ? "default" : "outline"}
                aria-pressed={isCurrent}
                aria-current={isCurrent ? "step" : undefined}
                onClick={() => setPhase(p.id)}
                className={cn(
                  "text-xs cursor-pointer",
                  isCurrent && "bg-sun text-ink border-ink/30 hover:bg-sun/90"
                )}
              >
                <span className="font-mono font-semibold">{p.short}:</span>{" "}
                <span>{p.label}</span>
              </Button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={phase === 1}
            onClick={() => setPhase((prev) => (prev > 1 ? ((prev - 1) as PhaseId) : 1))}
            className="text-xs cursor-pointer"
          >
            Prev
          </Button>
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={phase === 3}
            onClick={() => setPhase((prev) => (prev < 3 ? ((prev + 1) as PhaseId) : 3))}
            className="text-xs cursor-pointer"
          >
            Next
          </Button>
        </div>
      </div>

      <div className="mb-5 grid gap-3 md:grid-cols-2">
        <div
          className={cn(
            "min-w-0 rounded-2xl border p-4 transition-colors",
            phase === 1
              ? "border-ink/35 bg-sun-wash/55"
              : "border-line bg-paper"
          )}
        >
          <div className="text-xs font-medium text-ink">
            Ordinary Lookup &amp; Arguments
          </div>
          <p className="mt-1 font-mono text-[11px] leading-relaxed text-ink">
            {scenario.argSummary}
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">
            {scenario.ordinaryLookup}
          </p>
        </div>

        <div
          className={cn(
            "min-w-0 rounded-2xl border p-4 transition-colors",
            phase === 1 && scenario.adlActive && "border-ink/35 bg-sun-wash/55",
            phase === 1 && !scenario.adlActive && "border-line bg-paper-sunk",
            phase !== 1 && "border-line bg-paper"
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-ink">
              Associated Namespaces &amp; ADL Scope
            </span>
            <span
              className={cn(
                "rounded-[var(--radius-chip)] px-2 py-0.5 font-mono text-[11px] font-medium",
                scenario.adlActive
                  ? "bg-right-wash text-[color:var(--right)]"
                  : "bg-paper-sunk text-ink-soft"
              )}
            >
              {scenario.adlActive ? "ADL active" : "ADL inactive"}
            </span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-body">
            {scenario.adlScope}
          </p>
        </div>
      </div>

      {phase >= 2 ? (
        <div className="mb-5 rounded-2xl border border-line bg-paper p-3.5">
          <div className="mb-2 text-xs font-medium text-ink">
            Conversion Sequence Rank Ladder (Highest to Ambiguous Tie)
          </div>
          <div className="flex flex-wrap gap-1.5">
            {CONVERSION_LADDER.map((item) => {
              const isHighlighted = scenario.activeLadderTiers.includes(item.tier);
              const isAmbiguous = item.tier === "Ambiguous" && isHighlighted;
              return (
                <div
                  key={item.tier}
                  className={cn(
                    "rounded-xl border px-2.5 py-1.5 text-xs transition-colors",
                    isAmbiguous &&
                      "border-wrong/40 bg-wrong-wash text-wrong",
                    isHighlighted &&
                      !isAmbiguous &&
                      "border-ink/35 bg-sun-wash text-ink",
                    !isHighlighted &&
                      "border-line bg-paper-raised text-ink-soft"
                  )}
                >
                  <span className="font-mono font-semibold">{item.tier}</span>
                  <span className="ml-1.5 text-[11px] opacity-85">
                    ({item.note})
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="mb-5 space-y-2.5">
        <div className="text-xs font-medium text-ink-faint">
          Candidate Set ({scenario.candidates.length})
        </div>

        {scenario.candidates.map((cand) => {
          const isWinner = phase === 3 && cand.phase3Role === "winner";
          const isDanger =
            phase === 3 &&
            (cand.phase3Role === "ambiguous" ||
              cand.phase3Role === "trap-winner");
          const isDimmed =
            (phase === 1 && !cand.phase1Included) ||
            (phase >= 2 && !cand.viable);

          let statusLabel = cand.phase1Tag;
          if (phase === 2) {
            statusLabel = cand.viable
              ? `Viable (${cand.conversionTier})`
              : "Eliminated";
          } else if (phase === 3) {
            statusLabel = cand.phase3Tag;
          }

          return (
            <div
              key={cand.id}
              className={cn(
                "rounded-2xl border p-4 transition-colors",
                isWinner &&
                  "border-[color:var(--right)]/45 bg-right-wash/75",
                isDanger && "border-wrong/45 bg-wrong-wash/75",
                !isWinner &&
                  !isDanger &&
                  isDimmed &&
                  "border-line bg-paper-sunk text-ink-soft",
                !isWinner &&
                  !isDanger &&
                  !isDimmed &&
                  "border-line bg-paper-raised"
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-mono text-xs font-semibold text-ink break-words">
                    {cand.signature}
                  </div>
                  <div className="mt-0.5 text-xs text-ink-soft">
                    {cand.origin}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {phase >= 2 && cand.viable ? (
                    <span className="rounded-[var(--radius-chip)] border border-line bg-paper px-2 py-0.5 font-mono text-[11px] text-ink">
                      {cand.conversionTier}
                    </span>
                  ) : null}
                  <span
                    className={cn(
                      "rounded-[var(--radius-chip)] px-2 py-0.5 font-mono text-[11px] font-medium",
                      isWinner &&
                        "bg-paper-raised text-[color:var(--right)] border border-[color:var(--right)]/35",
                      isDanger &&
                        "bg-paper-raised text-wrong border border-wrong/35",
                      !isWinner &&
                        !isDanger &&
                        isDimmed &&
                        "bg-paper text-ink-soft border border-line",
                      !isWinner &&
                        !isDanger &&
                        !isDimmed &&
                        "bg-sun-wash text-ink border border-ink/20"
                    )}
                  >
                    {statusLabel}
                  </span>
                </div>
              </div>

              {phase >= 2 ? (
                <p className="mt-2 border-t border-line/80 pt-2 font-mono text-[11px] leading-relaxed text-ink-body">
                  {cand.conversionDetail}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      <div
        aria-live="polite"
        className={cn(
          "rounded-2xl border p-4 transition-colors",
          phase === 3 &&
            scenario.verdictTone === "right" &&
            "border-[color:var(--right)]/40 bg-right-wash/70",
          phase === 3 &&
            scenario.verdictTone === "wrong" &&
            "border-wrong/40 bg-wrong-wash/70",
          phase !== 3 && "border-ink/20 bg-sun-wash/55"
        )}
      >
        <div
          className={cn(
            "text-xs font-semibold",
            phase === 3 &&
              scenario.verdictTone === "right" &&
              "text-[color:var(--right)]",
            phase === 3 &&
              scenario.verdictTone === "wrong" &&
              "text-wrong",
            phase !== 3 && "text-ink"
          )}
        >
          {activePhaseSummary.heading}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-ink-body">
          {activePhaseSummary.detail}
        </p>
      </div>
    </Window>
  );
}
