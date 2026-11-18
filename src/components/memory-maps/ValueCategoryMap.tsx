"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Window } from "@/components/Window";
import { cn } from "@/lib/utils";
import type { ValueCategoryKind } from "@/types/cpp";

interface SampleExpr {
  id: string;
  code: string;
  category: ValueCategoryKind;
  glvalue: boolean;
  rvalue: boolean;
  addressable: string;
  materialization: string;
  clause: string;
  note: string;
}

const SAMPLE_EXPRS: SampleExpr[] = [
  {
    id: "var",
    code: "Widget w;",
    category: "lvalue",
    glvalue: true,
    rvalue: false,
    addressable: "Yes (&w = 0x7ffee4b2a8c0)",
    materialization: "Already resides in stack storage",
    clause: "[basic.lval] §7.2.1",
    note: "Named objects are always lvalues—even if their declared type is Widget&&.",
  },
  {
    id: "lit",
    code: "\"hello\"",
    category: "lvalue",
    glvalue: true,
    rvalue: false,
    addressable: "Yes (.rodata 0x1004012a0)",
    materialization:
      "Lives in static read-only segment for full program duration",
    clause: "[lex.string] §5.13.5",
    note: "String literals are lvalues of type const char[6], unlike numeric literals.",
  },
  {
    id: "prval",
    code: "Widget{42}",
    category: "prvalue",
    glvalue: false,
    rvalue: true,
    addressable: "No (unmaterialized recipe)",
    materialization:
      "Constructed directly into destination slot; materialized only on ref bind or member access",
    clause: "[class.copy.elision] & [conv.rval]",
    note: "C++17 prvalues carry initialization instructions down to the receiver—zero moves.",
  },
  {
    id: "move",
    code: "std::move(w)",
    category: "xvalue",
    glvalue: true,
    rvalue: true,
    addressable: "Origin has address; cast yields unnamed Widget&&",
    materialization: "Existing object marked expiring (0 CPU instructions)",
    clause: "[expr.static.cast]",
    note: "Has both identity (glvalue) and move-eligibility (rvalue).",
  },
  {
    id: "member-rval",
    code: "make_widget().id",
    category: "xvalue",
    glvalue: true,
    rvalue: true,
    addressable: "Subobject inside materialized temporary",
    materialization:
      "Triggers [conv.rval] on make_widget() before reading .id subobject",
    clause: "[expr.ref] §7.6.1.5",
    note: "Member access on a prvalue materializes a temporary xvalue and yields an xvalue field.",
  },
];

const CATEGORY_INFO: Record<
  ValueCategoryKind,
  { title: string; parents: string; summary: string }
> = {
  lvalue: {
    title: "lvalue",
    parents: "glvalue (not rvalue)",
    summary:
      "Designates an object or function with durable identity; cannot be moved from implicitly.",
  },
  xvalue: {
    title: "xvalue",
    parents: "glvalue AND rvalue",
    summary:
      "An expiring object that already exists in memory whose resources can be safely pilfered.",
  },
  prvalue: {
    title: "prvalue",
    parents: "rvalue (not glvalue)",
    summary:
      "An unmaterialized value computation or object initialization recipe waiting for a slot.",
  },
};

