"use client";

import { useState } from "react";
import { CppCodeBlock } from "@/components/CppCodeBlock";
import { Button } from "@/components/ui/button";
import { Window } from "@/components/Window";
import { cn } from "@/lib/utils";
import { standardRefToUrl } from "@/types/topics";

type ParamMode = "value" | "ref-trap";
type SlotTone = "active" | "highlight" | "safe" | "danger" | "muted";

interface FrameSlot {
  id: string;
  offset: string;
  name: string;
  size: string;
  valueModeState: string;
  valueModeTone: SlotTone;
  trapModeState: string;
  trapModeTone: SlotTone;
}

interface StackSlot {
  addr: string;
  name: string;
  valueModeState: string;
  valueModeTone: SlotTone;
  trapModeState: string;
  trapModeTone: SlotTone;
}

interface CoroutineStage {
  step: number;
  label: string;
  clause: string;
  captionValue: string;
  captionTrap: string;
  codeValue: string;
  codeTrap: string;
  heapAllocated: boolean;
  heapDestroyed: boolean;
  callerSuspended: boolean;
  heapSlots: FrameSlot[];
  stackSlots: StackSlot[];
  transferDiagram: string;
}

const STAGES: CoroutineStage[] = [
  {
    step: 1,
    label: "1. Call & Heap Frame Allocation",
    clause: "[dcl.fct.def.coroutine]",
    captionValue:
      "Calling parse_async(std::string{\"payload\"}) allocates the coroutine frame via operator new and moves the std::string argument into the heap frame's saved-params slot before running any body statement.",
    captionTrap:
      "Calling parse_async(std::string{\"payload\"}) allocates the heap coroutine frame, yet only an 8-byte pointer (const std::string*) pointing back into the caller's stack temporary is saved in the heap frame!",
    codeValue: `Task parse_async(std::string s) { // by-value param copied into heap frame
  auto prefix = make_prefix();
  co_yield prefix + s;
}`,
    codeTrap: `Task parse_async(const std::string& s) { // TRAP: saves pointer to caller stack!
  auto prefix = make_prefix();
  co_yield prefix + s; // UB if caller's argument dies across suspend
}`,
    heapAllocated: true,
    heapDestroyed: false,
    callerSuspended: false,
    heapSlots: [
      {
        id: "resume",
        offset: "+0x00",
        name: "resume_fn",
        size: "8B",
        valueModeState: "&parse_async_resume (idx = 0)",
        valueModeTone: "active",
        trapModeState: "&parse_async_resume (idx = 0)",
        trapModeTone: "active",
      },
      {
        id: "destroy",
        offset: "+0x08",
        name: "destroy_fn",
        size: "8B",
        valueModeState: "&parse_async_destroy",
        valueModeTone: "active",
        trapModeState: "&parse_async_destroy",
        trapModeTone: "active",
      },
      {
        id: "promise",
        offset: "+0x10",
        name: "promise_type",
        size: "32B",
        valueModeState: "constructed in-place (continuation = null)",
        valueModeTone: "highlight",
        trapModeState: "constructed in-place (continuation = null)",
        trapModeTone: "highlight",
      },
      {
        id: "param",
        offset: "+0x30",
        name: "saved params",
        size: "24B / 8B",
        valueModeState: "std::string s (24B owned copy: \"payload\")",
        valueModeTone: "safe",
        trapModeState: "const std::string* s_ptr = 0x7ffee4b2a900 (borrowing stack)",
        trapModeTone: "highlight",
      },
      {
        id: "locals",
        offset: "+0x48",
        name: "locals across suspend",
        size: "24B",
        valueModeState: "uninitialized storage for prefix",
        valueModeTone: "muted",
        trapModeState: "uninitialized storage for prefix",
        trapModeTone: "muted",
      },
    ],
    stackSlots: [
      {
        addr: "0x7ffee4b2a900",
        name: "std::string{\"payload\"} (caller arg)",
        valueModeState: "moved into heap frame s; alive until ';'",
        valueModeTone: "active",
        trapModeState: "bound by const std::string& s; alive until ';'",
        trapModeTone: "highlight",
      },
      {
        addr: "0x7ffee4b2a8e8",
        name: "Task return slot (caller)",
        valueModeState: "awaiting promise.get_return_object()",
        valueModeTone: "muted",
        trapModeState: "awaiting promise.get_return_object()",
        trapModeTone: "muted",
      },
    ],
    transferDiagram:
      "caller stack -> operator new(frame) -> construct promise_type -> copy/move params into frame",
  },
  {
    step: 2,
    label: "2. promise.initial_suspend()",
    clause: "[dcl.fct.def.coroutine]",
    captionValue:
      "get_return_object() hands Task (wrapping coroutine_handle at 0x600001804000) back to the caller. At the semicolon, the caller's temporary dies, which is completely safe because s lives inside the heap frame.",
    captionTrap:
      "initial_suspend() suspends before entering the body and returns Task to the caller. At the full-expression semicolon, the temporary std::string{\"payload\"} is destroyed, leaving s_ptr inside the heap frame dangling before the body even starts!",
    codeValue: `Task t = parse_async(std::string{"payload"});
// Caller temporary destroyed at ';': heap frame owns its own copy of s.
// Coroutine is now suspended at index 0 (initial_suspend).`,
    codeTrap: `Task t = parse_async(std::string{"payload"});
// Caller temporary destroyed at ';' right after initial_suspend returns!
// t.handle's saved s_ptr now points to dead stack memory 0x7ffee4b2a900!`,
    heapAllocated: true,
    heapDestroyed: false,
    callerSuspended: true,
    heapSlots: [
      {
        id: "resume",
        offset: "+0x00",
        name: "resume_fn",
        size: "8B",
        valueModeState: "suspended at idx = 0 (initial_suspend)",
        valueModeTone: "highlight",
        trapModeState: "suspended at idx = 0 (initial_suspend)",
        trapModeTone: "highlight",
      },
      {
        id: "destroy",
        offset: "+0x08",
        name: "destroy_fn",
        size: "8B",
        valueModeState: "ready (&parse_async_destroy)",
        valueModeTone: "active",
        trapModeState: "ready (&parse_async_destroy)",
        trapModeTone: "active",
      },
      {
        id: "promise",
        offset: "+0x10",
        name: "promise_type",
        size: "32B",
        valueModeState: "get_return_object() handed handle to Task t",
        valueModeTone: "safe",
        trapModeState: "get_return_object() handed handle to Task t",
        trapModeTone: "safe",
      },
      {
        id: "param",
        offset: "+0x30",
        name: "saved params",
        size: "24B / 8B",
        valueModeState: "std::string s = \"payload\" (ALIVE on heap)",
        valueModeTone: "safe",
        trapModeState: "s_ptr = 0x7ffee4b2a900 (DANGLING: temp destroyed!)",
        trapModeTone: "danger",
      },
      {
        id: "locals",
        offset: "+0x48",
        name: "locals across suspend",
        size: "24B",
        valueModeState: "not yet constructed",
        valueModeTone: "muted",
        trapModeState: "not yet constructed",
        trapModeTone: "muted",
      },
    ],
    stackSlots: [
      {
        addr: "0x7ffee4b2a900",
        name: "std::string{\"payload\"} (temp)",
        valueModeState: "destroyed at ';' (heap copy unaffected)",
        valueModeTone: "muted",
        trapModeState: "DESTROYED at ';' (storage reclaimed!)",
        trapModeTone: "danger",
      },
      {
        addr: "0x7ffee4b2a8e8",
        name: "Task t (caller handle)",
        valueModeState: "holds coroutine_handle -> 0x600001804000",
        valueModeTone: "safe",
        trapModeState: "holds coroutine_handle -> 0x600001804000 (poisoned param)",
        trapModeTone: "danger",
      },
    ],
    transferDiagram:
      "co_await promise.initial_suspend() -> return Task{handle} to caller stack -> caller continues",
  },
  {
    step: 3,
    label: "3. Body & co_yield / co_await suspension",
    clause: "[expr.yield]",
    captionValue:
      "handle.resume() enters the coroutine body. prefix is constructed directly inside the heap frame so it persists across co_yield / co_await, and reading s reads the safe heap-owned std::string.",
    captionTrap:
      "handle.resume() enters the coroutine body later from the scheduler. Evaluating prefix + s dereferences s_ptr -> 0x7ffee4b2a900, reading clobbered stack bytes (Undefined Behavior)!",
    codeValue: `t.resume(); // scheduler resumes coroutine at idx = 0
// Inside body: prefix = make_prefix(); (allocated inside heap frame)
// co_yield prefix + s; -> suspends at idx = 1, returns to resumer`,
    codeTrap: `t.resume(); // async resume on event loop after caller moved on
// Evaluating (prefix + s) dereferences dangling 0x7ffee4b2a900!
// Undefined behavior (use-after-free on stack temporary)`,
    heapAllocated: true,
    heapDestroyed: false,
    callerSuspended: true,
    heapSlots: [
      {
        id: "resume",
        offset: "+0x00",
        name: "resume_fn",
        size: "8B",
        valueModeState: "suspended at idx = 1 (co_yield / co_await)",
        valueModeTone: "highlight",
        trapModeState: "suspended at idx = 1 (after UB read of s)",
        trapModeTone: "highlight",
      },
      {
        id: "destroy",
        offset: "+0x08",
        name: "destroy_fn",
        size: "8B",
        valueModeState: "ready (knows idx = 1 for local dtor)",
        valueModeTone: "active",
        trapModeState: "ready (knows idx = 1 for local dtor)",
        trapModeTone: "active",
      },
      {
        id: "promise",
        offset: "+0x10",
        name: "promise_type",
        size: "32B",
        valueModeState: "current_value = \"tag:payload\"",
        valueModeTone: "safe",
        trapModeState: "current_value = <corrupted / UB>",
        trapModeTone: "danger",
      },
      {
        id: "param",
        offset: "+0x30",
        name: "saved params",
        size: "24B / 8B",
        valueModeState: "std::string s = \"payload\" (valid across suspend)",
        valueModeTone: "safe",
        trapModeState: "DANGLING dereference of 0x7ffee4b2a900 (UB!)",
        trapModeTone: "danger",
      },
      {
        id: "locals",
        offset: "+0x48",
        name: "locals across suspend",
        size: "24B",
        valueModeState: "std::string prefix = \"tag:\" (preserved in heap frame)",
        valueModeTone: "safe",
        trapModeState: "std::string prefix = \"tag:\" (preserved in heap frame)",
        trapModeTone: "active",
      },
    ],
    stackSlots: [
      {
        addr: "0x7ffee4b2a8c0",
        name: "event_loop::poll() frame",
        valueModeState: "overwrote 0x7ffee4b2a900; coroutine unaffected",
        valueModeTone: "active",
        trapModeState: "reused 0x7ffee4b2a900 for unrelated loop locals!",
        trapModeTone: "danger",
      },
      {
        addr: "0x7ffee4b2a8e8",
        name: "Task t (awaiter)",
        valueModeState: "observes yielded value safely",
        valueModeTone: "safe",
        trapModeState: "observes garbage or crashes with ASan stack-use-after-return",
        trapModeTone: "danger",
      },
    ],
    transferDiagram:
      "handle.resume() -> switch(resume_index) -> construct locals in heap frame -> co_yield suspends",
  },
  {
    step: 4,
    label: "4. Symmetric transfer via await_suspend() -> coroutine_handle",
    clause: "[expr.await]",
    captionValue:
      "Returning std::coroutine_handle<> from await_suspend() compiles into a tail call to the target handle's resume_fn. Chaining 1,000,000 coroutines consumes O(1) stack frames instead of overflowing.",
    captionTrap:
      "Symmetric transfer itself uses O(1) stack via tail-call jump, yet passing a reference parameter into the next awaited coroutine still dangles if the producing frame suspends or finishes first.",
    codeValue: `std::coroutine_handle<> await_suspend(std::coroutine_handle<> caller_h) noexcept {
  coro.promise().continuation = caller_h;
  return coro; // compiler emits tail-jump (jmp) with O(1) stack!
}`,
    codeTrap: `// If parent passes local string by const& before co_await child(local):
// OK ONLY if parent stays suspended until child completes.
// If child is detached or queued to a thread pool, parent exits -> dangling!`,
    heapAllocated: true,
    heapDestroyed: false,
    callerSuspended: true,
    heapSlots: [
      {
        id: "resume",
        offset: "+0x00",
        name: "resume_fn",
        size: "8B",
        valueModeState: "tail-call target from parent await_suspend()",
        valueModeTone: "highlight",
        trapModeState: "tail-call target from parent await_suspend()",
        trapModeTone: "highlight",
      },
      {
        id: "destroy",
        offset: "+0x08",
        name: "destroy_fn",
        size: "8B",
        valueModeState: "active",
        valueModeTone: "active",
        trapModeState: "active",
        trapModeTone: "active",
      },
      {
        id: "promise",
        offset: "+0x10",
        name: "promise_type",
        size: "32B",
        valueModeState: "continuation = caller_h (for final_suspend resume)",
        valueModeTone: "safe",
        trapModeState: "continuation = caller_h (detached: null)",
        trapModeTone: "highlight",
      },
      {
        id: "param",
        offset: "+0x30",
        name: "saved params",
        size: "24B / 8B",
        valueModeState: "std::string s = \"payload\" (self-contained)",
        valueModeTone: "safe",
        trapModeState: "s_ptr -> dead stack frame (dangling across async hop)",
        trapModeTone: "danger",
      },
      {
        id: "locals",
        offset: "+0x48",
        name: "locals across suspend",
        size: "24B",
        valueModeState: "prefix preserved during transfer",
        valueModeTone: "safe",
        trapModeState: "prefix preserved during transfer",
        trapModeTone: "active",
      },
    ],
    stackSlots: [
      {
        addr: "0x7ffee4b2a8b0",
        name: "tail-call frame (reused)",
        valueModeState: "O(1) stack depth: jmp target.resume_fn(target.ptr)",
        valueModeTone: "safe",
        trapModeState: "O(1) stack depth, yet heap frame holds dead stack pointer",
        trapModeTone: "danger",
      },
    ],
    transferDiagram:
      "await_suspend(awaiter) -> store continuation -> return next_handle -> tail-call jmp next_handle.resume()",
  },
  {
    step: 5,
    label: "5. final_suspend() & handle.destroy()",
    clause: "[dcl.fct.def.coroutine]",
    captionValue:
      "After co_return, locals in the frame are destroyed, final_suspend() transfers back to continuation (if suspended), and ~Task() calls handle.destroy() to destroy promise + saved params and run operator delete.",
    captionTrap:
      "final_suspend() and handle.destroy() clean up the promise and 8-byte s_ptr (without calling ~string on the dead referee). Note: if final_suspend() returned suspend_never, calling handle.destroy() would be a double-free!",
    codeValue: `~Task() {
  if (handle) handle.destroy(); // runs destroy_fn: ~promise(), ~s(), operator delete
}`,
    codeTrap: `// destroy_fn frees [resume_fn | destroy_fn | promise | s_ptr | locals]
// Rule of thumb: take coroutine parameters by VALUE (never const T&)!`,
    heapAllocated: false,
    heapDestroyed: true,
    callerSuspended: false,
    heapSlots: [
      {
        id: "resume",
        offset: "+0x00",
        name: "resume_fn",
        size: "8B",
        valueModeState: "freed (handle invalidated)",
        valueModeTone: "muted",
        trapModeState: "freed (handle invalidated)",
        trapModeTone: "muted",
      },
      {
        id: "destroy",
        offset: "+0x08",
        name: "destroy_fn",
        size: "8B",
        valueModeState: "executed -> operator delete(0x600001804000)",
        valueModeTone: "muted",
        trapModeState: "executed -> operator delete(0x600001804000)",
        trapModeTone: "muted",
      },
      {
        id: "promise",
        offset: "+0x10",
        name: "promise_type",
        size: "32B",
        valueModeState: "~promise_type() ran before delete",
        valueModeTone: "muted",
        trapModeState: "~promise_type() ran before delete",
        trapModeTone: "muted",
      },
      {
        id: "param",
        offset: "+0x30",
        name: "saved params",
        size: "24B / 8B",
        valueModeState: "~std::string() ran cleanly inside destroy_fn",
        valueModeTone: "safe",
        trapModeState: "8B pointer dropped (no referee destructor; UB occurred earlier)",
        trapModeTone: "muted",
      },
      {
        id: "locals",
        offset: "+0x48",
        name: "locals across suspend",
        size: "24B",
        valueModeState: "~prefix() ran before final_suspend()",
        valueModeTone: "muted",
        trapModeState: "~prefix() ran before final_suspend()",
        trapModeTone: "muted",
      },
    ],
    stackSlots: [
      {
        addr: "0x7ffee4b2a8e8",
        name: "Task t (~Task)",
        valueModeState: "called handle.destroy(); heap block reclaimed",
        valueModeTone: "safe",
        trapModeState: "called handle.destroy(); heap block reclaimed",
        trapModeTone: "active",
      },
    ],
    transferDiagram:
      "co_return -> destroy locals -> final_suspend() -> ~Task() calls handle.destroy() -> operator delete(frame)",
  },
];

