"use client";

import { useMemo, useState } from "react";
import { RadDebuggerShell } from "@/components/rad-debugger/RadDebuggerShell";
import { StatusPill } from "@/components/rad-debugger/PanePrimitives";
import { cn } from "@/lib/utils";
import {
  buildMemoryModelScenarios,
  type OrderMode,
} from "./scenarios/memory-model";

const ORDER_MODES: { id: OrderMode; label: string }[] = [
  { id: "nonatomic", label: "Non-atomic" },
  { id: "relaxed", label: "relaxed" },
  { id: "acq_rel", label: "acquire / release" },
  { id: "seq_cst", label: "seq_cst" },
];

export function MemoryModelMap({ topicSlug }: { topicSlug?: string }) {
  const [orderMode, setOrderMode] = useState<OrderMode>("relaxed");
  const scenarios = useMemo(
    () => buildMemoryModelScenarios(orderMode),
    [orderMode]
  );

  const [scenarioId, setScenarioId] = useState<string>(() =>
    topicSlug === "lock-free-programming-and-aba" ||
    topicSlug === "hazard-pointers-and-rcu"
      ? "aba-hazard"
      : "message-passing"
  );
  const [stepIndex, setStepIndex] = useState<number>(0);

  const supportsOrderToggle =
    scenarioId === "message-passing" || scenarioId === "store-buffering";

  return (
    <RadDebuggerShell
      ariaLabel="C++ memory model, store buffers, and lock-free ABA debugger"
      title="raddbg · memory_model"
      scenarios={scenarios}
      topicSlug={topicSlug}
      scenarioId={scenarioId}
      onScenarioChange={(id) => {
        setScenarioId(id);
        setStepIndex(0);
      }}
      stepIndex={stepIndex}
      onStepChange={setStepIndex}
      visualizerTitle="Cores & Happens-Before"
      toolbarExtra={
        supportsOrderToggle ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[11px] text-ink-soft">
              std::memory_order:
            </span>
            {ORDER_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setOrderMode(m.id)}
                className={cn(
                  "rounded-[5px] border px-2 py-0.5 font-mono text-[11px] transition-colors cursor-pointer",
                  orderMode === m.id
                    ? "border-ink bg-sun text-ink font-semibold"
                    : "border-line bg-paper-raised text-ink-soft hover:border-line-strong hover:text-ink"
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        ) : (
          <span className="font-mono text-[11px] text-ink-soft">
            C++26 Safe Reclamation: compare_exchange_weak ABA vs std::hazard_pointer
          </span>
        )
      }
      renderVisualizer={({ step, scenario }) => {
        const isAba = scenario.id === "aba-hazard";
        const isSafe = step.verdict.tone === "safe";

        if (isAba) {
          return (
            <div className="space-y-3">
              <div className="border border-line bg-paper p-2.5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-[11px] font-semibold text-ink">
                    Treiber Stack &amp; Hazard Registry
                  </span>
                  <StatusPill tone={step.verdict.tone}>
                    {step.verdict.label}
                  </StatusPill>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 font-mono text-[11px]">
                  <div className="border border-line bg-paper-raised p-2">
                    <div className="text-[10px] text-ink-faint">Thread 1 (Consumer)</div>
                    <div className="mt-1 font-semibold text-ink">
                      {step.id === "aba-hp-fix"
                        ? "hp.protect(head) = 0x600001000000"
                        : "snapshot old=A, nxt=B"}
                    </div>
                  </div>
                  <div className="border border-line bg-paper-raised p-2">
                    <div className="text-[10px] text-ink-faint">Thread 2 (Allocator)</div>
                    <div className="mt-1 font-semibold text-ink">
                      {step.id === "aba-hp-fix"
                        ? "Sees A in hp[] -> defers free(A)"
                        : step.id === "aba-bug"
                          ? "Freed B & recycled A @ same addr!"
                          : "Idle (ready to preempt)"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        }

        return (
          <div className="space-y-3">
            {/* Hardware Topology: Core 0 + SB <-> L3 <-> Core 1 + SB */}
            <div className="border border-line bg-paper p-2.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[11px] font-semibold text-ink">
                  Hardware Store Buffers &amp; Coherent L3
                </span>
                <StatusPill tone={step.verdict.tone}>
                  {orderMode}
                </StatusPill>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 font-mono text-[11px]">
                <div className="border border-line bg-paper-raised p-2">
                  <div className="text-[10px] font-semibold text-ink-soft">
                    CORE 0 (Thread 1)
                  </div>
                  <div className="mt-1 text-ink">
                    {scenario.id === "message-passing"
                      ? "data=42; flag.store(1)"
                      : "x.store(1); r1=y.load()"}
                  </div>
                  <div className="mt-1.5 border-t border-line/70 pt-1 text-[10.5px] text-ink-soft">
                    SB: {isSafe ? "Flushed in order" : "May defer flush"}
                  </div>
                </div>

                <div
                  className={cn(
                    "border p-2",
                    isSafe
                      ? "border-[color:var(--right)]/50 bg-right-wash/40"
                      : "border-wrong/40 bg-wrong-wash/35"
                  )}
                >
                  <div className="text-[10px] font-semibold text-ink-soft">
                    SHARED L3 CACHE
                  </div>
                  <div className="mt-1 space-y-0.5 text-[11px]">
                    {step.memory
                      .find((m) => m.segment === "STATIC")
                      ?.cells.map((c) => (
                        <div key={c.label} className="flex justify-between gap-2">
                          <span className="font-semibold text-ink">{c.label}</span>
                          <span className="text-ink-body">{c.value}</span>
                        </div>
                      )) ?? <span className="text-ink-faint">Awaiting commit</span>}
                  </div>
                </div>

                <div className="border border-line bg-paper-raised p-2">
                  <div className="text-[10px] font-semibold text-ink-soft">
                    CORE 1 (Thread 2)
                  </div>
                  <div className="mt-1 text-ink">
                    {scenario.id === "message-passing"
                      ? "while(!flag); assert(data)"
                      : "y.store(1); r2=x.load()"}
                  </div>
                  <div className="mt-1.5 border-t border-line/70 pt-1 text-[10.5px] text-ink-soft">
                    Edge: {isSafe ? "synchronizes-with" : "No HB edge"}
                  </div>
                </div>
              </div>
            </div>

            {/* Abstract Machine Relations */}
            <div className="border border-line bg-paper p-2.5">
              <div className="mb-1.5 font-mono text-[11px] font-semibold text-ink">
                ISO Abstract Machine Relations
              </div>
              <div className="flex flex-wrap gap-1.5">
                <StatusPill tone="info">sequenced-before (intra-thread)</StatusPill>
                <StatusPill tone={isSafe ? "safe" : "danger"}>
                  synchronizes-with: {isSafe ? "YES" : "NONE"}
                </StatusPill>
                <StatusPill tone={step.verdict.tone}>
                  {step.verdict.label}
                </StatusPill>
              </div>
            </div>
          </div>
        );
      }}
    />
  );
}
