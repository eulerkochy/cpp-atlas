"use client";

import { useMemo, useState } from "react";
import { RadDebuggerShell } from "@/components/rad-debugger/RadDebuggerShell";
import { StatusPill } from "@/components/rad-debugger/PanePrimitives";
import { cn } from "@/lib/utils";
import {
  buildOverloadLookupScenarios,
  type SwapCallMode,
} from "./scenarios/overload-lookup";

const CONVERSION_LADDER = [
  { rank: 1, name: "Exact Match", note: "Identity, lvalue->rvalue" },
  { rank: 2, name: "Qualification", note: "T* -> const T*" },
  { rank: 3, name: "Promotion", note: "char/bool -> int, float -> double" },
  { rank: 4, name: "Standard", note: "int -> long/double, Derived* -> Base*" },
  { rank: 5, name: "User-defined", note: "Converting ctor / operator T()" },
];

export function OverloadLookupMap({ topicSlug }: { topicSlug?: string }) {
  const [swapMode, setSwapMode] = useState<SwapCallMode>("two-step");
  const scenarios = useMemo(
    () => buildOverloadLookupScenarios(swapMode),
    [swapMode]
  );

  const [scenarioId, setScenarioId] = useState<string>(() => {
    if (topicSlug === "name-lookup-and-adl") return "adl-two-step-swap";
    if (topicSlug === "operator-overloading") return "spaceship-rewrite";
    if (topicSlug === "dependent-names-and-two-phase-lookup")
      return "two-phase-lookup";
    return "conversion-ranks";
  });
  const [stepIndex, setStepIndex] = useState<number>(0);

  return (
    <RadDebuggerShell
      ariaLabel="Overload resolution, conversion ranks, ADL, and two-phase lookup debugger"
      title="raddbg · overload_lookup"
      scenarios={scenarios}
      topicSlug={topicSlug}
      scenarioId={scenarioId}
      onScenarioChange={(id) => {
        setScenarioId(id);
        setStepIndex(0);
      }}
      stepIndex={stepIndex}
      onStepChange={setStepIndex}
      visualizerTitle="Lookup & Rank Matrix"
      toolbarExtra={
        scenarioId === "adl-two-step-swap" ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[11px] text-ink-soft">
              Call syntax:
            </span>
            <button
              type="button"
              onClick={() => setSwapMode("two-step")}
              className={cn(
                "rounded-[5px] border px-2 py-0.5 font-mono text-[11px] cursor-pointer",
                swapMode === "two-step"
                  ? "border-ink bg-sun text-ink font-semibold"
                  : "border-line bg-paper-raised text-ink-soft hover:text-ink"
              )}
            >
              using std::swap; swap(a, b); (ADL)
            </button>
            <button
              type="button"
              onClick={() => setSwapMode("qualified")}
              className={cn(
                "rounded-[5px] border px-2 py-0.5 font-mono text-[11px] cursor-pointer",
                swapMode === "qualified"
                  ? "border-ink bg-sun text-ink font-semibold"
                  : "border-line bg-paper-raised text-ink-soft hover:text-ink"
              )}
            >
              std::swap(a, b); (Qualified Trap)
            </button>
          </div>
        ) : undefined
      }
      renderVisualizer={({ step, scenario }) => {
        const isRanks = scenario.id === "conversion-ranks";

        return (
          <div className="space-y-3">
            {isRanks ? (
              <div className="border border-line bg-paper p-2.5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-[11px] font-semibold text-ink">
                    Conversion Sequence Rank Ladder
                  </span>
                  <StatusPill tone={step.verdict.tone}>
                    {step.verdict.label}
                  </StatusPill>
                </div>
                <div className="space-y-1 font-mono text-[11px]">
                  {CONVERSION_LADDER.map((tier) => {
                    const hit = step.watches.some((w) =>
                      w.value.includes(tier.name) || w.type.includes(String(tier.rank))
                    );
                    const isAmbig =
                      step.id === "ov-ambig" && tier.name === "Standard";
                    return (
                      <div
                        key={tier.rank}
                        className={cn(
                          "flex flex-wrap items-center justify-between gap-2 border px-2 py-1",
                          isAmbig
                            ? "border-wrong bg-wrong-wash text-wrong font-semibold"
                            : hit
                              ? "border-ink bg-sun-wash text-ink font-semibold"
                              : "border-line bg-paper-raised text-ink-soft"
                        )}
                      >
                        <span>
                          #{tier.rank} {tier.name}
                        </span>
                        <span className="font-sans text-[10.5px]">
                          {tier.note}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="border border-line bg-paper p-2.5">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="font-mono text-[11px] font-semibold text-ink">
                  Candidate Viability &amp; Lookup Scope
                </span>
                <StatusPill tone={step.verdict.tone}>
                  {step.verdict.label}
                </StatusPill>
              </div>
              <div className="space-y-1 font-mono text-[11px]">
                {step.watches.map((w) => (
                  <div
                    key={w.id}
                    className="flex flex-wrap items-center justify-between gap-2 border border-line bg-paper-raised px-2 py-1"
                  >
                    <span className="font-semibold text-ink">{w.expr}</span>
                    <span className="text-ink-body">{w.value}</span>
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
