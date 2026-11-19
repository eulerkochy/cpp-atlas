import type { RadMemoryCell, RadScenario, RadStep } from "@/components/rad-debugger/types";

export const VEC_BUFFER_ADDRS = [
  "nullptr (0x0)",
  "0x600002100000",
  "0x600002104000",
  "0x600002108000",
  "0x60000210c000",
  "0x600002110000",
];

export interface VecHistoryEntry {
  id: string;
  label: string;
  line: number;
  size: number;
  cap: number;
  allocGen: number;
  pinnedGen: number | null;
  moveCount: number;
  copyCount: number;
  reallocated: boolean;
  oldFreedAddr?: string;
  eventNote: string;
  clause: string;
}

export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function nextHeapCapacity(byteLen: number): number {
  if (byteLen <= 22) return 22;
  let cap = 31;
  while (cap < byteLen) {
    cap = cap * 2 + 1;
  }
  return cap;
}

function toHexBytes(text: string, maxLen: number): string {
  const bytes = new TextEncoder().encode(text).slice(0, maxLen);
  const parts = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0"));
  if (bytes.length < maxLen) parts.push("00");
  return parts.join(" ");
}

function vecEntryToStep(entry: VecHistoryEntry, isNoexcept: boolean): RadStep {
  const bufAddr =
    VEC_BUFFER_ADDRS[Math.min(entry.allocGen, VEC_BUFFER_ADDRS.length - 1)];
  const pinnedAddr =
    entry.pinnedGen !== null
      ? VEC_BUFFER_ADDRS[Math.min(entry.pinnedGen, VEC_BUFFER_ADDRS.length - 1)]
      : null;
  const handlesValid =
    entry.pinnedGen !== null && entry.pinnedGen === entry.allocGen;

  const slotCells: RadMemoryCell[] = Array.from(
    { length: Math.min(entry.cap, 8) },
    (_, i) => {
      const active = i < entry.size;
      const elemAddr = `0x${(0x600002100000 + (entry.allocGen - 1) * 0x4000 + i * 4).toString(16)}`;
      return {
        offset: `+0x${(i * 4).toString(16).padStart(2, "0")}`,
        size: 4,
        label: `vec[${i}]`,
        value: active ? `Widget{id=${i + 1}}` : "<spare capacity>",
        hex: active ? `${(i + 1).toString(16).padStart(2, "0")} 00 00 00` : "cc cc cc cc",
        state: active ? "alive" : "uninit",
        address: elemAddr,
        changed: active && i === entry.size - 1,
      };
    }
  );

  const memory = [
    {
      id: "stack-vec",
      name: "std::vector<Widget> header + handles (stack)",
      segment: "STACK" as const,
      baseAddress: "0x7ffee4b2a8c0",
      status: handlesValid ? ("alive" as const) : ("dangling" as const),
      statusLabel: handlesValid ? "HANDLES VALID" : "HANDLES DANGLING!",
      cells: [
        {
          offset: "+0x00",
          size: 8,
          label: "__begin_",
          value: bufAddr,
          hex: "00 00 10 02 00 60 00 00",
          state: "alive" as const,
          address: "0x7ffee4b2a8c0",
          pointsTo: bufAddr.startsWith("0x") ? bufAddr : undefined,
          changed: entry.reallocated,
        },
        {
          offset: "+0x08",
          size: 8,
          label: "__end_ / size",
          value: `${entry.size} elems`,
          hex: `0${entry.size} 00 00 00 00 00 00 00`,
          state: "alive" as const,
          address: "0x7ffee4b2a8c8",
        },
        {
          offset: "+0x10",
          size: 8,
          label: "__cap_",
          value: `${entry.cap} elems`,
          hex: `0${entry.cap} 00 00 00 00 00 00 00`,
          state: "alive" as const,
          address: "0x7ffee4b2a8d0",
        },
        {
          offset: "+0x18",
          size: 8,
          label: "it / ptr / span",
          value: pinnedAddr
            ? handlesValid
              ? `${pinnedAddr} (VALID)`
              : `${pinnedAddr} (DANGLING!)`
            : "<not captured>",
          hex: "00 00 10 02 00 60 00 00",
          state: handlesValid ? ("alive" as const) : ("dangling" as const),
          address: "0x7ffee4b2a8d8",
          pointsTo: pinnedAddr ?? undefined,
          changed: !handlesValid,
        },
      ],
    },
    {
      id: "heap-vec",
      name: `Active Heap Buffer (gen #${entry.allocGen})`,
      segment: "HEAP" as const,
      baseAddress: bufAddr,
      status: "alive" as const,
      statusLabel: `size=${entry.size} / cap=${entry.cap}`,
      cells: slotCells,
    },
    ...(entry.oldFreedAddr
      ? [
          {
            id: "heap-freed",
            name: "Freed Former Buffer (dangling target!)",
            segment: "HEAP" as const,
            baseAddress: entry.oldFreedAddr,
            status: "freed" as const,
            statusLabel: "FREED ON REALLOCATION",
            cells: [
              {
                offset: "+0x00",
                size: 16,
                label: "stale array",
                value: `Freed! it / ptr / span still point to ${entry.oldFreedAddr}`,
                hex: "fe fe fe fe fe fe fe fe",
                state: "ub" as const,
                address: entry.oldFreedAddr,
                changed: true,
              },
            ],
          },
        ]
      : []),
  ];

  return {
    id: entry.id,
    label: entry.label,
    line: entry.line,
    verdict: handlesValid
      ? { tone: "safe", label: `VALID · size=${entry.size}, cap=${entry.cap}` }
      : { tone: "danger", label: "INVALIDATED · it, ptr & span dangle!" },
    clause: entry.clause,
    summary: entry.eventNote,
    inlineHints: {
      [entry.line]: {
        text: handlesValid
          ? `data=${bufAddr} (${entry.size}/${entry.cap})`
          : `realloc -> ${bufAddr}`,
        tone: handlesValid ? "safe" : "danger",
      },
    },
    registersTitle: "Vector State",
    registers: [
      { name: "size() / capacity()", value: `${entry.size} / ${entry.cap}`, changed: true },
      { name: "data()", value: bufAddr, changed: entry.reallocated, tone: "info" },
      { name: "Widget(Widget&&)", value: isNoexcept ? "noexcept (moved)" : "throwing (copied)", tone: isNoexcept ? "safe" : "warn" },
      { name: "moves / copies", value: `${entry.moveCount} / ${entry.copyCount}`, changed: true },
    ],
    watches: [
      {
        id: "wv-vec",
        expr: "vec",
        value: `size=${entry.size}, cap=${entry.cap}, data=${bufAddr}`,
        type: "std::vector<Widget> (24B)",
        address: "0x7ffee4b2a8c0",
        changed: true,
        tone: "info",
      },
      {
        id: "wv-it",
        expr: "it (captured begin)",
        value: pinnedAddr
          ? handlesValid
            ? `${pinnedAddr} -> valid`
            : `${pinnedAddr} -> DANGLING (UAF!)`
          : "<unset>",
        type: "vector<Widget>::iterator",
        address: pinnedAddr ?? undefined,
        changed: !handlesValid,
        tone: handlesValid ? "safe" : "danger",
        badge: handlesValid ? "VALID" : "DANGLING",
      },
      {
        id: "wv-span",
        expr: "view (std::span)",
        value: pinnedAddr
          ? handlesValid
            ? `{ data=${pinnedAddr}, size=1 }`
            : `{ data=${pinnedAddr} [FREED!], size=1 }`
          : "<unset>",
        type: "std::span<Widget>",
        address: pinnedAddr ?? undefined,
        tone: handlesValid ? "safe" : "danger",
        badge: handlesValid ? "VALID" : "DANGLING",
      },
    ],
    memory,
    callStack: [
      {
        id: "f-vec",
        fn: "grow_vector",
        file: "vector_invalidation.cpp",
        line: entry.line,
        addr: "0x7ffee4b2a8c0",
        isCurrent: true,
      },
    ],
  };
}

