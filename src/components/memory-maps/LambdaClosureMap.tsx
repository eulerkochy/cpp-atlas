"use client";

import { useMemo, useState } from "react";
import { RadDebuggerShell } from "@/components/rad-debugger/RadDebuggerShell";
import {
  AddressChip,
  StatusPill,
} from "@/components/rad-debugger/PanePrimitives";
import { cn } from "@/lib/utils";
import {
  buildLambdaClosureScenarios,
  type ThisCaptureMode,
} from "./scenarios/lambda-closures";

export function LambdaClosureMap({ topicSlug }: { topicSlug?: string }) {
  const [thisMode, setThisMode] = useState<ThisCaptureMode>("ptr");
  const scenarios = useMemo(
    () => buildLambdaClosureScenarios(thisMode),
    [thisMode]
  );

  const [scenarioId, setScenarioId] = useState<string>(() =>
    topicSlug === "callable-wrappers"
      ? "type-erased-wrappers"
      : "captures-desugar"
  );
  const [stepIndex, setStepIndex] = useState<number>(0);

  return (
    <RadDebuggerShell
      ariaLabel="Lambda closure types, capture desugaring, and callable wrappers debugger"
      title="raddbg · lambda_closures"
      scenarios={scenarios}
      topicSlug={topicSlug}
      scenarioId={scenarioId}
      onScenarioChange={(id) => {
        setScenarioId(id);
        setStepIndex(0);
      }}
      stepIndex={stepIndex}
      onStepChange={setStepIndex}
      visualizerTitle="Closure Desugaring"
      toolbarExtra={
        scenarioId === "this-capture-trap" ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[11px] text-ink-soft">
              Capture mode:
            </span>
            <button
              type="button"
              onClick={() => setThisMode("ptr")}
              className={cn(
                "rounded-[5px] border px-2 py-0.5 font-mono text-[11px] cursor-pointer",
                thisMode === "ptr"
                  ? "border-ink bg-sun text-ink font-semibold"
                  : "border-line bg-paper-raised text-ink-soft hover:text-ink"
              )}
            >
              [=, this] (Pointer Trap)
            </button>
            <button
              type="button"
              onClick={() => setThisMode("copy")}
              className={cn(
                "rounded-[5px] border px-2 py-0.5 font-mono text-[11px] cursor-pointer",
                thisMode === "copy"
                  ? "border-ink bg-sun text-ink font-semibold"
                  : "border-line bg-paper-raised text-ink-soft hover:text-ink"
              )}
            >
              [=, *this] (C++17 Copy)
            </button>
          </div>
        ) : undefined
      }
      renderVisualizer={({ step, focusedAddress, onFocusAddress }) => {
        const structReg = step.registers?.find(
          (r) => r.name === "synthesized_struct"
        );
        const traitRegs =
          step.registers?.filter((r) => r.name !== "synthesized_struct") ?? [];

        return (
          <div className="space-y-3">
            {/* Compiler-Synthesized Closure Struct */}
            <div className="border border-line bg-paper p-2.5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] font-semibold text-ink">
                  Compiler-Synthesized Closure Type
                </span>
                <StatusPill tone={step.verdict.tone}>
                  {step.verdict.label}
                </StatusPill>
              </div>
              {structReg ? (
                <pre className="overflow-x-auto border border-line bg-paper-raised px-2.5 py-2 font-mono text-[11.5px] text-[color:var(--code-blue)]">
                  {structReg.value}
                </pre>
              ) : null}
              {traitRegs.length > 0 ? (
                <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2 font-mono text-[11px]">
                  {traitRegs.map((reg) => (
                    <div
                      key={reg.name}
                      className="flex items-center justify-between gap-2 border border-line bg-paper-raised px-2 py-1"
                    >
                      <span className="text-ink-faint">{reg.name}</span>
                      <span className="font-semibold text-ink">
                        {reg.value}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Captured Members & Storage Targets */}
            <div className="border border-line bg-paper p-2.5">
              <div className="mb-1.5 font-mono text-[11px] font-semibold text-ink">
                Captured Members &amp; Targets
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
