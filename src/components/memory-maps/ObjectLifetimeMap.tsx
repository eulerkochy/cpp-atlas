"use client";

import { useState } from "react";
import { CppCodeBlock } from "@/components/CppCodeBlock";
import { Button } from "@/components/ui/button";
import { Window } from "@/components/Window";
import { cn } from "@/lib/utils";

interface LifetimeStep {
  step: number;
  line: string;
  caption: string;
  stackCells: {
    addr: string;
    name: string;
    state: string;
    tone: "active" | "highlight" | "safe" | "danger" | "muted";
  }[];
  heapState: {
    addr: string;
    label: string;
    status: "unallocated" | "alive" | "freed";
  };
  clause: string;
}

const STEPS: LifetimeStep[] = [
  {
    step: 1,
    line: "{ // enter block scope",
    caption:
      "Automatic storage duration reserves stack slots, yet object lifetimes have not begun.",
    stackCells: [
      {
        addr: "0x7ffee4b2a8c0",
        name: "ptr (unique_ptr<Buffer>)",
        state: "uninitialized storage",
        tone: "muted",
      },
      {
        addr: "0x7ffee4b2a8b8",
        name: "ref (const string&)",
        state: "unbound",
        tone: "muted",
      },
      {
        addr: "0x7ffee4b2a898",
        name: "temp string slot",
        state: "unmaterialized",
        tone: "muted",
      },
    ],
    heapState: {
      addr: "0x600001408000",
      label: "Buffer (64 bytes)",
      status: "unallocated",
    },
    clause: "[basic.stc.auto]",
  },
  {
    step: 2,
    line: "auto ptr = std::make_unique<Buffer>(64);",
    caption:
      "Dynamic allocation acquires heap bytes, constructs Buffer, and starts RAII ownership on stack.",
    stackCells: [
      {
        addr: "0x7ffee4b2a8c0",
        name: "ptr (unique_ptr<Buffer>)",
        state: "alive → owns 0x600001408000",
        tone: "safe",
      },
      {
        addr: "0x7ffee4b2a8b8",
        name: "ref (const string&)",
        state: "unbound",
        tone: "muted",
      },
      {
        addr: "0x7ffee4b2a898",
        name: "temp string slot",
        state: "unmaterialized",
        tone: "muted",
      },
    ],
    heapState: {
      addr: "0x600001408000",
      label: "Buffer (64 bytes)",
      status: "alive",
    },
    clause: "[basic.life] & [unique.ptr]",
  },
  {
    step: 3,
    line: "const std::string& ref = make_tag();",
    caption:
      "Temporary materialization constructs make_tag() on the stack and extends its lifetime to ref's scope.",
    stackCells: [
      {
        addr: "0x7ffee4b2a8c0",
        name: "ptr (unique_ptr<Buffer>)",
        state: "alive → owns 0x600001408000",
        tone: "safe",
      },
      {
        addr: "0x7ffee4b2a8b8",
        name: "ref (const string&)",
        state: "bound to 0x7ffee4b2a898",
        tone: "safe",
      },
      {
        addr: "0x7ffee4b2a898",
        name: "materialized string",
        state: "alive (extended to block exit)",
        tone: "highlight",
      },
    ],
    heapState: {
      addr: "0x600001408000",
      label: "Buffer (64 bytes)",
      status: "alive",
    },
    clause: "[class.temporary] §6.7.7/6",
  },
  {
    step: 4,
    line: "const char* bad = make_tag().c_str(); // TRAP!",
    caption:
      "Chaining .c_str() does NOT extend the temporary string returned by make_tag(). It dies at the semicolon.",
    stackCells: [
      {
        addr: "0x7ffee4b2a8c0",
        name: "ptr (unique_ptr<Buffer>)",
        state: "alive → owns 0x600001408000",
        tone: "safe",
      },
      {
        addr: "0x7ffee4b2a8b8",
        name: "ref (const string&)",
        state: "bound & safe",
        tone: "safe",
      },
      {
        addr: "0x7ffee4b2a870",
        name: "bad (const char*)",
        state: "DANGLING POINTER (UB on read)",
        tone: "danger",
      },
    ],
    heapState: {
      addr: "0x600001408000",
      label: "Buffer (64 bytes)",
      status: "alive",
    },
    clause: "[class.temporary] (no transitive extension)",
  },
  {
    step: 5,
    line: "} // scope exit: reverse-order RAII unwind",
    caption:
      "Destructors run strictly LIFO: extended temporary dies first, then ptr frees the heap Buffer.",
    stackCells: [
      {
        addr: "0x7ffee4b2a8c0",
        name: "ptr (~unique_ptr)",
        state: "destroyed second → deleted heap",
        tone: "muted",
      },
      {
        addr: "0x7ffee4b2a898",
        name: "materialized string",
        state: "destroyed first (~string)",
        tone: "muted",
      },
      {
        addr: "0x7ffee4b2a870",
        name: "bad",
        state: "out of scope",
        tone: "muted",
      },
    ],
    heapState: {
      addr: "0x600001408000",
      label: "Buffer (64 bytes)",
      status: "freed",
    },
    clause: "[stmt.jump] & [class.dtor]",
  },
];

