"use client";

import { RadDebuggerShell } from "@/components/rad-debugger/RadDebuggerShell";
import { StatusPill } from "@/components/rad-debugger/PanePrimitives";
import { cn } from "@/lib/utils";
import { OBJECT_LIFETIME_SCENARIOS } from "./scenarios/object-lifetime";

function getPhaseIndex(verdictLabel: string): number {
  const lower = verdictLabel.toLowerCase();
  if (lower.includes("uninit") || lower.includes("raw storage")) return 1;
  if (lower.includes("alive") || lower.includes("valid")) return 2;
  if (lower.includes("lifetime ended")) return 3;
  if (lower.includes("freed") || lower.includes("dangling") || lower.includes("ub"))
    return 4;
  return 2;
}

const PHASES = [
  { id: 0, name: "Unallocated", detail: "No memory acquired" },
  { id: 1, name: "Storage Only", detail: "Bytes exist, no object" },
  { id: 2, name: "Lifetime Active", detail: "Valid to read/write" },
  { id: 3, name: "Lifetime Ended", detail: "~T() ran, bytes remain" },
  { id: 4, name: "Freed / UB", detail: "Returned or invalid access" },
];

const TBAA_RULES = [
  { type: "Same / cv-qualified T", legal: true, note: "Always valid" },
  {
    type: "char / unsigned char / std::byte",
    legal: true,
    note: "Permitted byte inspection",
  },
  {
    type: "Unrelated type* (int* ↔ float*)",
    legal: false,
    note: "TBAA UB (-O2 miscompiles)",
  },
  {
    type: "std::bit_cast / memcpy",
    legal: true,
    note: "Creates new value cleanly",
  },
];

export function ObjectLifetimeMap({ topicSlug }: { topicSlug?: string }) {
  return (
    <RadDebuggerShell
      ariaLabel="Object lifetime, dynamic storage, and strict aliasing debugger"
      title="raddbg · object_lifetime"
      scenarios={OBJECT_LIFETIME_SCENARIOS}
      topicSlug={topicSlug}
      visualizerTitle="Lifetime & TBAA"
      renderVisualizer={({ step, scenario }) => {
        const activePhase = getPhaseIndex(step.verdict.label);
        const isTbaa = scenario.id === "strict-aliasing-bitcast";

        return (
          <div className="space-y-3">
            {/* Storage vs Object Lifetime State Machine */}
            <div className="border border-line bg-paper p-2.5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] font-semibold text-ink">
                  Storage Duration vs Object Lifetime
                </span>
                <span className="font-mono text-[10.5px] text-ink-soft">
                  [basic.life]
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
                {PHASES.map((phase) => {
                  const active = phase.id === activePhase;
                  return (
                    <div
                      key={phase.id}
                      className={cn(
                        "border p-1.5 font-mono transition-colors",
                        active
                          ? phase.id === 4
                            ? "border-wrong bg-wrong-wash text-wrong font-semibold"
                            : phase.id === 2
                              ? "border-[color:var(--right)] bg-right-wash text-[color:var(--right)] font-semibold"
                              : "border-ink bg-sun text-ink font-semibold"
                          : "border-line bg-paper-raised text-ink-faint"
                      )}
                    >
                      <div className="text-[10.5px]">{phase.name}</div>
                      <div className="mt-0.5 font-sans text-[10px] leading-tight opacity-85">
                        {phase.detail}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* TBAA / Effective Type Matrix */}
            <div className="border border-line bg-paper p-2.5">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] font-semibold text-ink">
                  {isTbaa
                    ? "Effective Type & TBAA Aliasing Rules"
                    : "Active Storage Regions"}
                </span>
                <StatusPill tone={step.verdict.tone}>
                  {step.verdict.label}
                </StatusPill>
              </div>
              {isTbaa ? (
                <div className="space-y-1 font-mono text-[11px]">
                  {TBAA_RULES.map((rule) => (
                    <div
                      key={rule.type}
                      className="flex flex-wrap items-center justify-between gap-2 border border-line bg-paper-raised px-2 py-1"
                    >
                      <span className="font-semibold text-ink">{rule.type}</span>
                      <span className="font-sans text-[11px] text-ink-soft">
                        {rule.note}
                      </span>
                      <StatusPill
                        tone={rule.legal ? "safe" : "danger"}
                        className="text-[10px]"
                      >
                        {rule.legal ? "LEGAL" : "UB"}
                      </StatusPill>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-1 font-mono text-[11px]">
                  {step.memory.map((region) => (
                    <div
                      key={region.id}
                      className="flex flex-wrap items-center justify-between gap-2 border border-line bg-paper-raised px-2 py-1"
                    >
                      <span className="font-semibold text-ink">
                        [{region.segment}] {region.name}
                      </span>
                      <span className="text-ink-soft">{region.baseAddress}</span>
                      <StatusPill
                        tone={
                          region.status === "dangling" ||
                          region.status === "freed"
                            ? "danger"
                            : region.status === "alive"
                              ? "safe"
                              : "info"
                        }
                        className="text-[10px]"
                      >
                        {region.statusLabel ?? region.status ?? "ACTIVE"}
                      </StatusPill>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      }}
    />
  );
}
