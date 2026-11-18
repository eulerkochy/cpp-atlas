"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Window } from "@/components/Window";
import { cn } from "@/lib/utils";

interface ForwardingCase {
  id: string;
  callerExpr: string;
  deducedT: string;
  collapsedParam: string;
  forwardReturn: string;
  targetOverload: string;
  rule: string;
}

const FORWARD_CASES: ForwardingCase[] = [
  {
    id: "lval",
    callerExpr: "relay(w);  // Widget w;",
    deducedT: "Widget&",
    collapsedParam: "Widget& &&  →  Widget&",
    forwardReturn: "Widget& (lvalue)",
    targetOverload: "sink(Widget&)",
    rule: "[temp.deduct.call]: lvalue argument deduces T as lvalue reference; & + && collapses to &.",
  },
  {
    id: "clval",
    callerExpr: "relay(cw); // const Widget cw;",
    deducedT: "const Widget&",
    collapsedParam: "const Widget& &&  →  const Widget&",
    forwardReturn: "const Widget& (lvalue)",
    targetOverload: "sink(const Widget&)",
    rule: "cv-qualifiers survive deduction inside T = const Widget&, blocking accidental mutation.",
  },
  {
    id: "xval",
    callerExpr: "relay(std::move(w));",
    deducedT: "Widget",
    collapsedParam: "Widget&&",
    forwardReturn: "Widget&& (xvalue)",
    targetOverload: "sink(Widget&&)",
    rule: "Rvalue argument deduces T as non-reference Widget; && stays && and forward casts back to xvalue.",
  },
  {
    id: "prval",
    callerExpr: "relay(Widget{42});",
    deducedT: "Widget",
    collapsedParam: "Widget&&",
    forwardReturn: "Widget&& (xvalue)",
    targetOverload: "sink(Widget&&)",
    rule: "Inside relay, prvalue materialized into param; std::forward<Widget> restores rvalue-ness via xvalue.",
  },
];

