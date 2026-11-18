"use client";

import { useState } from "react";
import { CppCodeBlock } from "@/components/CppCodeBlock";
import { Button } from "@/components/ui/button";
import { Window } from "@/components/Window";
import { cn } from "@/lib/utils";
import { standardRefToUrl } from "@/types/topics";

type AllocStrategy = "make_shared" | "new_widget";

export function SmartPointerMap() {
  const [strategy, setStrategy] = useState<AllocStrategy>("make_shared");
  const [strong, setStrong] = useState<number>(1);
  const [weak, setWeak] = useState<number>(1);
  const [dtorRan, setDtorRan] = useState<boolean>(false);
  const [controlFreed, setControlFreed] = useState<boolean>(false);
  const [lastLockResult, setLastLockResult] = useState<
    "none" | "ok" | "expired"
  >("none");
  const [lastEvent, setLastEvent] = useState<string>(
    "Constructed sp1 (strong = 1) and observing wp1 (weak = 1). Try resetting all shared_ptrs to observe when ~Widget() runs vs when the control block is freed."
  );

  const internalWeakCount = weak + (strong > 0 ? 1 : 0);
  const widgetMemoryFreed =
    strategy === "new_widget" ? dtorRan : controlFreed;

  function handleCopyShared() {
    if (strong === 0 || controlFreed) return;
    const next = strong + 1;
    setStrong(next);
    setLastLockResult("none");
    setLastEvent(
      `Copied shared_ptr: strong incremented to ${next} (atomic fetch_add). Widget remains alive.`
    );
  }

  function handleCreateWeak() {
    if (controlFreed) return;
    const next = weak + 1;
    setWeak(next);
    setLastLockResult("none");
    setLastEvent(
      `Created weak_ptr: user weak count is now ${next} (internal control block weak refcount = ${
        next + (strong > 0 ? 1 : 0)
      }). Does not extend Widget lifetime.`
    );
  }

  function handleResetAllShared() {
    if (strong === 0) return;
    setStrong(0);
    setDtorRan(true);
    setLastLockResult("none");

    if (weak === 0) {
      setControlFreed(true);
      setLastEvent(
        strategy === "make_shared"
          ? "strong reached 0 and weak == 0: ~Widget() ran AND the single contiguous control-block + Widget allocation was freed immediately."
          : "strong reached 0 and weak == 0: ~Widget() + delete ptr freed Widget, AND the separate control block was freed immediately."
      );
    } else {
      setControlFreed(false);
      setLastEvent(
        strategy === "make_shared"
          ? `strong reached 0: ~Widget() ran immediately! HOWEVER, ${weak} live weak_ptr(s) keep internal weak == ${weak} > 0, pinning the entire contiguous [control | inline Widget] allocation on the heap.`
          : `strong reached 0: ~Widget() ran and the separate Widget heap block (0x600001c02000) was freed immediately! Only the small control block remains until weak == 0.`
      );
    }
  }

  function handleWeakLock() {
    if (weak === 0 || controlFreed) return;
    if (strong > 0) {
      const next = strong + 1;
      setStrong(next);
      setLastLockResult("ok");
      setLastEvent(
        `weak.lock() succeeded atomically (strong was ${strong} -> now ${next}): returned a non-null shared_ptr<Widget>.`
      );
    } else {
      setLastLockResult("expired");
      setLastEvent(
        `weak.lock() observed strong == 0 on the surviving control block and safely returned an empty shared_ptr<Widget>{} (nullptr) without touching destroyed Widget.`
      );
    }
  }

  function handleResetAllWeak() {
    if (weak === 0) return;
    setWeak(0);
    setLastLockResult("none");

    if (strong === 0) {
      setControlFreed(true);
      setLastEvent(
        "All weak_ptrs reset while strong == 0: internal weak refcount dropped to 0, so the control block allocation is now FREED!"
      );
    } else {
      setLastEvent(
        `All weak_ptrs reset (weak = 0). Control block stays allocated because strong = ${strong} still owns Widget.`
      );
    }
  }

  function handleRestart() {
    setStrong(1);
    setWeak(1);
    setDtorRan(false);
    setControlFreed(false);
    setLastLockResult("none");
    setLastEvent(
      "Restarted with sp1 (strong = 1) and observing wp1 (weak = 1). Widget and control block are newly allocated."
    );
  }

  const codeSnippet =
    strategy === "make_shared"
      ? `auto sp1 = std::make_shared<Widget>(); // 1 heap alloc: [strong | weak | Widget]
std::weak_ptr<Widget> wp1 = sp1;        // keeps whole contiguous block until weak == 0
sp1.reset();                            // ~Widget() runs now (strong == 0), block stays!
auto maybe = wp1.lock();                // sees strong == 0 -> returns nullptr
wp1.reset();                            // weak == 0 -> contiguous allocation freed`
      : `std::shared_ptr<Widget> sp1(new Widget); // 2 allocs: Widget + control block
std::weak_ptr<Widget> wp1 = sp1;          // keeps only small control block alive
sp1.reset();                              // ~Widget() + delete Widget runs NOW (strong == 0)
auto maybe = wp1.lock();                  // sees strong == 0 -> returns nullptr
wp1.reset();                              // weak == 0 -> control block freed`;

  return (
    <Window
      as="section"
      aria-label="Smart pointer control block simulator"
      title="smart-ptr-control-block.sim"
      actions={
        <a
          href={standardRefToUrl("[util.smartptr.shared]")}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-xs text-ink-soft underline decoration-line-strong underline-offset-4 hover:text-ink hover:decoration-ink"
        >
          [util.smartptr.shared]
        </a>
      }
      bodyClassName="p-5 sm:p-7"
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-2xl font-[450] tracking-[-0.02em] text-ink">
            Control Block &amp; Destruction vs. Deallocation
          </h3>
          <p className="mt-1 text-sm text-ink-soft">
            Compare{" "}
            <code className="font-mono text-xs text-ink">
              std::make_shared&lt;Widget&gt;()
            </code>{" "}
            against{" "}
            <code className="font-mono text-xs text-ink">
              std::shared_ptr&lt;Widget&gt;(new Widget)
            </code>{" "}
            to separate <code className="font-mono text-xs text-ink">~Widget()</code>{" "}
            (<code className="font-mono text-xs text-ink">strong == 0</code>) from
            control-block deallocation (
            <code className="font-mono text-xs text-ink">weak == 0</code>).
          </p>
        </div>

        <div
          role="group"
          aria-label="Shared pointer allocation layout"
          className="flex flex-wrap gap-1.5 rounded-full border border-line bg-paper-sunk p-1"
        >
          <Button
            type="button"
            size="xs"
            variant={strategy === "make_shared" ? "default" : "ghost"}
            aria-pressed={strategy === "make_shared"}
            onClick={() => setStrategy("make_shared")}
            className={cn(
              "font-mono text-xs cursor-pointer",
              strategy === "make_shared" &&
                "bg-sun text-ink border-ink/30 hover:bg-sun/90"
            )}
          >
            std::make_shared&lt;Widget&gt;() (1 block)
          </Button>
          <Button
            type="button"
            size="xs"
            variant={strategy === "new_widget" ? "default" : "ghost"}
            aria-pressed={strategy === "new_widget"}
            onClick={() => setStrategy("new_widget")}
            className={cn(
              "font-mono text-xs cursor-pointer",
              strategy === "new_widget" &&
                "bg-sun text-ink border-ink/30 hover:bg-sun/90"
            )}
          >
            shared_ptr&lt;Widget&gt;(new Widget) (2 blocks)
          </Button>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-paper px-4 py-3">
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={strong === 0 || controlFreed}
          onClick={handleCopyShared}
          className="font-mono text-xs cursor-pointer"
        >
          Copy shared_ptr
        </Button>
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={controlFreed}
          onClick={handleCreateWeak}
          className="font-mono text-xs cursor-pointer"
        >
          Create weak_ptr
        </Button>
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={strong === 0}
          onClick={handleResetAllShared}
          className="font-mono text-xs cursor-pointer"
        >
          Reset all shared_ptrs
        </Button>
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={weak === 0 || controlFreed}
          onClick={handleWeakLock}
          className="font-mono text-xs cursor-pointer"
        >
          Call weak.lock()
        </Button>
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={weak === 0}
          onClick={handleResetAllWeak}
          className="font-mono text-xs cursor-pointer"
        >
          Reset all weak_ptrs
        </Button>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={handleRestart}
          className="ml-auto font-mono text-xs cursor-pointer"
        >
          Restart
        </Button>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-line bg-paper px-3.5 py-2.5">
          <div className="text-[11px] text-ink-faint">strong (use_count)</div>
          <div
            className={cn(
              "mt-1 font-mono text-base font-semibold",
              strong > 0 ? "text-[color:var(--right)]" : "text-wrong"
            )}
          >
            {strong}
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-paper px-3.5 py-2.5">
          <div className="text-[11px] text-ink-faint">
            weak_ptrs (internal weak)
          </div>
          <div className="mt-1 font-mono text-base font-semibold text-ink">
            {weak}{" "}
            <span className="text-xs font-normal text-ink-soft">
              ({internalWeakCount})
            </span>
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-paper px-3.5 py-2.5">
          <div className="text-[11px] text-ink-faint">~Widget() destructor</div>
          <div
            className={cn(
              "mt-1 font-mono text-xs font-semibold",
              dtorRan ? "text-wrong" : "text-[color:var(--right)]"
            )}
          >
            {dtorRan ? "Ran (strong == 0)" : "Alive (constructed)"}
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-paper px-3.5 py-2.5">
          <div className="text-[11px] text-ink-faint">Control block memory</div>
          <div
            className={cn(
              "mt-1 font-mono text-xs font-semibold",
              controlFreed ? "text-ink-soft" : "text-ink"
            )}
          >
            {controlFreed
              ? "Freed (weak == 0)"
              : "Allocated on heap"}
          </div>
        </div>
      </div>

      {strategy === "make_shared" ? (
        <div className="mb-5 rounded-[var(--radius-panel)] border border-line bg-paper p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-ink">
              1 Contiguous Heap Allocation (0x600001c01000)
            </span>
            <span
              className={cn(
                "rounded-[var(--radius-chip)] px-2 py-0.5 font-mono text-[11px] font-medium",
                controlFreed
                  ? "bg-paper-sunk text-ink-soft"
                  : dtorRan
                    ? "bg-sun-wash text-ink"
                    : "bg-right-wash text-[color:var(--right)]"
              )}
            >
              {controlFreed
                ? "Freed via operator delete"
                : dtorRan
                  ? "Widget destroyed, yet whole block pinned by weak > 0!"
                  : "Single cache-friendly allocation"}
            </span>
          </div>

          <div
            className={cn(
              "grid gap-2 rounded-2xl border p-3 sm:grid-cols-3 transition-colors",
              controlFreed
                ? "border-dashed border-line-strong bg-paper-sunk/60 opacity-65"
                : "border-line-strong bg-paper-raised"
            )}
          >
            <div className="rounded-xl border border-line bg-paper p-3">
              <div className="font-mono text-[11px] text-ink-faint">
                +0x00 (8B)
              </div>
              <div className="mt-0.5 font-mono text-xs font-semibold text-ink">
                strong = {strong}
              </div>
              <div className="mt-1 font-mono text-[11px] text-ink-soft">
                Controls ~Widget()
              </div>
            </div>

            <div className="rounded-xl border border-line bg-paper p-3">
              <div className="font-mono text-[11px] text-ink-faint">
                +0x08 (8B)
              </div>
              <div className="mt-0.5 font-mono text-xs font-semibold text-ink">
                weak = {internalWeakCount}
              </div>
              <div className="mt-1 font-mono text-[11px] text-ink-soft">
                Controls block free()
              </div>
            </div>

            <div
              className={cn(
                "rounded-xl border p-3 transition-colors",
                controlFreed
                  ? "border-line bg-paper-sunk text-ink-soft"
                  : dtorRan
                    ? "border-wrong/35 bg-wrong-wash/60"
                    : "border-[color:var(--right)]/35 bg-right-wash/70"
              )}
            >
              <div className="font-mono text-[11px] text-ink-faint">
                +0x10 (inline Widget)
              </div>
              <div
                className={cn(
                  "mt-0.5 font-mono text-xs font-semibold",
                  dtorRan ? "text-wrong" : "text-[color:var(--right)]"
                )}
              >
                {dtorRan
                  ? "Destroyed (~Widget() ran)"
                  : "Widget alive inline"}
              </div>
              <div className="mt-1 font-mono text-[11px] text-ink-soft">
                {controlFreed
                  ? "Bytes returned to allocator"
                  : dtorRan
                    ? "Bytes stay reserved inside block!"
                    : "Zero second malloc"}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-[var(--radius-panel)] border border-line bg-paper p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-ink">
                Allocation #1: Control Block (0x600001c01000)
              </span>
              <span
                className={cn(
                  "rounded-[var(--radius-chip)] px-2 py-0.5 font-mono text-[11px] font-medium",
                  controlFreed
                    ? "bg-paper-sunk text-ink-soft"
                    : "bg-sun-wash text-ink"
                )}
              >
                {controlFreed ? "Freed (weak == 0)" : "Alive"}
              </span>
            </div>

            <div
              className={cn(
                "grid gap-2 rounded-2xl border p-3 sm:grid-cols-3 transition-colors",
                controlFreed
                  ? "border-dashed border-line-strong bg-paper-sunk/60 opacity-65"
                  : "border-line-strong bg-paper-raised"
              )}
            >
              <div className="rounded-xl border border-line bg-paper p-2.5">
                <div className="font-mono text-[11px] text-ink-faint">strong</div>
                <div className="mt-0.5 font-mono text-xs font-semibold text-ink">
                  {strong}
                </div>
              </div>
              <div className="rounded-xl border border-line bg-paper p-2.5">
                <div className="font-mono text-[11px] text-ink-faint">weak</div>
                <div className="mt-0.5 font-mono text-xs font-semibold text-ink">
                  {internalWeakCount}
                </div>
              </div>
              <div className="rounded-xl border border-line bg-paper p-2.5">
                <div className="font-mono text-[11px] text-ink-faint">ptr</div>
                <div className="mt-0.5 font-mono text-[11px] font-semibold text-ink truncate">
                  {widgetMemoryFreed ? "freed" : "0x600001c02000"}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[var(--radius-panel)] border border-line bg-paper p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-ink">
                Allocation #2: Separate Widget (0x600001c02000)
              </span>
              <span
                className={cn(
                  "rounded-[var(--radius-chip)] px-2 py-0.5 font-mono text-[11px] font-medium",
                  widgetMemoryFreed
                    ? "bg-wrong-wash text-wrong"
                    : "bg-right-wash text-[color:var(--right)]"
                )}
              >
                {widgetMemoryFreed
                  ? "~Widget() + freed (strong == 0)"
                  : "Alive"}
              </span>
            </div>

            <div
              className={cn(
                "rounded-2xl border p-3.5 font-mono text-xs transition-colors",
                widgetMemoryFreed
                  ? "border-dashed border-wrong/35 bg-wrong-wash/50 text-wrong"
                  : "border-[color:var(--right)]/35 bg-right-wash/70 text-[color:var(--right)]"
              )}
            >
              {widgetMemoryFreed
                ? "delete ptr ran immediately when strong reached 0. Widget RAM reclaimed even while weak_ptrs remain!"
                : "Constructed via `new Widget` at 0x600001c02000. Destroyed and freed as soon as strong == 0."}
            </div>
          </div>
        </div>
      )}

      <div
        aria-live="polite"
        className={cn(
          "mb-5 rounded-2xl border px-4 py-3 text-xs leading-relaxed text-ink-body",
          lastLockResult === "ok" &&
            "border-[color:var(--right)]/35 bg-right-wash/60",
          lastLockResult === "expired" && "border-wrong/35 bg-wrong-wash/60",
          lastLockResult === "none" &&
            (dtorRan && !controlFreed
              ? "border-ink/25 bg-sun-wash/70"
              : "border-line bg-paper")
        )}
      >
        {lastEvent}
      </div>

      <CppCodeBlock caption={`${strategy}_lifecycle.cpp`} code={codeSnippet} />
    </Window>
  );
}
