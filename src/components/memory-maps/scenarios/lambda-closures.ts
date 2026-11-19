import type { RadScenario } from "@/components/rad-debugger/types";

export type ThisCaptureMode = "ptr" | "copy";

export function buildLambdaClosureScenarios(
  thisMode: ThisCaptureMode
): RadScenario[] {
  const isPtrMode = thisMode === "ptr";

  return [
    {
      id: "captures-desugar",
      label: "1. Closure Struct & Captures",
      subtitle: "Value, reference & init-capture desugaring into unnamed structs",
      filename: "lambda_captures.cpp",
      standard: "C++23",
      target: "LP64",
      topicSlugs: ["lambdas"],
      defaultBreakpoints: [6, 8],
      quickWatches: [
        { expr: "count", note: "Outer stack int" },
        { expr: "by_val", note: "Closure with value member" },
        { expr: "owner", note: "Move-only init-capture closure" },
      ],
      source: [
        "void capture_demo() {",
        "  int count = 0;",
        "  auto by_val = [count]() mutable { return ++count; };",
        "  auto by_ref = [&count]() { return ++count; };",
        "  auto h = std::make_unique<int>(42);",
        "  auto owner = [p = std::move(h)]() { return *p; };",
        "  int a = by_val(); // mutates copy 0 -> 1",
        "  int b = by_ref(); // mutates outer 0 -> 1",
        "  int c = owner();  // derefs heap *p == 42",
        "}",
      ],
      steps: [
        {
          id: "lam-by-val",
          label: "by_val synthesizes __lambda_1 { int count = 0; } (mutable)",
          line: 3,
          verdict: { tone: "info", label: "CLOSURE 4B · operator() non-const (mutable)" },
          clause: "[expr.prim.lambda.closure] §7.5.5.1",
          summary:
            "Capturing count by value generates an unnamed struct __lambda_1 with a copied int count member (4B) at 0x7ffee4b2a8bc. Writing mutable drops const from operator() so ++count is legal.",
          inlineHints: {
            3: { text: "copy @ 0x7ffee4b2a8bc", tone: "info" },
          },
          registersTitle: "Closure Traits",
          registers: [
            { name: "synthesized_struct", value: "struct __lambda_1 { int count; }", changed: true, tone: "info" },
            { name: "sizeof(by_val)", value: "4 bytes (LP64)", tone: "info" },
            { name: "operator()()", value: "int operator()() /* mutable */", changed: true },
            { name: "copyable / fn*", value: "Copyable: Yes | fn*: No (captures)" },
          ],
          watches: [
            {
              id: "w-count",
              expr: "count",
              value: "0",
              type: "int",
              address: "0x7ffee4b2a8c0",
              tone: "neutral",
            },
            {
              id: "w-byval",
              expr: "by_val",
              value: "__lambda_1 { count = 0 }",
              type: "unnamed closure (4B)",
              address: "0x7ffee4b2a8bc",
              changed: true,
              tone: "info",
              badge: "MUTABLE",
              children: [
                {
                  id: "w-bv-c",
                  expr: "by_val.__count",
                  offset: "+0x00",
                  value: "0 (independent copy)",
                  type: "int",
                  address: "0x7ffee4b2a8bc",
                  changed: true,
                },
              ],
            },
          ],
          memory: [
            {
              id: "stack-lam",
              name: "capture_demo() stack frame",
              segment: "STACK",
              baseAddress: "0x7ffee4b2a898",
              status: "alive",
              statusLabel: "__lambda_1 CONSTRUCTED",
              cells: [
                {
                  offset: "+0x28",
                  size: 4,
                  label: "outer count",
                  value: "0",
                  hex: "00 00 00 00",
                  state: "alive",
                  address: "0x7ffee4b2a8c0",
                },
                {
                  offset: "+0x24",
                  size: 4,
                  label: "by_val.__count",
                  value: "0 (by-value copy)",
                  hex: "00 00 00 00",
                  state: "alive",
                  address: "0x7ffee4b2a8bc",
                  changed: true,
                },
              ],
            },
          ],
          callStack: [
            { id: "f-cap", fn: "capture_demo", file: "lambda_captures.cpp", line: 3, addr: "0x7ffee4b2a898", isCurrent: true },
          ],
          disasmTitle: "Closure Lowering",
          disasm: [
            { addr: "0x401210", op: "mov", operands: "eax, dword ptr [rbp - 0x04]", comment: "Read outer count (0)" },
            { addr: "0x401213", op: "mov", operands: "dword ptr [rbp - 0x08], eax", comment: "Copy into by_val.__count", active: true },
          ],
        },
        {
          id: "lam-by-ref",
          label: "by_ref synthesizes __lambda_2 { int& count -> 0x7ffee4b2a8c0 }",
          line: 4,
          verdict: { tone: "info", label: "CLOSURE 8B · const operator() mutates ref" },
          clause: "[expr.prim.lambda.capture] §7.5.5.2",
          summary:
            "Capturing [&count] stores an 8-byte reference pointer inside __lambda_2 pointing to outer count (0x7ffee4b2a8c0). Its operator() stays const because mutating the referent does not alter the reference field itself.",
          inlineHints: {
            4: { text: "ref -> 0x7ffee4b2a8c0", tone: "info" },
          },
          registersTitle: "Closure Traits",
          registers: [
            { name: "synthesized_struct", value: "struct __lambda_2 { int& count; }", changed: true, tone: "info" },
            { name: "sizeof(by_ref)", value: "8 bytes (reference ptr)", changed: true },
            { name: "operator()()", value: "int operator()() const", changed: true, tone: "safe" },
            { name: "copyable / fn*", value: "Copyable: Yes | fn*: No (captures)" },
          ],
          watches: [
            {
              id: "w-byref",
              expr: "by_ref",
              value: "__lambda_2 { count& -> 0x7ffee4b2a8c0 }",
              type: "unnamed closure (8B)",
              address: "0x7ffee4b2a8b0",
              changed: true,
              tone: "info",
              badge: "CONST OP()",
              children: [
                {
                  id: "w-br-ptr",
                  expr: "by_ref.__count_ref",
                  offset: "+0x00",
                  value: "0x7ffee4b2a8c0 (* == 0)",
                  type: "int& (8B)",
                  address: "0x7ffee4b2a8b0",
                },
              ],
            },
          ],
          memory: [
            {
              id: "stack-lam",
              name: "capture_demo() stack frame",
              segment: "STACK",
              baseAddress: "0x7ffee4b2a898",
              status: "alive",
              statusLabel: "__lambda_2 REF BIND",
              cells: [
                { offset: "+0x28", size: 4, label: "outer count", value: "0", hex: "00 00 00 00", state: "alive", address: "0x7ffee4b2a8c0" },
                { offset: "+0x24", size: 4, label: "by_val.__count", value: "0", hex: "00 00 00 00", state: "alive", address: "0x7ffee4b2a8bc" },
                { offset: "+0x18", size: 8, label: "by_ref.__count", value: "0x7ffee4b2a8c0", hex: "c0 a8 b2 e4 fe 7f 00 00", state: "alive", address: "0x7ffee4b2a8b0", pointsTo: "0x7ffee4b2a8c0", changed: true },
              ],
            },
          ],
          callStack: [
            { id: "f-cap", fn: "capture_demo", file: "lambda_captures.cpp", line: 4, addr: "0x7ffee4b2a898", isCurrent: true },
          ],
        },
        {
          id: "lam-init-move",
          label: "owner init-capture moves unique_ptr -> move-only closure!",
          line: 6,
          verdict: { tone: "safe", label: "MOVE-ONLY · unique_ptr transferred into closure" },
          clause: "[expr.prim.lambda.capture]/6",
          summary:
            "C++14 init-capture [p = std::move(h)] deduces p as std::unique_ptr<int>, moves 0x600001408000 into __lambda_3, nulls outer h, and makes __lambda_3 non-copyable (move-only).",
          inlineHints: {
            6: { text: "p -> 0x600001408000", tone: "safe" },
          },
          registersTitle: "Closure Traits",
          registers: [
            { name: "synthesized_struct", value: "struct __lambda_3 { unique_ptr<int> p; }", changed: true, tone: "safe" },
            { name: "sizeof(owner)", value: "8 bytes (unique_ptr)", changed: true },
            { name: "operator()()", value: "int operator()() const", tone: "safe" },
            { name: "copyable / fn*", value: "Copyable: NO (deleted!) | fn*: No", changed: true, tone: "warn" },
          ],
          watches: [
            {
              id: "w-h",
              expr: "h (moved-from)",
              value: "nullptr (0x0)",
              type: "std::unique_ptr<int>",
              address: "0x7ffee4b2a8a8",
              changed: true,
              tone: "warn",
              badge: "MOVED",
            },
            {
              id: "w-owner",
              expr: "owner",
              value: "__lambda_3 { p = 0x600001408000 }",
              type: "move-only closure (8B)",
              address: "0x7ffee4b2a8a0",
              changed: true,
              tone: "safe",
              badge: "MOVE-ONLY",
              children: [
                {
                  id: "w-ow-p",
                  expr: "owner.p",
                  offset: "+0x00",
                  value: "0x600001408000 (*p == 42)",
                  type: "std::unique_ptr<int>",
                  address: "0x600001408000",
                  changed: true,
                },
              ],
            },
          ],
          memory: [
            {
              id: "stack-lam",
              name: "capture_demo() stack frame",
              segment: "STACK",
              baseAddress: "0x7ffee4b2a898",
              status: "alive",
              statusLabel: "INIT-CAPTURE MOVED",
              cells: [
                { offset: "+0x10", size: 8, label: "h (unique_ptr)", value: "nullptr (moved-from)", hex: "00 00 00 00 00 00 00 00", state: "moved", address: "0x7ffee4b2a8a8", changed: true },
                { offset: "+0x08", size: 8, label: "owner.p", value: "0x600001408000", hex: "00 80 40 01 00 60 00 00", state: "alive", address: "0x7ffee4b2a8a0", pointsTo: "0x600001408000", changed: true },
              ],
            },
            {
              id: "heap-lam",
              name: "Heap int owned by owner.p",
              segment: "HEAP",
              baseAddress: "0x600001408000",
              status: "alive",
              statusLabel: "OWNED BY CLOSURE",
              cells: [
                { offset: "+0x00", size: 4, label: "*owner.p", value: "42", hex: "2a 00 00 00", state: "alive", address: "0x600001408000" },
              ],
            },
          ],
          callStack: [
            { id: "f-cap", fn: "capture_demo", file: "lambda_captures.cpp", line: 6, addr: "0x7ffee4b2a898", isCurrent: true },
          ],
        },
        {
          id: "lam-call-val",
          label: "by_val() mutates closure member -> outer count stays 0",
          line: 7,
          verdict: { tone: "info", label: "MUTATED COPY · by_val.__count=1, count=0" },
          clause: "[expr.prim.lambda.closure]/5",
          summary:
            "Calling by_val() passes rdi = &by_val (0x7ffee4b2a8bc) as the closure's hidden this pointer into __lambda_1::operator(). Only the closure's own copy increments from 0 to 1; outer count remains 0.",
          inlineHints: {
            7: { text: "a=1, by_val.__count=1, outer count=0", tone: "info" },
          },
          registersTitle: "Call ABI & Traits",
          registers: [
            { name: "rdi (closure this)", value: "0x7ffee4b2a8bc (&by_val)", changed: true, tone: "info" },
            { name: "eax (return a)", value: "1", changed: true, tone: "safe" },
            { name: "outer count", value: "0 (untouched)", tone: "neutral" },
          ],
          watches: [
            { id: "w-a", expr: "a", value: "1", type: "int", changed: true, tone: "safe" },
            { id: "w-bv-c", expr: "by_val.__count", value: "1", type: "int", address: "0x7ffee4b2a8bc", changed: true, tone: "info" },
            { id: "w-count", expr: "count (outer)", value: "0", type: "int", address: "0x7ffee4b2a8c0" },
          ],
          memory: [
            {
              id: "stack-lam",
              name: "capture_demo() stack frame",
              segment: "STACK",
              baseAddress: "0x7ffee4b2a898",
              status: "alive",
              cells: [
                { offset: "+0x28", size: 4, label: "outer count", value: "0 (unchanged)", hex: "00 00 00 00", state: "alive", address: "0x7ffee4b2a8c0" },
                { offset: "+0x24", size: 4, label: "by_val.__count", value: "1 (mutated)", hex: "01 00 00 00", state: "alive", address: "0x7ffee4b2a8bc", changed: true },
              ],
            },
          ],
          callStack: [
            { id: "f-l1", fn: "__lambda_1::operator()", args: "this=0x7ffee4b2a8bc", file: "lambda_captures.cpp", line: 3, addr: "0x7ffee4b2a870", isCurrent: true },
            { id: "f-cap", fn: "capture_demo", file: "lambda_captures.cpp", line: 7, addr: "0x7ffee4b2a898" },
          ],
        },
        {
          id: "lam-call-ref",
          label: "by_ref() mutates outer count (0 -> 1); owner() returns 42",
          line: 9,
          verdict: { tone: "safe", label: "RESOLVED · count=1, b=1, c=42" },
          clause: "[expr.prim.lambda.capture]",
          summary:
            "by_ref() follows its stored reference pointer to 0x7ffee4b2a8c0 and increments outer count to 1. owner() dereferences its moved unique_ptr at 0x600001408000 and returns 42.",
          inlineHints: {
            9: { text: "b=1 (outer count=1), c=42", tone: "safe" },
          },
          registersTitle: "Call ABI & Traits",
          registers: [
            { name: "outer count", value: "1 (mutated via by_ref)", changed: true, tone: "safe" },
            { name: "owner.p", value: "0x600001408000 -> 42", tone: "safe" },
            { name: "a / b / c", value: "1 / 1 / 42", changed: true, tone: "safe" },
          ],
          watches: [
            { id: "w-count", expr: "count (outer)", value: "1", type: "int", address: "0x7ffee4b2a8c0", changed: true, tone: "safe" },
            { id: "w-b", expr: "b", value: "1", type: "int", changed: true, tone: "safe" },
            { id: "w-c", expr: "c", value: "42", type: "int", address: "0x600001408000", changed: true, tone: "safe" },
          ],
          memory: [
            {
              id: "stack-lam",
              name: "capture_demo() stack frame",
              segment: "STACK",
              baseAddress: "0x7ffee4b2a898",
              status: "alive",
              cells: [
                { offset: "+0x28", size: 4, label: "outer count", value: "1", hex: "01 00 00 00", state: "alive", address: "0x7ffee4b2a8c0", changed: true },
                { offset: "+0x18", size: 8, label: "by_ref.__count", value: "0x7ffee4b2a8c0", hex: "c0 a8 b2 e4 fe 7f 00 00", state: "alive", address: "0x7ffee4b2a8b0", pointsTo: "0x7ffee4b2a8c0" },
                { offset: "+0x08", size: 8, label: "owner.p", value: "0x600001408000", hex: "00 80 40 01 00 60 00 00", state: "alive", address: "0x7ffee4b2a8a0", pointsTo: "0x600001408000" },
              ],
            },
            {
              id: "heap-lam",
              name: "Heap int owned by owner.p",
              segment: "HEAP",
              baseAddress: "0x600001408000",
              status: "alive",
              cells: [
                { offset: "+0x00", size: 4, label: "*owner.p", value: "42", hex: "2a 00 00 00", state: "alive", address: "0x600001408000" },
              ],
            },
          ],
          callStack: [
            { id: "f-l3", fn: "__lambda_3::operator()", args: "this=0x7ffee4b2a8a0", file: "lambda_captures.cpp", line: 6, addr: "0x7ffee4b2a870", isCurrent: true },
            { id: "f-cap", fn: "capture_demo", file: "lambda_captures.cpp", line: 9, addr: "0x7ffee4b2a898" },
          ],
        },
      ],
    },
    {
      id: "this-capture-trap",
      label: "2. [=, this] vs [=, *this]",
      subtitle: "Why [=] inside a method captures raw `this*` instead of member values",
      filename: "this_capture.cpp",
      standard: "C++23",
      target: "LP64",
      defaultBreakpoints: [7, 8],
      quickWatches: [
        { expr: "job", note: "Stack Job object" },
        { expr: "task", note: "Returned lambda closure" },
      ],
      source: [
        "struct Job {",
        "  int factor = 3;",
        "  auto make_task() const {",
        isPtrMode
          ? "    return [=, this](int x) { return x * factor; }; // captures this*!"
          : "    return [=, *this](int x) { return x * factor; }; // copies *this!",
        "  }",
        "};",
        "int run_later() {",
        "  auto task = Job{3}.make_task(); // Job temporary dies at ;",
        "  return task(10);                // invokes closure after ~Job()",
        "}",
      ],
      steps: [
        {
          id: "this-construct",
          label: isPtrMode
            ? "Closure captures raw const Job* pointer (0x7ffee4b2a890)"
            : "Closure copies entire Job{3} object by value inside struct (4B)",
          line: 4,
          verdict: isPtrMode
            ? { tone: "warn", label: "CAPTURES PTR · Holds const Job* 0x7ffee4b2a890" }
            : { tone: "safe", label: "CAPTURES COPY · Owns Job { factor = 3 }" },
          clause: "[expr.prim.lambda.capture]/10",
          summary: isPtrMode
            ? "[=, this] (and deprecated C++17 bare [=]) does NOT copy Job::factor! It stores the 8-byte `this` pointer inside the closure struct."
            : "C++17 [=, *this] snapshots a complete copy of *this (Job { factor = 3 }) directly as a data member inside the closure object.",
          inlineHints: {
            4: {
              text: isPtrMode
                ? "__this = 0x7ffee4b2a890 (Job*)"
                : "__copy = Job{3} (self-contained)",
              tone: isPtrMode ? "warn" : "safe",
            },
          },
          registersTitle: "Closure Traits",
          registers: [
            {
              name: "synthesized_struct",
              value: isPtrMode
                ? "struct __lambda { const Job* __this; };"
                : "struct __lambda { Job __copy; };",
              changed: true,
              tone: isPtrMode ? "warn" : "safe",
            },
            { name: "sizeof(task)", value: isPtrMode ? "8 bytes (pointer)" : "4 bytes (Job copy)" },
            { name: "operator()(int)", value: "int operator()(int) const" },
          ],
          watches: [
            {
              id: "wt-job",
              expr: "<temp Job{3}>",
              value: "Job { factor = 3 }",
              type: "Job",
              address: "0x7ffee4b2a890",
              tone: "info",
            },
            {
              id: "wt-task",
              expr: "task (constructed)",
              value: isPtrMode
                ? "__lambda { __this = 0x7ffee4b2a890 }"
                : "__lambda { __copy = Job{3} }",
              type: isPtrMode ? "closure (8B)" : "closure (4B)",
              address: "0x7ffee4b2a8a0",
              changed: true,
              tone: isPtrMode ? "warn" : "safe",
            },
          ],
          memory: [
            {
              id: "stack-this",
              name: "run_later() stack frame",
              segment: "STACK",
              baseAddress: "0x7ffee4b2a890",
              status: "alive",
              cells: [
                { offset: "+0x00", size: 4, label: "<temp Job>.factor", value: "3", hex: "03 00 00 00", state: "alive", address: "0x7ffee4b2a890" },
                isPtrMode
                  ? { offset: "+0x10", size: 8, label: "task.__this", value: "0x7ffee4b2a890", hex: "90 a8 b2 e4 fe 7f 00 00", state: "alive", address: "0x7ffee4b2a8a0", pointsTo: "0x7ffee4b2a890", changed: true }
                  : { offset: "+0x10", size: 4, label: "task.__copy.factor", value: "3 (copied)", hex: "03 00 00 00", state: "alive", address: "0x7ffee4b2a8a0", changed: true },
              ],
            },
          ],
          callStack: [
            { id: "f-mk", fn: "Job::make_task", file: "this_capture.cpp", line: 4, addr: "0x7ffee4b2a890", isCurrent: true },
            { id: "f-rl", fn: "run_later", file: "this_capture.cpp", line: 8, addr: "0x7ffee4b2a8a0" },
          ],
        },
        {
          id: "this-temp-dies",
          label: "Semicolon at line 8 destroys temporary Job{3}",
          line: 8,
          verdict: isPtrMode
            ? { tone: "danger", label: "DANGLING · task.__this -> dead Job!" }
            : { tone: "safe", label: "INDEPENDENT · task.__copy still alive" },
          clause: "[class.temporary] §6.7.7",
          summary: isPtrMode
            ? "Temporary Job{3} ends its lifetime at the semicolon, leaving task.__this pointing at destroyed stack bytes 0x7ffee4b2a890."
            : "Temporary Job{3} ends its lifetime at the semicolon, but task owns an independent copy of Job{3} inside 0x7ffee4b2a8a0.",
          inlineHints: {
            8: {
              text: isPtrMode
                ? "~Job() ran; task.__this dangles!"
                : "~Job() ran; task.__copy safe",
              tone: isPtrMode ? "danger" : "safe",
            },
          },
          registersTitle: "Closure Traits",
          registers: [
            {
              name: "synthesized_struct",
              value: isPtrMode
                ? "struct __lambda { const Job* __this; };"
                : "struct __lambda { Job __copy; };",
              tone: isPtrMode ? "danger" : "safe",
            },
            { name: "Job temp @ 0x...890", value: "DESTROYED at ;", changed: true, tone: "warn" },
            { name: "task validity", value: isPtrMode ? "DANGLING POINTER" : "SELF-CONTAINED", tone: isPtrMode ? "danger" : "safe" },
          ],
          watches: [
            {
              id: "wt-task",
              expr: "task",
              value: isPtrMode
                ? "__lambda { __this = 0x7ffee4b2a890 [DEAD!] }"
                : "__lambda { __copy = Job{3} [ALIVE] }",
              type: isPtrMode ? "closure (8B)" : "closure (4B)",
              address: "0x7ffee4b2a8a0",
              changed: true,
              tone: isPtrMode ? "danger" : "safe",
              badge: isPtrMode ? "DANGLING" : "VALID",
            },
          ],
          memory: [
            {
              id: "stack-this",
              name: "run_later() stack frame",
              segment: "STACK",
              baseAddress: "0x7ffee4b2a890",
              status: isPtrMode ? "dangling" : "alive",
              statusLabel: isPtrMode ? "DANGLING THIS*" : "COPY SAFE",
              cells: [
                { offset: "+0x00", size: 4, label: "<dead Job>", value: "~Job() ran at ;", hex: "dd dd dd dd", state: "freed", address: "0x7ffee4b2a890", changed: true },
                isPtrMode
                  ? { offset: "+0x10", size: 8, label: "task.__this", value: "0x7ffee4b2a890 (DANGLING)", hex: "90 a8 b2 e4 fe 7f 00 00", state: "dangling", address: "0x7ffee4b2a8a0", pointsTo: "0x7ffee4b2a890", changed: true }
                  : { offset: "+0x10", size: 4, label: "task.__copy.factor", value: "3 (alive)", hex: "03 00 00 00", state: "alive", address: "0x7ffee4b2a8a0" },
              ],
            },
          ],
          callStack: [
            { id: "f-rl", fn: "run_later", file: "this_capture.cpp", line: 8, addr: "0x7ffee4b2a8a0", isCurrent: true },
          ],
        },
        {
          id: "this-invoke",
          label: isPtrMode
            ? "task(10) reads dead this->factor -> Use-After-Free UB!"
            : "task(10) multiplies 10 * task.__copy.factor -> returns 30",
          line: 9,
          verdict: isPtrMode
            ? { tone: "danger", label: "UAF UB · Read dead Job::factor!" }
            : { tone: "safe", label: "SAFE · Returns 30 (10 * 3)" },
          clause: isPtrMode ? "[basic.life]/7" : "[expr.prim.lambda.capture]/10",
          summary: isPtrMode
            ? "Calling task(10) dereferences task.__this->factor at 0x7ffee4b2a890 after Job's lifetime ended — Undefined Behavior."
            : "Calling task(10) reads task.__copy.factor directly from its own closure struct (0x7ffee4b2a8a0) and cleanly returns 30.",
          inlineHints: {
            9: {
              text: isPtrMode
                ? "UAF UB: reads dead 0x7ffee4b2a890"
                : "returns 30 from task.__copy",
              tone: isPtrMode ? "danger" : "safe",
            },
          },
          registersTitle: "Closure Traits",
          registers: [
            {
              name: "synthesized_struct",
              value: isPtrMode
                ? "struct __lambda { const Job* __this; };"
                : "struct __lambda { Job __copy; };",
              tone: isPtrMode ? "danger" : "safe",
            },
            { name: "return value", value: isPtrMode ? "<UB / indeterminate>" : "30", changed: true, tone: isPtrMode ? "danger" : "safe" },
          ],
          watches: [
            {
              id: "wt-res",
              expr: "task(10)",
              value: isPtrMode ? "<UB: stack-use-after-scope>" : "30",
              type: "int",
              address: isPtrMode ? "0x7ffee4b2a890" : "0x7ffee4b2a8a0",
              changed: true,
              tone: isPtrMode ? "danger" : "safe",
              badge: isPtrMode ? "UAF UB" : "SAFE",
            },
          ],
          memory: [
            {
              id: "stack-this",
              name: "run_later() stack frame",
              segment: "STACK",
              baseAddress: "0x7ffee4b2a890",
              status: isPtrMode ? "dangling" : "alive",
              cells: [
                isPtrMode
                  ? { offset: "+0x00", size: 4, label: "<dead Job>", value: "Illegal dereference!", hex: "dd dd dd dd", state: "ub", address: "0x7ffee4b2a890", changed: true }
                  : { offset: "+0x10", size: 4, label: "task.__copy.factor", value: "3 (safe read)", hex: "03 00 00 00", state: "alive", address: "0x7ffee4b2a8a0" },
              ],
            },
          ],
          callStack: [
            { id: "f-l", fn: "__lambda::operator()", file: "this_capture.cpp", line: 4, addr: "0x7ffee4b2a8a0", isCurrent: true },
            { id: "f-rl", fn: "run_later", file: "this_capture.cpp", line: 9, addr: "0x7ffee4b2a8a0" },
          ],
        },
      ],
    },
    {
      id: "stateless-cpp23",
      label: "3. Stateless, +[] & C++23 static ()",
      subtitle: "Empty closure (1B), function-pointer conversion & static/recursive operator()",
      filename: "stateless_cpp23.cpp",
      standard: "C++23",
      target: "x86-64 SysV ABI",
      defaultBreakpoints: [2, 4],
      source: [
        "void modern_closures() {",
        "  int (*fn)(int) = +[](int x) { return x + 1; }; // -> C fn ptr",
        "  auto dbl = [](int x) static { return x * 2; }; // no hidden this!",
        "  auto fib = [](this auto self, int n) -> int {  // C++23 recursion",
        "    return n <= 1 ? n : self(n - 1) + self(n - 2);",
        "  };",
        "}",
      ],
      steps: [
        {
          id: "sl-fnptr",
          label: "+[] triggers constexpr conversion to plain C function pointer",
          line: 2,
          verdict: { tone: "safe", label: "DECAYED · 1B empty class -> int(*)(int)" },
          clause: "[expr.prim.lambda.closure]/9",
          summary:
            "A captureless lambda has size 1B (empty class) and an implicit constexpr conversion operator to a matching function pointer. Unary + forces conversion to __invoke at 0x401620.",
          inlineHints: {
            2: { text: "fn = 0x401620", tone: "safe" },
          },
          registersTitle: "Closure Traits",
          registers: [
            { name: "synthesized_struct", value: "struct __lambda_fn {}; // empty", tone: "safe" },
            { name: "sizeof(closure)", value: "1 byte (no captures)" },
            { name: "operator int(*)(int)", value: "0x401620 (__invoke)", changed: true, tone: "safe" },
            { name: "copyable / fn*", value: "Default-ctored (C++20) | fn*: YES" },
          ],
          watches: [
            { id: "ws-fn", expr: "fn", value: "0x401620 (__lambda::__invoke)", type: "int(*)(int)", address: "0x401620", changed: true, tone: "safe", badge: "FN PTR" },
          ],
          memory: [
            {
              id: "ro-invoke",
              name: ".text Static Invoker Thunk",
              segment: "RODATA",
              baseAddress: "0x401620",
              status: "static",
              statusLabel: "STATELESS INVOKER",
              cells: [
                { offset: "+0x00", size: 8, label: "__invoke(int)", value: "lea eax, [rdi + 1]; ret", hex: "8d 47 01 c3", state: "rodata", address: "0x401620", changed: true },
              ],
            },
          ],
          callStack: [
            { id: "f-mod", fn: "modern_closures", file: "stateless_cpp23.cpp", line: 2, addr: "0x7ffee4b2a880", isCurrent: true },
          ],
          disasmTitle: "Stateless ABI",
          disasm: [
            { addr: "0x401620", op: "lea", operands: "eax, [rdi + 1]", comment: "edi = x directly; no hidden closure pointer", active: true },
            { addr: "0x401623", op: "ret", operands: "" },
          ],
        },
        {
          id: "sl-static",
          label: "C++23 static operator() drops unused hidden this from ABI",
          line: 3,
          verdict: { tone: "safe", label: "C++23 STATIC () · Zero closure register arg" },
          clause: "[expr.prim.lambda.closure]/5",
          summary:
            "Non-static operator() on a captureless lambda still reserves rdi for an unused closure pointer when called directly. C++23 `static` turns operator() into a static member function so edi carries x directly.",
          inlineHints: {
            3: { text: "edi = x (no this)", tone: "safe" },
          },
          registersTitle: "Closure Traits",
          registers: [
            { name: "synthesized_struct", value: "struct __lambda_dbl { static int operator()(int); };", changed: true, tone: "safe" },
            { name: "abi rdi", value: "x (NO unused closure this!)", changed: true, tone: "safe" },
            { name: "operator()()", value: "static int operator()(int)" },
          ],
          watches: [
            { id: "ws-dbl", expr: "dbl", value: "stateless with static operator()", type: "__lambda_dbl (1B)", tone: "safe", badge: "C++23 STATIC" },
          ],
          memory: [
            {
              id: "ro-dbl",
              name: ".text static operator()(int)",
              segment: "RODATA",
              baseAddress: "0x401640",
              status: "static",
              cells: [
                { offset: "+0x00", size: 4, label: "dbl::operator()", value: "lea eax, [rdi + rdi]; ret", hex: "8d 04 3f c3", state: "rodata", address: "0x401640", changed: true },
              ],
            },
          ],
          callStack: [
            { id: "f-mod", fn: "modern_closures", file: "stateless_cpp23.cpp", line: 3, addr: "0x7ffee4b2a880", isCurrent: true },
          ],
        },
        {
          id: "sl-deducing-this",
          label: "C++23 [this auto self] enables recursion with zero std::function",
          line: 4,
          verdict: { tone: "safe", label: "SELF-RECURSIVE · Zero type erasure" },
          clause: "[dcl.fct] §9.3.4.6",
          summary:
            "Naming explicit object parameter `this auto self` exposes the closure itself inside the body so fib recurses directly with full inlining—no std::function wrapper needed.",
          inlineHints: {
            4: { text: "0 overhead recursion", tone: "safe" },
          },
          registersTitle: "Closure Traits",
          registers: [
            { name: "synthesized_struct", value: "struct __lambda_fib { template<class Self> int operator()(this Self, int); };", changed: true, tone: "safe" },
            { name: "heap allocs", value: "0 (direct template recursion)", tone: "safe" },
          ],
          watches: [
            { id: "ws-fib", expr: "self (deduced)", value: "__lambda_fib (passed by value, 1B)", type: "explicit object param", tone: "safe", changed: true },
          ],
          memory: [
            {
              id: "stack-fib",
              name: "fib direct recursion",
              segment: "STACK",
              baseAddress: "0x7ffee4b2a880",
              status: "alive",
              cells: [
                { offset: "+0x00", size: 1, label: "fib (1B empty)", value: "recursing with self(n - 1)", hex: "00", state: "alive", address: "0x7ffee4b2a880" },
              ],
            },
          ],
          callStack: [
            { id: "f-fib", fn: "__lambda_fib::operator()<__lambda_fib>", args: "n=5", file: "stateless_cpp23.cpp", line: 5, addr: "0x7ffee4b2a880", isCurrent: true },
          ],
        },
      ],
    },
    {
      id: "type-erased-wrappers",
      label: "4. std::function vs move_only_function",
      subtitle: "SBO vs heap spill, move-only C++23 wrapper & C++26 function_ref",
      filename: "callable_wrappers.cpp",
      standard: "C++26",
      target: "LP64",
      topicSlugs: ["callable-wrappers"],
      defaultBreakpoints: [3, 5, 7],
      quickWatches: [
        { expr: "sbo", note: "SBO std::function (32B)" },
        { expr: "heap", note: "Heap-spilled std::function" },
        { expr: "mof", note: "C++23 move_only_function" },
      ],
      source: [
        "void erase_callables() {",
        "  int x = 7; std::array<int, 12> big{};",
        "  std::function<int()> sbo = [x]() { return x; };",
        "  std::function<int()> heap = [big]() { return big[0]; };",
        "  auto ptr = std::make_unique<int>(42);",
        "  // std::function rejects move-only; C++23 & C++26:",
        "  std::move_only_function<int() const> mof =",
        "    [p = std::move(ptr)]() { return *p; };",
        "  std::function_ref<int() const> ref = mof;",
        "}",
      ],
      steps: [
        {
          id: "cw-sbo",
          label: "sbo fits 4B closure inside std::function's inline SBO buffer",
          line: 3,
          verdict: { tone: "safe", label: "SBO INLINE · 0 heap allocations (4B <= 16B)" },
          clause: "[func.wrap.func] §22.10.17.3",
          summary:
            "std::function (typically 32B) reserves an inline Small Buffer (~16B). Storing a 4B closure fits directly inside sbo on the stack with zero malloc calls.",
          inlineHints: {
            3: { text: "SBO inline (0 allocs)", tone: "safe" },
          },
          registersTitle: "Wrapper Traits",
          registers: [
            { name: "synthesized_struct", value: "struct __lambda_small { int x; };", tone: "info" },
            { name: "wrapper_storage", value: "Inline SBO (stack)", changed: true, tone: "safe" },
            { name: "copyable / const?", value: "Copyable: Yes | const sig: No (C++11)" },
          ],
          watches: [
            { id: "wc-sm", expr: "sbo", value: "{ SBO=__lambda_small{7}, invoker=0x401800 }", type: "std::function<int()> (32B)", address: "0x7ffee4b2a8a0", changed: true, tone: "safe", badge: "SBO" },
          ],
          memory: [
            {
              id: "stack-cw",
              name: "sbo std::function (32B)",
              segment: "STACK",
              baseAddress: "0x7ffee4b2a8a0",
              status: "alive",
              statusLabel: "SBO ACTIVE",
              cells: [
                { offset: "+0x00", size: 16, label: "SBO __functor", value: "__lambda_small { x = 7 }", hex: "07 00 00 00 ...", state: "alive", address: "0x7ffee4b2a8a0", changed: true },
                { offset: "+0x10", size: 8, label: "__manager", value: "&__func_mgr", hex: "20 18 40 00 00 00 00 00", state: "vptr", address: "0x7ffee4b2a8b0" },
                { offset: "+0x18", size: 8, label: "__invoker", value: "&__invoke", hex: "00 18 40 00 00 00 00 00", state: "vptr", address: "0x7ffee4b2a8b8" },
              ],
            },
          ],
          callStack: [
            { id: "f-cw", fn: "erase_callables", file: "callable_wrappers.cpp", line: 3, addr: "0x7ffee4b2a8a0", isCurrent: true },
          ],
        },
        {
          id: "cw-heap",
          label: "heap_fn spills 48B capture struct onto heap (0x600001a04000)",
          line: 4,
          verdict: { tone: "warn", label: "HEAP SPILL · 48B closure > SBO limit" },
          clause: "[func.wrap.func.con]",
          summary:
            "Capturing std::array<int, 12> produces a 48-byte closure that exceeds std::function's inline SBO capacity, forcing a dynamic heap allocation at 0x600001a04000.",
          inlineHints: {
            4: { text: "heap @ 0x600001a04000", tone: "warn" },
          },
          registersTitle: "Wrapper Traits",
          registers: [
            { name: "synthesized_struct", value: "struct __lambda_big { array<int,12> big; };", tone: "warn" },
            { name: "wrapper_storage", value: "Heap @ 0x600001a04000 (48B)", changed: true, tone: "warn" },
          ],
          watches: [
            { id: "wc-hg", expr: "heap", value: "{ ptr=0x600001a04000, invoker=0x401860 }", type: "std::function<int()> (32B)", address: "0x7ffee4b2a880", changed: true, tone: "warn", badge: "HEAP" },
          ],
          memory: [
            {
              id: "stack-cw2",
              name: "heap std::function (32B)",
              segment: "STACK",
              baseAddress: "0x7ffee4b2a880",
              status: "alive",
              cells: [
                { offset: "+0x00", size: 8, label: "__functor ptr", value: "0x600001a04000", hex: "00 40 a0 01 00 60 00 00", state: "alive", address: "0x7ffee4b2a880", pointsTo: "0x600001a04000", changed: true },
              ],
            },
            {
              id: "heap-cw",
              name: "Spilled 48B Closure",
              segment: "HEAP",
              baseAddress: "0x600001a04000",
              status: "alive",
              statusLabel: "48B HEAP ALLOC",
              cells: [
                { offset: "+0x00", size: 48, label: "__lambda_big.big", value: "std::array<int, 12>{}", hex: "00 00 00 00 ...", state: "alive", address: "0x600001a04000", changed: true },
              ],
            },
          ],
          callStack: [
            { id: "f-cw", fn: "erase_callables", file: "callable_wrappers.cpp", line: 4, addr: "0x7ffee4b2a880", isCurrent: true },
          ],
        },
        {
          id: "cw-mof-ref",
          label: "move_only_function owns unique_ptr lambda; function_ref borrows in 16B",
          line: 9,
          verdict: { tone: "safe", label: "C++23/26 · Move-only owned, 16B non-owning ref" },
          clause: "[func.wrap.move] & [func.wrap.ref]",
          summary:
            "std::function requires copyability and rejects [p = std::move(ptr)]. C++23 std::move_only_function<int() const> moves the 8B closure cleanly (const-qualified!) and C++26 std::function_ref borrows it in 16B ({ obj*, thunk* }) with zero allocations.",
          inlineHints: {
            7: { text: "SBO 8B move-only", tone: "safe" },
            9: { text: "16B { &mof, thunk }", tone: "info" },
          },
          registersTitle: "Wrapper Traits",
          registers: [
            { name: "synthesized_struct", value: "struct __lambda_mof { unique_ptr<int> p; };", tone: "safe" },
            { name: "mof (C++23)", value: "Owns via SBO (8B), supports const", changed: true, tone: "safe" },
            { name: "ref (C++26)", value: "Non-owning 16B { obj*, thunk* }", changed: true, tone: "info" },
          ],
          watches: [
            { id: "wc-mof", expr: "mof", value: "move_only_function { SBO __lambda_mof }", type: "std::move_only_function<int() const>", address: "0x7ffee4b2a860", changed: true, tone: "safe", badge: "C++23" },
            { id: "wc-ref", expr: "ref", value: "{ obj=0x7ffee4b2a860, thunk=0x401900 }", type: "std::function_ref<int() const> (16B)", address: "0x7ffee4b2a850", changed: true, tone: "info", badge: "C++26 VIEW" },
          ],
          memory: [
            {
              id: "stack-mof",
              name: "mof + function_ref (stack)",
              segment: "STACK",
              baseAddress: "0x7ffee4b2a850",
              status: "alive",
              cells: [
                { offset: "+0x10", size: 8, label: "mof.p (SBO)", value: "0x600001408000", hex: "00 80 40 01 00 60 00 00", state: "alive", address: "0x7ffee4b2a860", pointsTo: "0x600001408000", changed: true },
                { offset: "+0x00", size: 16, label: "ref {obj, thunk}", value: "0x7ffee4b2a860, 0x401900", hex: "60 a8 b2 e4 fe 7f 00 00 ...", state: "alive", address: "0x7ffee4b2a850", pointsTo: "0x7ffee4b2a860", changed: true },
              ],
            },
          ],
          callStack: [
            { id: "f-cw", fn: "erase_callables", file: "callable_wrappers.cpp", line: 9, addr: "0x7ffee4b2a850", isCurrent: true },
          ],
        },
      ],
    },
  ];
}
