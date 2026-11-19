"use client";

import { RadDebuggerShell } from "@/components/rad-debugger/RadDebuggerShell";
import {
  AddressChip,
  StatusPill,
} from "@/components/rad-debugger/PanePrimitives";
import { cn } from "@/lib/utils";
import { COROUTINE_FRAME_SCENARIOS } from "./scenarios/coroutine-frame";

const CORO_STATES = [
  { id: "coro-alloc", label: "ALLOC + INIT" },
  { id: "coro-yield", label: "SUSPENDED #1" },
  { id: "coro-final", label: "FINAL_SUSPEND" },
  { id: "coro-destroy", label: "FREED" },
];

export function CoroutineFrameMap({ topicSlug }: { topicSlug?: string }) {
  return (
    <RadDebuggerShell
      ariaLabel="Coroutine heap frame, suspend index, and symmetric transfer debugger"
      title="raddbg · coroutine_frame"
      scenarios={COROUTINE_FRAME_SCENARIOS}
      topicSlug={topicSlug}
      visualizerTitle="Coro Frame & Transfer"
      renderVisualizer={({ step, scenario, focusedAddress, onFocusAddress }) => {
        const isLifecycle = scenario.id === "coro-lifecycle";

        return (
          <div className="space-y-3">
            {isLifecycle ? (
              <div className="border border-line bg-paper p-2.5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-[11px] font-semibold text-ink">
                    Coroutine State Machine
                  </span>
                  <StatusPill tone={step.verdict.tone}>
                    {step.verdict.label}
                  </StatusPill>
                </div>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 font-mono text-[10.5px]">
                  {CORO_STATES.map((st) => {
                    const active = st.id === step.id;
                    return (
                      <div
                        key={st.id}
                        className={cn(
                          "border px-2 py-1.5 text-center",
                          active
                            ? "border-ink bg-sun text-ink font-semibold"
                            : "border-line bg-paper-raised text-ink-soft"
                        )}
                      >
                        {st.label}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="border border-line bg-paper p-2.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[11px] font-semibold text-ink">
                  Stack Handle ↔ Coroutine Frame Transfer
                </span>
                <StatusPill tone={step.verdict.tone}>
                  {step.verdict.label}
                </StatusPill>
              </div>
              <div className="space-y-1.5 font-mono text-[11px]">
                {step.memory.map((region) => (
                  <div
                    key={region.id}
                    className="border border-line bg-paper-raised p-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-ink">
                        [{region.segment}] {region.name}
                      </span>
                      <AddressChip
                        address={region.baseAddress}
                        focusedAddress={focusedAddress}
                        onFocusAddress={onFocusAddress}
                      />
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {region.cells.map((cell) => (
                        <span
                          key={cell.label}
                          className={cn(
                            "rounded-[4px] border px-1.5 py-0.5 text-[10px]",
                            cell.state === "ub" || cell.state === "dangling"
                              ? "border-wrong/40 bg-wrong-wash text-wrong"
                              : cell.state === "freed"
                                ? "border-line bg-paper-sunk text-ink-faint line-through"
                                : "border-line bg-paper text-ink"
                          )}
                        >
                          {cell.offset} {cell.label}: {cell.value}
                        </span>
                      ))}
                    </div>
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
