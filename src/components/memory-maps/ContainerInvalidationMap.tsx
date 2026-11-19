"use client";

import { useMemo, useState } from "react";
import { RadDebuggerShell } from "@/components/rad-debugger/RadDebuggerShell";
import {
  AddressChip,
  StatusPill,
} from "@/components/rad-debugger/PanePrimitives";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  buildContainerScenarios,
  nextHeapCapacity,
  utf8ByteLength,
  VEC_BUFFER_ADDRS,
  type VecHistoryEntry,
} from "./scenarios/container-invalidation";

const INITIAL_VEC_HISTORY: VecHistoryEntry[] = [
  {
    id: "vec-init",
    label: "Init vec{Widget{1}} (cap=1)",
    line: 2,
    size: 1,
    cap: 1,
    allocGen: 1,
    pinnedGen: 1,
    moveCount: 0,
    copyCount: 0,
    reallocated: false,
    eventNote:
      "Initialized vec with 1 Widget at 0x600002100000 (capacity 1). Captured iterator it, raw pointer ptr, and std::span view.",
    clause: "[vector.capacity]",
  },
  {
    id: "vec-realloc-1",
    label: "push_back(2) reallocates 1 -> 2!",
    line: 4,
    size: 2,
    cap: 2,
    allocGen: 2,
    pinnedGen: 1,
    moveCount: 1,
    copyCount: 0,
    reallocated: true,
    oldFreedAddr: "0x600002100000",
    eventNote:
      "size == capacity (1): vector allocated new 2-slot buffer at 0x600002104000, moved element #0, and freed 0x600002100000. Captured it, ptr, and span are now DANGLING!",
    clause: "[vector.modifiers] §24.3.11.5",
  },
];

const STRING_PRESETS = [
  { id: "short", label: "5B SSO", value: "cpp23" },
  { id: "boundary", label: "22B Max SSO", value: "small_sso_22_char_test" },
  { id: "cross", label: "23B Heap Flip", value: "twenty_three_chars_heap" },
  { id: "long", label: "34B Heap", value: "long_heap_allocated_string_payload" },
];

