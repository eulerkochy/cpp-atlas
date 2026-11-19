import type { RadScenario } from "@/components/rad-debugger/types";

export type OrderMode = "nonatomic" | "relaxed" | "acq_rel" | "seq_cst";

function orderToken(mode: OrderMode): string {
  switch (mode) {
    case "nonatomic":
      return "/* non-atomic */";
    case "relaxed":
      return "std::memory_order_relaxed";
    case "acq_rel":
      return "std::memory_order_acquire / release";
    case "seq_cst":
      return "std::memory_order_seq_cst";
  }
}

export function buildMemoryModelScenarios(mode: OrderMode): RadScenario[] {
  const isSafeMp = mode === "acq_rel" || mode === "seq_cst";
  const isSafeSb = mode === "seq_cst";
  const storeOrder =
    mode === "acq_rel"
      ? "std::memory_order_release"
      : mode === "seq_cst"
        ? "std::memory_order_seq_cst"
        : "std::memory_order_relaxed";
  const loadOrder =
    mode === "acq_rel"
      ? "std::memory_order_acquire"
      : mode === "seq_cst"
        ? "std::memory_order_seq_cst"
        : "std::memory_order_relaxed";

  const mpSource =
    mode === "nonatomic"
      ? [
          "int data = 0;",
          "bool flag = false; // non-atomic!",
          "void producer_t1() {",
          "  data = 42;",
          "  flag = true;",
          "}",
          "void consumer_t2() {",
          "  while (!flag) {}",
          "  assert(data == 42);",
          "}",
        ]
      : [
          "int data = 0;",
          "std::atomic<bool> flag{false};",
          "void producer_t1() {",
          "  data = 42;",
          `  flag.store(true, ${storeOrder});`,
          "}",
          "void consumer_t2() {",
          `  while (!flag.load(${loadOrder})) {}`,
          "  assert(data == 42);",
          "}",
        ];

  const sbSource =
    mode === "nonatomic"
      ? [
          "int x = 0, y = 0; // non-atomic!",
          "void t1() {",
          "  x = 1;",
          "  int r1 = y;",
          "}",
          "void t2() {",
          "  y = 1;",
          "  int r2 = x;",
          "}",
        ]
      : [
          "std::atomic<int> x{0}, y{0};",
          "void t1() {",
          `  x.store(1, ${storeOrder});`,
          `  int r1 = y.load(${loadOrder});`,
          "}",
          "void t2() {",
          `  y.store(1, ${storeOrder});`,
          `  int r2 = x.load(${loadOrder});`,
          "}",
        ];

  return [
    {
      id: "message-passing",
      label: "1. Message Passing (MP)",
      subtitle: `Publish-subscribe payload & flag (${orderToken(mode)})`,
      filename: "litmus_mp.cpp",
      standard: "C++23",
      target: "Multi-Core (ARM64 / x86-64)",
      topicSlugs: ["atomics-and-memory-ordering"],
      defaultBreakpoints: [5, 9],
      quickWatches: [
        { expr: "data", note: "Shared non-atomic payload" },
        { expr: "flag", note: "Synchronization flag" },
      ],
      source: mpSource,
      steps: [
        {
          id: "mp-write-data",
          label: "T1 stores data = 42 in Core 0 store buffer",
          line: 4,
          verdict: { tone: "info", label: "BUFFERED · Core 0 local store" },
          clause: "[intro.races] §6.9.2",
          summary:
            "Thread 1 writes data = 42. On weakly ordered hardware, the write sits in Core 0's private store buffer before draining to coherent L3 cache.",
          inlineHints: {
            4: { text: "Core0 SB: [data=42], L3: data=0", tone: "info" },
          },
          registersTitle: "Core & Ordering State",
          registers: [
            { name: "order_mode", value: mode, tone: "info" },
            { name: "Core0 StoreBuf", value: "data = 42", changed: true, tone: "warn" },
            { name: "L3 Cache (data)", value: "0 (stale)" },
            { name: "happens-before", value: "Pending store/load edge" },
          ],
          watches: [
            {
              id: "w-data",
              expr: "data (L3 coherent)",
              value: "0 (Core 0 SB has 42)",
              type: "int",
              address: "0x100408000",
              changed: true,
              tone: "warn",
            },
            {
              id: "w-flag",
              expr: "flag",
              value: "false",
              type: mode === "nonatomic" ? "bool" : "std::atomic<bool>",
              address: "0x100408004",
            },
          ],
          memory: [
            {
              id: "cache-sb0",
              name: "Core 0 Store Buffer",
              segment: "CACHE",
              baseAddress: "0xc0re0000",
              status: "buffer",
              statusLabel: "PRIVATE CORE 0",
              cells: [
                {
                  offset: "+0x00",
                  size: 4,
                  label: "pending data",
                  value: "42 (unflushed)",
                  hex: "2a 00 00 00",
                  state: "moved",
                  address: "0xc0re0000",
                  changed: true,
                },
              ],
            },
            {
              id: "cache-l3",
              name: "Shared Coherent L3",
              segment: "STATIC",
              baseAddress: "0x100408000",
              status: "alive",
              statusLabel: "GLOBAL MEMORY",
              cells: [
                {
                  offset: "+0x00",
                  size: 4,
                  label: "data",
                  value: "0",
                  hex: "00 00 00 00",
                  state: "alive",
                  address: "0x100408000",
                },
                {
                  offset: "+0x04",
                  size: 1,
                  label: "flag",
                  value: "false (0x00)",
                  hex: "00",
                  state: "alive",
                  address: "0x100408004",
                },
              ],
            },
          ],
          callStack: [
            {
              id: "t1",
              thread: "T1",
              fn: "producer_t1",
              file: "litmus_mp.cpp",
              line: 4,
              addr: "0x700001000800",
              isCurrent: true,
            },
            {
              id: "t2",
              thread: "T2",
              fn: "consumer_t2",
              file: "litmus_mp.cpp",
              line: 8,
              addr: "0x700002000800",
            },
          ],
        },
        {
          id: "mp-publish-flag",
          label: `T1 publishes flag = true (${mode})`,
          line: 5,
          verdict: isSafeMp
            ? { tone: "safe", label: "ORDERED · data=42 committed before flag" }
            : { tone: "danger", label: "REORDERED · flag=1 visible before data=42!" },
          clause: isSafeMp ? "[atomics.order] §33.5.4" : "[intro.races] §6.9.2",
          summary: isSafeMp
            ? `${mode} barrier flushes data = 42 from Core 0's store buffer to L3 BEFORE flag = true becomes observable, establishing a release-acquire bridge.`
            : mode === "nonatomic"
              ? "Without std::atomic, the compiler may reorder flag = true before data = 42 or hoist while (!flag) into an infinite loop. Immediate Data Race UB."
              : "relaxed imposes zero ordering around other writes: Core 0 / compiler can make flag = 1 visible in L3 while data = 42 is still buffered!",
          inlineHints: {
            5: {
              text: isSafeMp
                ? "Release fence: L3 sees data=42, then flag=1"
                : "L3 sees flag=1 while data is STILL 0!",
              tone: isSafeMp ? "safe" : "danger",
            },
          },
          registersTitle: "Core & Ordering State",
          registers: [
            { name: "Core0 StoreBuf", value: isSafeMp ? "EMPTY (flushed)" : "data=42 (STILL BUFFERED!)", changed: true, tone: isSafeMp ? "safe" : "danger" },
            { name: "L3 data", value: isSafeMp ? "42" : "0 (STALE!)", changed: true, tone: isSafeMp ? "safe" : "danger" },
            { name: "L3 flag", value: "true (1)", changed: true },
            { name: "synchronizes-with", value: isSafeMp ? "Established on load" : "NONE", tone: isSafeMp ? "safe" : "danger" },
          ],
          watches: [
            {
              id: "w-data",
              expr: "data (L3 visible)",
              value: isSafeMp ? "42" : "0 (race / stale!)",
              type: "int",
              address: "0x100408000",
              changed: true,
              tone: isSafeMp ? "safe" : "danger",
              badge: isSafeMp ? "PUBLISHED" : "STALE",
            },
            {
              id: "w-flag",
              expr: "flag (L3 visible)",
              value: "true (1)",
              type: mode === "nonatomic" ? "bool" : "std::atomic<bool>",
              address: "0x100408004",
              changed: true,
              tone: "info",
            },
          ],
          memory: [
            {
              id: "cache-sb0",
              name: "Core 0 Store Buffer",
              segment: "CACHE",
              baseAddress: "0xc0re0000",
              status: isSafeMp ? "alive" : "dangling",
              statusLabel: isSafeMp ? "FLUSHED IN ORDER" : "REORDERED",
              cells: [
                {
                  offset: "+0x00",
                  size: 4,
                  label: "Core0 SB",
                  value: isSafeMp
                    ? "<empty: data=42 drained before flag>"
                    : "data=42 trapped behind flag!",
                  hex: isSafeMp ? "00 00 00 00" : "2a 00 00 00",
                  state: isSafeMp ? "alive" : "ub",
                  address: "0xc0re0000",
                  changed: true,
                },
              ],
            },
            {
              id: "cache-l3",
              name: "Shared Coherent L3",
              segment: "STATIC",
              baseAddress: "0x100408000",
              status: isSafeMp ? "alive" : "dangling",
              statusLabel: isSafeMp ? "SYNCHRONIZED" : "TORN PUBLICATION",
              cells: [
                {
                  offset: "+0x00",
                  size: 4,
                  label: "data",
                  value: isSafeMp ? "42" : "0 (STALE!)",
                  hex: isSafeMp ? "2a 00 00 00" : "00 00 00 00",
                  state: isSafeMp ? "alive" : "ub",
                  address: "0x100408000",
                  changed: true,
                },
                {
                  offset: "+0x04",
                  size: 1,
                  label: "flag",
                  value: "true (0x01)",
                  hex: "01",
                  state: "alive",
                  address: "0x100408004",
                  changed: true,
                },
              ],
            },
          ],
          callStack: [
            {
              id: "t1",
              thread: "T1",
              fn: "producer_t1",
              file: "litmus_mp.cpp",
              line: 5,
              addr: "0x700001000800",
              isCurrent: true,
            },
            {
              id: "t2",
              thread: "T2",
              fn: "consumer_t2",
              file: "litmus_mp.cpp",
              line: 8,
              addr: "0x700002000800",
            },
          ],
          disasmTitle: "Barrier Lowering",
          disasm: [
            {
              addr: "0x401400",
              op: "mov",
              operands: "dword ptr [data], 42",
              comment: "Write payload",
            },
            {
              addr: "0x40140a",
              op: mode === "seq_cst" ? "xchg / stlr" : mode === "acq_rel" ? "stlr (ARM)" : "str / mov",
              operands: "byte ptr [flag], 1",
              comment: isSafeMp
                ? "Release semantics prevent upward/downward reordering"
                : "Plain store: store-store reordering allowed on ARM/POWER",
              active: true,
            },
          ],
        },
        {
          id: "mp-consume",
          label: "T2 reads flag == true and checks assert(data == 42)",
          line: 9,
          secondaryLine: { line: 5, thread: "T1" },
          verdict: isSafeMp
            ? { tone: "safe", label: "SAFE · data == 42 guaranteed" }
            : { tone: "danger", label: "DATA RACE UB · assert(data == 42) fails!" },
          clause: isSafeMp ? "[atomics.order]/2" : "[intro.races]/21",
          summary: isSafeMp
            ? "T1's store(release/seq_cst) synchronizes-with T2's load(acquire/seq_cst), creating a transitive happens-before chain: data = 42 happens-before assert(data == 42)."
            : "T2 sees flag == true with zero happens-before relationship to T1's write to data: concurrent un-synchronized access to non-atomic data is Undefined Behavior!",
          inlineHints: {
            9: {
              text: isSafeMp
                ? "happens-before verified -> data == 42"
                : "DATA RACE on data: observed 0 != 42 (UB)",
              tone: isSafeMp ? "safe" : "danger",
            },
          },
          registersTitle: "Happens-Before Graph",
          registers: [
            { name: "T1 sequenced-before", value: "data=42 -> flag=true", tone: "info" },
            { name: "synchronizes-with", value: isSafeMp ? "YES (release -> acquire)" : "NO", tone: isSafeMp ? "safe" : "danger" },
            { name: "T2 asserts", value: isSafeMp ? "data == 42 (PASS)" : "data == 0 (FAIL / UB)", changed: true, tone: isSafeMp ? "safe" : "danger" },
          ],
          watches: [
            {
              id: "w-t2-data",
              expr: "T2 observed data",
              value: isSafeMp ? "42 (PASS)" : "0 (UB / Assert Fail!)",
              type: "int",
              address: "0x100408000",
              changed: true,
              tone: isSafeMp ? "safe" : "danger",
              badge: isSafeMp ? "SAFE" : "RACE UB",
            },
          ],
          memory: [
            {
              id: "cache-l3",
              name: "Shared Coherent L3",
              segment: "STATIC",
              baseAddress: "0x100408000",
              status: isSafeMp ? "alive" : "dangling",
              statusLabel: isSafeMp ? "HAPPENS-BEFORE VALID" : "DATA RACE ON data",
              cells: [
                {
                  offset: "+0x00",
                  size: 4,
                  label: "data",
                  value: isSafeMp ? "42 (synchronized)" : "0 (racy load!)",
                  hex: isSafeMp ? "2a 00 00 00" : "00 00 00 00",
                  state: isSafeMp ? "alive" : "ub",
                  address: "0x100408000",
                },
                {
                  offset: "+0x04",
                  size: 1,
                  label: "flag",
                  value: "true (0x01)",
                  hex: "01",
                  state: "alive",
                  address: "0x100408004",
                },
              ],
            },
          ],
          callStack: [
            {
              id: "t2",
              thread: "T2",
              fn: "consumer_t2",
              file: "litmus_mp.cpp",
              line: 9,
              addr: "0x700002000800",
              isCurrent: true,
            },
            {
              id: "t1",
              thread: "T1",
              fn: "producer_t1",
              file: "litmus_mp.cpp",
              line: 5,
              addr: "0x700001000800",
            },
          ],
        },
      ],
    },
    {
      id: "store-buffering",
      label: "2. Store Buffering (SB)",
      subtitle: "Why acq_rel STILL allows r1==0 && r2==0 on x86-64!",
      filename: "litmus_sb.cpp",
      standard: "C++23",
      target: "x86-64 TSO / ARM64",
      defaultBreakpoints: [4, 8],
      quickWatches: [
        { expr: "r1", note: "T1 load of y" },
        { expr: "r2", note: "T2 load of x" },
      ],
      source: sbSource,
      steps: [
        {
          id: "sb-stores",
          label: "Both cores buffer stores locally (x=1 on C0, y=1 on C1)",
          line: 3,
          secondaryLine: { line: 7, thread: "T2" },
          verdict: isSafeSb
            ? { tone: "safe", label: "MFENCE · Stores drained into total order S" }
            : { tone: "warn", label: "BUFFERED · x=1, y=1 invisible to other core" },
          clause: "[atomics.order] §33.5.4",
          summary: isSafeSb
            ? "With memory_order_seq_cst, x86-64 emits XCHG/MFENCE after each store, stalling loads until the store buffer drains globally."
            : "Both Core 0 (x=1) and Core 1 (y=1) enqueue their stores in local store buffers. Neither release nor relaxed drains the store buffer before a following load!",
          inlineHints: {
            3: { text: isSafeSb ? "x=1 committed + MFENCE" : "Core0 SB: [x=1], L3: x=0", tone: isSafeSb ? "safe" : "warn" },
            7: { text: isSafeSb ? "y=1 committed + MFENCE" : "Core1 SB: [y=1], L3: y=0", tone: isSafeSb ? "safe" : "warn" },
          },
          watches: [
            {
              id: "sb-x",
              expr: "x (L3)",
              value: isSafeSb ? "1" : "0 (in Core0 SB)",
              type: mode === "nonatomic" ? "int" : "std::atomic<int>",
              address: "0x100409000",
              changed: true,
              tone: isSafeSb ? "safe" : "warn",
            },
            {
              id: "sb-y",
              expr: "y (L3)",
              value: isSafeSb ? "1" : "0 (in Core1 SB)",
              type: mode === "nonatomic" ? "int" : "std::atomic<int>",
              address: "0x100409004",
              changed: true,
              tone: isSafeSb ? "safe" : "warn",
            },
          ],
          memory: [
            {
              id: "sb-c0",
              name: "Core 0 Store Buffer",
              segment: "CACHE",
              baseAddress: "0xc0re0000",
              status: isSafeSb ? "alive" : "buffer",
              statusLabel: isSafeSb ? "DRAINED (MFENCE)" : "BUFFERED",
              cells: [
                {
                  offset: "+0x00",
                  size: 4,
                  label: "buffered x",
                  value: isSafeSb ? "<flushed to L3>" : "1 (hidden from Core 1)",
                  hex: isSafeSb ? "00 00 00 00" : "01 00 00 00",
                  state: isSafeSb ? "alive" : "moved",
                  address: "0xc0re0000",
                },
              ],
            },
            {
              id: "sb-c1",
              name: "Core 1 Store Buffer",
              segment: "CACHE",
              baseAddress: "0xc0re1000",
              status: isSafeSb ? "alive" : "buffer",
              statusLabel: isSafeSb ? "DRAINED (MFENCE)" : "BUFFERED",
              cells: [
                {
                  offset: "+0x00",
                  size: 4,
                  label: "buffered y",
                  value: isSafeSb ? "<flushed to L3>" : "1 (hidden from Core 0)",
                  hex: isSafeSb ? "00 00 00 00" : "01 00 00 00",
                  state: isSafeSb ? "alive" : "moved",
                  address: "0xc0re1000",
                },
              ],
            },
          ],
          callStack: [
            {
              id: "sb-t1",
              thread: "T1",
              fn: "t1",
              file: "litmus_sb.cpp",
              line: 3,
              addr: "0x700001000400",
              isCurrent: true,
            },
            {
              id: "sb-t2",
              thread: "T2",
              fn: "t2",
              file: "litmus_sb.cpp",
              line: 7,
              addr: "0x700002000400",
            },
          ],
        },
        {
          id: "sb-loads",
          label: "Both cores read opposite variable before stores drain",
          line: 4,
          secondaryLine: { line: 8, thread: "T2" },
          verdict: isSafeSb
            ? { tone: "safe", label: "FORBIDDEN · r1==0 && r2==0 impossible" }
            : mode === "nonatomic"
              ? { tone: "danger", label: "DATA RACE UB · concurrent non-atomic x,y" }
              : { tone: "warn", label: `ALLOWED (${mode}) · r1 == 0 && r2 == 0!` },
          clause: "[atomics.order] §33.5.4/4",
          summary: isSafeSb
            ? "seq_cst puts all four operations in one single total modification order S. Whichever store comes first in S is guaranteed visible to the other core's load."
            : mode === "acq_rel"
              ? "Crucial insight: store(release) followed by load(acquire) STILL allows store-then-load bypassing even on x86-64! Neither acquire nor release forbids r1 == 0 && r2 == 0."
              : "Store-load reordering lets both cores read stale 0 from L3 while their own 1 sits in their local store buffer.",
          inlineHints: {
            4: { text: isSafeSb ? "r1 = 1 (or r2 = 1)" : "r1 = 0 (bypassed Core0 SB!)", tone: isSafeSb ? "safe" : "warn" },
            8: { text: isSafeSb ? "at least one == 1" : "r2 = 0 (bypassed Core1 SB!)", tone: isSafeSb ? "safe" : "warn" },
          },
          watches: [
            {
              id: "sb-r1",
              expr: "r1 (T1)",
              value: isSafeSb ? "1 (if T2 won S)" : "0 (LEGAL outcome!)",
              type: "int",
              address: "0x700001000410",
              changed: true,
              tone: isSafeSb ? "safe" : "warn",
            },
            {
              id: "sb-r2",
              expr: "r2 (T2)",
              value: isSafeSb ? "1" : "0 (LEGAL outcome!)",
              type: "int",
              address: "0x700002000410",
              changed: true,
              tone: isSafeSb ? "safe" : "warn",
            },
          ],
          memory: [
            {
              id: "sb-l3",
              name: "Shared Coherent L3",
              segment: "STATIC",
              baseAddress: "0x100409000",
              status: isSafeSb ? "alive" : "dangling",
              statusLabel: isSafeSb ? "TOTAL ORDER S" : "STORE-LOAD BYPASS",
              cells: [
                {
                  offset: "+0x00",
                  size: 4,
                  label: "x (observed by T2)",
                  value: isSafeSb ? "1" : "0 during T2 load",
                  hex: isSafeSb ? "01 00 00 00" : "00 00 00 00",
                  state: isSafeSb ? "alive" : "moved",
                  address: "0x100409000",
                },
                {
                  offset: "+0x04",
                  size: 4,
                  label: "y (observed by T1)",
                  value: isSafeSb ? "1" : "0 during T1 load",
                  hex: isSafeSb ? "01 00 00 00" : "00 00 00 00",
                  state: isSafeSb ? "alive" : "moved",
                  address: "0x100409004",
                },
              ],
            },
          ],
          callStack: [
            {
              id: "sb-t1",
              thread: "T1",
              fn: "t1",
              file: "litmus_sb.cpp",
              line: 4,
              addr: "0x700001000400",
              isCurrent: true,
            },
            {
              id: "sb-t2",
              thread: "T2",
              fn: "t2",
              file: "litmus_sb.cpp",
              line: 8,
              addr: "0x700002000400",
            },
          ],
        },
      ],
    },
    {
      id: "aba-hazard",
      label: "3. Lock-Free ABA & Hazard Pointers",
      subtitle: "Treiber stack CAS pointer reuse bug vs C++26 std::hazard_pointer",
      filename: "treiber_aba.cpp",
      standard: "C++26",
      target: "Lock-Free CAS",
      topicSlugs: ["lock-free-programming-and-aba", "hazard-pointers-and-rcu"],
      defaultBreakpoints: [5, 9],
      quickWatches: [
        { expr: "head", note: "Atomic stack top pointer" },
        { expr: "old_head", note: "T1 stale snapshot" },
        { expr: "hp", note: "C++26 hazard pointer guard" },
      ],
      source: [
        "struct Node { int val; Node* next; };",
        "std::atomic<Node*> head; // initially A -> B -> C",
        "Node* unsafe_pop() {",
        "  Node* old = head.load(std::memory_order_acquire);",
        "  Node* nxt = old->next; // PREEMPTED! T2 pops A, B & reuses A",
        "  if (head.compare_exchange_weak(old, nxt)) return old; // ABA BUG!",
        "}",
        "Node* safe_pop(std::hazard_pointer& hp) {",
        "  Node* old = hp.protect(head); // T2 cannot free/reuse A!",
        "  return head.compare_exchange_weak(old, old->next) ? old : nullptr;",
        "}",
      ],
      steps: [
        {
          id: "aba-snap",
          label: "T1 snapshots old = A (0x600001000000), nxt = B",
          line: 5,
          verdict: { tone: "info", label: "PREEMPTED · T1 holds old=A, nxt=B" },
          clause: "[atomics.types.operations]",
          summary:
            "T1 reads head = A and A->next = B, then is preempted right before executing compare_exchange_weak(head, B).",
          inlineHints: {
            5: { text: "T1 local: old=0x600001000000, nxt=0x600001000020", tone: "info" },
          },
          watches: [
            {
              id: "aba-head",
              expr: "head",
              value: "A (0x600001000000) -> B -> C",
              type: "std::atomic<Node*>",
              address: "0x600001000000",
              tone: "info",
            },
            {
              id: "aba-old",
              expr: "T1::old",
              value: "0x600001000000 (Node A)",
              type: "Node*",
              address: "0x600001000000",
              changed: true,
            },
            {
              id: "aba-nxt",
              expr: "T1::nxt",
              value: "0x600001000020 (Node B)",
              type: "Node*",
              address: "0x600001000020",
              changed: true,
            },
          ],
          memory: [
            {
              id: "aba-heap",
              name: "Lock-free pool nodes",
              segment: "HEAP",
              baseAddress: "0x600001000000",
              status: "alive",
              statusLabel: "A -> B -> C",
              cells: [
                {
                  offset: "+0x00",
                  size: 16,
                  label: "Node A",
                  value: "val=1, next=0x600001000020 (B)",
                  hex: "01 00 00 00 ... 20 00 00 01 00 60 00 00",
                  state: "alive",
                  address: "0x600001000000",
                  pointsTo: "0x600001000020",
                },
                {
                  offset: "+0x20",
                  size: 16,
                  label: "Node B",
                  value: "val=2, next=0x600001000040 (C)",
                  hex: "02 00 00 00 ... 40 00 00 01 00 60 00 00",
                  state: "alive",
                  address: "0x600001000020",
                  pointsTo: "0x600001000040",
                },
              ],
            },
          ],
          callStack: [
            {
              id: "t1",
              thread: "T1",
              fn: "unsafe_pop",
              file: "treiber_aba.cpp",
              line: 5,
              addr: "0x700001000200",
              isCurrent: true,
            },
          ],
        },
        {
          id: "aba-bug",
          label: "T2 reuses A at 0x600001000000; T1 CAS sets head = freed B!",
          line: 6,
          verdict: { tone: "danger", label: "ABA CORRUPTION · head points to freed B!" },
          clause: "[saferecl.hp.general] (C++26)",
          summary:
            "While T1 slept, T2 popped A and freed B, then reallocated a fresh node at the recycled address A (0x600001000000) pointing to C. T1's CAS sees head == 0x600001000000, succeeds blindly, and points head at freed B!",
          inlineHints: {
            6: { text: "CAS matched 0x600001000000 -> head = FREED B!", tone: "danger" },
          },
          watches: [
            {
              id: "aba-head",
              expr: "head (after T1 CAS)",
              value: "0x600001000020 (FREED B!)",
              type: "std::atomic<Node*>",
              address: "0x600001000020",
              changed: true,
              tone: "danger",
              badge: "UAF CORRUPT",
            },
          ],
          memory: [
            {
              id: "aba-heap",
              name: "Lock-free pool nodes",
              segment: "HEAP",
              baseAddress: "0x600001000000",
              status: "dangling",
              statusLabel: "ABA USE-AFTER-FREE",
              cells: [
                {
                  offset: "+0x00",
                  size: 16,
                  label: "Node A (recycled!)",
                  value: "val=99, next=0x600001000040 (C)",
                  hex: "63 00 00 00 ... 40 00 00 01 00 60 00 00",
                  state: "moved",
                  address: "0x600001000000",
                  changed: true,
                },
                {
                  offset: "+0x20",
                  size: 16,
                  label: "Node B (FREED!)",
                  value: "FREED by T2 — yet head now points here!",
                  hex: "fe fe fe fe fe fe fe fe",
                  state: "ub",
                  address: "0x600001000020",
                  changed: true,
                },
              ],
            },
          ],
          callStack: [
            {
              id: "t1",
              thread: "T1",
              fn: "unsafe_pop",
              file: "treiber_aba.cpp",
              line: 6,
              addr: "0x700001000200",
              isCurrent: true,
            },
          ],
        },
        {
          id: "aba-hp-fix",
          label: "C++26 std::hazard_pointer pins A so T2 cannot reuse it",
          line: 9,
          verdict: { tone: "safe", label: "PROTECTED · Hazard pointer blocks ABA reuse" },
          clause: "[saferecl.hp.holder] (P2530)",
          summary:
            "hp.protect(head) publishes 0x600001000000 into T1's globally scanned hazard slot. When T2 retires A, reclamation checks all hazard pointers, sees T1 protecting A, and defers freeing/reusing A!",
          inlineHints: {
            9: { text: "hp[T1] = 0x600001000000 (reclaim deferred)", tone: "safe" },
          },
          watches: [
            {
              id: "hp-slot",
              expr: "hp.slot_ptr",
              value: "0x600001000000 (pinned)",
              type: "std::hazard_pointer",
              address: "0x600001000000",
              changed: true,
              tone: "safe",
              badge: "PROTECTED",
            },
          ],
          memory: [
            {
              id: "aba-hp-table",
              name: "Global Hazard Pointer Registry",
              segment: "STATIC",
              baseAddress: "0x10040a000",
              status: "alive",
              statusLabel: "RECLAMATION GUARD",
              cells: [
                {
                  offset: "+0x00",
                  size: 8,
                  label: "hp[T1]",
                  value: "0x600001000000 (Node A protected)",
                  hex: "00 00 00 01 00 60 00 00",
                  state: "alive",
                  address: "0x10040a000",
                  pointsTo: "0x600001000000",
                  changed: true,
                },
              ],
            },
          ],
          callStack: [
            {
              id: "t1-safe",
              thread: "T1",
              fn: "safe_pop",
              file: "treiber_aba.cpp",
              line: 9,
              addr: "0x700001000200",
              isCurrent: true,
            },
          ],
        },
      ],
    },
  ];
}
