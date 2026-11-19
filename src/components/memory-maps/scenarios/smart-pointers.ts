import type { RadScenario, RadStep } from "@/components/rad-debugger/types";

export type AllocStrategy = "make_shared" | "new_widget";

export interface SharedHistoryEntry {
  id: string;
  label: string;
  line: number;
  strong: number;
  weak: number;
  dtorRan: boolean;
  controlFreed: boolean;
  lockResult: "none" | "ok" | "expired";
  eventNote: string;
  clause: string;
}

function sharedEntryToStep(
  entry: SharedHistoryEntry,
  strategy: AllocStrategy
): RadStep {
  const internalWeak = entry.weak + (entry.strong > 0 ? 1 : 0);
  const widgetFreed =
    strategy === "new_widget" ? entry.dtorRan : entry.controlFreed;
  const isSingleBlock = strategy === "make_shared";

  const ctrlAddr = isSingleBlock ? "0x600001c00000" : "0x600001c08000";
  const widgetAddr = isSingleBlock ? "0x600001c00018" : "0x600001c02000";

  return {
    id: entry.id,
    label: entry.label,
    line: entry.line,
    verdict: entry.controlFreed
      ? { tone: "safe", label: "ALL FREED · strong=0, weak=0" }
      : entry.dtorRan && isSingleBlock
        ? {
            tone: "warn",
            label: "~Widget() RAN · Contiguous block PINNED by weak_ptr!",
          }
        : entry.dtorRan
          ? {
              tone: "info",
              label: "WIDGET FREED · Only 24B control block pinned by weak_ptr",
            }
          : {
              tone: "safe",
              label: `ALIVE · strong=${entry.strong}, weak=${entry.weak}`,
            },
    clause: entry.clause,
    summary: entry.eventNote,
    inlineHints: {
      [entry.line]: {
        text: entry.controlFreed
          ? "Control block + Widget freed"
          : entry.dtorRan
            ? `~Widget() ran! ctrl.weak=${internalWeak}`
            : `strong=${entry.strong}, ctrl.weak=${internalWeak}`,
        tone: entry.controlFreed
          ? "safe"
          : entry.dtorRan && isSingleBlock
            ? "warn"
            : "safe",
      },
    },
    registersTitle: "Atomic Refcounts",
    registers: [
      { name: "strategy", value: isSingleBlock ? "make_shared (1 alloc)" : "new Widget (2 allocs)", tone: "info" },
      { name: "ctrl->strong", value: String(entry.strong), changed: true, tone: entry.strong > 0 ? "safe" : "warn" },
      { name: "ctrl->weak (internal)", value: String(internalWeak), changed: true, note: `${entry.weak} user + ${entry.strong > 0 ? 1 : 0} strong-lock` },
      { name: "Widget heap bytes", value: widgetFreed ? "FREED" : entry.dtorRan ? "DESTROYED (PINNED!)" : "ALIVE", tone: widgetFreed ? "neutral" : entry.dtorRan ? "warn" : "safe" },
    ],
    watches: [
      {
        id: "sp-ctrl",
        expr: "control_block",
        value: entry.controlFreed
          ? "FREED"
          : `{ strong=${entry.strong}, weak=${internalWeak} }`,
        type: "_Sp_counted_base (24B)",
        address: ctrlAddr,
        changed: true,
        tone: entry.controlFreed ? "neutral" : entry.dtorRan ? "warn" : "safe",
        children: [
          { id: "c-str", expr: "__use_count (strong)", value: String(entry.strong), type: "std::atomic<long>", address: ctrlAddr },
          { id: "c-wk", expr: "__weak_count", value: String(internalWeak), type: "std::atomic<long>", address: `${ctrlAddr.slice(0, -1)}8` },
        ],
      },
      {
        id: "sp-wid",
        expr: "*sp1 (Widget)",
        value: entry.dtorRan
          ? widgetFreed
            ? "Freed (operator delete ran)"
            : "Destroyed (~Widget ran) — BYTES STILL PINNED!"
          : "Widget { id = 42 }",
        type: "Widget",
        address: widgetAddr,
        tone: entry.dtorRan ? "warn" : "safe",
        badge: entry.dtorRan ? (widgetFreed ? "FREED" : "PINNED") : "ALIVE",
      },
      ...(entry.lockResult !== "none"
        ? [
            {
              id: "sp-lock",
              expr: "wp1.lock()",
              value:
                entry.lockResult === "ok"
                  ? `Succeeded -> shared_ptr (strong=${entry.strong})`
                  : "Expired -> returned nullptr safely!",
              type: "std::shared_ptr<Widget>",
              tone: (entry.lockResult === "ok" ? "safe" : "info") as "safe" | "info",
              badge: entry.lockResult === "ok" ? "LOCKED" : "EXPIRED",
            },
          ]
        : []),
    ],
    memory: isSingleBlock
      ? [
          {
            id: "heap-combined",
            name: "Single Contiguous Allocation (make_shared)",
            segment: "HEAP",
            baseAddress: ctrlAddr,
            status: entry.controlFreed
              ? "freed"
              : entry.dtorRan
                ? "dangling"
                : "alive",
            statusLabel: entry.controlFreed
              ? "CONTIGUOUS BLOCK FREED"
              : entry.dtorRan
                ? "PINNED BY weak_ptr!"
                : "SINGLE BLOCK ALIVE",
            cells: [
              {
                offset: "+0x00",
                size: 24,
                label: "control_block",
                value: entry.controlFreed
                  ? "freed"
                  : `strong=${entry.strong}, weak=${internalWeak}`,
                hex: `0${entry.strong} 00 00 00 0${internalWeak} 00 00 00 ...`,
                state: entry.controlFreed ? "freed" : "alive",
                address: ctrlAddr,
                changed: true,
              },
              {
                offset: "+0x18",
                size: 32,
                label: "inline Widget (32B)",
                value: entry.controlFreed
                  ? "freed with block"
                  : entry.dtorRan
                    ? "~Widget() ran; bytes CANNOT be freed yet!"
                    : "Widget { id = 42 }",
                hex: entry.dtorRan ? "dd dd dd dd ..." : "2a 00 00 00 ...",
                state: entry.controlFreed
                  ? "freed"
                  : entry.dtorRan
                    ? "moved"
                    : "alive",
                address: widgetAddr,
                changed: entry.dtorRan,
              },
            ],
          },
        ]
      : [
          {
            id: "heap-ctrl",
            name: "Control Block Allocation (24B)",
            segment: "HEAP",
            baseAddress: ctrlAddr,
            status: entry.controlFreed ? "freed" : "alive",
            statusLabel: entry.controlFreed ? "FREED" : "ALIVE",
            cells: [
              {
                offset: "+0x00",
                size: 24,
                label: "control_block",
                value: entry.controlFreed
                  ? "freed"
                  : `strong=${entry.strong}, weak=${internalWeak}`,
                hex: `0${entry.strong} 00 00 00 0${internalWeak} 00 00 00 ...`,
                state: entry.controlFreed ? "freed" : "alive",
                address: ctrlAddr,
                pointsTo: widgetAddr,
                changed: true,
              },
            ],
          },
          {
            id: "heap-wid",
            name: "Separate Widget Allocation (new Widget)",
            segment: "HEAP",
            baseAddress: widgetAddr,
            status: widgetFreed ? "freed" : "alive",
            statusLabel: widgetFreed ? "FREED EARLY ON strong==0" : "ALIVE",
            cells: [
              {
                offset: "+0x00",
                size: 32,
                label: "Widget",
                value: widgetFreed
                  ? "~Widget() + delete ran immediately!"
                  : "Widget { id = 42 }",
                hex: widgetFreed ? "fe fe fe fe ..." : "2a 00 00 00 ...",
                state: widgetFreed ? "freed" : "alive",
                address: widgetAddr,
                changed: widgetFreed,
              },
            ],
          },
        ],
    callStack: [
      {
        id: "f-sp",
        fn: "control_block_demo",
        file: "smart_pointers.cpp",
        line: entry.line,
        addr: "0x7ffee4b2a880",
        isCurrent: true,
      },
    ],
  };
}

