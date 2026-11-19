"use client";

import { useMemo, useState } from "react";
import { RadDebuggerShell } from "@/components/rad-debugger/RadDebuggerShell";
import { StatusPill } from "@/components/rad-debugger/PanePrimitives";
import { cn } from "@/lib/utils";
import {
  buildCpp26Scenarios,
  type ContractInput,
  type ContractSemantic,
} from "./scenarios/cpp26-preview";

const SEMANTICS: ContractSemantic[] = [
  "ignore",
  "observe",
  "enforce",
  "quick_enforce",
];

export function Cpp26PreviewMap({ topicSlug }: { topicSlug?: string }) {
  const [semantic, setSemantic] = useState<ContractSemantic>("enforce");
  const [input, setInput] = useState<ContractInput>("oob");
  const [scenarioId, setScenarioId] = useState<string>(() => {
    if (topicSlug === "reflection") return "reflection-p2996";
    if (topicSlug === "senders-and-receivers") return "execution-p2300";
    return "contracts-p2900";
  });
  const [stepIndex, setStepIndex] = useState<number>(1);

  const scenarios = useMemo(
    () => buildCpp26Scenarios({ semantic, input }),
    [semantic, input]
  );

  return (
    <RadDebuggerShell
      ariaLabel="C++26 contracts, static reflection, and senders/receivers debugger"
      title="raddbg · cpp26_preview"
      scenarios={scenarios}
      topicSlug={topicSlug}
      scenarioId={scenarioId}
      onScenarioChange={(id) => {
        setScenarioId(id);
        setStepIndex(id === "contracts-p2900" ? 1 : 0);
      }}
      stepIndex={stepIndex}
      onStepChange={setStepIndex}
      visualizerTitle="C++26 Pillar View"
      toolbarExtra={
        scenarioId === "contracts-p2900" ? (
          <div className="flex flex-wrap items-center gap-1.5 w-full">
            <span className="font-mono text-[11px] text-ink-soft">
              Semantic:
            </span>
            {SEMANTICS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSemantic(s)}
                className={cn(
                  "rounded-[5px] border px-2 py-0.5 font-mono text-[10.5px] cursor-pointer",
                  semantic === s
                    ? "border-ink bg-sun text-ink font-semibold"
                    : "border-line bg-paper-raised text-ink-soft hover:text-ink"
                )}
              >
                {s}
              </button>
            ))}
            <span className="mx-1 h-4 w-px bg-line-strong" aria-hidden />
            <button
              type="button"
              onClick={() => setInput("valid")}
              className={cn(
                "rounded-[5px] border px-2 py-0.5 font-mono text-[10.5px] cursor-pointer",
                input === "valid"
                  ? "border-ink bg-sun text-ink font-semibold"
                  : "border-line bg-paper-raised text-ink-soft hover:text-ink"
              )}
            >
              i = 2 (valid)
            </button>
            <button
              type="button"
              onClick={() => setInput("oob")}
              className={cn(
                "rounded-[5px] border px-2 py-0.5 font-mono text-[10.5px] cursor-pointer",
                input === "oob"
                  ? "border-ink bg-sun text-ink font-semibold"
                  : "border-line bg-paper-raised text-ink-soft hover:text-ink"
              )}
            >
              i = 9 (OOB)
            </button>
          </div>
        ) : undefined
      }
      renderVisualizer={({ step, scenario }) => (
        <div className="space-y-3">
          <div className="border border-line bg-paper p-2.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-[11px] font-semibold text-ink">
                {scenario.id === "contracts-p2900"
                  ? "P2900 Contract Guard Pipeline"
                  : scenario.id === "reflection-p2996"
                    ? "P2996 Compile-Time Meta Splice"
                    : "P2300 Sender -> OperationState -> Receiver"}
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
                    w.tone === "danger"
                      ? "border-wrong/40 bg-wrong-wash/40 text-wrong"
                      : w.tone === "safe"
                        ? "border-[color:var(--right)]/40 bg-right-wash/35 text-ink"
                        : "border-line bg-paper-raised text-ink"
                  )}
                >
                  <span className="font-semibold">{w.expr}</span>
                  <span>{w.value}</span>
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
      )}
    />
  );
}
