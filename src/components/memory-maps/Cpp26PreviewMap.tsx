"use client";

import { useState } from "react";
import { CppCodeBlock } from "@/components/CppCodeBlock";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Window } from "@/components/Window";
import { cn } from "@/lib/utils";

type PillarTab = "contracts" | "reflection" | "execution";

/* ------------------------------------------------------------------ */
/* Mode 1: Contracts ([basic.contract], P2900)                          */
/* ------------------------------------------------------------------ */

type ContractSemantic = "ignore" | "observe" | "enforce" | "quick_enforce";
type ContractInput = "valid" | "oob";

interface ContractTraceStep {
  id: string;
  label: string;
  status: "passed" | "violated-continue" | "violated-abort" | "skipped" | "ub-risk";
  badge: string;
  detail: string;
}

const CONTRACT_SEMANTICS: {
  id: ContractSemantic;
  label: string;
  summary: string;
}[] = [
  {
    id: "ignore",
    label: "ignore",
    summary: "Semantic compile-time check only; zero runtime evaluation.",
  },
  {
    id: "observe",
    label: "observe",
    summary: "Evaluates at runtime; invokes violation handler and continues.",
  },
  {
    id: "enforce",
    label: "enforce",
    summary: "Evaluates at runtime; invokes handler then terminates on failure.",
  },
  {
    id: "quick_enforce",
    label: "quick_enforce",
    summary: "Evaluates at runtime; aborts immediately without handler call.",
  },
];

const CONTRACTS_CODE = `#include <contracts>
#include <cstddef>

int read_slot(const int* data, const std::size_t sz, const std::size_t i)
    pre(i < sz)
    post(r: r >= 0)
{
    contract_assert(data != nullptr);
    return data[i]; // valid slots hold >= 0
}`;

