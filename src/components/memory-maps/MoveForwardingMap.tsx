"use client";

import { useMemo, useState } from "react";
import { RadDebuggerShell } from "@/components/rad-debugger/RadDebuggerShell";
import {
  AddressChip,
  StatusPill,
} from "@/components/rad-debugger/PanePrimitives";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { buildMoveForwardingScenarios } from "./scenarios/move-forwarding";

export function MoveForwardingMap({ topicSlug }: { topicSlug?: string }) {
  const [isNoexcept, setIsNoexcept] = useState<boolean>(true);
  const scenarios = useMemo(
    () => buildMoveForwardingScenarios(isNoexcept),
    [isNoexcept]
  );

  const [scenarioId, setScenarioId] = useState<string>(() =>
    topicSlug === "copy-and-move" ? "move-vs-copy" : "perfect-forwarding"
  );
  const [stepIndex, setStepIndex] = useState<number>(0);

  return (
    <RadDebuggerShell
      ariaLabel="Move semantics, noexcept reallocation, and perfect forwarding debugger"
      title="raddbg · move_forwarding"
      scenarios={scenarios}
      topicSlug={topicSlug}
      scenarioId={scenarioId}
      onScenarioChange={(id) => {
        setScenarioId(id);
        setStepIndex(0);
      }}
      stepIndex={stepIndex}
      onStepChange={setStepIndex}
      visualizerTitle="Collapsing & Transfer"
      toolbarExtra={
        scenarioId === "noexcept-reallocation" ? (
          <label className="flex items-center gap-2 font-mono text-[11px] text-ink cursor-pointer">
            <Switch
              checked={isNoexcept}
              onCheckedChange={setIsNoexcept}
              aria-label="Toggle noexcept on Buffer move constructor"
            />
            <span>
              Buffer(Buffer&amp;&amp;){" "}
              <strong className={isNoexcept ? "text-[color:var(--right)]" : "text-wrong"}>
                {isNoexcept ? "noexcept" : "/* throwing */"}
              </strong>
            </span>
          </label>
        ) : undefined
      }
      renderVisualizer={({ step, scenario, focusedAddress, onFocusAddress }) => {
        if (scenario.id === "perfect-forwarding") {
          const tNode = step.watches.find((w) => w.id === "fwd-t");
          const sinkNode = step.watches.find((w) => w.id === "fwd-sink");
          return (
            <div className="space-y-3">
              <div className="border border-line bg-paper p-2.5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-[11px] font-semibold text-ink">
                    4-Stage Forwarding Pipeline
                  </span>
                  <StatusPill tone={step.verdict.tone}>
                    {step.verdict.label}
                  </StatusPill>
                </div>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-4 font-mono text-[11px]">
                  <div className="border border-line bg-paper-raised p-2">
                    <div className="text-[10px] text-ink-faint">1. Caller Expr</div>
                    <div className="mt-0.5 font-semibold text-ink">
                      {step.registers?.[0]?.value ?? "expr"}
                    </div>
                  </div>
                  <div className="border border-line bg-paper-raised p-2">
                    <div className="text-[10px] text-ink-faint">2. Deduced T</div>
                    <div className="mt-0.5 font-semibold text-[color:var(--code-blue)]">
                      {tNode?.value ?? "Widget"}
                    </div>
                  </div>
                  <div className="border border-line bg-paper-raised p-2">
                    <div className="text-[10px] text-ink-faint">3. T&amp;&amp; Collapse</div>
                    <div className="mt-0.5 font-semibold text-ink">
                      {step.registers?.[2]?.value ?? "Widget&&"}
                    </div>
                  </div>
                  <div className="border border-ink bg-sun-wash p-2">
                    <div className="text-[10px] text-ink-soft">4. forward&lt;T&gt;</div>
                    <div className="mt-0.5 font-semibold text-ink">
                      {sinkNode?.value ?? "sink(Widget&&)"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        }

        return (
          <div className="space-y-3">
            <div className="border border-line bg-paper p-2.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[11px] font-semibold text-ink">
                  Heap Ownership Transfer
                </span>
                <StatusPill tone={step.verdict.tone}>
                  {step.verdict.label}
                </StatusPill>
              </div>
              <div className="space-y-1.5 font-mono text-[11px]">
                {step.watches.map((w) => (
                  <div
                    key={w.id}
                    className={cn(
                      "flex flex-wrap items-center justify-between gap-2 border px-2 py-1.5",
                      w.tone === "safe"
                        ? "border-[color:var(--right)]/40 bg-right-wash/35"
                        : w.tone === "danger"
                          ? "border-wrong/40 bg-wrong-wash/35"
                          : "border-line bg-paper-raised"
                    )}
                  >
                    <span className="font-semibold text-ink">{w.expr}</span>
                    <span className="text-ink-body">{w.value}</span>
                    {w.address ? (
                      <AddressChip
                        address={w.address}
                        focusedAddress={focusedAddress}
                        onFocusAddress={onFocusAddress}
                      />
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
