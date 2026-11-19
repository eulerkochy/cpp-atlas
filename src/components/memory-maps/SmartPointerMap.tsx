"use client";

import { useMemo, useState } from "react";
import { RadDebuggerShell } from "@/components/rad-debugger/RadDebuggerShell";
import {
  AddressChip,
  StatusPill,
} from "@/components/rad-debugger/PanePrimitives";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  buildSmartPointerScenarios,
  type AllocStrategy,
  type SharedHistoryEntry,
} from "./scenarios/smart-pointers";

const INITIAL_SP_HISTORY: SharedHistoryEntry[] = [
  {
    id: "sp-init",
    label: "Init sp1 (strong=1) + wp1 (weak=1)",
    line: 2,
    strong: 1,
    weak: 1,
    dtorRan: false,
    controlFreed: false,
    lockResult: "none",
    eventNote:
      "Constructed sp1 (strong = 1) and observing wp1 (weak = 1). Notice internal weak refcount is 2 (1 user weak + 1 implicit lock held by live strong owners).",
    clause: "[util.smartptr.shared]",
  },
  {
    id: "sp-copy",
    label: "sp2 = sp1 (strong -> 2)",
    line: 3,
    strong: 2,
    weak: 1,
    dtorRan: false,
    controlFreed: false,
    lockResult: "none",
    eventNote:
      "Copying shared_ptr atomically increments strong to 2 (relaxed fetch_add). Widget remains alive.",
    clause: "[util.smartptr.shared.const]",
  },
];