export function ValueCategoryMap() {
  const [selectedExprId, setSelectedExprId] = useState<string>("prval");
  const activeExpr =
    SAMPLE_EXPRS.find((e) => e.id === selectedExprId) ?? SAMPLE_EXPRS[0];
  const activeMeta = CATEGORY_INFO[activeExpr.category];

  return (
    <Window
      as="section"
      aria-label="Value category taxonomy map"
      title="value_category.map"
      actions={
        <span className="font-mono text-xs text-ink-soft">
          {activeExpr.clause}
        </span>
      }
      bodyClassName="p-5 sm:p-7"
    >
      <div className="mb-5">
        <h3 className="font-display text-2xl font-[450] tracking-[-0.02em] text-ink">
          C++17 Value Category Lattice
        </h3>
        <p className="mt-1 text-sm text-ink-soft">
          Select an expression to trace its path through glvalue, rvalue, and
          temporary materialization.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {SAMPLE_EXPRS.map((expr) => {
          const isSelected = expr.id === activeExpr.id;
          return (
            <Button
              key={expr.id}
              type="button"
              variant={isSelected ? "default" : "outline"}
              size="sm"
              aria-pressed={isSelected}
              onClick={() => setSelectedExprId(expr.id)}
              className={cn(
                "font-mono text-xs cursor-pointer",
                isSelected && "bg-sun text-ink border-ink/30 hover:bg-sun/90"
              )}
            >
              {expr.code}
            </Button>
          );
        })}
      </div>

      <div className="rounded-[var(--radius-panel)] border border-line bg-paper p-5 sm:p-6 mb-6">
        <div className="flex flex-col items-center gap-4">
          <div className="rounded-full border border-ink bg-ink px-4 py-1.5 font-mono text-xs font-medium text-paper">
            expression
          </div>

          <svg
            viewBox="0 0 400 32"
            className="h-7 w-full max-w-md"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M200 0 L200 12 L95 12 L95 32"
              strokeWidth={activeExpr.glvalue ? 2 : 1.2}
              stroke={activeExpr.glvalue ? "var(--ink)" : "var(--line-strong)"}
            />
            <path
              d="M200 12 L305 12 L305 32"
              strokeWidth={activeExpr.rvalue ? 2 : 1.2}
              stroke={activeExpr.rvalue ? "var(--ink)" : "var(--line-strong)"}
            />
          </svg>

          <div className="grid w-full max-w-md grid-cols-2 gap-3 sm:gap-4">
            <Tooltip>
              <TooltipTrigger
                closeOnClick={false}
                render={
                  <button
                    type="button"
                    onClick={(e) => e.currentTarget.focus()}
                    className={cn(
                      "rounded-2xl border p-3.5 text-center transition-all cursor-help",
                      activeExpr.glvalue
                        ? "border-sun-deep/60 bg-sun text-ink"
                        : "border-line bg-paper-sunk text-ink-soft"
                    )}
                  />
                }
              >
                <span className="block font-mono text-sm font-semibold">
                  glvalue
                </span>
                <span
                  className={cn(
                    "mt-0.5 block text-xs",
                    activeExpr.glvalue ? "text-ink-body" : "text-ink-soft"
                  )}
                >
                  Has identity: {activeExpr.glvalue ? "yes" : "no"}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Generalized lvalue: evaluation identifies a specific object or
                function.
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger
                closeOnClick={false}
                render={
                  <button
                    type="button"
                    onClick={(e) => e.currentTarget.focus()}
                    className={cn(
                      "rounded-2xl border p-3.5 text-center transition-all cursor-help",
                      activeExpr.rvalue
                        ? "border-sun-deep/60 bg-sun text-ink"
                        : "border-line bg-paper-sunk text-ink-soft"
                    )}
                  />
                }
              >
                <span className="block font-mono text-sm font-semibold">
                  rvalue
                </span>
                <span
                  className={cn(
                    "mt-0.5 block text-xs",
                    activeExpr.rvalue ? "text-ink-body" : "text-ink-soft"
                  )}
                >
                  Movable from: {activeExpr.rvalue ? "yes" : "no"}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Can safely surrender internal resources to a move constructor or
                move assignment.
              </TooltipContent>
            </Tooltip>
          </div>

          <svg
            viewBox="0 0 420 34"
            className="h-8 w-full max-w-lg"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M110 0 L110 14 L65 14 L65 34"
              strokeWidth={activeExpr.category === "lvalue" ? 2.2 : 1.2}
              stroke={
                activeExpr.category === "lvalue"
                  ? "var(--ink)"
                  : "var(--line-strong)"
              }
            />
            <path
              d="M110 14 L210 14 L210 34"
              strokeWidth={activeExpr.category === "xvalue" ? 2.2 : 1.2}
              stroke={
                activeExpr.category === "xvalue"
                  ? "var(--ink)"
                  : "var(--line-strong)"
              }
            />
            <path
              d="M310 0 L310 14 L210 14 L210 34"
              strokeWidth={activeExpr.category === "xvalue" ? 2.2 : 1.2}
              stroke={
                activeExpr.category === "xvalue"
                  ? "var(--ink)"
                  : "var(--line-strong)"
              }
            />
            <path
              d="M310 14 L355 14 L355 34"
              strokeWidth={activeExpr.category === "prvalue" ? 2.2 : 1.2}
              stroke={
                activeExpr.category === "prvalue"
                  ? "var(--ink)"
                  : "var(--line-strong)"
              }
            />
          </svg>

          <div className="grid w-full max-w-lg grid-cols-1 gap-3 sm:grid-cols-3">
            {(["lvalue", "xvalue", "prvalue"] as ValueCategoryKind[]).map(
              (cat) => {
                const info = CATEGORY_INFO[cat];
                const isActive = activeExpr.category === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => {
                      const match = SAMPLE_EXPRS.find((e) => e.category === cat);
                      if (match) setSelectedExprId(match.id);
                    }}
                    className={cn(
                      "rounded-2xl border p-3.5 text-left transition-all cursor-pointer",
                      isActive
                        ? "border-ink bg-sun-wash text-ink"
                        : "border-line bg-paper-raised text-ink-soft hover:border-line-strong hover:text-ink"
                    )}
                  >
                    <span className="block font-mono text-sm font-semibold text-ink">
                      {info.title}
                    </span>
                    <span className="mt-1 block text-[11px] leading-snug">
                      {info.parents}
                    </span>
                  </button>
                );
              }
            )}
          </div>
        </div>
      </div>

      <dl
        aria-live="polite"
        className="grid gap-6 border-t border-line pt-5 sm:grid-cols-3"
      >
        <div>
          <dt className="text-xs font-medium text-ink-faint">
            Primary category
          </dt>
          <dd className="mt-1">
            <span className="font-mono text-sm font-semibold text-ink">
              {activeMeta.title}
            </span>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">
              {activeMeta.summary}
            </p>
          </dd>
        </div>

        <div>
          <dt className="text-xs font-medium text-ink-faint">
            Addressability &amp; storage
          </dt>
          <dd className="mt-1">
            <span className="font-mono text-xs text-ink">
              {activeExpr.addressable}
            </span>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">
              {activeExpr.materialization}
            </p>
          </dd>
        </div>

        <div>
          <dt className="text-xs font-medium text-ink-faint">
            Standard takeaway
          </dt>
          <dd className="mt-1 text-xs leading-relaxed text-ink-body">
            {activeExpr.note}
          </dd>
        </div>
      </dl>
    </Window>
  );
}