export function buildContainerScenarios(params: {
  vecHistory: VecHistoryEntry[];
  isNoexcept: boolean;
  strValue: string;
  strHeapGen: number;
  strHeapCap: number;
  svSnap: { addr: string; len: number; preview: string };
  strNote: string;
}): RadScenario[] {
  const { vecHistory, isNoexcept, strValue, strHeapGen, strHeapCap, svSnap, strNote } =
    params;

  const byteLen = utf8ByteLength(strValue);
  const isSso = byteLen <= 22;
  const ssoAddr = "0x7ffee4b2a880";
  const currentStrDataAddr = isSso
    ? "0x7ffee4b2a881"
    : `0x60000390${(strHeapGen * 2 || 2).toString(16)}000`;
  const svValid = svSnap.addr === currentStrDataAddr;

  const ssoStep1: RadStep = {
    id: "sso-initial",
    label: "1. Capture std::string_view sv during 22B inline SSO",
    line: 3,
    verdict: { tone: "safe", label: "SSO INLINE · 0 heap allocs, sv valid" },
    clause: "[string.view] & libc++ SSO",
    summary:
      "At 22 UTF-8 bytes, std::string stores characters directly inside its 24-byte stack object (0x7ffee4b2a881) with zero heap allocation. std::string_view sv captures that stack pointer.",
    inlineHints: {
      3: { text: "sv.data() = 0x7ffee4b2a881 (inline SSO)", tone: "safe" },
    },
    watches: [
      {
        id: "ws-s",
        expr: "s (initial)",
        value: '"small_sso_22_char_test" (len=22, cap=22)',
        type: "std::string (24B)",
        address: ssoAddr,
        tone: "safe",
        badge: "SSO",
      },
      {
        id: "ws-sv",
        expr: "sv",
        value: '"small_sso_22_char_test" @ 0x7ffee4b2a881',
        type: "std::string_view (16B)",
        address: "0x7ffee4b2a881",
        tone: "safe",
        badge: "VALID",
      },
    ],
    memory: [
      {
        id: "sso-stack",
        name: "std::string inline 24B layout (stack)",
        segment: "STACK",
        baseAddress: ssoAddr,
        status: "alive",
        statusLabel: "SSO MODE (<= 22B)",
        cells: [
          { offset: "+0x00", size: 1, label: "tag | size<<1", value: "SSO (len=22)", hex: "2c", state: "alive", address: "0x7ffee4b2a880" },
          { offset: "+0x01", size: 23, label: "inline buf[23]", value: '"small_sso_22_char_test\\0"', hex: toHexBytes("small_sso_22_char_test", 12) + " ...", ascii: "small_sso...", state: "alive", address: "0x7ffee4b2a881" },
        ],
      },
    ],
    callStack: [
      { id: "f-sso", fn: "sso_probe", file: "sso_string_view.cpp", line: 3, addr: ssoAddr, isCurrent: true },
    ],
  };

  const ssoStep2: RadStep = {
    id: "sso-current",
    label: `2. Current string (${byteLen}B ${isSso ? "SSO" : "HEAP"}): ${svValid ? "sv valid" : "sv DANGLING!"}`,
    line: isSso ? 4 : 5,
    verdict: svValid
      ? { tone: "safe", label: `${isSso ? "SSO" : "HEAP"} · sv valid (${byteLen}B)` }
      : { tone: "danger", label: `DANGLING · sv still points to ${svSnap.addr}!` },
    clause: "[string.require] & [string.view.cons]",
    summary: strNote,
    inlineHints: {
      [isSso ? 4 : 5]: {
        text: svValid
          ? `s.data()=${currentStrDataAddr}, sv matches`
          : `s.data() moved to ${currentStrDataAddr}; sv -> ${svSnap.addr} DANGLES`,
        tone: svValid ? "safe" : "danger",
      },
    },
    registersTitle: "SSO Layout Mode",
    registers: [
      { name: "mode", value: isSso ? "Short (inline 24B)" : "Long (heap ptr+size+cap)", changed: true, tone: isSso ? "safe" : "info" },
      { name: "size / cap", value: `${byteLen} / ${isSso ? 22 : strHeapCap}`, changed: true },
      { name: "s.data()", value: currentStrDataAddr, changed: true, tone: "info" },
      { name: "sv.data()", value: svSnap.addr, tone: svValid ? "safe" : "danger" },
    ],
    watches: [
      {
        id: "ws-s-cur",
        expr: "s",
        value: `"${strValue}" (${byteLen}B, ${isSso ? "SSO" : "Heap"})`,
        type: "std::string (24B)",
        address: ssoAddr,
        changed: true,
        tone: isSso ? "safe" : "info",
        badge: isSso ? "SSO" : "HEAP",
      },
      {
        id: "ws-sv-cur",
        expr: "sv",
        value: `${svValid ? "VALID" : "DANGLING"} -> ${svSnap.addr}`,
        type: "std::string_view (16B)",
        address: svSnap.addr,
        changed: !svValid,
        tone: svValid ? "safe" : "danger",
        badge: svValid ? "VALID" : "DANGLING",
      },
    ],
    memory: [
      {
        id: "sso-stack",
        name: "std::string 24B stack representation",
        segment: "STACK",
        baseAddress: ssoAddr,
        status: svValid ? "alive" : "dangling",
        statusLabel: isSso ? "INLINE SSO BUFFER" : "LONG HEAP HEADER",
        cells: isSso
          ? [
              { offset: "+0x00", size: 1, label: "tag | size<<1", value: `SSO len=${byteLen}`, hex: (byteLen * 2).toString(16).padStart(2, "0"), state: "alive", address: "0x7ffee4b2a880", changed: true },
              { offset: "+0x01", size: 23, label: "inline char[23]", value: `"${strValue}\\0"`, hex: toHexBytes(strValue, 12), ascii: strValue.slice(0, 12), state: "alive", address: "0x7ffee4b2a881", changed: true },
            ]
          : [
              { offset: "+0x00", size: 8, label: "__cap_ | long_bit", value: `cap=${strHeapCap} (long=1)`, hex: "01 00 00 00 00 00 00 00", state: "alive", address: "0x7ffee4b2a880", changed: true },
              { offset: "+0x08", size: 8, label: "__size_", value: `${byteLen}`, hex: `${byteLen.toString(16).padStart(2, "0")} 00 00 00 00 00 00 00`, state: "alive", address: "0x7ffee4b2a888" },
              { offset: "+0x10", size: 8, label: "__data_ ptr", value: currentStrDataAddr, hex: "00 20 90 03 00 60 00 00", state: "alive", address: "0x7ffee4b2a890", pointsTo: currentStrDataAddr, changed: true },
            ],
      },
      ...(!isSso
        ? [
            {
              id: "sso-heap",
              name: "Heap Character Buffer",
              segment: "HEAP" as const,
              baseAddress: currentStrDataAddr,
              status: "alive" as const,
              statusLabel: `HEAP (${byteLen}B)`,
              cells: [
                {
                  offset: "+0x00",
                  size: byteLen + 1,
                  label: "heap chars",
                  value: `"${strValue}\\0"`,
                  hex: toHexBytes(strValue, 14),
                  ascii: strValue.slice(0, 14),
                  state: "alive" as const,
                  address: currentStrDataAddr,
                  changed: true,
                },
              ],
            },
          ]
        : []),
    ],
    callStack: [
      { id: "f-sso", fn: "sso_probe", file: "sso_string_view.cpp", line: isSso ? 4 : 5, addr: ssoAddr, isCurrent: true },
    ],
  };

  return [
    {
      id: "vector-reallocation",
      label: "1. vector Growth & Invalidation",
      subtitle: "Click push_back / reserve / pop_back to trace real reallocations",
      filename: "vector_invalidation.cpp",
      standard: "C++23",
      target: "LP64",
      topicSlugs: [
        "containers-and-iterator-invalidation",
        "iterator-invalidation",
        "sequence-containers",
      ],
      defaultBreakpoints: [4],
      quickWatches: [
        { expr: "vec", note: "24-byte vector header" },
        { expr: "it", note: "Pinned iterator" },
        { expr: "view", note: "Pinned std::span" },
      ],
      source: [
        "std::vector<Widget> vec = { Widget{1} }; // cap=1 @ 0x600002100000",
        "auto it = vec.begin(); Widget* ptr = vec.data();",
        "std::span<Widget> view(vec);",
        "vec.push_back(Widget{2}); // realloc if full",
        "// Interactive toolbar adds push_back / reserve / pop_back steps ->",
      ],
      steps: vecHistory.map((e) => vecEntryToStep(e, isNoexcept)),
    },
    {
      id: "string-sso-view",
      label: "2. std::string 24B SSO & string_view",
      subtitle: "22B inline stack limit vs 23B heap flip & dangling string_view",
      filename: "sso_string_view.cpp",
      standard: "C++23",
      target: "libc++ 24B SSO",
      topicSlugs: ["strings-views-and-spans", "strings-and-string-view"],
      defaultBreakpoints: [5],
      quickWatches: [
        { expr: "s", note: "24-byte std::string" },
        { expr: "sv", note: "Non-owning std::string_view" },
      ],
      source: [
        "std::string s = \"small_sso_22_char_test\"; // 22B fits inline in 24B!",
        "std::string_view sv = s;                  // points into stack @ 0x7ffee4b2a881",
        "// 22B SSO: 0 heap allocations, sv valid",
        "// Still <= 22B: mutates inline SSO buffer",
        "s = \"twenty_three_chars_heap\"; // >=23B allocates heap -> sv DANGLES!",
      ],
      steps: [ssoStep1, ssoStep2],
    },
    {
      id: "span-mdspan",
      label: "3. std::span & C++23 std::mdspan",
      subtitle: "Non-owning 16B view vs layout_right / layout_left 2D stride mapping",
      filename: "span_mdspan.cpp",
      standard: "C++23",
      target: "LP64",
      topicSlugs: ["span-and-mdspan"],
      defaultBreakpoints: [4],
      source: [
        "std::array<double, 6> raw = {1, 2, 3, 4, 5, 6};",
        "std::span<double> view{raw}; // 16B: { ptr, 6 }",
        "std::mdspan<double, std::extents<std::size_t, 2, 3>> mat{raw.data()};",
        "double val = mat[1, 2];      // C++23 multi-arg [] -> raw[1*3 + 2] = 6.0",
      ],
      steps: [
        {
          id: "md-index",
          label: "mat[1, 2] computes layout_right offset (1 * 3 + 2 = 5) -> 6.0",
          line: 4,
          verdict: { tone: "safe", label: "ZERO COPY VIEW · mat[1, 2] == raw[5] (6.0)" },
          clause: "[mdspan.mdspan] §24.7.3.6",
          summary:
            "std::mdspan holds only the raw pointer (no heap ownership, no nested vector<vector<double>> allocations). With default layout_right (row-major), static extents<2, 3> compute index 1*3 + 2 = 5 directly at compile/register speed.",
          inlineHints: {
            4: { text: "mat[1, 2] -> offset 5 -> raw[5] = 6.0", tone: "safe" },
          },
          watches: [
            { id: "md-sp", expr: "view (std::span)", value: "{ ptr=0x7ffee4b2a800, size=6 }", type: "std::span<double> (16B)", address: "0x7ffee4b2a800", tone: "info" },
            { id: "md-mat", expr: "mat (std::mdspan)", value: "ptr=0x7ffee4b2a800, extents<2, 3>", type: "mdspan (8B! static extents)", address: "0x7ffee4b2a800", tone: "safe", changed: true },
            { id: "md-val", expr: "mat[1, 2]", value: "6.0 (raw[1*3 + 2])", type: "double&", address: "0x7ffee4b2a828", changed: true, tone: "safe" },
          ],
          memory: [
            {
              id: "md-flat",
              name: "Flat Contiguous Backing Array (double[6])",
              segment: "STACK",
              baseAddress: "0x7ffee4b2a800",
              status: "alive",
              statusLabel: "6 x 8B ROW-MAJOR",
              cells: [
                { offset: "+0x00", size: 8, label: "mat[0,0] (raw[0])", value: "1.0", hex: "00 00 00 00 00 00 f0 3f", state: "alive", address: "0x7ffee4b2a800" },
                { offset: "+0x08", size: 8, label: "mat[0,1] (raw[1])", value: "2.0", hex: "00 00 00 00 00 00 00 40", state: "alive", address: "0x7ffee4b2a808" },
                { offset: "+0x10", size: 8, label: "mat[0,2] (raw[2])", value: "3.0", hex: "00 00 00 00 00 00 08 40", state: "alive", address: "0x7ffee4b2a810" },
                { offset: "+0x18", size: 8, label: "mat[1,0] (raw[3])", value: "4.0", hex: "00 00 00 00 00 00 10 40", state: "alive", address: "0x7ffee4b2a818" },
                { offset: "+0x20", size: 8, label: "mat[1,1] (raw[4])", value: "5.0", hex: "00 00 00 00 00 00 14 40", state: "alive", address: "0x7ffee4b2a820" },
                { offset: "+0x28", size: 8, label: "mat[1,2] (raw[5])", value: "6.0 <- SELECTED", hex: "00 00 00 00 00 00 18 40", state: "alive", address: "0x7ffee4b2a828", changed: true },
              ],
            },
          ],
          callStack: [
            { id: "f-md", fn: "mdspan_demo", file: "span_mdspan.cpp", line: 4, addr: "0x7ffee4b2a800", isCurrent: true },
          ],
        },
      ],
    },
  ];
}