export function ContainerInvalidationMap({ topicSlug }: { topicSlug?: string }) {
  const [scenarioId, setScenarioId] = useState<string>(() => {
    if (
      topicSlug === "strings-views-and-spans" ||
      topicSlug === "strings-and-string-view"
    ) {
      return "string-sso-view";
    }
    if (topicSlug === "span-and-mdspan") return "span-mdspan";
    return "vector-reallocation";
  });
  const [stepIndex, setStepIndex] = useState<number>(1);
  const [vecHistory, setVecHistory] =
    useState<VecHistoryEntry[]>(INITIAL_VEC_HISTORY);
  const [isNoexcept, setIsNoexcept] = useState<boolean>(true);

  const [strValue, setStrValue] = useState<string>("twenty_three_chars_heap");
  const [strHeapCap, setStrHeapCap] = useState<number>(31);
  const [strHeapGen, setStrHeapGen] = useState<number>(1);
  const [svSnap, setSvSnap] = useState<{
    addr: string;
    len: number;
    preview: string;
  }>({
    addr: "0x7ffee4b2a881",
    len: 22,
    preview: "small_sso_22_char_test",
  });
  const [strNote, setStrNote] = useState<string>(
    "Crossing 22 -> 23 bytes flipped std::string from inline stack SSO (0x7ffee4b2a881) to heap (0x600003902000). Previously captured string_view sv now DANGLES!"
  );

  const scenarios = useMemo(
    () =>
      buildContainerScenarios({
        vecHistory,
        isNoexcept,
        strValue,
        strHeapGen,
        strHeapCap,
        svSnap,
        strNote,
      }),
    [vecHistory, isNoexcept, strValue, strHeapGen, strHeapCap, svSnap, strNote]
  );

  const activeVecIdx = Math.max(0, Math.min(stepIndex, vecHistory.length - 1));
  const activeVec = vecHistory[activeVecIdx];

  function appendVecAction(action: "push" | "reserve" | "pop" | "repin") {
    const cur = activeVec;
    const prefix = vecHistory.slice(0, activeVecIdx + 1);
    if (action === "push") {
      if (cur.size >= 8) return;
      const nextSize = cur.size + 1;
      const realloc = nextSize > cur.cap;
      const nextCap = realloc ? cur.cap * 2 : cur.cap;
      const nextGen = realloc
        ? Math.min(cur.allocGen + 1, VEC_BUFFER_ADDRS.length - 1)
        : cur.allocGen;
      const oldAddr = realloc
        ? VEC_BUFFER_ADDRS[Math.min(cur.allocGen, VEC_BUFFER_ADDRS.length - 1)]
        : undefined;
      const nextEntry: VecHistoryEntry = {
        id: `vec-push-${prefix.length}`,
        label: realloc
          ? `push_back(${nextSize}) realloc -> cap=${nextCap}`
          : `push_back(${nextSize}) in-place (${nextSize}/${nextCap})`,
        line: 4,
        size: nextSize,
        cap: nextCap,
        allocGen: nextGen,
        pinnedGen: cur.pinnedGen,
        moveCount: cur.moveCount + (realloc && isNoexcept ? cur.size : 0),
        copyCount: cur.copyCount + (realloc && !isNoexcept ? cur.size : 0),
        reallocated: realloc,
        oldFreedAddr: oldAddr,
        eventNote: realloc
          ? `Reallocated ${cur.cap} -> ${nextCap} slots at ${VEC_BUFFER_ADDRS[nextGen]}. ${
              isNoexcept
                ? `Moved ${cur.size} Widget(s) via noexcept move ctor.`
                : `Deep-copied ${cur.size} Widget(s) because move ctor lacked noexcept.`
            } Prior handles at ${VEC_BUFFER_ADDRS[cur.pinnedGen ?? 1]} dangle!`
          : `Appended Widget{${nextSize}} into spare capacity (${nextSize}/${nextCap}). Zero reallocation; pinned handles stay valid.`,
        clause: "[vector.modifiers] §24.3.11.5",
      };
      setVecHistory([...prefix, nextEntry]);
      setStepIndex(prefix.length);
    } else if (action === "reserve") {
      const targetCap = Math.min(16, cur.cap + 4);
      const nextGen = Math.min(cur.allocGen + 1, VEC_BUFFER_ADDRS.length - 1);
      const oldAddr =
        VEC_BUFFER_ADDRS[Math.min(cur.allocGen, VEC_BUFFER_ADDRS.length - 1)];
      const nextEntry: VecHistoryEntry = {
        id: `vec-res-${prefix.length}`,
        label: `reserve(${targetCap}) reallocates buffer`,
        line: 4,
        size: cur.size,
        cap: targetCap,
        allocGen: nextGen,
        pinnedGen: cur.pinnedGen,
        moveCount: cur.moveCount + (isNoexcept ? cur.size : 0),
        copyCount: cur.copyCount + (!isNoexcept ? cur.size : 0),
        reallocated: true,
        oldFreedAddr: oldAddr,
        eventNote: `reserve(${targetCap}) allocated ${VEC_BUFFER_ADDRS[nextGen]} and freed ${oldAddr}, invalidating all old iterators/spans.`,
        clause: "[vector.capacity]",
      };
      setVecHistory([...prefix, nextEntry]);
      setStepIndex(prefix.length);
    } else if (action === "pop") {
      if (cur.size <= 0) return;
      const nextSize = cur.size - 1;
      const nextEntry: VecHistoryEntry = {
        id: `vec-pop-${prefix.length}`,
        label: `pop_back() -> size=${nextSize} (cap=${cur.cap})`,
        line: 4,
        size: nextSize,
        cap: cur.cap,
        allocGen: cur.allocGen,
        pinnedGen: cur.pinnedGen,
        moveCount: cur.moveCount,
        copyCount: cur.copyCount,
        reallocated: false,
        eventNote: `pop_back() destroyed vec[${nextSize}] in place. Capacity stays ${cur.cap}; buffer address ${VEC_BUFFER_ADDRS[cur.allocGen]} unchanged.`,
        clause: "[vector.modifiers]",
      };
      setVecHistory([...prefix, nextEntry]);
      setStepIndex(prefix.length);
    } else if (action === "repin") {
      const nextEntry: VecHistoryEntry = {
        id: `vec-repin-${prefix.length}`,
        label: `Re-pin it/ptr/span to ${VEC_BUFFER_ADDRS[cur.allocGen]}`,
        line: 2,
        size: cur.size,
        cap: cur.cap,
        allocGen: cur.allocGen,
        pinnedGen: cur.allocGen,
        moveCount: cur.moveCount,
        copyCount: cur.copyCount,
        reallocated: false,
        eventNote: `Re-acquired it = vec.begin(), ptr = vec.data(), and span against active buffer ${VEC_BUFFER_ADDRS[cur.allocGen]}.`,
        clause: "[vector.data]",
      };
      setVecHistory([...prefix, nextEntry]);
      setStepIndex(prefix.length);
    }
  }

  function applyStringChange(nextText: string) {
    const len = utf8ByteLength(nextText);
    const prevWasSso = strHeapGen === 0;
    let nextGen = strHeapGen;
    let nextCap = strHeapCap;
    if (len <= 22) {
      nextGen = 0;
      nextCap = 22;
      setStrNote(
        `${len} bytes fit inside the 24-byte inline stack SSO buffer (0x7ffee4b2a881). Zero heap allocations.`
      );
    } else if (prevWasSso || len > strHeapCap) {
      nextGen = strHeapGen + 1;
      nextCap = nextHeapCapacity(len);
      setStrNote(
        `String grew to ${len} bytes (> 22B SSO limit), allocating heap buffer cap=${nextCap} at 0x60000390${(nextGen * 2).toString(16)}000.`
      );
    } else {
      setStrNote(
        `Mutated ${len}-byte heap payload inside existing capacity (${nextCap}).`
      );
    }
    setStrValue(nextText);
    setStrHeapGen(nextGen);
    setStrHeapCap(nextCap);
    setStepIndex(1);
  }

  function recaptureSv() {
    const len = utf8ByteLength(strValue);
    const addr =
      len <= 22
        ? "0x7ffee4b2a881"
        : `0x60000390${(strHeapGen * 2 || 2).toString(16)}000`;
    setSvSnap({ addr, len, preview: strValue });
    setStrNote(`Re-captured std::string_view sv = s at ${addr} (${len} bytes).`);
    setStepIndex(1);
  }

  return (
    <RadDebuggerShell
      ariaLabel="Container reallocation, iterator invalidation, SSO, and mdspan debugger"
      title="raddbg · containers_sso"
      scenarios={scenarios}
      topicSlug={topicSlug}
      scenarioId={scenarioId}
      onScenarioChange={(id) => {
        setScenarioId(id);
        setStepIndex(id === "vector-reallocation" || id === "string-sso-view" ? 1 : 0);
      }}
      stepIndex={stepIndex}
      onStepChange={setStepIndex}
      visualizerTitle="Buffer & Handles"
      toolbarExtra={
        scenarioId === "vector-reallocation" ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              size="xs"
              variant="default"
              onClick={() => appendVecAction("push")}
              disabled={activeVec.size >= 8}
              className="h-6 rounded-[5px] px-2 font-mono text-[11px] cursor-pointer"
            >
              push_back()
            </Button>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => appendVecAction("reserve")}
              className="h-6 rounded-[5px] px-2 font-mono text-[11px] cursor-pointer"
            >
              reserve(+4)
            </Button>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => appendVecAction("pop")}
              disabled={activeVec.size <= 0}
              className="h-6 rounded-[5px] px-2 font-mono text-[11px] cursor-pointer"
            >
              pop_back()
            </Button>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => appendVecAction("repin")}
              className="h-6 rounded-[5px] px-2 font-mono text-[11px] cursor-pointer"
            >
              Re-pin handles
            </Button>
            <label className="ml-1 flex items-center gap-1.5 font-mono text-[11px] text-ink cursor-pointer">
              <Switch
                checked={isNoexcept}
                onCheckedChange={setIsNoexcept}
                aria-label="Toggle noexcept move constructor"
              />
              <span>noexcept</span>
            </label>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={() => {
                setVecHistory(INITIAL_VEC_HISTORY);
                setStepIndex(0);
              }}
              className="ml-auto h-6 rounded-[5px] px-2 font-mono text-[11px] cursor-pointer"
            >
              Reset trace
            </Button>
          </div>
        ) : scenarioId === "string-sso-view" ? (
          <div className="flex flex-wrap items-center gap-1.5 w-full">
            {STRING_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyStringChange(p.value)}
                className={cn(
                  "rounded-[5px] border px-2 py-0.5 font-mono text-[10.5px] cursor-pointer",
                  strValue === p.value
                    ? "border-ink bg-sun text-ink font-semibold"
                    : "border-line bg-paper-raised text-ink-soft hover:text-ink"
                )}
              >
                {p.label}
              </button>
            ))}
            <input
              type="text"
              value={strValue}
              maxLength={48}
              onChange={(e) => applyStringChange(e.target.value)}
              aria-label="Edit std::string payload"
              className="min-w-[140px] flex-1 rounded-[5px] border border-line-strong bg-paper-raised px-2 py-0.5 font-mono text-[11px] text-ink focus:border-ink focus:outline-none"
            />
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={recaptureSv}
              className="h-6 rounded-[5px] px-2 font-mono text-[11px] cursor-pointer"
            >
              Re-capture sv
            </Button>
          </div>
        ) : undefined
      }
      renderVisualizer={({ step, scenario, focusedAddress, onFocusAddress }) => {
        if (scenario.id === "span-mdspan") {
          return (
            <div className="space-y-3">
              <div className="border border-line bg-paper p-2.5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-[11px] font-semibold text-ink">
                    std::mdspan&lt;double, extents&lt;2, 3&gt;&gt; Stride Matrix
                  </span>
                  <StatusPill tone="safe">layout_right (row-major)</StatusPill>
                </div>
                <div className="grid grid-cols-3 gap-1.5 font-mono text-[11px]">
                  {[0, 1].flatMap((r) =>
                    [0, 1, 2].map((c) => {
                      const idx = r * 3 + c;
                      const selected = r === 1 && c === 2;
                      return (
                        <div
                          key={`${r}-${c}`}
                          className={cn(
                            "border p-2",
                            selected
                              ? "border-ink bg-sun text-ink font-semibold"
                              : "border-line bg-paper-raised text-ink"
                          )}
                        >
                          <div className="text-[10px] opacity-75">
                            mat[{r}, {c}] → raw[{idx}]
                          </div>
                          <div className="mt-0.5 text-xs">{idx + 1}.0</div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          );
        }

        const activeRegion =
          step.memory.find((m) => m.segment === "HEAP" && m.status === "alive") ??
          step.memory[0];

        return (
          <div className="space-y-3">
            {/* Buffer Slots Strip */}
            {activeRegion ? (
              <div className="border border-line bg-paper p-2.5">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-[11px] font-semibold text-ink">
                    {activeRegion.name}
                  </span>
                  <AddressChip
                    address={activeRegion.baseAddress}
                    focusedAddress={focusedAddress}
                    onFocusAddress={onFocusAddress}
                  />
                </div>
                <div className="flex flex-wrap gap-1 font-mono text-[10.5px]">
                  {activeRegion.cells.map((cell) => (
                    <div
                      key={`${cell.offset}-${cell.label}`}
                      className={cn(
                        "min-w-[76px] flex-1 border p-1.5",
                        cell.state === "alive"
                          ? "border-[color:var(--right)]/40 bg-right-wash/35 text-ink"
                          : "border-dashed border-line-strong bg-paper-sunk text-ink-faint"
                      )}
                    >
                      <div className="text-[9.5px] opacity-75">{cell.label}</div>
                      <div className="truncate font-semibold">{cell.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Handle Validity Status */}
            <div className="border border-line bg-paper p-2.5">
              <div className="mb-1.5 font-mono text-[11px] font-semibold text-ink">
                Captured Handles &amp; Views
              </div>
              <div className="space-y-1 font-mono text-[11px]">
                {step.watches.map((w) => (
                  <div
                    key={w.id}
                    className={cn(
                      "flex flex-wrap items-center justify-between gap-2 border px-2 py-1",
                      w.tone === "danger"
                        ? "border-wrong/40 bg-wrong-wash/40 text-wrong"
                        : "border-line bg-paper-raised text-ink"
                    )}
                  >
                    <span className="font-semibold">{w.expr}</span>
                    <span className="truncate text-[10.5px]">{w.value}</span>
                    {w.badge ? (
                      <StatusPill tone={w.tone ?? "neutral"} className="text-[10px]">
                        {w.badge}
                      </StatusPill>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      }}
    />
  );
}