function getContractsSimulation(
  semantic: ContractSemantic,
  input: ContractInput
): {
  tone: "right" | "warn" | "wrong";
  verdictLabel: string;
  handlerBehavior: string;
  executionBehavior: string;
  codegenBehavior: string;
  steps: ContractTraceStep[];
} {
  const isValid = input === "valid";

  if (isValid) {
    if (semantic === "ignore") {
      return {
        tone: "right",
        verdictLabel: "Returns 38 (runtime checks elided)",
        handlerBehavior: "Not invoked (no runtime predicate emitted)",
        executionBehavior: "Returns data[2] = 38 with zero runtime contract overhead.",
        codegenBehavior:
          "Compiler type-checks pre, contract_assert, and post (including constification) at compile time, then emits zero runtime branches.",
        steps: [
          {
            id: "compile",
            label: "Compile-time semantic check",
            status: "passed",
            badge: "Checked",
            detail: "Predicates i < sz, data != nullptr, and r >= 0 are type-checked under constification.",
          },
          {
            id: "pre",
            label: "pre(i < sz)  [2 < 4]",
            status: "skipped",
            badge: "Ignored at runtime",
            detail: "Predicate evaluation skipped under ignore semantic.",
          },
          {
            id: "assert",
            label: "contract_assert(data != nullptr)",
            status: "skipped",
            badge: "Ignored at runtime",
            detail: "Statement check skipped under ignore semantic.",
          },
          {
            id: "post",
            label: "post(r: r >= 0)  [r = 38]",
            status: "skipped",
            badge: "Ignored at runtime",
            detail: "Postcondition skipped; caller receives 38 directly.",
          },
        ],
      };
    }

    return {
      tone: "right",
      verdictLabel: "All contracts satisfied -> returns 38",
      handlerBehavior: "Not invoked (every predicate evaluated to true)",
      executionBehavior:
        "pre(2 < 4), contract_assert(data != nullptr), and post(38 >= 0) all pass; returns 38.",
      codegenBehavior:
        semantic === "quick_enforce"
          ? "Emits compact inline predicate checks jumping directly to trap instruction on failure (no handler frame)."
          : "Emits predicate branches calling handle_contract_violation only on false.",
      steps: [
        {
          id: "compile",
          label: "Compile-time semantic check",
          status: "passed",
          badge: "Checked",
          detail: "Predicates verified with constified parameters data, sz, i, and result r.",
        },
        {
          id: "pre",
          label: "pre(i < sz)  [2 < 4]",
          status: "passed",
          badge: "true",
          detail: "Precondition holds before entering function body.",
        },
        {
          id: "assert",
          label: "contract_assert(data != nullptr)",
          status: "passed",
          badge: "true",
          detail: "Pointer check holds inside function body.",
        },
        {
          id: "post",
          label: "post(r: r >= 0)  [r = 38]",
          status: "passed",
          badge: "true",
          detail: "Return value r = 38 satisfies postcondition; returns 38.",
        },
      ],
    };
  }

  // Out-of-bounds input: index = 7, sz = 4
  if (semantic === "ignore") {
    return {
      tone: "wrong",
      verdictLabel: "Silent out-of-bounds read (Undefined Behavior)",
      handlerBehavior: "Not invoked (runtime checks disabled)",
      executionBehavior:
        "Control enters body with i = 7 >= 4 and reads past buffer bounds (UB).",
      codegenBehavior:
        "Zero runtime check instructions generated. Unlike NDEBUG macros, syntax still compiled and type-checked.",
      steps: [
        {
          id: "compile",
          label: "Compile-time semantic check",
          status: "passed",
          badge: "Checked",
          detail: "Syntax remains valid and type-checked even under ignore.",
        },
        {
          id: "pre",
          label: "pre(i < sz)  [7 < 4]",
          status: "ub-risk",
          badge: "Skipped (false unseen)",
          detail: "Violation goes undetected at runtime; execution falls into body.",
        },
        {
          id: "assert",
          label: "contract_assert(data != nullptr)",
          status: "skipped",
          badge: "Ignored at runtime",
          detail: "Pointer non-null holds, then data[7] triggers out-of-bounds UB.",
        },
        {
          id: "post",
          label: "post(r: r >= 0)",
          status: "ub-risk",
          badge: "Ignored at runtime",
          detail: "Corrupt return value is never checked.",
        },
      ],
    };
  }

  if (semantic === "observe") {
    return {
      tone: "warn",
      verdictLabel: "Violation observed; handler runs and execution continues",
      handlerBehavior:
        "Invoked: handle_contract_violation(info) with semantic = observe",
      executionBehavior:
        "Logs pre(7 < 4) failure, returns from handler, executes body (OOB read UB), and checks post(r >= 0) before returning.",
      codegenBehavior:
        "Emits check + violation handler call without std::terminate; useful for staging contracts in production before flipping to enforce.",
      steps: [
        {
          id: "compile",
          label: "Compile-time semantic check",
          status: "passed",
          badge: "Checked",
          detail: "All three contract predicates compiled and constified.",
        },
        {
          id: "pre",
          label: "pre(i < sz)  [7 < 4]",
          status: "violated-continue",
          badge: "false -> observe",
          detail: "Calls handle_contract_violation(info), logs failure, and continues into body!",
        },
        {
          id: "assert",
          label: "contract_assert(data != nullptr)",
          status: "passed",
          badge: "true (reached)",
          detail: "Reached after handler return; pointer is non-null, then data[7] reads out of bounds.",
        },
        {
          id: "post",
          label: "post(r: r >= 0)",
          status: "violated-continue",
          badge: "Checked on exit",
          detail: "If corrupt OOB value is negative, handler fires a second time before returning.",
        },
      ],
    };
  }

  if (semantic === "enforce") {
    return {
      tone: "wrong",
      verdictLabel: "Handler invoked -> std::terminate() halts execution",
      handlerBehavior:
        "Invoked: handle_contract_violation(info) with semantic = enforce, then terminates",
      executionBehavior:
        "pre(7 < 4) fails immediately on entry; body, data[7], contract_assert, and post never execute.",
      codegenBehavior:
        "Emits check, builds contract_violation metadata, calls handler, and enforces termination even if handler returns.",
      steps: [
        {
          id: "compile",
          label: "Compile-time semantic check",
          status: "passed",
          badge: "Checked",
          detail: "All contract expressions verified at compile time.",
        },
        {
          id: "pre",
          label: "pre(i < sz)  [7 < 4]",
          status: "violated-abort",
          badge: "false -> handler + abort",
          detail: "Calls handle_contract_violation(info), then invokes std::terminate().",
        },
        {
          id: "assert",
          label: "contract_assert(data != nullptr)",
          status: "skipped",
          badge: "Unreachable",
          detail: "Never reached because precondition halted execution before body.",
        },
        {
          id: "post",
          label: "post(r: r >= 0)",
          status: "skipped",
          badge: "Unreachable",
          detail: "Never reached; no out-of-bounds memory read occurred.",
        },
      ],
    };
  }

  // quick_enforce
  return {
    tone: "wrong",
    verdictLabel: "Immediate trap / abort (violation handler skipped)",
    handlerBehavior:
      "Bypassed: handle_contract_violation is NOT called under quick_enforce",
    executionBehavior:
      "pre(7 < 4) evaluates false and immediately executes trap/abort; zero out-of-bounds read.",
    codegenBehavior:
      "Smallest runtime footprint: no contract_violation object constructed and no handler call emitted before hardware trap.",
    steps: [
      {
        id: "compile",
        label: "Compile-time semantic check",
        status: "passed",
        badge: "Checked",
        detail: "All contract expressions verified at compile time.",
      },
      {
        id: "pre",
        label: "pre(i < sz)  [7 < 4]",
        status: "violated-abort",
        badge: "false -> immediate trap",
        detail: "Traps / aborts immediately without calling handle_contract_violation.",
      },
      {
        id: "assert",
        label: "contract_assert(data != nullptr)",
        status: "skipped",
        badge: "Unreachable",
        detail: "Never executed; process already trapped on entry.",
      },
      {
        id: "post",
        label: "post(r: r >= 0)",
        status: "skipped",
        badge: "Unreachable",
        detail: "Never executed; safe fail-fast stop.",
      },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Mode 2: Static Reflection (<meta>, P2996 + P1306)                    */
/* ------------------------------------------------------------------ */

type ReflectionStructId = "Point" | "Config";
type ReflectionStage = 1 | 2 | 3 | 4;

interface ReflectedMember {
  name: string;
  type: string;
  offset: number;
  size: number;
  sampleValue: string;
  splicedLine: string;
}

interface ReflectedStructSpec {
  id: ReflectionStructId;
  sizeofBytes: number;
  alignofBytes: number;
  paddingNote: string;
  code: string;
  members: ReflectedMember[];
  jsonPreview: string;
}

const REFLECTION_STAGES: {
  id: ReflectionStage;
  title: string;
  expr: string;
  note: string;
}[] = [
  {
    id: 1,
    title: "1. Reflect Type",
    expr: "^^T",
    note: "Unary reflection operator ^^ produces a consteval-only std::meta::info value representing the struct type—zero RTTI tables emitted.",
  },
  {
    id: 2,
    title: "2. Query Members",
    expr: "nonstatic_data_members_of(^^T, ctx)",
    note: "Queries non-static data members visible under access_context ctx (defaulting to current lexical access control) as std::meta::info descriptors.",
  },
  {
    id: 3,
    title: "3. Expansion Loop",
    expr: "template for (constexpr auto m : ...)",
    note: "P1306 expansion statement unrolls the loop body once per element at compile time so each iteration sees a distinct constexpr m.",
  },
  {
    id: 4,
    title: "4. Splice & Emit",
    expr: "obj.[:m:]",
    note: "Splicer [:m:] turns the compile-time reflection value m back into a direct typed member access expression, generating zero-overhead code.",
  },
];

const REFLECTED_STRUCTS: Record<ReflectionStructId, ReflectedStructSpec> = {
  Point: {
    id: "Point",
    sizeofBytes: 24,
    alignofBytes: 8,
    paddingNote: "4 bytes trailing padding after id (offsets 20..23)",
    code: `#include <meta>
#include <print>

struct Point {
    double x;
    double y;
    int id;
};

template <typename T>
void serialize_json(const T& obj) {
    constexpr auto ctx = std::meta::access_context::current();
    template for (constexpr auto m : std::define_static_array(
        std::meta::nonstatic_data_members_of(^^T, ctx)))
    {
        std::println("\\"{}\\": {}", std::meta::identifier_of(m), obj.[:m:]);
    }
}

void dump_point(const Point& p) {
    serialize_json(p); // ^^Point -> 3 spliced member prints
}`,
    members: [
      {
        name: "x",
        type: "double",
        offset: 0,
        size: 8,
        sampleValue: "3.5",
        splicedLine: 'std::println("\\"{}\\": {}", "x", obj.x);',
      },
      {
        name: "y",
        type: "double",
        offset: 8,
        size: 8,
        sampleValue: "-1.25",
        splicedLine: 'std::println("\\"{}\\": {}", "y", obj.y);',
      },
      {
        name: "id",
        type: "int",
        offset: 16,
        size: 4,
        sampleValue: "42",
        splicedLine: 'std::println("\\"{}\\": {}", "id", obj.id);',
      },
    ],
    jsonPreview: '{"x": 3.5, "y": -1.25, "id": 42}',
  },
  Config: {
    id: "Config",
    sizeofBytes: 24,
    alignofBytes: 8,
    paddingNote: "3 bytes internal padding between tls (offset 0) and port (offset 4)",
    code: `#include <meta>
#include <print>
#include <string_view>

struct Config {
    bool tls;
    int port;
    std::string_view host;
};

template <typename T>
void serialize_json(const T& obj) {
    constexpr auto ctx = std::meta::access_context::current();
    template for (constexpr auto m : std::define_static_array(
        std::meta::nonstatic_data_members_of(^^T, ctx)))
    {
        std::println("\\"{}\\": {}", std::meta::identifier_of(m), obj.[:m:]);
    }
}

void dump_config(const Config& cfg) {
    serialize_json(cfg); // ^^Config -> 3 heterogeneous spliced prints
}`,
    members: [
      {
        name: "tls",
        type: "bool",
        offset: 0,
        size: 1,
        sampleValue: "true",
        splicedLine: 'std::println("\\"{}\\": {}", "tls", obj.tls);',
      },
      {
        name: "port",
        type: "int",
        offset: 4,
        size: 4,
        sampleValue: "8443",
        splicedLine: 'std::println("\\"{}\\": {}", "port", obj.port);',
      },
      {
        name: "host",
        type: "std::string_view",
        offset: 8,
        size: 16,
        sampleValue: '"cppatlas.dev"',
        splicedLine: 'std::println("\\"{}\\": {}", "host", obj.host);',
      },
    ],
    jsonPreview: '{"tls": true, "port": 8443, "host": "cppatlas.dev"}',
  },
};

/* ------------------------------------------------------------------ */
/* Mode 3: Senders & Receivers (std::execution, [exec], P2300)          */
/* ------------------------------------------------------------------ */

type ExecStep = 1 | 2 | 3 | 4;
type CompletionChannel = "set_value" | "set_error" | "set_stopped";

const EXEC_CODE = `#include <execution>
#include <thread>
#include <utility>

namespace ex = std::execution;

auto run_pipeline(ex::scheduler auto pool, RawFrame raw) {
    auto sndr =
        ex::schedule(pool)
        | ex::then([raw] { return parse(raw); })
        | ex::let_value([](ParsedMsg msg) { return validate(msg); });

    // sync_wait connects sndr + receiver into stack operation_state, then calls start(op)
    return std::this_thread::sync_wait(std::move(sndr));
}`;

const EXEC_STEPS: { id: ExecStep; label: string }[] = [
  { id: 1, label: "1. Build Lazy Sender" },
  { id: 2, label: "2. connect(sndr, rcvr)" },
  { id: 3, label: "3. start(op)" },
  { id: 4, label: "4. Completion Channel" },
];

const OUTCOME_OPTIONS: {
  id: CompletionChannel;
  label: string;
  signature: string;
  summary: string;
}[] = [
  {
    id: "set_value",
    label: "set_value",
    signature: "set_value(ValidToken)",
    summary:
      "Every stage succeeds: parse produces ParsedMsg, let_value launches inner validate sender, and sync_wait returns engaged optional<tuple<ValidToken>>.",
  },
  {
    id: "set_error",
    label: "set_error",
    signature: "set_error(std::exception_ptr)",
    summary:
      "parse fails and emits set_error. let_value(validate) is bypassed cleanly, forwarding the error straight to sync_wait which rethrows.",
  },
  {
    id: "set_stopped",
    label: "set_stopped",
    signature: "set_stopped()",
    summary:
      "Cooperative stop_token requests cancellation before parse finishes. let_value(validate) is skipped and sync_wait returns std::nullopt without throwing.",
  },
];

interface PipelineNodeView {
  id: string;
  title: string;
  role: string;
  status: string;
  tone: "idle" | "active" | "right" | "wrong" | "warn" | "bypassed";
}

function getExecutionNodes(
  step: ExecStep,
  outcome: CompletionChannel
): PipelineNodeView[] {
  if (step === 1) {
    return [
      {
        id: "schedule",
        title: "schedule(pool)",
        role: "Schedule sender",
        status: "Lazy description (0 work)",
        tone: "active",
      },
      {
        id: "then",
        title: "then(parse)",
        role: "Transform adaptor",
        status: "Lazy closure stored",
        tone: "active",
      },
      {
        id: "let_value",
        title: "let_value(validate)",
        role: "Dynamic chain adaptor",
        status: "Lazy closure stored",
        tone: "active",
      },
      {
        id: "sync_wait",
        title: "sync_wait",
        role: "Consumer / receiver",
        status: "Awaiting connection",
        tone: "idle",
      },
    ];
  }

  if (step === 2) {
    return [
      {
        id: "schedule",
        title: "schedule(pool)",
        role: "Child op_state #1",
        status: "Embedded on stack",
        tone: "active",
      },
      {
        id: "then",
        title: "then(parse)",
        role: "Child op_state #2",
        status: "Embedded on stack",
        tone: "active",
      },
      {
        id: "let_value",
        title: "let_value(validate)",
        role: "Inline variant slot",
        status: "Reserved for inner op",
        tone: "active",
      },
      {
        id: "sync_wait",
        title: "sync_wait receiver",
        role: "Root stack op_state",
        status: "0 heap bytes allocated",
        tone: "right",
      },
    ];
  }

  if (step === 3) {
    const parseStatus =
      outcome === "set_value"
        ? "parse(raw) -> ParsedMsg"
        : outcome === "set_error"
          ? "parse(raw) threw / failed"
          : "stop_token cancelled parse";
    const parseTone: PipelineNodeView["tone"] =
      outcome === "set_value"
        ? "right"
        : outcome === "set_error"
          ? "wrong"
          : "warn";

    return [
      {
        id: "schedule",
        title: "schedule(pool)",
        role: "pool.enqueue(&op)",
        status: "Dispatched -> set_value()",
        tone: "right",
      },
      {
        id: "then",
        title: "then(parse)",
        role: "Executing on pool thread",
        status: parseStatus,
        tone: parseTone,
      },
      {
        id: "let_value",
        title: "let_value(validate)",
        role: "Value-channel continuation",
        status:
          outcome === "set_value"
            ? "Runs validate(msg) inline"
            : "Bypassed (non-value signal)",
        tone: outcome === "set_value" ? "active" : "bypassed",
      },
      {
        id: "sync_wait",
        title: "sync_wait receiver",
        role: "Waiting on cv / atomic",
        status: "Blocked until completion",
        tone: "idle",
      },
    ];
  }

  // Step 4: Completion Channel
  return [
    {
      id: "schedule",
      title: "schedule(pool)",
      role: "Worker context",
      status: "Completed (set_value)",
      tone: "right",
    },
    {
      id: "then",
      title: "then(parse)",
      role: "Upstream producer",
      status:
        outcome === "set_value"
          ? "Emitted set_value(ParsedMsg)"
          : outcome === "set_error"
            ? "Emitted set_error(err)"
            : "Emitted set_stopped()",
      tone:
        outcome === "set_value"
          ? "right"
          : outcome === "set_error"
            ? "wrong"
            : "warn",
    },
    {
      id: "let_value",
      title: "let_value(validate)",
      role: "Conditional sender",
      status:
        outcome === "set_value"
          ? "Emitted set_value(ValidToken)"
          : "Short-circuited cleanly",
      tone: outcome === "set_value" ? "right" : "bypassed",
    },
    {
      id: "sync_wait",
      title: "sync_wait receiver",
      role: "Terminal channel handler",
      status:
        outcome === "set_value"
          ? "Returns optional(ValidToken)"
          : outcome === "set_error"
            ? "Rethrows captured error"
            : "Returns std::nullopt",
      tone:
        outcome === "set_value"
          ? "right"
          : outcome === "set_error"
            ? "wrong"
            : "warn",
    },
  ];
}

export function Cpp26PreviewMap() {
  const [activeTab, setActiveTab] = useState<PillarTab>("contracts");

  // Contracts state
  const [semantic, setSemantic] = useState<ContractSemantic>("enforce");
  const [contractInput, setContractInput] = useState<ContractInput>("oob");

  // Reflection state
  const [structId, setStructId] = useState<ReflectionStructId>("Point");
  const [reflStage, setReflStage] = useState<ReflectionStage>(4);
  const [selectedMember, setSelectedMember] = useState<string>("x");

  // Execution state
  const [execStep, setExecStep] = useState<ExecStep>(2);
  const [outcome, setOutcome] = useState<CompletionChannel>("set_value");

  const contractSim = getContractsSimulation(semantic, contractInput);
  const reflectedStruct = REFLECTED_STRUCTS[structId];
  const activeReflStage =
    REFLECTION_STAGES.find((s) => s.id === reflStage) ?? REFLECTION_STAGES[0];
  const execNodes = getExecutionNodes(execStep, outcome);
  const activeOutcome =
    OUTCOME_OPTIONS.find((o) => o.id === outcome) ?? OUTCOME_OPTIONS[0];

  const activeClause =
    activeTab === "contracts"
      ? "[basic.contract]"
      : activeTab === "reflection"
        ? "[meta.reflection] & P2996"
        : "[exec] & P2300";

  function handleSelectStruct(nextId: ReflectionStructId) {
    setStructId(nextId);
    setSelectedMember(REFLECTED_STRUCTS[nextId].members[0].name);
  }

  return (
    <Window
      as="section"
      aria-label="C++26 core pillars simulator"
      title="cpp26-pillars.sim"
      actions={
        <span className="font-mono text-xs text-ink-soft">{activeClause}</span>
      }
      bodyClassName="p-5 sm:p-7"
    >
      <div className="mb-4">
        <h3 className="font-display text-2xl font-[450] tracking-[-0.02em] text-ink">
          C++26 Pillars: Contracts, Reflection &amp; Execution
        </h3>
        <p className="mt-1 text-sm text-ink-soft">
          Inspect build-time contract semantics, compile-time{" "}
          <code className="font-mono text-xs text-ink">&lt;meta&gt;</code>{" "}
          splicing, and zero-allocation{" "}
          <code className="font-mono text-xs text-ink">std::execution</code>{" "}
          pipelines.
        </p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as PillarTab)}
        className="w-full"
      >
        <TabsList className="mb-6 max-w-full flex-wrap">
          <TabsTrigger
            value="contracts"
            className="h-8 px-3.5 text-xs cursor-pointer"
          >
            Contracts ([basic.contract])
          </TabsTrigger>
          <TabsTrigger
            value="reflection"
            className="h-8 px-3.5 text-xs cursor-pointer"
          >
            Static Reflection (P2996)
          </TabsTrigger>
          <TabsTrigger
            value="execution"
            className="h-8 px-3.5 text-xs cursor-pointer"
          >
            Senders &amp; Receivers ([exec])
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: CONTRACTS */}
        <TabsContent value="contracts" keepMounted className="mt-0 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-paper px-4 py-3">
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-ink-faint">
                Evaluation semantic
              </div>
              <div
                role="group"
                aria-label="Contract evaluation semantic"
                className="flex flex-wrap gap-1.5"
              >
                {CONTRACT_SEMANTICS.map((sem) => {
                  const active = semantic === sem.id;
                  return (
                    <Button
                      key={sem.id}
                      type="button"
                      size="xs"
                      variant={active ? "default" : "outline"}
                      aria-pressed={active}
                      onClick={() => setSemantic(sem.id)}
                      className={cn(
                        "font-mono text-xs cursor-pointer",
                        active && "bg-sun text-ink border-ink/30 hover:bg-sun/90"
                      )}
                    >
                      {sem.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs font-medium text-ink-faint">
                Input index (sz = 4)
              </div>
              <div
                role="group"
                aria-label="Contract input index"
                className="flex flex-wrap gap-1.5"
              >
                <Button
                  type="button"
                  size="xs"
                  variant={contractInput === "valid" ? "default" : "outline"}
                  aria-pressed={contractInput === "valid"}
                  onClick={() => setContractInput("valid")}
                  className={cn(
                    "font-mono text-xs cursor-pointer",
                    contractInput === "valid" &&
                      "bg-sun text-ink border-ink/30 hover:bg-sun/90"
                  )}
                >
                  valid (i = 2)
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant={contractInput === "oob" ? "default" : "outline"}
                  aria-pressed={contractInput === "oob"}
                  onClick={() => setContractInput("oob")}
                  className={cn(
                    "font-mono text-xs cursor-pointer",
                    contractInput === "oob" &&
                      "bg-sun text-ink border-ink/30 hover:bg-sun/90"
                  )}
                >
                  out-of-bounds (i = 7)
                </Button>
              </div>
            </div>
          </div>

          <CppCodeBlock caption="contracts_p2900.cpp" code={CONTRACTS_CODE} />

          <div className="space-y-2">
            <div className="text-xs font-medium text-ink-faint">
              Step-by-step evaluation trace
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {contractSim.steps.map((step) => (
                <div
                  key={step.id}
                  className={cn(
                    "rounded-2xl border p-3.5 transition-colors",
                    step.status === "passed" &&
                      "border-[color:var(--right)]/35 bg-right-wash/65",
                    (step.status === "violated-continue" ||
                      step.status === "ub-risk") &&
                      "border-ink/25 bg-sun-wash/75",
                    step.status === "violated-abort" &&
                      "border-wrong/40 bg-wrong-wash/75",
                    step.status === "skipped" &&
                      "border-line bg-paper-sunk text-ink-soft"
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-ink">
                      {step.label}
                    </span>
                    <span
                      className={cn(
                        "rounded-[var(--radius-chip)] border px-2 py-0.5 font-mono text-[11px] font-medium",
                        step.status === "passed" &&
                          "border-[color:var(--right)]/35 bg-paper-raised text-[color:var(--right)]",
                        step.status === "violated-abort" &&
                          "border-wrong/35 bg-paper-raised text-wrong",
                        (step.status === "violated-continue" ||
                          step.status === "ub-risk") &&
                          "border-ink/25 bg-paper-raised text-ink",
                        step.status === "skipped" &&
                          "border-line bg-paper text-ink-soft"
                      )}
                    >
                      {step.badge}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-ink-body">
                    {step.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div
            aria-live={activeTab === "contracts" ? "polite" : "off"}
            className={cn(
              "rounded-2xl border p-4 transition-colors",
              contractSim.tone === "right" &&
                "border-[color:var(--right)]/40 bg-right-wash/70",
              contractSim.tone === "warn" && "border-ink/25 bg-sun-wash/65",
              contractSim.tone === "wrong" && "border-wrong/40 bg-wrong-wash/70"
            )}
          >
            <div
              className={cn(
                "text-xs font-semibold",
                contractSim.tone === "right" && "text-[color:var(--right)]",
                contractSim.tone === "warn" && "text-ink",
                contractSim.tone === "wrong" && "text-wrong"
              )}
            >
              {contractSim.verdictLabel}
            </div>
            <dl className="mt-3 grid gap-4 border-t border-line pt-3 sm:grid-cols-3">
              <div>
                <dt className="text-[11px] font-medium text-ink-faint">
                  Violation handler
                </dt>
                <dd className="mt-1 font-mono text-xs text-ink">
                  {contractSim.handlerBehavior}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-medium text-ink-faint">
                  Runtime behavior
                </dt>
                <dd className="mt-1 text-xs leading-relaxed text-ink-body">
                  {contractSim.executionBehavior}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-medium text-ink-faint">
                  Generated codegen
                </dt>
                <dd className="mt-1 text-xs leading-relaxed text-ink-body">
                  {contractSim.codegenBehavior}
                </dd>
              </div>
            </dl>
          </div>
        </TabsContent>

        {/* TAB 2: STATIC REFLECTION */}
        <TabsContent value="reflection" keepMounted className="mt-0 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-paper px-4 py-3">
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-ink-faint">
                Sample aggregate struct
              </div>
              <div
                role="group"
                aria-label="Sample struct selection"
                className="flex flex-wrap gap-1.5"
              >
                {(["Point", "Config"] as ReflectionStructId[]).map((name) => (
                  <Button
                    key={name}
                    type="button"
                    size="xs"
                    variant={structId === name ? "default" : "outline"}
                    aria-pressed={structId === name}
                    onClick={() => handleSelectStruct(name)}
                    className={cn(
                      "font-mono text-xs cursor-pointer",
                      structId === name &&
                        "bg-sun text-ink border-ink/30 hover:bg-sun/90"
                    )}
                  >
                    struct {name}
                  </Button>
                ))}
              </div>
            </div>

            <div className="font-mono text-xs text-ink-soft">
              sizeof({reflectedStruct.id}) ={" "}
              <span className="font-semibold text-ink">
                {reflectedStruct.sizeofBytes}B
              </span>{" "}
              / alignof ={" "}
              <span className="font-semibold text-ink">
                {reflectedStruct.alignofBytes}B
              </span>
            </div>
          </div>

          <CppCodeBlock
            caption={`reflect_${reflectedStruct.id.toLowerCase()}.cpp`}
            code={reflectedStruct.code}
          />

          <div className="space-y-2.5">
            <div className="text-xs font-medium text-ink-faint">
              Compile-time reflection and splice pipeline
            </div>
            <div
              role="group"
              aria-label="Static reflection pipeline stages"
              className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
            >
              {REFLECTION_STAGES.map((stage) => {
                const isSelected = reflStage === stage.id;
                const exprLabel = stage.expr.replace(
                  "^^T",
                  `^^${reflectedStruct.id}`
                );
                return (
                  <button
                    key={stage.id}
                    type="button"
                    aria-pressed={isSelected}
                    aria-current={isSelected ? "step" : undefined}
                    onClick={() => setReflStage(stage.id)}
                    className={cn(
                      "rounded-2xl border p-3 text-left transition-colors cursor-pointer",
                      isSelected
                        ? "border-ink bg-sun text-ink"
                        : "border-line bg-paper-raised text-ink-soft hover:border-line-strong hover:text-ink"
                    )}
                  >
                    <span className="block text-xs font-semibold text-ink">
                      {stage.title}
                    </span>
                    <span className="mt-1 block font-mono text-[11px] break-all text-ink-body">
                      {exprLabel}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="rounded-2xl border border-ink/20 bg-sun-wash/55 px-4 py-3 text-xs leading-relaxed text-ink-body">
              {activeReflStage.note}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="min-w-0 rounded-2xl border border-line bg-paper p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-ink">
                  Reflected Data Members (click to trace splice)
                </span>
                <span className="font-mono text-[11px] text-ink-soft">
                  count = {reflectedStruct.members.length}
                </span>
              </div>

              <div className="space-y-2">
                {reflectedStruct.members.map((member) => {
                  const isFocused = selectedMember === member.name;
                  return (
                    <button
                      key={member.name}
                      type="button"
                      aria-pressed={isFocused}
                      onClick={() => setSelectedMember(member.name)}
                      className={cn(
                        "flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors cursor-pointer",
                        isFocused
                          ? "border-ink bg-sun-wash text-ink"
                          : "border-line bg-paper-raised text-ink-body hover:border-line-strong"
                      )}
                    >
                      <div className="min-w-0">
                        <span className="font-mono text-xs font-semibold text-ink">
                          {member.name}
                        </span>
                        <span className="ml-2 font-mono text-[11px] text-ink-soft">
                          {member.type}
                        </span>
                      </div>
                      <div className="font-mono text-[11px] text-ink-soft">
                        offset {member.offset}B / size {member.size}B
                      </div>
                    </button>
                  );
                })}
              </div>

              <p className="mt-3 text-[11px] leading-relaxed text-ink-soft">
                Layout note: {reflectedStruct.paddingNote}
              </p>
            </div>

            <div className="min-w-0 rounded-2xl border border-line bg-paper p-4 flex flex-col justify-between">
              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium text-ink">
                    Unrolled Compile-Time Serializer Output
                  </span>
                  <span className="rounded-[var(--radius-chip)] bg-right-wash px-2 py-0.5 font-mono text-[11px] font-medium text-[color:var(--right)]">
                    zero runtime reflection
                  </span>
                </div>

                <div className="space-y-1.5">
                  {reflectedStruct.members.map((member, index) => {
                    const isFocused = selectedMember === member.name;
                    return (
                      <div
                        key={member.name}
                        className={cn(
                          "rounded-xl border px-3 py-2 font-mono text-[11px] transition-colors",
                          reflStage === 4 && isFocused
                            ? "border-[color:var(--right)]/45 bg-right-wash/75 text-ink"
                            : isFocused
                              ? "border-ink/35 bg-sun-wash/70 text-ink"
                              : "border-line bg-paper-raised text-ink-body"
                        )}
                      >
                        <div className="text-[10px] text-ink-faint">
                          iteration #{index} (m = ^^
                          {reflectedStruct.id}::{member.name})
                        </div>
                        <div className="mt-0.5 break-all">
                          {member.splicedLine}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div
                aria-live={activeTab === "reflection" ? "polite" : "off"}
                className="mt-3 rounded-xl border border-[color:var(--right)]/35 bg-right-wash/60 px-3 py-2.5"
              >
                <div className="text-[11px] font-medium text-[color:var(--right)]">
                  Emitted runtime output
                </div>
                <div className="mt-0.5 font-mono text-xs text-ink break-all">
                  {reflectedStruct.jsonPreview}
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* TAB 3: SENDERS & RECEIVERS */}
        <TabsContent value="execution" keepMounted className="mt-0 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-paper px-4 py-3">
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-ink-faint">
                Lifecycle stage
              </div>
              <div
                role="group"
                aria-label="Execution lifecycle stage"
                className="flex flex-wrap gap-1.5"
              >
                {EXEC_STEPS.map((s) => {
                  const active = execStep === s.id;
                  return (
                    <Button
                      key={s.id}
                      type="button"
                      size="xs"
                      variant={active ? "default" : "outline"}
                      aria-pressed={active}
                      aria-current={active ? "step" : undefined}
                      onClick={() => setExecStep(s.id)}
                      className={cn(
                        "font-mono text-xs cursor-pointer",
                        active && "bg-sun text-ink border-ink/30 hover:bg-sun/90"
                      )}
                    >
                      {s.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs font-medium text-ink-faint">
                Completion channel outcome
              </div>
              <div
                role="group"
                aria-label="Receiver completion channel"
                className="flex flex-wrap gap-1.5"
              >
                {OUTCOME_OPTIONS.map((opt) => {
                  const active = outcome === opt.id;
                  return (
                    <Button
                      key={opt.id}
                      type="button"
                      size="xs"
                      variant={active ? "default" : "outline"}
                      aria-pressed={active}
                      onClick={() => setOutcome(opt.id)}
                      className={cn(
                        "font-mono text-xs cursor-pointer",
                        active && "bg-sun text-ink border-ink/30 hover:bg-sun/90"
                      )}
                    >
                      {opt.label}
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>

          <CppCodeBlock caption="execution_p2300.cpp" code={EXEC_CODE} />

          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {execNodes.map((node) => (
              <div
                key={node.id}
                className={cn(
                  "rounded-2xl border p-3.5 transition-colors",
                  node.tone === "right" &&
                    "border-[color:var(--right)]/40 bg-right-wash/70",
                  node.tone === "wrong" && "border-wrong/40 bg-wrong-wash/75",
                  node.tone === "warn" && "border-ink/25 bg-sun-wash/75",
                  node.tone === "active" && "border-ink/30 bg-sun-wash/55",
                  node.tone === "bypassed" &&
                    "border-line bg-paper-sunk text-ink-soft",
                  node.tone === "idle" && "border-line bg-paper-raised"
                )}
              >
                <div className="font-mono text-xs font-semibold text-ink">
                  {node.title}
                </div>
                <div className="mt-0.5 text-[11px] text-ink-soft">
                  {node.role}
                </div>
                <div
                  className={cn(
                    "mt-2 font-mono text-[11px] font-medium",
                    node.tone === "right" && "text-[color:var(--right)]",
                    node.tone === "wrong" && "text-wrong",
                    (node.tone === "warn" || node.tone === "active") &&
                      "text-ink",
                    (node.tone === "bypassed" || node.tone === "idle") &&
                      "text-ink-soft"
                  )}
                >
                  {node.status}
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="min-w-0 rounded-2xl border border-line bg-paper p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-ink">
                  Stack-Allocated operation_state
                </span>
                <span className="rounded-[var(--radius-chip)] bg-right-wash px-2 py-0.5 font-mono text-[11px] font-medium text-[color:var(--right)]">
                  0 heap allocations
                </span>
              </div>
              <pre className="overflow-x-auto rounded-xl border border-line bg-paper-raised p-3 font-mono text-[11px] leading-relaxed text-[var(--code-ink)]">
                {execStep === 1
                  ? `// Not connected yet: sndr is a pure stack value
sizeof(sndr) = sizeof(pool) + sizeof(raw); // 0 threads started`
                  : `// Immovable fused state created on caller stack by connect(sndr, rcvr):
struct sync_wait_op_state {
    schedule_op   sched_state;     // pool queue intrusive node
    then_op       parse_state;     // holds RawFrame + parse lambda
    let_value_op  validate_state;  // union slot for inner sender op
    sync_wait_rcvr* terminal;      // address fixed (immovable!)
};`}
              </pre>
            </div>

            <div
              aria-live={activeTab === "execution" ? "polite" : "off"}
              className="min-w-0 rounded-2xl border border-line bg-paper p-4 flex flex-col justify-between"
            >
              <div>
                <div className="mb-2 text-xs font-medium text-ink">
                  Receiver Completion Channels (Exactly One Fires)
                </div>
                <div className="space-y-2">
                  {OUTCOME_OPTIONS.map((opt) => {
                    const isSelected = outcome === opt.id;
                    const highlightLive = isSelected && execStep >= 3;
                    return (
                      <div
                        key={opt.id}
                        className={cn(
                          "rounded-xl border px-3 py-2 font-mono text-[11px] transition-colors",
                          highlightLive &&
                            opt.id === "set_value" &&
                            "border-[color:var(--right)]/45 bg-right-wash/75 text-[color:var(--right)]",
                          highlightLive &&
                            opt.id === "set_error" &&
                            "border-wrong/45 bg-wrong-wash/75 text-wrong",
                          highlightLive &&
                            opt.id === "set_stopped" &&
                            "border-ink/35 bg-sun-wash/80 text-ink",
                          !highlightLive &&
                            isSelected &&
                            "border-ink/25 bg-sun-wash/45 text-ink",
                          !isSelected &&
                            "border-line bg-paper-raised text-ink-soft"
                        )}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold">{opt.signature}</span>
                          <span>
                            {highlightLive
                              ? "active signal"
                              : isSelected
                                ? "armed"
                                : "standby"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <p className="mt-3 text-xs leading-relaxed text-ink-body">
                {execStep === 1
                  ? "Step 1 builds an inert sender graph value. No work starts and no heap memory is allocated."
                  : execStep === 2
                    ? "Step 2 runs connect(sndr, rcvr), constructing one immovable stack-allocated operation_state with every child state embedded inline."
                    : activeOutcome.summary}
              </p>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </Window>
  );
}