function toneCardClass(tone: SlotTone) {
  switch (tone) {
    case "highlight":
      return "border-ink/30 bg-sun-wash";
    case "safe":
      return "border-[color:var(--right)]/35 bg-right-wash/70";
    case "danger":
      return "border-wrong/35 bg-wrong-wash/70";
    case "active":
      return "border-line-strong bg-paper-raised";
    default:
      return "border-line bg-paper-sunk/60";
  }
}

function toneTextClass(tone: SlotTone) {
  switch (tone) {
    case "safe":
      return "text-[color:var(--right)]";
    case "danger":
      return "text-wrong";
    case "highlight":
      return "text-ink";
    case "active":
      return "text-ink-body";
    default:
      return "text-ink-soft";
  }
}

export function CoroutineFrameMap() {
  const [stageIdx, setStageIdx] = useState(2);
  const [paramMode, setParamMode] = useState<ParamMode>("value");

  const current = STAGES[stageIdx];
  const isTrap = paramMode === "ref-trap";
  const activeCaption = isTrap ? current.captionTrap : current.captionValue;
  const activeCode = isTrap ? current.codeTrap : current.codeValue;

  return (
    <Window
      as="section"
      aria-label="C++20 coroutine frame layout simulator"
      title="coroutine-frame.sim"
      actions={
        <a
          href={standardRefToUrl(current.clause)}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-xs text-ink-soft underline decoration-line-strong underline-offset-4 hover:text-ink hover:decoration-ink"
        >
          {current.clause}
        </a>
      }
      bodyClassName="p-5 sm:p-7"
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-2xl font-[450] tracking-[-0.02em] text-ink">
            Coroutine Heap Frame &amp; Parameter Lifetime
          </h3>
          <p className="mt-1 text-sm text-ink-soft">
            Step through the five coroutine suspension stages and compare owning
            by-value parameters against the dangling reference parameter trap.
          </p>
        </div>

        <div
          role="group"
          aria-label="Coroutine parameter passing mode"
          className="flex flex-wrap gap-1.5 rounded-full border border-line bg-paper-sunk p-1"
        >
          <Button
            type="button"
            size="xs"
            variant={paramMode === "value" ? "default" : "ghost"}
            aria-pressed={paramMode === "value"}
            onClick={() => setParamMode("value")}
            className={cn(
              "font-mono text-xs cursor-pointer",
              paramMode === "value" &&
                "bg-sun text-ink border-ink/30 hover:bg-sun/90"
            )}
          >
            Value param: std::string s
          </Button>
          <Button
            type="button"
            size="xs"
            variant={paramMode === "ref-trap" ? "default" : "ghost"}
            aria-pressed={paramMode === "ref-trap"}
            onClick={() => setParamMode("ref-trap")}
            className={cn(
              "font-mono text-xs cursor-pointer",
              paramMode === "ref-trap" &&
                "bg-wrong-wash text-wrong border border-wrong/35 hover:bg-wrong-wash"
            )}
          >
            Reference trap: const std::string&amp; s
          </Button>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-1.5">
        {STAGES.map((stage, idx) => {
          const isCurrent = idx === stageIdx;
          return (
            <Button
              key={stage.step}
              type="button"
              size="xs"
              variant={isCurrent ? "default" : "outline"}
              aria-pressed={isCurrent}
              aria-current={isCurrent ? "step" : undefined}
              onClick={() => setStageIdx(idx)}
              className={cn(
                "text-xs cursor-pointer",
                isCurrent && "bg-sun text-ink border-ink/30 hover:bg-sun/90"
              )}
            >
              {stage.label}
            </Button>
          );
        })}
      </div>

      <div className="mb-6 space-y-2.5">
        <CppCodeBlock
          caption={`coroutine_stage_${current.step}.cpp`}
          code={activeCode}
        />
        <p
          aria-live="polite"
          className={cn(
            "rounded-2xl border px-4 py-3 text-xs leading-relaxed",
            isTrap && current.step >= 2 && current.step <= 4
              ? "border-wrong/35 bg-wrong-wash/60 text-ink-body"
              : "border-line bg-paper text-ink-body"
          )}
        >
          {activeCaption}
        </p>
      </div>

      <div className="mb-5 rounded-[var(--radius-panel)] border border-line bg-paper p-4">
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium text-ink">
            Heap Coroutine State Block (0x600001804000)
          </span>
          <span
            className={cn(
              "rounded-[var(--radius-chip)] px-2 py-0.5 font-mono text-[11px] font-medium",
              current.heapDestroyed
                ? "bg-paper-sunk text-ink-soft"
                : isTrap && current.step >= 2 && current.step <= 4
                  ? "bg-wrong-wash text-wrong"
                  : "bg-right-wash text-[color:var(--right)]"
            )}
          >
            {current.heapDestroyed
              ? "Freed via operator delete"
              : isTrap && current.step >= 2 && current.step <= 4
                ? "Alive on heap, dangling saved param!"
                : "Allocated on heap"}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
          {current.heapSlots.map((slot) => {
            const tone = isTrap ? slot.trapModeTone : slot.valueModeTone;
            const state = isTrap ? slot.trapModeState : slot.valueModeState;
            return (
              <div
                key={slot.id}
                className={cn(
                  "rounded-xl border p-2.5 transition-colors",
                  toneCardClass(tone)
                )}
              >
                <div className="flex items-center justify-between gap-1 font-mono text-[11px] text-ink-faint">
                  <span>{slot.offset}</span>
                  <span>{slot.size}</span>
                </div>
                <div className="mt-1 font-mono text-xs font-semibold text-ink">
                  {slot.name}
                </div>
                <div
                  className={cn(
                    "mt-1 font-mono text-[11px] leading-snug font-medium",
                    toneTextClass(tone)
                  )}
                >
                  {state}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="min-w-0 rounded-[var(--radius-panel)] border border-line bg-paper p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-ink">
              Caller / Scheduler Stack Frame
            </span>
            <span className="font-mono text-[11px] text-ink-faint">
              {current.callerSuspended
                ? "Caller frame unwound or moved on"
                : "Active on call stack"}
            </span>
          </div>
          <div className="space-y-2.5">
            {current.stackSlots.map((cell) => {
              const tone = isTrap ? cell.trapModeTone : cell.valueModeTone;
              const state = isTrap ? cell.trapModeState : cell.valueModeState;
              return (
                <div
                  key={cell.addr + cell.name}
                  className={cn(
                    "rounded-xl border p-3 transition-colors",
                    toneCardClass(tone)
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-ink">
                      {cell.name}
                    </span>
                    <span className="font-mono text-[11px] text-ink-faint">
                      {cell.addr}
                    </span>
                  </div>
                  <div
                    className={cn(
                      "mt-1 font-mono text-[11px] font-medium",
                      toneTextClass(tone)
                    )}
                  >
                    {state}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex min-w-0 flex-col justify-between rounded-[var(--radius-panel)] border border-line bg-paper p-4">
          <div>
            <div className="mb-2 text-xs font-medium text-ink">
              Control-Flow Transfer Path
            </div>
            <div className="rounded-xl border border-line bg-paper-raised p-3 font-mono text-xs leading-relaxed text-ink">
              {current.transferDiagram}
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-line bg-sun-wash/50 p-3 text-xs leading-relaxed text-ink-body">
            <strong className="font-semibold text-ink">HALO &amp; safety rule:</strong>{" "}
            Compilers can elide the heap allocation when the coroutine lifetime
            is strictly nested inside the caller, yet parameter copying rules still
            govern correctness. Prefer by-value parameters (
            <code className="font-mono text-ink">std::string</code>) over{" "}
            <code className="font-mono text-ink">const std::string&amp;</code> in
            any coroutine returning a task or generator.
          </div>
        </div>
      </div>
    </Window>
  );
}
