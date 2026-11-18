"use client";

import { useState } from "react";
import { CppCodeBlock } from "@/components/CppCodeBlock";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Window } from "@/components/Window";
import { cn } from "@/lib/utils";

type OrderMode = "nonatomic" | "relaxed" | "acq_rel" | "seq_cst";

interface ScenarioResult {
  verdict: "safe" | "warn" | "race";
  statusLabel: string;
  storeBufferNote: string;
  edgeDescription: string;
  t1Steps: string[];
  t2Steps: string[];
}

const MP_RESULTS: Record<OrderMode, ScenarioResult> = {
  nonatomic: {
    verdict: "race",
    statusLabel: "Data Race (Undefined Behavior)",
    storeBufferNote:
      "Compiler may hoist flag=true before data=42 or eliminate the polling loop completely.",
    edgeDescription:
      "No atomic operations exist. Reading flag while Thread 1 writes flag violates [intro.races].",
    t1Steps: ["data = 42;", "flag = true; // non-atomic write"],
    t2Steps: [
      "while (!flag) {} // compiler may load once!",
      "assert(data == 42); // UB",
    ],
  },
  relaxed: {
    verdict: "race",
    statusLabel: "Assert Can Fail + Data Race on data",
    storeBufferNote:
      "Store buffer on Core 1 may flush flag=true to L3 cache while data=42 is still buffered locally.",
    edgeDescription:
      "flag itself has no data race, yet relaxed forms zero happens-before edge for data.",
    t1Steps: [
      "data = 42;",
      "flag.store(true, std::memory_order_relaxed);",
    ],
    t2Steps: [
      "while (!flag.load(std::memory_order_relaxed)) {}",
      "assert(data == 42); // May observe 0 or UB!",
    ],
  },
  acq_rel: {
    verdict: "safe",
    statusLabel: "Guaranteed Safe (synchronizes-with)",
    storeBufferNote:
      "Core 1 commits data=42 before flag=true becomes visible; Core 2 inhibits speculative reads of data before flag.",
    edgeDescription:
      "Release store synchronizes-with acquire load → data=42 happens-before assert(data == 42).",
    t1Steps: [
      "data = 42; // sequenced-before store",
      "flag.store(true, std::memory_order_release);",
    ],
    t2Steps: [
      "while (!flag.load(std::memory_order_acquire)) {}",
      "assert(data == 42); // Always 42",
    ],
  },
  seq_cst: {
    verdict: "safe",
    statusLabel: "Guaranteed Safe + Total Global Order",
    storeBufferNote:
      "Enforces acquire/release guarantees plus places all seq_cst operations in one single total modification order.",
    edgeDescription:
      "Full synchronizes-with bridge plus global sequential consistency (typically MFENCE/LOCK on x86).",
    t1Steps: [
      "data = 42;",
      "flag.store(true, std::memory_order_seq_cst);",
    ],
    t2Steps: [
      "while (!flag.load(std::memory_order_seq_cst)) {}",
      "assert(data == 42); // Always 42",
    ],
  },
};

const SB_RESULTS: Record<OrderMode, ScenarioResult> = {
  nonatomic: {
    verdict: "race",
    statusLabel: "Data Race (Undefined Behavior)",
    storeBufferNote:
      "Concurrent non-atomic writes and reads on x and y trigger immediate UB.",
    edgeDescription:
      "No happens-before relationship exists between Thread 1 and Thread 2.",
    t1Steps: ["x = 1;", "int r1 = y;"],
    t2Steps: ["y = 1;", "int r2 = x;"],
  },
  relaxed: {
    verdict: "warn",
    statusLabel: "r1 == 0 && r2 == 0 Possible",
    storeBufferNote:
      "Each core buffers its own store locally while reading stale 0 from shared L3 cache.",
    edgeDescription:
      "Compiler and CPU can freely reorder load y ahead of store x on both threads.",
    t1Steps: ["x.store(1, relaxed);", "r1 = y.load(relaxed); // can see 0"],
    t2Steps: ["y.store(1, relaxed);", "r2 = x.load(relaxed); // can see 0"],
  },
  acq_rel: {
    verdict: "warn",
    statusLabel: "r1 == 0 && r2 == 0 STILL Possible",
    storeBufferNote:
      "Even on x86-64: release prevents prior ops moving down; acquire prevents later ops moving up—neither stops store-then-load reordering.",
    edgeDescription:
      "No single atomic is both written with release and read with acquire before the opposite read, so no total order exists.",
    t1Steps: [
      "x.store(1, release);",
      "r1 = y.load(acquire); // can bypass buffer!",
    ],
    t2Steps: [
      "y.store(1, release);",
      "r2 = x.load(acquire); // can bypass buffer!",
    ],
  },
  seq_cst: {
    verdict: "safe",
    statusLabel: "r1 == 0 && r2 == 0 Forbidden",
    storeBufferNote:
      "Hardware drains Core 1 and Core 2 store buffers (MFENCE/DMB ISH) before issuing the subsequent loads.",
    edgeDescription:
      "Single total modification order S across all seq_cst atomics guarantees at least one store precedes the other thread's load.",
    t1Steps: ["x.store(1, seq_cst);", "r1 = y.load(seq_cst);"],
    t2Steps: ["y.store(1, seq_cst);", "r2 = x.load(seq_cst);"],
  },
};

