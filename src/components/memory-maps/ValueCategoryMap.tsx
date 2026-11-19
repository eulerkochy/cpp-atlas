"use client";

import { RadDebuggerShell } from "@/components/rad-debugger/RadDebuggerShell";
import {
  AddressChip,
  StatusPill,
} from "@/components/rad-debugger/PanePrimitives";
import { cn } from "@/lib/utils";
import { VALUE_CATEGORY_SCENARIOS } from "./scenarios/value-categories";

type TaxonomyCell = "lvalue" | "xvalue" | "prvalue" | "none";

function detectActiveCategory(verdictLabel: string): TaxonomyCell {
  const lower = verdictLabel.toLowerCase();
  if (lower.includes("xvalue")) return "xvalue";
  if (lower.includes("prvalue") || lower.includes("elided")) return "prvalue";
  if (lower.includes("lvalue") || lower.includes("extended")) return "lvalue";
  return "none";
}

export function ValueCategoryMap({
  topicSlug,
  compact = false,
}: {
  topicSlug?: string;
  compact?: boolean;
}) {
  return (
    <RadDebuggerShell
      ariaLabel="Value categories, copy elision, and reference binding debugger"
      title="raddbg · value_categories"
      scenarios={VALUE_CATEGORY_SCENARIOS}
      topicSlug={topicSlug}
      compact={compact}
      visualizerTitle="Value Lattice"
      renderVisualizer={({ step, focusedAddress, onFocusAddress }) => {
        const activeCat = detectActiveCategory(step.verdict.label);
        const isGlvalue = activeCat === "lvalue" || activeCat === "xvalue";
        const isRvalue = activeCat === "xvalue" || activeCat === "prvalue";

        return (
          <div className="space-y-3">
            {/* Two-Axis Value Category Lattice */}
            <div className="border border-line bg-paper p-2.5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] font-semibold text-ink">
                  C++17 Value Category Lattice
                </span>
                <span className="font-mono text-[10.5px] text-ink-soft">
                  [basic.lval]
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1.5 font-mono text-[11px]">
                <div className="border border-line bg-paper-sunk/60 p-1.5 text-[10px] text-ink-faint">
                  Axis
                </div>
                <div
                  className={cn(
                    "border p-1.5 text-center font-semibold",
                    isGlvalue
                      ? "border-ink bg-sun-wash text-ink"
                      : "border-line bg-paper-sunk/60 text-ink-soft"
                  )}
                >
                  glvalue (identity)
                </div>
                <div
                  className={cn(
                    "border p-1.5 text-center font-semibold",
                    !isGlvalue && activeCat !== "none"
                      ? "border-ink bg-sun-wash text-ink"
                      : "border-line bg-paper-sunk/60 text-ink-soft"
                  )}
                >
                  !glvalue (recipe)
                </div>

                {/* Row 1: !rvalue */}
                <div
                  className={cn(
                    "border p-1.5 font-semibold",
                    !isRvalue && activeCat !== "none"
                      ? "border-ink bg-sun-wash text-ink"
                      : "border-line bg-paper-sunk/60 text-ink-soft"
                  )}
                >
                  !rvalue
                </div>
                <div
                  className={cn(
                    "border p-2 transition-colors",
                    activeCat === "lvalue"
                      ? "border-ink bg-sun text-ink font-semibold"
                      : "border-line bg-paper-raised text-ink-soft"
                  )}
                >
                  <div>lvalue</div>
                  <div className="mt-0.5 font-sans text-[10px] opacity-85">
                    Has address, cannot steal
                  </div>
                </div>
                <div className="border border-dashed border-line bg-paper-sunk/30 p-2 text-ink-faint">
                  <div>impossible</div>
                  <div className="mt-0.5 font-sans text-[10px]">
                    No identity &amp; non-movable
                  </div>
                </div>

                {/* Row 2: rvalue */}
                <div
                  className={cn(
                    "border p-1.5 font-semibold",
                    isRvalue
                      ? "border-ink bg-sun-wash text-ink"
                      : "border-line bg-paper-sunk/60 text-ink-soft"
                  )}
                >
                  rvalue (movable)
                </div>
                <div
                  className={cn(
                    "border p-2 transition-colors",
                    activeCat === "xvalue"
                      ? "border-ink bg-sun text-ink font-semibold"
                      : "border-line bg-paper-raised text-ink-soft"
                  )}
                >
                  <div>xvalue</div>
                  <div className="mt-0.5 font-sans text-[10px] opacity-85">
                    Identity + expiring
                  </div>
                </div>
                <div
                  className={cn(
                    "border p-2 transition-colors",
                    activeCat === "prvalue"
                      ? "border-ink bg-sun text-ink font-semibold"
                      : "border-line bg-paper-raised text-ink-soft"
                  )}
                >
                  <div>prvalue</div>
                  <div className="mt-0.5 font-sans text-[10px] opacity-85">
                    Init recipe (elidable)
                  </div>
                </div>
              </div>
            </div>

            {/* Active Watch Targets & Materialization Summary */}
            <div className="border border-line bg-paper p-2.5">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="font-mono text-[11px] font-semibold text-ink">
                  Materialization &amp; Storage Probe
                </span>
                <StatusPill tone={step.verdict.tone}>
                  {step.verdict.label}
                </StatusPill>
              </div>
              <div className="space-y-1.5">
                {step.watches.map((w) => (
                  <div
                    key={w.id}
                    className="flex flex-wrap items-center justify-between gap-2 border border-line bg-paper-raised px-2 py-1 font-mono text-[11px]"
                  >
                    <span className="font-semibold text-ink">{w.expr}</span>
                    <span className="text-ink-soft">{w.type}</span>
                    {w.address ? (
                      <AddressChip
                        address={w.address}
                        focusedAddress={focusedAddress}
                        onFocusAddress={onFocusAddress}
                      />
                    ) : (
                      <StatusPill tone="safe" className="text-[10px]">
                        Unmaterialized
                      </StatusPill>
                    )}
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
