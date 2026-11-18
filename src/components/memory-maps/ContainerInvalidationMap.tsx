"use client";

import { useState } from "react";
import { CppCodeBlock } from "@/components/CppCodeBlock";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Window } from "@/components/Window";
import { cn } from "@/lib/utils";
import { standardRefToUrl } from "@/types/topics";

const BUFFER_ADDRS = [
  "nullptr (0x0)",
  "0x600002100000",
  "0x600002104000",
  "0x600002108000",
  "0x60000210c000",
  "0x600002110000",
];

const SSO_STACK_DATA_ADDR = "0x7ffee4b2a881 (inline SSO)";
const HEAP_STRING_ADDRS = [
  "0x600003902000",
  "0x600003904000",
  "0x600003908000",
];

interface StringPreset {
  id: string;
  label: string;
  value: string;
}

const STRING_PRESETS: StringPreset[] = [
  { id: "short", label: "5 B (SSO)", value: "cpp23" },
  { id: "boundary", label: "22 B (Max SSO)", value: "small_sso_22_char_test" },
  { id: "cross", label: "23 B (Heap flip)", value: "twenty_three_chars_heap" },
  {
    id: "long",
    label: "34 B (Heap)",
    value: "long_heap_allocated_string_payload",
  },
];

function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function nextHeapCapacity(byteLen: number): number {
  if (byteLen <= 22) return 22;
  let cap = 31;
  while (cap < byteLen) {
    cap = cap * 2 + 1;
  }
  return cap;
}