const MODE_LABELS: { id: OrderMode; label: string }[] = [
  { id: "nonatomic", label: "Non-atomic (UB)" },
  { id: "relaxed", label: "relaxed" },
  { id: "acq_rel", label: "acquire / release" },
  { id: "seq_cst", label: "seq_cst" },
];

export function MemoryModelMap() {
  const [scenario, setScenario] = useState<"mp" | "sb">("mp");
  const [mode, setMode] = useState<OrderMode>("acq_rel");

  const active = scenario === "mp" ? MP_RESULTS[mode] : SB_RESULTS[mode];

  return (
    <Window
      as="section"
      aria-label="Multi-core litmus simulator"
      title="memory_model.map"
      actions={
        <span
          className={cn(
            "rounded-[var(--radius-chip)] px-2 py-0.5 font-mono text-xs font-medium",
            active.verdict === "safe" &&
              "bg-right-wash text-[color:var(--right)]",
            active.verdict === "warn" && "bg-sun-wash text-ink",
            active.verdict === "race" && "bg-wrong-wash text-wrong"
          )}
        >
          {active.statusLabel}
        </span>
      }
      bodyClassName="p-5 sm:p-7"
    >
      <div className="mb-4">
        <h3 className="font-display text-2xl font-[450] tracking-[-0.02em] text-ink">
          Multi-Core Litmus Simulator
        </h3>
        <p className="mt-1 text-sm text-ink-soft">
          Compare compiler and store-buffer behavior across C++ memory orders.
        </p>
      </div>

      <Tabs
        value={scenario}
        onValueChange={(val) => setScenario(val as "mp" | "sb")}
        className="w-full"
      >
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <TabsList className="max-w-full flex-wrap">
            <TabsTrigger value="mp" className="text-xs h-8 px-3.5 cursor-pointer">
              Message Passing (MP)
            </TabsTrigger>
            <TabsTrigger value="sb" className="text-xs h-8 px-3.5 cursor-pointer">
              Store Buffering (SB)
            </TabsTrigger>
          </TabsList>

          <div className="flex flex-wrap gap-1.5">
            {MODE_LABELS.map((m) => (
              <Button
                key={m.id}
                type="button"
                size="xs"
                variant={mode === m.id ? "default" : "outline"}
                aria-pressed={mode === m.id}
                onClick={() => setMode(m.id)}
                className={cn(
                  "font-mono text-xs cursor-pointer",
                  mode === m.id &&
                    "bg-sun text-ink border-ink/30 hover:bg-sun/90"
                )}
              >
                {m.label}
              </Button>
            ))}
          </div>
        </div>

        {(["mp", "sb"] as const).map((tabKey) => {
          const panel = tabKey === "mp" ? MP_RESULTS[mode] : SB_RESULTS[mode];
          return (
            <TabsContent
              key={tabKey}
              value={tabKey}
              keepMounted
              className="mt-0 space-y-5"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <CppCodeBlock
                  className="min-w-0"
                  caption="Thread 1 (Core 0)"
                  code={panel.t1Steps.join("\n")}
                />
                <CppCodeBlock
                  className="min-w-0"
                  caption="Thread 2 (Core 1)"
                  code={panel.t2Steps.join("\n")}
                />
              </div>

              <div
                aria-live={scenario === tabKey ? "polite" : "off"}
                className={cn(
                  "rounded-2xl border p-4 transition-colors",
                  panel.verdict === "safe" &&
                    "border-[color:var(--right)]/35 bg-right-wash/60",
                  panel.verdict === "warn" &&
                    "border-ink/20 bg-sun-wash/60",
                  panel.verdict === "race" && "border-wrong/35 bg-wrong-wash/60"
                )}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <div
                      className={cn(
                        "text-xs font-semibold",
                        panel.verdict === "safe" &&
                          "text-[color:var(--right)]",
                        panel.verdict === "warn" && "text-ink",
                        panel.verdict === "race" && "text-wrong"
                      )}
                    >
                      Happens-before &amp; ordering relation
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-ink-body">
                      {panel.edgeDescription}
                    </p>
                  </div>
                  <div>
                    <div
                      className={cn(
                        "text-xs font-semibold",
                        panel.verdict === "safe" &&
                          "text-[color:var(--right)]",
                        panel.verdict === "warn" && "text-ink",
                        panel.verdict === "race" && "text-wrong"
                      )}
                    >
                      Store buffer &amp; optimizer trace
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-ink-body">
                      {panel.storeBufferNote}
                    </p>
                  </div>
                </div>
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </Window>
  );
}