export function ObjectLifetimeMap() {
  const [stepIdx, setStepIdx] = useState(2);
  const current = STEPS[stepIdx];

  return (
    <Window
      as="section"
      aria-label="Stack, heap and lifetime timeline"
      title="lifetime.map"
      actions={
        <span className="font-mono text-xs text-ink-soft">
          {current.clause}
        </span>
      }
      bodyClassName="p-5 sm:p-7"
    >
      <div className="mb-4">
        <h3 className="font-display text-2xl font-[450] tracking-[-0.02em] text-ink">
          Stack, Heap &amp; Lifetime Timeline
        </h3>
        <p className="mt-1 text-sm text-ink-soft">
          Step through execution to separate raw storage duration from typed
          object lifetime.
        </p>
      </div>

      <div className="mb-5 flex flex-wrap gap-1.5">
        {STEPS.map((s, idx) => {
          const isCurrent = idx === stepIdx;
          return (
            <Button
              key={s.step}
              type="button"
              size="xs"
              variant={isCurrent ? "default" : "outline"}
              aria-pressed={isCurrent}
              aria-current={isCurrent ? "step" : undefined}
              onClick={() => setStepIdx(idx)}
              className={cn(
                "font-mono text-xs cursor-pointer",
                isCurrent && "bg-sun text-ink border-ink/30 hover:bg-sun/90"
              )}
            >
              Step {s.step}
            </Button>
          );
        })}
      </div>

      <div className="mb-6 space-y-2">
        <CppCodeBlock caption={`step_${current.step}.cpp`} code={current.line} />
        <p
          aria-live="polite"
          className="px-1 text-xs leading-relaxed text-ink-soft"
        >
          {current.caption}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="min-w-0 rounded-[var(--radius-panel)] border border-line bg-paper p-4">
          <div className="mb-3 text-xs font-medium text-ink">
            Automatic Stack Frame (LIFO)
          </div>
          <div className="space-y-2.5">
            {current.stackCells.map((cell) => (
              <div
                key={cell.addr + cell.name}
                className={cn(
                  "rounded-xl border p-3 transition-colors",
                  cell.tone === "highlight" && "border-ink/30 bg-sun-wash",
                  cell.tone === "safe" &&
                    "border-[color:var(--right)]/35 bg-right-wash/70",
                  cell.tone === "danger" &&
                    "border-wrong/35 bg-wrong-wash/70",
                  (cell.tone === "muted" || cell.tone === "active") &&
                    "border-line bg-paper-raised"
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 font-mono text-xs font-semibold text-ink">
                    {cell.name}
                  </span>
                  <span className="font-mono text-[11px] text-ink-faint">
                    {cell.addr}
                  </span>
                </div>
                <div
                  className={cn(
                    "mt-1 font-mono text-[11px] font-medium",
                    cell.tone === "safe" && "text-[color:var(--right)]",
                    cell.tone === "danger" && "text-wrong",
                    cell.tone === "highlight" && "text-ink",
                    (cell.tone === "muted" || cell.tone === "active") &&
                      "text-ink-soft"
                  )}
                >
                  {cell.state}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex min-w-0 flex-col justify-between rounded-[var(--radius-panel)] border border-line bg-paper p-4">
          <div>
            <div className="mb-3 text-xs font-medium text-ink">
              Dynamic Heap Storage
            </div>
            <div
              className={cn(
                "rounded-xl border p-3.5 transition-colors",
                current.heapState.status === "alive"
                  ? "border-[color:var(--right)]/35 bg-right-wash/70"
                  : "border-line bg-paper-raised"
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 font-mono text-xs font-semibold text-ink">
                  {current.heapState.label}
                </span>
                <span className="font-mono text-[11px] text-ink-faint">
                  {current.heapState.addr}
                </span>
              </div>
              <div
                className={cn(
                  "mt-1.5 font-mono text-xs font-medium",
                  current.heapState.status === "alive"
                    ? "text-[color:var(--right)]"
                    : "text-ink-soft"
                )}
              >
                Status: {current.heapState.status}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-line bg-paper-raised p-3 text-xs leading-relaxed text-ink-soft">
            Storage in <span className="font-mono text-ink">.rodata</span> and{" "}
            <span className="font-mono text-ink">.bss</span> lives for the
            entire program; dynamic heap objects live strictly between{" "}
            <span className="font-mono text-ink">new</span> and{" "}
            <span className="font-mono text-ink">delete</span>.
          </div>
        </div>
      </div>
    </Window>
  );
}
