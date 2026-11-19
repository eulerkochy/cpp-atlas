import type { RadScenario } from "@/components/rad-debugger/types";

export type ContractSemantic =
  | "ignore"
  | "observe"
  | "enforce"
  | "quick_enforce";
export type ContractInput = "valid" | "oob";

export function buildCpp26Scenarios(params: {
  semantic: ContractSemantic;
  input: ContractInput;
}): RadScenario[] {
  const { semantic, input } = params;
  const isValid = input === "valid";
  const idxVal = isValid ? 2 : 9;

  const contractStep2 = isValid
    ? {
        id: "ctr-pre",
        label: `pre(i < sz) checks ${idxVal} < 4 -> PASS`,
        line: 5,
        verdict: {
          tone: "safe" as const,
          label:
            semantic === "ignore"
              ? "ELIDED (ignore) · 0 runtime checks"
              : `PASS (${semantic}) · pre & assert satisfied`,
        },
        clause: "[basic.contract.eval] (P2900)",
        summary:
          semantic === "ignore"
            ? "Under ignore semantic, pre(i < sz) and contract_assert(data != nullptr) were checked semantically at compile time; zero runtime branch instructions are emitted."
            : `Under ${semantic} semantic, pre(2 < 4) and contract_assert(data != nullptr) evaluate true at runtime and proceed to return data[2] = 38.`,
        inlineHints: {
          5: {
            text:
              semantic === "ignore"
                ? "ignore: compile-checked, elided at runtime"
                : `i=${idxVal} < sz=4 -> TRUE`,
            tone: "safe" as const,
          },
        },
        watches: [
          {
            id: "wc-pre",
            expr: "pre(i < sz)",
            value: semantic === "ignore" ? "elided (semantic: ignore)" : "true (2 < 4)",
            type: "contract assertion",
            changed: true,
            tone: "safe" as const,
            badge: semantic === "ignore" ? "ELIDED" : "PASS",
          },
          {
            id: "wc-ret",
            expr: "data[2]",
            value: "38",
            type: "int",
            address: "0x7ffee4b2a808",
            tone: "safe" as const,
          },
        ],
        memory: [
          {
            id: "ctr-arr",
            name: "const int data[4] (constified in contract)",
            segment: "STACK" as const,
            baseAddress: "0x7ffee4b2a800",
            status: "alive" as const,
            statusLabel: "sz = 4, i = 2",
            cells: [
              { offset: "+0x00", size: 4, label: "data[0]", value: "10", hex: "0a 00 00 00", state: "alive" as const, address: "0x7ffee4b2a800" },
              { offset: "+0x04", size: 4, label: "data[1]", value: "24", hex: "18 00 00 00", state: "alive" as const, address: "0x7ffee4b2a804" },
              { offset: "+0x08", size: 4, label: "data[2] (selected)", value: "38", hex: "26 00 00 00", state: "alive" as const, address: "0x7ffee4b2a808", changed: true },
              { offset: "+0x0c", size: 4, label: "data[3]", value: "51", hex: "33 00 00 00", state: "alive" as const, address: "0x7ffee4b2a80c" },
            ],
          },
        ],
        callStack: [
          { id: "f-ctr", fn: "read_slot", args: `sz=4, i=${idxVal}`, file: "contracts_p2900.cpp", line: 5, addr: "0x7ffee4b2a7e0", isCurrent: true },
        ],
      }
    : {
        id: "ctr-pre-fail",
        label: `pre(9 < 4) VIOLATED under ${semantic} semantic`,
        line: 5,
        verdict:
          semantic === "enforce" || semantic === "quick_enforce"
            ? { tone: "danger" as const, label: `CONTRACT ABORT (${semantic}) · OOB blocked!` }
            : semantic === "observe"
              ? { tone: "warn" as const, label: "OBSERVED · Handler ran, then OOB UB!" }
              : { tone: "danger" as const, label: "ELIDED (ignore) · Silent OOB UB!" },
        clause: "[basic.contract.handler] (P2900)",
        summary:
          semantic === "enforce"
            ? "pre(9 < 4) fails: invokes global contract_violation_handler(), then terminates before touching out-of-bounds data[9]."
            : semantic === "quick_enforce"
              ? "pre(9 < 4) fails: aborts immediately via trap instruction (__builtin_trap) without calling violation handler."
              : semantic === "observe"
                ? "pre(9 < 4) fails: invokes violation handler for telemetry and CONTINUES execution into out-of-bounds data[9]!"
                : "ignore elided the runtime check completely, allowing silent out-of-bounds read data[9] (UB)!",
        inlineHints: {
          5: {
            text:
              semantic === "enforce"
                ? "VIOLATION -> handler() -> terminate!"
                : semantic === "quick_enforce"
                  ? "VIOLATION -> ud2 trap (no handler)"
                  : semantic === "observe"
                    ? "VIOLATION -> handler() -> continues!"
                    : "Check elided -> enters OOB data[9] UB!",
            tone: semantic === "observe" ? ("warn" as const) : ("danger" as const),
          },
        },
        watches: [
          {
            id: "wc-pre",
            expr: "pre(i < sz)",
            value: `false (9 < 4) [${semantic}]`,
            type: "contract_violation",
            changed: true,
            tone: semantic === "observe" ? ("warn" as const) : ("danger" as const),
            badge: semantic.toUpperCase(),
          },
        ],
        memory: [
          {
            id: "ctr-arr",
            name: "const int data[4] (OOB attempt @ +0x24)",
            segment: "STACK" as const,
            baseAddress: "0x7ffee4b2a800",
            status: "dangling" as const,
            statusLabel: "i=9 OUT OF BOUNDS",
            cells: [
              { offset: "+0x00", size: 16, label: "data[0..3]", value: "{10, 24, 38, 51}", hex: "0a 00 00 00 ...", state: "alive" as const, address: "0x7ffee4b2a800" },
              { offset: "+0x24", size: 4, label: "data[9] (OOB)", value: "OUT OF BOUNDS!", hex: "?? ?? ?? ??", state: "ub" as const, address: "0x7ffee4b2a824", changed: true },
            ],
          },
        ],
        callStack: [
          { id: "f-ctr", fn: "read_slot", args: "sz=4, i=9", file: "contracts_p2900.cpp", line: 5, addr: "0x7ffee4b2a7e0", isCurrent: true },
        ],
      };

  return [
    {
      id: "contracts-p2900",
      label: "1. C++26 Contracts (P2900)",
      subtitle: "pre, post, contract_assert & 4 evaluation semantics",
      filename: "contracts_p2900.cpp",
      standard: "C++26",
      target: "P2900",
      topicSlugs: ["contracts", "cpp26-contracts-reflection-execution"],
      defaultBreakpoints: [5, 7],
      quickWatches: [
        { expr: "pre(i < sz)", note: "Precondition contract assertion" },
      ],
      source: [
        "#include <contracts>",
        "#include <cstddef>",
        "",
        "int read_slot(const int* data, const std::size_t sz, const std::size_t i)",
        "    pre(i < sz)",
        "    post(r: r >= 0)",
        "{",
        "    contract_assert(data != nullptr);",
        "    return data[i];",
        "}",
      ],
      steps: [
        {
          id: "ctr-compile",
          label: `Compile-time type check & constification (semantic: ${semantic})`,
          line: 4,
          verdict: { tone: "info", label: `COMPILED · Predicate vars implicitly const` },
          clause: "[basic.contract.syn]",
          summary:
            "P2900 compiles every contract predicate even under ignore: parameters and postcondition result r are implicitly constified inside predicates so contracts cannot mutate program state.",
          inlineHints: {
            4: { text: `Evaluation semantic = ${semantic}`, tone: "info" },
          },
          watches: [
            { id: "wc-sem", expr: "evaluation_semantic", value: semantic, type: "P2900 mode", tone: "info", changed: true },
            { id: "wc-i", expr: "i (argument)", value: String(idxVal), type: "const std::size_t", tone: isValid ? "safe" : "danger" },
          ],
          memory: [
            {
              id: "ctr-arr",
              name: "const int data[4]",
              segment: "STACK",
              baseAddress: "0x7ffee4b2a800",
              status: "alive",
              cells: [
                { offset: "+0x00", size: 16, label: "data[0..3]", value: "{10, 24, 38, 51}", hex: "0a 00 00 00 ...", state: "alive", address: "0x7ffee4b2a800" },
              ],
            },
          ],
          callStack: [
            { id: "f-ctr", fn: "read_slot", args: `sz=4, i=${idxVal}`, file: "contracts_p2900.cpp", line: 4, addr: "0x7ffee4b2a7e0", isCurrent: true },
          ],
        },
        contractStep2,
      ],
    },
    {
      id: "reflection-p2996",
      label: "2. C++26 Static Reflection (P2996)",
      subtitle: "^^T reflection, template for expansion & [:m:] splicers",
      filename: "reflection_p2996.cpp",
      standard: "C++26",
      target: "P2996 + P1306",
      topicSlugs: ["reflection"],
      defaultBreakpoints: [5, 7],
      source: [
        "#include <meta>",
        "struct Point { int x{12}; double y{4.5}; };",
        "void dump(const Point& p) {",
        "  constexpr auto ctx = std::meta::access_context::current();",
        "  template for (constexpr auto m : define_static_array(",
        "      std::meta::nonstatic_data_members_of(^^Point, ctx))) {",
        "    print(std::meta::identifier_of(m), p.[:m:]); // splice!",
        "  }",
        "}",
      ],
      steps: [
        {
          id: "ref-splice",
          label: "^^Point -> template for unrolls [:m:] splices with 0 runtime RTTI",
          line: 7,
          verdict: { tone: "safe", label: "CONSTEXPR EXPANDED · 0B RTTI, direct field reads" },
          clause: "[meta.reflection] (P2996)",
          summary:
            "^^Point yields a compile-time std::meta::info value. expansion statements (template for) unroll each reflected member m at compile time, emitting identifier_of(m) literals and direct p.[:m:] field accesses (p.x, p.y).",
          inlineHints: {
            7: { text: 'Unrolled: print("x", p.x); print("y", p.y);', tone: "safe" },
          },
          watches: [
            { id: "wr-1", expr: "^^Point", value: "std::meta::info (#Point)", type: "consteval info", tone: "info" },
            { id: "wr-2", expr: "m[0] -> p.[:m[0]:]", value: '"x" -> 12', type: "int", address: "0x7ffee4b2a860", changed: true, tone: "safe" },
            { id: "wr-3", expr: "m[1] -> p.[:m[1]:]", value: '"y" -> 4.5', type: "double", address: "0x7ffee4b2a868", changed: true, tone: "safe" },
          ],
          memory: [
            {
              id: "ref-pt",
              name: "Point p (zero reflection metadata in object!)",
              segment: "STACK",
              baseAddress: "0x7ffee4b2a860",
              status: "alive",
              statusLabel: "16B PLAIN DATA (0B RTTI)",
              cells: [
                { offset: "+0x00", size: 4, label: "p.x ([:m[0]:])", value: "12", hex: "0c 00 00 00", state: "alive", address: "0x7ffee4b2a860", changed: true },
                { offset: "+0x08", size: 8, label: "p.y ([:m[1]:])", value: "4.5", hex: "00 00 00 00 00 00 12 40", state: "alive", address: "0x7ffee4b2a868", changed: true },
              ],
            },
          ],
          callStack: [
            { id: "f-ref", fn: "dump", file: "reflection_p2996.cpp", line: 7, addr: "0x7ffee4b2a860", isCurrent: true },
          ],
        },
      ],
    },
    {
      id: "execution-p2300",
      label: "3. std::execution Senders (P2300)",
      subtitle: "Lazy sender graph -> fused stack OperationState (0 heap allocs)",
      filename: "execution_p2300.cpp",
      standard: "C++26",
      target: "P2300",
      topicSlugs: ["senders-and-receivers"],
      defaultBreakpoints: [4, 5],
      source: [
        "namespace ex = std::execution;",
        "auto work = ex::just(21)",
        "          | ex::then([](int v) { return v * 2; });",
        "auto op = ex::connect(std::move(work), PrintReceiver{}); // 0 allocs!",
        "ex::start(op); // fires set_value(42)",
      ],
      steps: [
        {
          id: "ex-connect",
          label: "ex::connect() fuses sender + receiver into 1 stack OperationState",
          line: 4,
          verdict: { tone: "info", label: "CONNECTED · Fused stack OperationState (0 allocs)" },
          clause: "[exec.snd] (P2300)",
          summary:
            "Unlike std::future/std::promise (which allocate a shared heap state), ex::connect builds a single concrete OperationState on the stack containing both just(21)'s state and then's continuation.",
          inlineHints: {
            4: { text: "op @ 0x7ffee4b2a840 (0 heap allocations)", tone: "info" },
          },
          watches: [
            { id: "we-op", expr: "op (OperationState)", value: "{ value=21, fn=lambda, rcv=PrintReceiver }", type: "__then_opstate", address: "0x7ffee4b2a840", changed: true, tone: "info" },
          ],
          memory: [
            {
              id: "ex-stack",
              name: "Fused Stack OperationState",
              segment: "STACK",
              baseAddress: "0x7ffee4b2a840",
              status: "alive",
              statusLabel: "0 HEAP ALLOCATIONS",
              cells: [
                { offset: "+0x00", size: 4, label: "just::val", value: "21", hex: "15 00 00 00", state: "alive", address: "0x7ffee4b2a840", changed: true },
                { offset: "+0x08", size: 8, label: "receiver", value: "PrintReceiver{}", hex: "00 00 00 00 00 00 00 00", state: "alive", address: "0x7ffee4b2a848" },
              ],
            },
          ],
          callStack: [
            { id: "f-ex", fn: "ex::connect", file: "execution_p2300.cpp", line: 4, addr: "0x7ffee4b2a840", isCurrent: true },
          ],
        },
        {
          id: "ex-start",
          label: "ex::start(op) invokes lambda(21) -> PrintReceiver::set_value(42)",
          line: 5,
          verdict: { tone: "safe", label: "COMPLETED · set_value(42) on value channel" },
          clause: "[exec.recv]",
          summary:
            "Starting the operation state runs the sender synchronously/asynchronously and routes 21 * 2 = 42 directly into PrintReceiver::set_value(42) with zero virtual dispatch or heap allocations.",
          inlineHints: {
            5: { text: "set_value(42) fired (set_error/set_stopped idle)", tone: "safe" },
          },
          watches: [
            { id: "we-res", expr: "receiver.set_value", value: "42 (completion channel)", type: "void(int)", changed: true, tone: "safe", badge: "SET_VALUE" },
          ],
          memory: [
            {
              id: "ex-stack",
              name: "Fused Stack OperationState",
              segment: "STACK",
              baseAddress: "0x7ffee4b2a840",
              status: "alive",
              statusLabel: "SET_VALUE(42)",
              cells: [
                { offset: "+0x00", size: 4, label: "output value", value: "42", hex: "2a 00 00 00", state: "alive", address: "0x7ffee4b2a840", changed: true },
              ],
            },
          ],
          callStack: [
            { id: "f-ex", fn: "PrintReceiver::set_value", args: "42", file: "execution_p2300.cpp", line: 5, addr: "0x7ffee4b2a840", isCurrent: true },
          ],
        },
      ],
    },
  ];
}
