"use client";

import { RadDebuggerShell } from "@/components/rad-debugger/RadDebuggerShell";
import {
  AddressChip,
  StatusPill,
} from "@/components/rad-debugger/PanePrimitives";
import { cn } from "@/lib/utils";
import { VTABLE_LAYOUT_SCENARIOS } from "./scenarios/vtable-layout";

export function VtableLayoutMap({ topicSlug }: { topicSlug?: string }) {
  return (
    <RadDebuggerShell
      ariaLabel="Object layout, padding, vtables, thunks, and deducing this debugger"
      title="raddbg · vtable_layout"
      scenarios={VTABLE_LAYOUT_SCENARIOS}
      topicSlug={topicSlug}
      visualizerTitle="Object & VTable Map"
      renderVisualizer={({ step, focusedAddress, onFocusAddress }) => {
        const primaryMem = step.memory[0];
        const rodataMem = step.memory.find((m) => m.segment === "RODATA");

        return (
          <div className="space-y-3">
            {/* Object Byte Layout Strip */}
            {primaryMem ? (
              <div className="border border-line bg-paper p-2.5">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-[11px] font-semibold text-ink">
                    Byte Layout: {primaryMem.name}
                  </span>
                  <AddressChip
                    address={primaryMem.baseAddress}
                    focusedAddress={focusedAddress}
                    onFocusAddress={onFocusAddress}
                  />
                </div>
                <div className="flex flex-wrap gap-1 font-mono text-[10.5px]">
                  {primaryMem.cells.map((cell) => (
                    <div
                      key={`${cell.offset}-${cell.label}`}
                      style={{ flexGrow: Math.max(1, cell.size) }}
                      className={cn(
                        "min-w-[80px] border p-1.5",
                        cell.state === "vptr"
                          ? "border-[color:var(--code-blue)]/50 bg-sky-wash/50 text-ink"
                          : cell.state === "padding"
                            ? "border-dashed border-line-strong bg-paper-sunk text-ink-faint"
                            : "border-line-strong bg-paper-raised text-ink"
                      )}
                    >
                      <div className="flex items-center justify-between gap-1 text-[9.5px] text-ink-faint">
                        <span>{cell.offset}</span>
                        <span>{cell.size}B</span>
                      </div>
                      <div className="mt-0.5 truncate font-semibold">
                        {cell.label}
                      </div>
                      <div className="truncate text-[10px] text-ink-soft">
                        {cell.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* .rodata VTable Target Slots */}
            {rodataMem ? (
              <div className="border border-line bg-paper p-2.5">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="font-mono text-[11px] font-semibold text-ink">
                    {rodataMem.name}
                  </span>
                  <AddressChip
                    address={rodataMem.baseAddress}
                    focusedAddress={focusedAddress}
                    onFocusAddress={onFocusAddress}
                  />
                </div>
                <div className="space-y-1 font-mono text-[11px]">
                  {rodataMem.cells.map((c) => (
                    <div
                      key={c.offset}
                      className={cn(
                        "flex flex-wrap items-center justify-between gap-2 border px-2 py-1",
                        c.changed
                          ? "border-ink bg-sun-wash text-ink font-semibold"
                          : "border-line bg-paper-raised text-ink-body"
                      )}
                    >
                      <span className="text-ink-faint">{c.offset}</span>
                      <span className="font-semibold">{c.label}</span>
                      <span>{c.value}</span>
                      <AddressChip
                        address={c.address}
                        focusedAddress={focusedAddress}
                        onFocusAddress={onFocusAddress}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="border border-line bg-paper p-2.5 font-mono text-[11px] text-ink-soft">
                <div className="flex items-center justify-between">
                  <span>Dispatch Mode</span>
                  <StatusPill tone={step.verdict.tone}>
                    {step.verdict.label}
                  </StatusPill>
                </div>
              </div>
            )}
          </div>
        );
      }}
    />
  );
}