export function buildSmartPointerScenarios(params: {
  strategy: AllocStrategy;
  spHistory: SharedHistoryEntry[];
}): RadScenario[] {
  const { strategy, spHistory } = params;
  const isSingle = strategy === "make_shared";

  return [
    {
      id: "shared-control-block",
      label: "1. shared_ptr & weak_ptr Control Block",
      subtitle: isSingle
        ? "make_shared (1 contiguous block pinned while weak > 0)"
        : "shared_ptr(new Widget) (Widget freed immediately when strong == 0)",
      filename: "smart_pointers.cpp",
      standard: "C++23",
      target: "LP64",
      topicSlugs: ["smart-pointers-and-allocators", "smart-pointers"],
      defaultBreakpoints: [4],
      quickWatches: [
        { expr: "control_block", note: "Strong & weak atomic counters" },
        { expr: "Widget", note: "Managed object storage" },
      ],
      source: [
        isSingle
          ? "auto sp1 = std::make_shared<Widget>(42); // 1 contiguous [ctrl | Widget] alloc"
          : "std::shared_ptr<Widget> sp1(new Widget(42)); // 2 separate allocs!",
        "std::weak_ptr<Widget> wp1 = sp1;",
        "auto sp2 = sp1; // strong = 2 (atomic fetch_add)",
        "sp1.reset(); sp2.reset(); // strong = 0 -> ~Widget() runs!",
        "auto locked = wp1.lock(); // inspects control_block->strong safely",
        "wp1.reset(); // weak = 0 -> control block finally freed",
      ],
      steps: spHistory.map((e) => sharedEntryToStep(e, strategy)),
    },
    {
      id: "raii-unique-unwind",
      label: "2. RAII & Exception Stack Unwinding",
      subtitle: "Deterministic ~FileGuard() & ~unique_ptr() across throw",
      filename: "raii_unwind.cpp",
      standard: "C++23",
      target: "Itanium Zero-Cost EH",
      topicSlugs: ["raii-and-resource-management"],
      defaultBreakpoints: [4, 6],
      source: [
        "void process() {",
        "  auto buf = std::make_unique<Packet>(128); // stack @ +0x20",
        "  FileGuard fd(\"trace.bin\");                 // stack @ +0x10",
        "  throw std::runtime_error(\"I/O error\");   // triggers unwind!",
        "}",
        "// Catch site receives exception AFTER ~FileGuard() & ~unique_ptr()",
      ],
      steps: [
        {
          id: "raii-throw",
          label: "throw triggers LIFO stack unwinding: ~FileGuard() then ~unique_ptr()",
          line: 4,
          verdict: { tone: "safe", label: "0 LEAKS · Deterministic LIFO unwind" },
          clause: "[except.ctor] §14.3",
          summary:
            "As the exception unwinds process()'s stack frame, C++ destroys fully constructed automatic objects in strict reverse order: first ~FileGuard() closes fd, then ~unique_ptr<Packet>() frees 0x600001a00000.",
          inlineHints: {
            4: { text: "Unwind order: 1. ~FileGuard() -> 2. ~unique_ptr()", tone: "safe" },
          },
          watches: [
            { id: "rf-fd", expr: "fd (FileGuard)", value: "closed in ~FileGuard()", type: "FileGuard", address: "0x7ffee4b2a890", changed: true, tone: "safe", badge: "UNWOUND" },
            { id: "rf-buf", expr: "buf (unique_ptr)", value: "deleted 0x600001a00000 in ~unique_ptr", type: "std::unique_ptr<Packet>", address: "0x7ffee4b2a8a0", changed: true, tone: "safe", badge: "UNWOUND" },
          ],
          memory: [
            {
              id: "raii-stack",
              name: "process() unwinding stack",
              segment: "STACK",
              baseAddress: "0x7ffee4b2a890",
              status: "freed",
              statusLabel: "REVERSE DESTRUCTION",
              cells: [
                { offset: "+0x10", size: 8, label: "fd", value: "1st destroyed (~FileGuard)", hex: "ff ff ff ff ...", state: "freed", address: "0x7ffee4b2a890", changed: true },
                { offset: "+0x20", size: 8, label: "buf", value: "2nd destroyed (~unique_ptr)", hex: "00 00 00 00 ...", state: "freed", address: "0x7ffee4b2a8a0", changed: true },
              ],
            },
          ],
          callStack: [
            { id: "f-eh", fn: "__cxa_throw -> _Unwind_RaiseException", file: "raii_unwind.cpp", line: 4, addr: "0x7ffee4b2a890", isCurrent: true },
          ],
        },
      ],
    },
    {
      id: "pmr-monotonic",
      label: "3. std::pmr Monotonic Stack Arena",
      subtitle: "Bump-pointer allocations inside 256B stack buffer (0 mallocs)",
      filename: "pmr_arena.cpp",
      standard: "C++23",
      target: "LP64",
      topicSlugs: ["allocators-and-pmr"],
      defaultBreakpoints: [4],
      source: [
        "std::array<std::byte, 256> buf{};",
        "std::pmr::monotonic_buffer_resource pool{buf.data(), buf.size()};",
        "std::pmr::vector<int> v{&pool};",
        "v.reserve(16); // bump-pointer inside stack buf (0 malloc syscalls!)",
      ],
      steps: [
        {
          id: "pmr-bump",
          label: "v.reserve(16) advances bump pointer +0x40 inside stack array",
          line: 4,
          verdict: { tone: "safe", label: "0 MALLOCS · Allocated inside stack arena" },
          clause: "[mem.res.monotonic.buffer] §20.6.6",
          summary:
            "monotonic_buffer_resource services v.reserve(16) (64 bytes) by simply advancing its stack cursor from 0x7ffee4b2a700 to 0x7ffee4b2a740—zero system heap calls, O(1) allocation, and deallocate() is a no-op!",
          inlineHints: {
            4: { text: "v.data() = 0x7ffee4b2a700 (cursor -> +0x40)", tone: "safe" },
          },
          watches: [
            { id: "pm-v", expr: "v.data()", value: "0x7ffee4b2a700 (inside stack buf!)", type: "int*", address: "0x7ffee4b2a700", changed: true, tone: "safe", badge: "ARENA" },
            { id: "pm-cur", expr: "pool.cursor", value: "0x7ffee4b2a740 (64 / 256B used)", type: "void*", address: "0x7ffee4b2a740", changed: true },
          ],
          memory: [
            {
              id: "pmr-stack",
              name: "Stack Arena std::array<byte, 256>",
              segment: "STACK",
              baseAddress: "0x7ffee4b2a700",
              status: "alive",
              statusLabel: "64B USED / 192B FREE",
              cells: [
                { offset: "+0x00", size: 64, label: "v[0..15] (bump slice)", value: "16 ints in stack arena", hex: "00 00 00 00 ...", state: "alive", address: "0x7ffee4b2a700", changed: true },
                { offset: "+0x40", size: 192, label: "remaining arena", value: "192 bytes free", hex: "00 00 00 00 ...", state: "uninit", address: "0x7ffee4b2a740" },
              ],
            },
          ],
          callStack: [
            { id: "f-pmr", fn: "pmr_demo", file: "pmr_arena.cpp", line: 4, addr: "0x7ffee4b2a700", isCurrent: true },
          ],
        },
      ],
    },
  ];
}
