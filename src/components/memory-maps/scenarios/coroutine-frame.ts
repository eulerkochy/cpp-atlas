import type { RadScenario } from "@/components/rad-debugger/types";

export const COROUTINE_FRAME_SCENARIOS: RadScenario[] = [
  {
    id: "coro-lifecycle",
    label: "1. Coroutine Heap Frame Lifecycle",
    subtitle: "operator new frame, suspend_index, co_yield, resume() & destroy()",
    filename: "coro_lifecycle.cpp",
    standard: "C++23",
    target: "LP64",
    topicSlugs: ["coroutines"],
    defaultBreakpoints: [4, 6],
    quickWatches: [
      { expr: "__coro_frame", note: "Heap-allocated coroutine state" },
      { expr: "suspend_index", note: "Resume switch-table cursor" },
    ],
    source: [
      "Task parse_async(std::string s) { // param moved into heap frame",
      "  auto prefix = make_prefix();",
      "  co_yield prefix + s;          // suspend_index = 1",
      "  co_return;",
      "}",
      "void driver() {",
      "  Task t = parse_async(std::string{\"payload\"}); // initial_suspend",
      "  t.resume(); // enters body -> suspends at co_yield",
      "  t.resume(); // finishes -> final_suspend",
      "}             // ~Task() calls handle.destroy()",
    ],
    steps: [
      {
        id: "coro-alloc",
        label: "Call allocates 96B heap frame & moves s into +0x28 (initial_suspend)",
        line: 7,
        verdict: { tone: "info", label: "INITIAL_SUSPEND · Heap frame @ 0x600001802000" },
        clause: "[dcl.fct.def.coroutine] §9.5.4",
        summary:
          "Calling parse_async calls operator new(96) for the coroutine frame, moves std::string{\"payload\"} safely into the heap frame at +0x28, builds promise_type, and suspends at initial_suspend (suspend_index = 0).",
        inlineHints: {
          7: { text: "frame=0x600001802000 (idx=0, s moved-in)", tone: "info" },
        },
        registersTitle: "Coroutine State",
        registers: [
          { name: "frame_ptr", value: "0x600001802000", changed: true, tone: "info" },
          { name: "suspend_index", value: "0 (initial_suspend)", changed: true },
          { name: "done()", value: "false" },
          { name: "s storage", value: "Heap frame +0x28 (owned)", tone: "safe" },
        ],
        watches: [
          {
            id: "w-task",
            expr: "t (Task)",
            value: "{ handle=0x600001802000 }",
            type: "Task",
            address: "0x7ffee4b2a8c0",
            changed: true,
            tone: "info",
            children: [
              { id: "c-res", expr: "__frame.resume_fn", value: "&parse_async_resume", type: "void(*)(void*)", address: "0x600001802000" },
              { id: "c-idx", expr: "__frame.suspend_index", value: "0", type: "uint16_t", address: "0x600001802020", changed: true },
              { id: "c-s", expr: "__frame.s", value: '"payload" (moved into heap)', type: "std::string", address: "0x600001802028", tone: "safe", changed: true },
            ],
          },
        ],
        memory: [
          {
            id: "coro-heap",
            name: "Heap Coroutine Frame",
            segment: "CORO",
            baseAddress: "0x600001802000",
            status: "alive",
            statusLabel: "SUSPENDED AT IDX 0",
            cells: [
              { offset: "+0x00", size: 8, label: "resume_fn", value: "&parse_async_resume", hex: "40 12 40 00 00 00 00 00", state: "vptr", address: "0x600001802000" },
              { offset: "+0x08", size: 8, label: "destroy_fn", value: "&parse_async_destroy", hex: "90 12 40 00 00 00 00 00", state: "vptr", address: "0x600001802008" },
              { offset: "+0x10", size: 16, label: "promise_type", value: "{ value=\"\" }", hex: "00 00 00 00 ...", state: "alive", address: "0x600001802010" },
              { offset: "+0x20", size: 2, label: "suspend_index", value: "0 (initial)", hex: "00 00", state: "alive", address: "0x600001802020", changed: true },
              { offset: "+0x28", size: 24, label: "param s", value: '"payload" (safe owned copy)', hex: "70 61 79 6c 6f 61 64 00 ...", ascii: "payload.", state: "alive", address: "0x600001802028", changed: true },
              { offset: "+0x40", size: 24, label: "local prefix", value: "<unconstructed>", hex: "cc cc cc cc ...", state: "uninit", address: "0x600001802040" },
            ],
          },
        ],
        callStack: [
          { id: "f-drv", fn: "driver", file: "coro_lifecycle.cpp", line: 7, addr: "0x7ffee4b2a8c0", isCurrent: true },
          { id: "f-coro", fn: "parse_async [suspended idx=0]", file: "coro_lifecycle.cpp", line: 1, addr: "0x600001802000", isSuspended: true },
        ],
      },
      {
        id: "coro-yield",
        label: "t.resume() computes prefix & suspends at co_yield (idx=1)",
        line: 3,
        verdict: { tone: "safe", label: "SUSPENDED #1 · prefix + s yielded to promise" },
        clause: "[expr.yield] §7.6.17",
        summary:
          "Resuming enters parse_async, initializes local prefix directly inside the heap frame (+0x40), yields \"hdr:payload\" into promise, writes suspend_index = 1, and returns control to driver().",
        inlineHints: {
          3: { text: "promise.val=\"hdr:payload\", idx=1", tone: "safe" },
        },
        registersTitle: "Coroutine State",
        registers: [
          { name: "frame_ptr", value: "0x600001802000" },
          { name: "suspend_index", value: "1 (co_yield)", changed: true, tone: "safe" },
          { name: "promise.val", value: '"hdr:payload"', changed: true, tone: "safe" },
        ],
        watches: [
          {
            id: "w-frame",
            expr: "*__coro_frame",
            value: "suspended @ co_yield (idx=1)",
            type: "__parse_async_frame",
            address: "0x600001802000",
            changed: true,
            tone: "safe",
            children: [
              { id: "c-prom", expr: "promise.value", value: '"hdr:payload"', type: "std::string", address: "0x600001802010", changed: true, tone: "safe" },
              { id: "c-idx", expr: "suspend_index", value: "1", type: "uint16_t", address: "0x600001802020", changed: true },
              { id: "c-pref", expr: "prefix", value: '"hdr:" (lives across suspend!)', type: "std::string", address: "0x600001802040", changed: true, tone: "safe" },
            ],
          },
        ],
        memory: [
          {
            id: "coro-heap",
            name: "Heap Coroutine Frame",
            segment: "CORO",
            baseAddress: "0x600001802000",
            status: "alive",
            statusLabel: "SUSPENDED AT IDX 1",
            cells: [
              { offset: "+0x10", size: 16, label: "promise.value", value: '"hdr:payload"', hex: "68 64 72 3a 70 61 ...", ascii: "hdr:pa..", state: "alive", address: "0x600001802010", changed: true },
              { offset: "+0x20", size: 2, label: "suspend_index", value: "1 (co_yield)", hex: "01 00", state: "alive", address: "0x600001802020", changed: true },
              { offset: "+0x28", size: 24, label: "param s", value: '"payload"', hex: "70 61 79 6c 6f 61 64 00 ...", state: "alive", address: "0x600001802028" },
              { offset: "+0x40", size: 24, label: "local prefix", value: '"hdr:" (alive across suspend)', hex: "68 64 72 3a 00 ...", ascii: "hdr:....", state: "alive", address: "0x600001802040", changed: true },
            ],
          },
        ],
        callStack: [
          { id: "f-coro", fn: "parse_async_resume", args: "frame=0x600001802000", file: "coro_lifecycle.cpp", line: 3, addr: "0x600001802000", isCurrent: true },
          { id: "f-drv", fn: "driver", file: "coro_lifecycle.cpp", line: 8, addr: "0x7ffee4b2a8c0" },
        ],
      },
      {
        id: "coro-final",
        label: "Second resume reaches co_return -> final_suspend (done=true)",
        line: 4,
        verdict: { tone: "info", label: "FINAL_SUSPEND · Locals destroyed, handle.done()==true" },
        clause: "[dcl.fct.def.coroutine]/5",
        summary:
          "Jumping to case 1 resumes past co_yield, hits co_return, destroys local prefix and param s, sets resume_fn = nullptr (so done() returns true), and parks at final_suspend so ~Task() can safely read promise.",
        inlineHints: {
          4: { text: "resume_fn = nullptr (done()==true)", tone: "info" },
        },
        watches: [
          {
            id: "w-done",
            expr: "t.handle.done()",
            value: "true (resume_fn == nullptr)",
            type: "bool",
            changed: true,
            tone: "info",
          },
        ],
        memory: [
          {
            id: "coro-heap",
            name: "Heap Coroutine Frame",
            segment: "CORO",
            baseAddress: "0x600001802000",
            status: "alive",
            statusLabel: "FINAL_SUSPEND (AWAITING destroy)",
            cells: [
              { offset: "+0x00", size: 8, label: "resume_fn", value: "nullptr (signals done())", hex: "00 00 00 00 00 00 00 00", state: "moved", address: "0x600001802000", changed: true },
              { offset: "+0x10", size: 16, label: "promise.value", value: '"hdr:payload" (readable)', hex: "68 64 72 3a ...", state: "alive", address: "0x600001802010" },
              { offset: "+0x40", size: 24, label: "local prefix", value: "~string() destroyed", hex: "dd dd dd dd ...", state: "freed", address: "0x600001802040", changed: true },
            ],
          },
        ],
        callStack: [
          { id: "f-coro", fn: "parse_async_resume [final_suspend]", file: "coro_lifecycle.cpp", line: 4, addr: "0x600001802000", isSuspended: true, isCurrent: true },
          { id: "f-drv", fn: "driver", file: "coro_lifecycle.cpp", line: 9, addr: "0x7ffee4b2a8c0" },
        ],
      },
      {
        id: "coro-destroy",
        label: "~Task() calls handle.destroy() -> frees heap coroutine frame",
        line: 10,
        verdict: { tone: "safe", label: "DESTROYED · Heap frame freed cleanly" },
        clause: "[coroutine.handle.resumption]",
        summary:
          "Exiting driver() destroys Task t, whose destructor invokes handle.destroy(). That destroys promise_type and calls operator delete(0x600001802000).",
        inlineHints: {
          10: { text: "operator delete(0x600001802000)", tone: "safe" },
        },
        watches: [
          {
            id: "w-task",
            expr: "t (destroyed)",
            value: "handle freed",
            type: "Task",
            address: "0x600001802000",
            changed: true,
            tone: "neutral",
            badge: "FREED",
          },
        ],
        memory: [
          {
            id: "coro-heap",
            name: "Heap Coroutine Frame",
            segment: "CORO",
            baseAddress: "0x600001802000",
            status: "freed",
            statusLabel: "FREED (0 LEAKS)",
            cells: [
              { offset: "+0x00", size: 96, label: "freed coro frame", value: "returned via operator delete", hex: "fe fe fe fe ...", state: "freed", address: "0x600001802000", changed: true },
            ],
          },
        ],
        callStack: [
          { id: "f-drv", fn: "~Task -> handle.destroy()", file: "coro_lifecycle.cpp", line: 10, addr: "0x7ffee4b2a8c0", isCurrent: true },
        ],
      },
    ],
  },
  {
    id: "dangling-ref-trap",
    label: "2. Reference-Param Trap (UB)",
    subtitle: "Why const T& coroutine parameters dangle across initial_suspend",
    filename: "coro_ref_trap.cpp",
    standard: "C++23",
    target: "LP64",
    defaultBreakpoints: [2, 6],
    quickWatches: [
      { expr: "__frame.s", note: "Saved pointer into caller stack!" },
    ],
    source: [
      "Task parse_async(const std::string& s) { // TRAP: saves ptr, not string!",
      "  co_yield s; // UAF when resumed after caller's semicolon!",
      "}",
      "void driver() {",
      "  Task t = parse_async(std::string{\"payload\"}); // temp dies at ;",
      "  t.resume(); // DEREFERENCES DEAD STACK @ 0x7ffee4b2a880!",
      "}",
    ],
    steps: [
      {
        id: "trap-call",
        label: "Heap frame saves only const string* pointing to caller stack temp",
        line: 5,
        verdict: { tone: "warn", label: "DANGLING AT ; · Frame holds stack ptr" },
        clause: "[dcl.fct.def.coroutine]/13",
        summary:
          "Because parameter s is const std::string&, the heap frame stores an 8-byte pointer to caller's temporary (0x7ffee4b2a880). When line 5 finishes at the semicolon, that temporary is destroyed!",
        inlineHints: {
          5: { text: "temp @ 0x7ffee4b2a880 destroyed at ;!", tone: "danger" },
        },
        watches: [
          {
            id: "tr-s",
            expr: "__frame.s (const string&)",
            value: "0x7ffee4b2a880 (DEAD STACK TEMP!)",
            type: "const std::string*",
            address: "0x7ffee4b2a880",
            changed: true,
            tone: "danger",
            badge: "DANGLING",
          },
        ],
        memory: [
          {
            id: "trap-stack",
            name: "driver() temporary slot",
            segment: "STACK",
            baseAddress: "0x7ffee4b2a880",
            status: "freed",
            statusLabel: "DESTROYED AT SEMICOLON",
            cells: [
              { offset: "+0x00", size: 24, label: "<temp string>", value: "~string() ran at line 5 ;", hex: "dd dd dd dd ...", state: "freed", address: "0x7ffee4b2a880", changed: true },
            ],
          },
          {
            id: "trap-heap",
            name: "Heap Coroutine Frame",
            segment: "CORO",
            baseAddress: "0x600001802000",
            status: "dangling",
            statusLabel: "HOLDS DANGLING PTR",
            cells: [
              { offset: "+0x28", size: 8, label: "saved s ptr", value: "0x7ffee4b2a880", hex: "80 a8 b2 e4 fe 7f 00 00", state: "dangling", address: "0x600001802028", pointsTo: "0x7ffee4b2a880", changed: true },
            ],
          },
        ],
        callStack: [
          { id: "f-drv", fn: "driver", file: "coro_ref_trap.cpp", line: 5, addr: "0x7ffee4b2a8c0", isCurrent: true },
        ],
      },
      {
        id: "trap-uaf",
        label: "t.resume() dereferences freed stack slot -> Use-After-Free UB",
        line: 2,
        verdict: { tone: "danger", label: "UAF UB · Read freed stack temporary!" },
        clause: "[basic.life]/7",
        summary:
          "Resuming enters co_yield s and reads 0x7ffee4b2a880 after the temporary's lifetime ended. Always take coroutine parameters by value (std::string s) or span-safe lifetime!",
        inlineHints: {
          2: { text: "ASan: stack-use-after-return @ 0x7ffee4b2a880", tone: "danger" },
        },
        watches: [
          {
            id: "tr-uaf",
            expr: "*__frame.s",
            value: "<garbage / heap UAF>",
            type: "const std::string",
            address: "0x7ffee4b2a880",
            changed: true,
            tone: "danger",
            badge: "UAF UB",
          },
        ],
        memory: [
          {
            id: "trap-stack",
            name: "driver() temporary slot",
            segment: "STACK",
            baseAddress: "0x7ffee4b2a880",
            status: "dangling",
            statusLabel: "USE-AFTER-FREE",
            cells: [
              { offset: "+0x00", size: 24, label: "<dead temp>", value: "Accessed out of lifetime!", hex: "dd dd dd dd ...", state: "ub", address: "0x7ffee4b2a880" },
            ],
          },
        ],
        callStack: [
          { id: "f-coro", fn: "parse_async_resume", file: "coro_ref_trap.cpp", line: 2, addr: "0x600001802000", isCurrent: true },
          { id: "f-drv", fn: "driver", file: "coro_ref_trap.cpp", line: 6, addr: "0x7ffee4b2a8c0" },
        ],
      },
    ],
  },
  {
    id: "generator-symmetric",
    label: "3. C++23 std::generator & Symmetric Transfer",
    subtitle: "Tail-call jmp transfer (O(1) stack) + lazy range yielding",
    filename: "generator_sym.cpp",
    standard: "C++23",
    target: "x86-64 Tail Call",
    topicSlugs: ["coroutine-library-and-generators"],
    defaultBreakpoints: [3, 8],
    source: [
      "std::generator<int> seq(int n) {",
      "  for (int i = 0; i < n; ++i)",
      "    co_yield i * 10;",
      "}",
      "// Symmetric transfer awaiter avoids recursive stack growth:",
      "std::coroutine_handle<> await_suspend(std::coroutine_handle<> self) noexcept {",
      "  return continuation_; // compiled to JMP, not CALL!",
      "}",
    ],
    steps: [
      {
        id: "gen-sym",
        label: "Symmetric transfer returns coroutine_handle<> -> tail-call jmp",
        line: 7,
        verdict: { tone: "safe", label: "O(1) STACK · Tail-call jmp transfer" },
        clause: "[coro.generator] & [expr.await]",
        summary:
          "Returning a std::coroutine_handle<> from await_suspend guarantees symmetric transfer: the compiler destroys/suspends the current activation and executes an unconditional tail jump (`jmp`) to continuation_, preventing stack overflow across millions of coroutine hops.",
        inlineHints: {
          7: { text: "jmp continuation_ (0 stack frame growth)", tone: "safe" },
        },
        watches: [
          {
            id: "sym-next",
            expr: "continuation_",
            value: "0x600001806000",
            type: "std::coroutine_handle<>",
            address: "0x600001806000",
            changed: true,
            tone: "safe",
            badge: "TAIL JMP",
          },
        ],
        memory: [
          {
            id: "sym-coro",
            name: "Chained Generator Frames",
            segment: "CORO",
            baseAddress: "0x600001806000",
            status: "alive",
            statusLabel: "SYMMETRIC TRANSFER",
            cells: [
              { offset: "+0x00", size: 8, label: "active_coro", value: "0x600001806000", hex: "00 60 80 01 00 60 00 00", state: "alive", address: "0x600001806000", changed: true },
              { offset: "+0x10", size: 4, label: "yielded int", value: "20", hex: "14 00 00 00", state: "alive", address: "0x600001806010" },
            ],
          },
        ],
        callStack: [
          { id: "f-sym", fn: "await_suspend -> jmp [continuation_]", file: "generator_sym.cpp", line: 7, addr: "0x600001806000", isCurrent: true },
        ],
        disasmTitle: "Symmetric Transfer Tail Call",
        disasm: [
          { addr: "0x401920", op: "mov", operands: "rdi, qword ptr [rbx + 0x18]", comment: "Load next coroutine frame pointer" },
          { addr: "0x401924", op: "jmp", operands: "qword ptr [rdi]", comment: "Tail-call resume_fn(next); stack depth stays O(1)", active: true },
        ],
      },
    ],
  },
];