export function SmartPointerMap({ topicSlug }: { topicSlug?: string }) {
  const [strategy, setStrategy] = useState<AllocStrategy>("make_shared");
  const [spHistory, setSpHistory] =
    useState<SharedHistoryEntry[]>(INITIAL_SP_HISTORY);
  const [scenarioId, setScenarioId] = useState<string>(() => {
    if (topicSlug === "raii-and-resource-management") return "raii-unique-unwind";
    if (topicSlug === "allocators-and-pmr") return "pmr-monotonic";
    return "shared-control-block";
  });
  const [stepIndex, setStepIndex] = useState<number>(0);

  const scenarios = useMemo(
    () => buildSmartPointerScenarios({ strategy, spHistory }),
    [strategy, spHistory]
  );

  const activeSpIdx = Math.max(0, Math.min(stepIndex, spHistory.length - 1));
  const cur = spHistory[activeSpIdx];

  function appendSpAction(
    action: "copy" | "add_weak" | "reset_strong" | "lock" | "reset_weak"
  ) {
    const prefix = spHistory.slice(0, activeSpIdx + 1);
    if (action === "copy") {
      if (cur.strong === 0 || cur.controlFreed) return;
      const nextStrong = cur.strong + 1;
      setSpHistory([
        ...prefix,
        {
          ...cur,
          id: `sp-copy-${prefix.length}`,
          label: `Copy sp (strong -> ${nextStrong})`,
          line: 3,
          strong: nextStrong,
          lockResult: "none",
          eventNote: `Copied shared_ptr: strong incremented to ${nextStrong}.`,
          clause: "[util.smartptr.shared.const]",
        },
      ]);
      setStepIndex(prefix.length);
    } else if (action === "add_weak") {
      if (cur.controlFreed) return;
      const nextWeak = cur.weak + 1;
      setSpHistory([
        ...prefix,
        {
          ...cur,
          id: `sp-wp-${prefix.length}`,
          label: `Add wp (weak -> ${nextWeak})`,
          line: 2,
          weak: nextWeak,
          lockResult: "none",
          eventNote: `Created weak_ptr: user weak count is now ${nextWeak}. Does not extend Widget lifetime.`,
          clause: "[util.smartptr.weak]",
        },
      ]);
      setStepIndex(prefix.length);
    } else if (action === "reset_strong") {
      if (cur.strong === 0) return;
      const freedNow = cur.weak === 0;
      setSpHistory([
        ...prefix,
        {
          ...cur,
          id: `sp-reset-s-${prefix.length}`,
          label: "Reset all sp (strong -> 0)",
          line: 4,
          strong: 0,
          dtorRan: true,
          controlFreed: freedNow,
          lockResult: "none",
          eventNote: freedNow
            ? "strong == 0 and weak == 0: ~Widget() ran and all heap memory freed."
            : strategy === "make_shared"
              ? `strong == 0: ~Widget() ran, yet ${cur.weak} weak_ptr(s) pin the entire contiguous [control | inline Widget] allocation!`
              : `strong == 0: ~Widget() + delete freed Widget immediately! Only the 24B control block stays alive for ${cur.weak} weak_ptr(s).`,
          clause: "[util.smartptr.shared.dest]",
        },
      ]);
      setStepIndex(prefix.length);
    } else if (action === "lock") {
      if (cur.weak === 0 || cur.controlFreed) return;
      if (cur.strong > 0) {
        const nextStrong = cur.strong + 1;
        setSpHistory([
          ...prefix,
          {
            ...cur,
            id: `sp-lock-${prefix.length}`,
            label: `wp.lock() -> OK (strong=${nextStrong})`,
            line: 5,
            strong: nextStrong,
            lockResult: "ok",
            eventNote: `wp1.lock() succeeded atomically: strong incremented to ${nextStrong}.`,
            clause: "[util.smartptr.weak.obs]",
          },
        ]);
      } else {
        setSpHistory([
          ...prefix,
          {
            ...cur,
            id: `sp-lock-${prefix.length}`,
            label: "wp.lock() -> expired (nullptr)",
            line: 5,
            lockResult: "expired",
            eventNote:
              "wp1.lock() observed strong == 0 on the surviving control block and safely returned empty shared_ptr<Widget>{}.",
            clause: "[util.smartptr.weak.obs]",
          },
        ]);
      }
      setStepIndex(prefix.length);
    } else if (action === "reset_weak") {
      if (cur.weak === 0) return;
      const freedNow = cur.strong === 0;
      setSpHistory([
        ...prefix,
        {
          ...cur,
          id: `sp-reset-w-${prefix.length}`,
          label: "Reset all wp (weak -> 0)",
          line: 6,
          weak: 0,
          controlFreed: freedNow,
          lockResult: "none",
          eventNote: freedNow
            ? "Last weak_ptr released: control block (and any pinned make_shared block) freed."
            : "All weak_ptrs cleared; strong owners still keep Widget alive.",
          clause: "[util.smartptr.weak.mod]",
        },
      ]);
      setStepIndex(prefix.length);
    }
  }

  return (
    <RadDebuggerShell
      ariaLabel="Smart pointers control block, RAII stack unwinding, and PMR arena debugger"
      title="raddbg · smart_pointers"
      scenarios={scenarios}
      topicSlug={topicSlug}
      scenarioId={scenarioId}
      onScenarioChange={(id) => {
        setScenarioId(id);
        setStepIndex(0);
      }}
      stepIndex={stepIndex}
      onStepChange={setStepIndex}
      visualizerTitle="Control Block & Ownership"
      toolbarExtra={
        scenarioId === "shared-control-block" ? (
          <div className="flex flex-wrap items-center gap-1.5 w-full">
            <button
              type="button"
              onClick={() => setStrategy("make_shared")}
              className={cn(
                "rounded-[5px] border px-2 py-0.5 font-mono text-[10.5px] cursor-pointer",
                strategy === "make_shared"
                  ? "border-ink bg-sun text-ink font-semibold"
                  : "border-line bg-paper-raised text-ink-soft hover:text-ink"
              )}
            >
              std::make_shared
            </button>
            <button
              type="button"
              onClick={() => setStrategy("new_widget")}
              className={cn(
                "rounded-[5px] border px-2 py-0.5 font-mono text-[10.5px] cursor-pointer",
                strategy === "new_widget"
                  ? "border-ink bg-sun text-ink font-semibold"
                  : "border-line bg-paper-raised text-ink-soft hover:text-ink"
              )}
            >
              new Widget
            </button>
            <span className="mx-1 h-4 w-px bg-line-strong" aria-hidden />
            <Button
              type="button"
              size="xs"
              variant="default"
              disabled={cur.strong === 0 || cur.controlFreed}
              onClick={() => appendSpAction("copy")}
              className="h-6 rounded-[5px] px-2 font-mono text-[10.5px] cursor-pointer"
            >
              +Copy sp
            </Button>
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={cur.controlFreed}
              onClick={() => appendSpAction("add_weak")}
              className="h-6 rounded-[5px] px-2 font-mono text-[10.5px] cursor-pointer"
            >
              +Add wp
            </Button>
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={cur.strong === 0}
              onClick={() => appendSpAction("reset_strong")}
              className="h-6 rounded-[5px] px-2 font-mono text-[10.5px] cursor-pointer"
            >
              Reset all sp
            </Button>
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={cur.weak === 0 || cur.controlFreed}
              onClick={() => appendSpAction("lock")}
              className="h-6 rounded-[5px] px-2 font-mono text-[10.5px] cursor-pointer"
            >
              wp.lock()
            </Button>
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={cur.weak === 0}
              onClick={() => appendSpAction("reset_weak")}
              className="h-6 rounded-[5px] px-2 font-mono text-[10.5px] cursor-pointer"
            >
              Reset all wp
            </Button>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={() => {
                setSpHistory(INITIAL_SP_HISTORY);
                setStepIndex(0);
              }}
              className="ml-auto h-6 rounded-[5px] px-2 font-mono text-[10.5px] cursor-pointer"
            >
              Reset trace
            </Button>
          </div>
        ) : undefined
      }
      renderVisualizer={({ step, focusedAddress, onFocusAddress }) => (
        <div className="space-y-3">
          <div className="border border-line bg-paper p-2.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-[11px] font-semibold text-ink">
                Ownership Topology
              </span>
              <StatusPill tone={step.verdict.tone}>
                {step.verdict.label}
              </StatusPill>
            </div>
            <div className="space-y-2 font-mono text-[11px]">
              {step.memory.map((region) => (
                <div
                  key={region.id}
                  className={cn(
                    "border p-2",
                    region.status === "freed"
                      ? "border-line bg-paper-sunk text-ink-faint"
                      : region.status === "dangling"
                        ? "border-sun-deep bg-sun-wash/50 text-ink"
                        : "border-[color:var(--right)]/40 bg-right-wash/30 text-ink"
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{region.name}</span>
                    <AddressChip
                      address={region.baseAddress}
                      focusedAddress={focusedAddress}
                      onFocusAddress={onFocusAddress}
                    />
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {region.cells.map((c) => (
                      <span
                        key={c.label}
                        className="rounded-[4px] border border-line bg-paper-raised px-1.5 py-0.5 text-[10.5px]"
                      >
                        {c.label}: {c.value}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    />
  );
}