export function MoveForwardingMap() {
  const [activeTab, setActiveTab] = useState<"ownership" | "collapsing">(
    "ownership"
  );
  const [transferOp, setTransferOp] = useState<"copy" | "move">("move");
  const [isNoexcept, setIsNoexcept] = useState<boolean>(true);
  const [fwdId, setFwdId] = useState<string>("lval");

  const fwdCase =
    FORWARD_CASES.find((c) => c.id === fwdId) ?? FORWARD_CASES[0];
  const effectiveMove = transferOp === "move" && isNoexcept;

  return (
    <Window
      as="section"
      aria-label="Ownership and reference collapsing map"
      title="move_forwarding.map"
      actions={
        <span className="font-mono text-xs text-ink-soft">
          [dcl.ref] &amp; [utility.syn]
        </span>
      }
      bodyClassName="p-5 sm:p-7"
    >
      <div className="mb-4">
        <h3 className="font-display text-2xl font-[450] tracking-[-0.02em] text-ink">
          Vector Ownership &amp; Reference Collapsing
        </h3>
        <p className="mt-1 text-sm text-ink-soft">
          Inspect pointer stealing versus deep copy and trace template{" "}
          <code className="font-mono text-xs text-ink">T&amp;&amp;</code>{" "}
          deduction rules.
        </p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "ownership" | "collapsing")}
        className="w-full"
      >
        <TabsList className="mb-5 max-w-full flex-wrap">
          <TabsTrigger
            value="ownership"
            className="h-8 px-3.5 text-xs cursor-pointer"
          >
            std::vector Copy vs. Move
          </TabsTrigger>
          <TabsTrigger
            value="collapsing"
            className="h-8 px-3.5 text-xs cursor-pointer"
          >
            T&amp;&amp; &amp; Reference Collapsing
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ownership" keepMounted className="mt-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-paper px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="xs"
                variant={transferOp === "copy" ? "default" : "outline"}
                aria-pressed={transferOp === "copy"}
                onClick={() => setTransferOp("copy")}
                className={cn(
                  "font-mono text-xs cursor-pointer",
                  transferOp === "copy" &&
                    "bg-sun text-ink border-ink/30 hover:bg-sun/90"
                )}
              >
                v2 = v1 (copy)
              </Button>
              <Button
                type="button"
                size="xs"
                variant={transferOp === "move" ? "default" : "outline"}
                aria-pressed={transferOp === "move"}
                onClick={() => setTransferOp("move")}
                className={cn(
                  "font-mono text-xs cursor-pointer",
                  transferOp === "move" &&
                    "bg-sun text-ink border-ink/30 hover:bg-sun/90"
                )}
              >
                v2 = std::move(v1)
              </Button>
            </div>

            <label className="flex items-center gap-2.5 text-xs text-ink-body cursor-pointer select-none">
              <Switch
                checked={isNoexcept}
                onCheckedChange={setIsNoexcept}
                size="sm"
              />
              <span>
                Element move ctor is{" "}
                <code className="rounded border border-line bg-paper-sunk px-1.5 py-0.5 font-mono text-xs text-ink">
                  noexcept
                </code>
              </span>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="min-w-0 rounded-2xl border border-line bg-paper p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-xs font-semibold text-ink">
                  Stack: v1 (24 bytes)
                </span>
                <span className="font-mono text-[11px] text-ink-soft">
                  {effectiveMove
                    ? "moved-from (empty valid)"
                    : "owns 0x60000140a100"}
                </span>
              </div>
              <pre className="overflow-x-auto rounded-xl border border-line bg-paper-raised p-3 font-mono text-xs leading-relaxed text-[var(--code-ink)]">
                {`begin_: ${effectiveMove ? "nullptr (0x0)" : "0x60000140a100"}
end_:   ${effectiveMove ? "nullptr (0x0)" : "0x60000140a10c"}
cap_:   ${effectiveMove ? "nullptr (0x0)" : "0x60000140a110"}`}
              </pre>
            </div>

            <div className="min-w-0 rounded-2xl border border-line bg-paper p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-xs font-semibold text-ink">
                  Stack: v2 (24 bytes)
                </span>
                <span
                  className={cn(
                    "font-mono text-[11px] font-medium",
                    effectiveMove ? "text-[color:var(--right)]" : "text-ink-soft"
                  )}
                >
                  {effectiveMove
                    ? "stole 0x60000140a100 in O(1)"
                    : "allocated new 0x60000140f800 in O(N)"}
                </span>
              </div>
              <pre className="overflow-x-auto rounded-xl border border-line bg-paper-raised p-3 font-mono text-xs leading-relaxed text-[var(--code-ink)]">
                {`begin_: ${effectiveMove ? "0x60000140a100" : "0x60000140f800"}
end_:   ${effectiveMove ? "0x60000140a10c" : "0x60000140f80c"}
cap_:   ${effectiveMove ? "0x60000140a110" : "0x60000140f810"}`}
              </pre>
            </div>
          </div>

          <div
            aria-live={activeTab === "ownership" ? "polite" : "off"}
            className={cn(
              "rounded-2xl border p-3.5 text-xs leading-relaxed text-ink-body",
              transferOp === "move" && !isNoexcept
                ? "border-ink/25 bg-sun-wash/70"
                : "border-[color:var(--right)]/35 bg-right-wash/60"
            )}
          >
            {transferOp === "move" && !isNoexcept
              ? "Reallocation fallback active: during buffer growth, std::move_if_noexcept refuses to move elements whose move constructor lacks noexcept, falling back to O(N) copying to preserve the strong exception guarantee."
              : effectiveMove
                ? "Zero heap allocations performed. Moving a container transfers three stack pointers and nulls the source control block."
                : "Deep copy allocates a fresh heap buffer and invokes the element copy constructor N times."}
          </div>
        </TabsContent>

        <TabsContent value="collapsing" keepMounted className="mt-0 space-y-4">
          <div className="flex flex-wrap gap-2">
            {FORWARD_CASES.map((item) => (
              <Button
                key={item.id}
                type="button"
                size="xs"
                variant={fwdId === item.id ? "default" : "outline"}
                aria-pressed={fwdId === item.id}
                onClick={() => setFwdId(item.id)}
                className={cn(
                  "font-mono text-xs cursor-pointer",
                  fwdId === item.id &&
                    "bg-sun text-ink border-ink/30 hover:bg-sun/90"
                )}
              >
                {item.callerExpr}
              </Button>
            ))}
          </div>

          <div
            aria-live={activeTab === "collapsing" ? "polite" : "off"}
            className="space-y-4"
          >
            <dl className="grid gap-3 border-t border-line pt-4 sm:grid-cols-4">
              <div>
                <dt className="text-[11px] text-ink-faint">Deduced T</dt>
                <dd className="mt-1 font-mono text-xs font-semibold text-ink">
                  {fwdCase.deducedT}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-ink-faint">
                  Param T&amp;&amp; collapsed
                </dt>
                <dd className="mt-1 font-mono text-xs font-semibold text-ink">
                  {fwdCase.collapsedParam}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-ink-faint">
                  std::forward&lt;T&gt;(arg)
                </dt>
                <dd className="mt-1 font-mono text-xs font-semibold text-ink">
                  {fwdCase.forwardReturn}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-ink-faint">
                  Selected overload
                </dt>
                <dd className="mt-1 font-mono text-xs font-semibold text-[color:var(--right)]">
                  {fwdCase.targetOverload}
                </dd>
              </div>
            </dl>

            <div className="rounded-2xl bg-sun-wash/60 px-4 py-3 text-xs leading-relaxed text-ink-body">
              {fwdCase.rule}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </Window>
  );
}