export function ContainerInvalidationMap() {
  const [activeTab, setActiveTab] = useState<"vector" | "sso">("vector");

  // Vector mode state
  const [vecSize, setVecSize] = useState<number>(1);
  const [vecCap, setVecCap] = useState<number>(1);
  const [allocGen, setAllocGen] = useState<number>(1);
  const [pinnedGen, setPinnedGen] = useState<number | null>(1);
  const [isNoexcept, setIsNoexcept] = useState<boolean>(true);
  const [moveCount, setMoveCount] = useState<number>(0);
  const [copyCount, setCopyCount] = useState<number>(0);
  const [lastVecEvent, setLastVecEvent] = useState<string>(
    "Initialized with 1 Widget at 0x600002100000 (capacity 1). Captured it = vec.begin(), ptr = vec.data(), and std::span view."
  );

  // SSO mode state
  const [strValue, setStrValue] = useState<string>("small_sso_22_char_test");
  const [strHeapCap, setStrHeapCap] = useState<number>(22);
  const [strHeapGen, setStrHeapGen] = useState<number>(0);
  const [svSnap, setSvSnap] = useState<{
    addr: string;
    len: number;
    preview: string;
  }>({
    addr: SSO_STACK_DATA_ADDR,
    len: 22,
    preview: "small_sso_22_char_test",
  });
  const [lastSsoEvent, setLastSsoEvent] = useState<string>(
    "22 bytes fit inside the 24-byte inline SSO buffer (0 heap allocations). std::string_view sv currently points into stack SSO storage."
  );

  const currentVecAddr =
    BUFFER_ADDRS[Math.min(allocGen, BUFFER_ADDRS.length - 1)];
  const pinnedVecAddr =
    pinnedGen !== null
      ? BUFFER_ADDRS[Math.min(pinnedGen, BUFFER_ADDRS.length - 1)]
      : "unbound";
  const vecHandlesActive = vecSize > 0 && pinnedGen !== null;
  const vecHandlesValid = vecHandlesActive && pinnedGen === allocGen;

  function handlePushBack() {
    if (vecSize >= 5) return;
    const nextSize = vecSize + 1;

    if (vecCap === 0) {
      const nextGen = allocGen + 1;
      setVecSize(1);
      setVecCap(1);
      setAllocGen(nextGen);
      setPinnedGen(nextGen);
      setLastVecEvent(
        `push_back #1 allocated buffer ${BUFFER_ADDRS[Math.min(nextGen, BUFFER_ADDRS.length - 1)]} (capacity 1) and bound it, Widget*, and std::span.`
      );
      return;
    }

    if (vecSize < vecCap) {
      setVecSize(nextSize);
      setLastVecEvent(
        `push_back #${nextSize} constructed Widget[${nextSize - 1}] in-place inside ${currentVecAddr} (capacity ${vecCap}). No reallocation: existing it, Widget*, and std::span stay valid (end() updated).`
      );
      return;
    }

    const nextCap = vecCap * 2;
    const nextGen = allocGen + 1;
    const nextAddr = BUFFER_ADDRS[Math.min(nextGen, BUFFER_ADDRS.length - 1)];
    const transferred = vecSize;

    setVecSize(nextSize);
    setVecCap(nextCap);
    setAllocGen(nextGen);
    if (isNoexcept) {
      setMoveCount((c) => c + transferred);
    } else {
      setCopyCount((c) => c + transferred);
    }

    setLastVecEvent(
      `push_back #${nextSize} exceeded capacity ${vecCap}! Reallocated to ${nextAddr} (capacity ${nextCap}) and ${
        isNoexcept
          ? `MOVED ${transferred} existing Widget(s) via std::move_if_noexcept.`
          : `COPIED ${transferred} existing Widget(s) because move ctor is not noexcept (strong exception guarantee).`
      } Old handles at ${pinnedVecAddr} are now DANGLING!`
    );
  }

  function handleReserve8() {
    if (vecCap >= 8) {
      setLastVecEvent(
        `reserve(8) is a no-op: capacity is already ${vecCap} at ${currentVecAddr}.`
      );
      return;
    }
    const nextGen = allocGen + 1;
    const nextAddr = BUFFER_ADDRS[Math.min(nextGen, BUFFER_ADDRS.length - 1)];
    const transferred = vecSize;

    setVecCap(8);
    setAllocGen(nextGen);
    if (transferred > 0) {
      if (isNoexcept) {
        setMoveCount((c) => c + transferred);
      } else {
        setCopyCount((c) => c + transferred);
      }
      setLastVecEvent(
        `reserve(8) reallocated buffer from ${currentVecAddr} to ${nextAddr}, ${
          isNoexcept ? "moving" : "copying"
        } ${transferred} Widget(s). Previously captured handles at ${pinnedVecAddr} are now DANGLING!`
      );
    } else {
      setPinnedGen(nextGen);
      setLastVecEvent(
        `reserve(8) pre-allocated ${nextAddr} for 8 Widgets before pushing. Subsequent push_back calls 1..5 will never reallocate.`
      );
    }
  }

  function handleRebindHandles() {
    if (vecSize === 0) return;
    setPinnedGen(allocGen);
    setLastVecEvent(
      `Re-bound iterator, Widget*, and std::span to current live buffer ${currentVecAddr}.`
    );
  }

  function handleResetVec() {
    setVecSize(0);
    setVecCap(0);
    setAllocGen(0);
    setPinnedGen(null);
    setMoveCount(0);
    setCopyCount(0);
    setLastVecEvent(
      "Reset vector to size 0, capacity 0 (nullptr). Click push_back to watch dynamic growth, or reserve(8) first to prevent reallocation."
    );
  }

  const strByteLen = utf8ByteLength(strValue);
  const isSsoActive = strByteLen <= 22 && strHeapCap <= 22;
  const currentStrAddr = isSsoActive
    ? SSO_STACK_DATA_ADDR
    : HEAP_STRING_ADDRS[Math.max(0, (strHeapGen - 1) % HEAP_STRING_ADDRS.length)];
  const svValid = svSnap.addr === currentStrAddr;

  function applyStringUpdate(
    nextText: string,
    sourceNote: string,
    options?: { resetToPreset?: boolean }
  ) {
    const nextBytes = utf8ByteLength(nextText);
    const wasHeap = !isSsoActive;
    let nextCap = strHeapCap;
    let nextGen = strHeapGen;

    if (options?.resetToPreset && nextBytes <= 22) {
      nextCap = 22;
      nextGen = 0;
    } else if (nextBytes > nextCap) {
      nextCap = nextHeapCapacity(nextBytes);
      nextGen = strHeapGen + 1;
    }

    const nextIsSso = nextBytes <= 22 && nextCap <= 22;
    const nextAddr = nextIsSso
      ? SSO_STACK_DATA_ADDR
      : HEAP_STRING_ADDRS[Math.max(0, (nextGen - 1) % HEAP_STRING_ADDRS.length)];

    setStrValue(nextText);
    setStrHeapCap(nextCap);
    setStrHeapGen(nextGen);

    if (svSnap.addr !== nextAddr) {
      setLastSsoEvent(
        `${sourceNote}: ${nextBytes} bytes exceeded ${
          wasHeap ? `heap capacity ${strHeapCap}` : "22-byte SSO inline limit"
        }. s.data() moved to ${nextAddr}; existing std::string_view at ${svSnap.addr} is now DANGLING!`
      );
    } else {
      setLastSsoEvent(
        `${sourceNote}: ${nextBytes} bytes stay within ${
          nextIsSso
            ? "the 24-byte inline SSO buffer (0 heap allocations)"
            : `existing heap capacity ${nextCap}`
        }. s.data() did not move.`
      );
    }
  }

  function handleResetSso() {
    const initial = "small_sso_22_char_test";
    setStrValue(initial);
    setStrHeapCap(22);
    setStrHeapGen(0);
    setSvSnap({
      addr: SSO_STACK_DATA_ADDR,
      len: utf8ByteLength(initial),
      preview: initial,
    });
    setLastSsoEvent(
      "Reset to 22-byte SSO string with std::string_view sv bound to inline stack storage."
    );
  }

  function handleCaptureSv() {
    setSvSnap({
      addr: currentStrAddr,
      len: strByteLen,
      preview: strValue,
    });
    setLastSsoEvent(
      `Captured std::string_view sv = s pointing to ${currentStrAddr} (${strByteLen} bytes).`
    );
  }

  return (
    <Window
      as="section"
      aria-label="Container invalidation and string SSO simulator"
      title="vector-sso.sim"
      actions={
        <a
          href={standardRefToUrl(
            activeTab === "vector" ? "[vector.modifiers]" : "[string.view]"
          )}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-xs text-ink-soft underline decoration-line-strong underline-offset-4 hover:text-ink hover:decoration-ink"
        >
          {activeTab === "vector"
            ? "[vector.modifiers]"
            : "[basic.string] & [string.view]"}
        </a>
      }
      bodyClassName="p-5 sm:p-7"
    >
      <div className="mb-4">
        <h3 className="font-display text-2xl font-[450] tracking-[-0.02em] text-ink">
          Vector Reallocation &amp; String SSO Hazards
        </h3>
        <p className="mt-1 text-sm text-ink-soft">
          Trace buffer growth,{" "}
          <code className="font-mono text-xs text-ink">std::move_if_noexcept</code>{" "}
          copy fallbacks, and dangling views across capacity transitions.
        </p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "vector" | "sso")}
        className="w-full"
      >
        <TabsList className="mb-5 max-w-full flex-wrap">
          <TabsTrigger value="vector" className="h-8 px-3.5 text-xs cursor-pointer">
            Vector capacity &amp; reallocation
          </TabsTrigger>
          <TabsTrigger value="sso" className="h-8 px-3.5 text-xs cursor-pointer">
            std::string SSO &amp; string_view
          </TabsTrigger>
        </TabsList>

        <TabsContent value="vector" keepMounted className="mt-0 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-paper px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="xs"
                variant="default"
                disabled={vecSize >= 5}
                onClick={handlePushBack}
                className="font-mono text-xs bg-sun text-ink border border-ink/30 hover:bg-sun/90 cursor-pointer"
              >
                {vecSize >= 5
                  ? "push_back (max 5)"
                  : `push_back (#${vecSize + 1})`}
              </Button>
              <Button
                type="button"
                size="xs"
                variant="outline"
                disabled={vecCap >= 8}
                onClick={handleReserve8}
                className="font-mono text-xs cursor-pointer"
              >
                reserve(8)
              </Button>
              {vecSize > 0 && !vecHandlesValid ? (
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={handleRebindHandles}
                  className="font-mono text-xs cursor-pointer"
                >
                  Re-bind handles
                </Button>
              ) : null}
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={handleResetVec}
                className="font-mono text-xs cursor-pointer"
              >
                Reset
              </Button>
            </div>

            <label className="flex items-center gap-2.5 text-xs text-ink-body cursor-pointer select-none">
              <Switch
                checked={isNoexcept}
                onCheckedChange={setIsNoexcept}
                size="sm"
              />
              <span>
                Move ctor is{" "}
                <code className="rounded border border-line bg-paper-sunk px-1.5 py-0.5 font-mono text-xs text-ink">
                  noexcept
                </code>
              </span>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-line bg-paper px-3.5 py-2.5">
              <div className="text-[11px] text-ink-faint">size / capacity</div>
              <div className="mt-1 font-mono text-sm font-semibold text-ink">
                {vecSize} / {vecCap}
              </div>
            </div>
            <div className="rounded-2xl border border-line bg-paper px-3.5 py-2.5">
              <div className="text-[11px] text-ink-faint">vec.data() address</div>
              <div className="mt-1 font-mono text-xs font-semibold text-ink truncate">
                {currentVecAddr}
              </div>
            </div>
            <div className="rounded-2xl border border-line bg-paper px-3.5 py-2.5">
              <div className="text-[11px] text-ink-faint">
                Element moves (noexcept)
              </div>
              <div className="mt-1 font-mono text-sm font-semibold text-[color:var(--right)]">
                {moveCount}
              </div>
            </div>
            <div className="rounded-2xl border border-line bg-paper px-3.5 py-2.5">
              <div className="text-[11px] text-ink-faint">
                Copy fallbacks (strong guarantee)
              </div>
              <div
                className={cn(
                  "mt-1 font-mono text-sm font-semibold",
                  copyCount > 0 ? "text-wrong" : "text-ink-soft"
                )}
              >
                {copyCount}
              </div>
            </div>
          </div>

          <div className="rounded-[var(--radius-panel)] border border-line bg-paper p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-ink">
                Contiguous Heap Buffer ({currentVecAddr})
              </span>
              <span className="font-mono text-[11px] text-ink-soft">
                {vecCap === 0
                  ? "0 slots allocated"
                  : `${vecSize} constructed, ${vecCap - vecSize} uninitialized spare`}
              </span>
            </div>

            {vecCap === 0 ? (
              <div className="rounded-xl border border-dashed border-line-strong bg-paper-sunk/60 px-4 py-5 text-center font-mono text-xs text-ink-soft">
                Empty vector (begin_ == end_ == cap_ == nullptr)
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-8">
                {Array.from({ length: vecCap }, (_, idx) => {
                  const occupied = idx < vecSize;
                  return (
                    <div
                      key={idx}
                      className={cn(
                        "rounded-xl border px-2.5 py-2 font-mono text-xs transition-colors",
                        occupied
                          ? "border-ink/25 bg-sun-wash text-ink"
                          : "border-dashed border-line-strong bg-paper-raised text-ink-faint"
                      )}
                    >
                      <div className="text-[10px] text-ink-faint">[{idx}]</div>
                      <div className="mt-0.5 font-semibold">
                        {occupied ? `Widget#${idx + 1}` : "raw"}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {[
              {
                name: "std::vector<Widget>::iterator it",
                expr: "vec.begin()",
              },
              {
                name: "Widget* ptr",
                expr: "&vec[0]",
              },
              {
                name: "std::span<Widget> view",
                expr: "std::span{vec}",
              },
            ].map((handle) => (
              <div
                key={handle.name}
                className={cn(
                  "rounded-2xl border p-3.5 transition-colors",
                  !vecHandlesActive && "border-line bg-paper-sunk/70",
                  vecHandlesActive &&
                    vecHandlesValid &&
                    "border-[color:var(--right)]/35 bg-right-wash/70",
                  vecHandlesActive &&
                    !vecHandlesValid &&
                    "border-wrong/35 bg-wrong-wash/70"
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="font-mono text-xs font-semibold text-ink">
                    {handle.name}
                  </span>
                  <span
                    className={cn(
                      "rounded-[var(--radius-chip)] px-2 py-0.5 font-mono text-[11px] font-medium",
                      !vecHandlesActive && "bg-paper-raised text-ink-soft",
                      vecHandlesActive &&
                        vecHandlesValid &&
                        "bg-paper-raised text-[color:var(--right)]",
                      vecHandlesActive &&
                        !vecHandlesValid &&
                        "bg-paper-raised text-wrong"
                    )}
                  >
                    {!vecHandlesActive
                      ? "Unbound"
                      : vecHandlesValid
                        ? "Valid"
                        : "Dangling (UB!)"}
                  </span>
                </div>
                <div className="mt-1.5 font-mono text-[11px] text-ink-soft">
                  {vecHandlesActive
                    ? `Target: ${pinnedVecAddr} (${handle.expr})`
                    : `Push an item to bind ${handle.expr}`}
                </div>
              </div>
            ))}
          </div>

          <div
            aria-live={activeTab === "vector" ? "polite" : "off"}
            className={cn(
              "rounded-2xl border px-4 py-3 text-xs leading-relaxed text-ink-body",
              vecHandlesActive && !vecHandlesValid
                ? "border-wrong/35 bg-wrong-wash/60"
                : !isNoexcept
                  ? "border-ink/25 bg-sun-wash/70"
                  : "border-[color:var(--right)]/35 bg-right-wash/60"
            )}
          >
            {lastVecEvent}
          </div>

          <CppCodeBlock
            caption="move_if_noexcept_vector.cpp"
            code={`struct Widget {
  Widget() = default;
  Widget(const Widget&) = default;
  Widget(Widget&&) ${isNoexcept ? "noexcept" : "/* NOT noexcept! */"} = default;
};
std::vector<Widget> vec;
vec.push_back(Widget{});
auto it = vec.begin(); Widget* p = vec.data(); std::span s{vec};
// Reallocation calls std::move_if_noexcept: ${
              isNoexcept
                ? "moves elements cheaply"
                : "COPIES elements to keep strong guarantee!"
            }`}
          />
        </TabsContent>

        <TabsContent value="sso" keepMounted className="mt-0 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-paper px-4 py-3">
            <div className="flex flex-wrap gap-1.5">
              {STRING_PRESETS.map((preset) => (
                <Button
                  key={preset.id}
                  type="button"
                  size="xs"
                  variant={strValue === preset.value ? "default" : "outline"}
                  aria-pressed={strValue === preset.value}
                  onClick={() =>
                    applyStringUpdate(preset.value, `Preset "${preset.label}"`, {
                      resetToPreset: true,
                    })
                  }
                  className={cn(
                    "font-mono text-xs cursor-pointer",
                    strValue === preset.value &&
                      "bg-sun text-ink border-ink/30 hover:bg-sun/90"
                  )}
                >
                  {preset.label}
                </Button>
              ))}
            </div>

            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                size="xs"
                variant="outline"
                disabled={strValue.length >= 56}
                onClick={() =>
                  applyStringUpdate(`${strValue}_x`, 'append("_x")')
                }
                className="font-mono text-xs cursor-pointer"
              >
                append(&quot;_x&quot;)
              </Button>
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={handleCaptureSv}
                className="font-mono text-xs cursor-pointer"
              >
                Capture string_view
              </Button>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={handleResetSso}
                className="font-mono text-xs cursor-pointer"
              >
                Reset
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-paper p-4 space-y-3">
            <label className="block text-xs font-medium text-ink">
              Live string content ({strByteLen} UTF-8 bytes, libc++ 64-bit SSO
              threshold is 22 bytes)
              <input
                type="text"
                maxLength={64}
                value={strValue}
                onChange={(e) =>
                  applyStringUpdate(e.target.value, "Edited string")
                }
                className="mt-2 block w-full rounded-xl border border-line-strong bg-paper-raised px-3.5 py-2 font-mono text-xs text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="min-w-0 rounded-[var(--radius-panel)] border border-line bg-paper p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-ink">
                  Stack: sizeof(std::string) == 24 bytes
                </span>
                <span
                  className={cn(
                    "rounded-[var(--radius-chip)] px-2 py-0.5 font-mono text-[11px] font-medium",
                    isSsoActive
                      ? "bg-right-wash text-[color:var(--right)]"
                      : "bg-sun-wash text-ink"
                  )}
                >
                  {isSsoActive ? "SSO Inline Mode" : "Heap Pointer Mode"}
                </span>
              </div>

              {isSsoActive ? (
                <div className="rounded-xl border border-[color:var(--right)]/35 bg-right-wash/60 p-3 font-mono text-xs space-y-1.5">
                  <div className="text-[11px] text-ink-soft">
                    0x7ffee4b2a880 (24-byte union in short layout)
                  </div>
                  <div className="text-ink font-semibold">
                    [len_tag: {strByteLen}] [inline char[23]: &quot;{strValue}&quot;\0]
                  </div>
                  <div className="text-[11px] text-[color:var(--right)]">
                    s.data() == {SSO_STACK_DATA_ADDR} (cap {strHeapCap}, 0 heap allocs)
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="rounded-xl border border-ink/25 bg-sun-wash/70 p-3 font-mono text-xs space-y-1">
                    <div className="text-[11px] text-ink-soft">
                      0x7ffee4b2a880 (24-byte union flipped to long layout!)
                    </div>
                    <div className="text-ink font-semibold">
                      [cap: {strHeapCap} | size: {strByteLen} | data*: {currentStrAddr}]
                    </div>
                  </div>
                  <div className="rounded-xl border border-line-strong bg-paper-raised p-3 font-mono text-xs">
                    <div className="text-[11px] text-ink-faint">
                      Heap allocation at {currentStrAddr}
                    </div>
                    <div className="mt-1 text-ink break-all">
                      &quot;{strValue}&quot;\0
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div
              className={cn(
                "min-w-0 rounded-[var(--radius-panel)] border p-4 flex flex-col justify-between transition-colors",
                svValid
                  ? "border-[color:var(--right)]/35 bg-right-wash/60"
                  : "border-wrong/35 bg-wrong-wash/70"
              )}
            >
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-ink">
                    std::string_view sv = s;
                  </span>
                  <span
                    className={cn(
                      "rounded-[var(--radius-chip)] bg-paper-raised px-2 py-0.5 font-mono text-[11px] font-medium",
                      svValid ? "text-[color:var(--right)]" : "text-wrong"
                    )}
                  >
                    {svValid ? "Valid View" : "Dangling View (UB!)"}
                  </span>
                </div>

                <dl className="mt-3 space-y-1.5 font-mono text-xs">
                  <div className="flex justify-between gap-2">
                    <dt className="text-ink-soft">sv.data() (captured):</dt>
                    <dd className="font-semibold text-ink">{svSnap.addr}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-ink-soft">s.data() (current):</dt>
                    <dd className="font-semibold text-ink">{currentStrAddr}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-ink-soft">sv.size():</dt>
                    <dd className="text-ink">{svSnap.len} bytes</dd>
                  </div>
                </dl>
              </div>

              <p className="mt-4 rounded-xl border border-line bg-paper-raised px-3 py-2 text-[11px] leading-relaxed text-ink-body">
                {svValid
                  ? "sv still points at the active buffer. Crossing 22 bytes (or growing past heap capacity) switches the union or frees the old heap block."
                  : "DANGER: s transitioned buffers! Reading sv reads overwritten union pointer bytes on the stack or freed heap memory. Note: libstdc++ uses a 15-byte SSO cap inside a 32-byte string."}
              </p>
            </div>
          </div>

          <div
            aria-live={activeTab === "sso" ? "polite" : "off"}
            className={cn(
              "rounded-2xl border px-4 py-3 text-xs leading-relaxed text-ink-body",
              svValid
                ? "border-line bg-paper"
                : "border-wrong/35 bg-wrong-wash/60"
            )}
          >
            {lastSsoEvent}
          </div>
        </TabsContent>
      </Tabs>
    </Window>
  );
}
