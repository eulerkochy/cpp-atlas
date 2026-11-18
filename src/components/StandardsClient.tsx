"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, BookOpen, ExternalLink, Search } from "lucide-react";
import { CppCodeBlock } from "@/components/CppCodeBlock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  STANDARD_ERAS,
  STANDARDS_MILESTONES,
  type StandardEra,
} from "@/data/standards-evolution";
import { cn } from "@/lib/utils";
import { standardRefToUrl } from "@/types/topics";

type EraFilter = "all" | StandardEra;
type CategoryFilter = "all" | "language" | "library";

export function StandardsClient() {
  const [era, setEra] = useState<EraFilter>("all");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return STANDARDS_MILESTONES.filter((m) => {
      if (era !== "all" && m.era !== era) return false;
      if (category !== "all" && m.category !== category) return false;
      if (!q) return true;
      return (
        m.title.toLowerCase().includes(q) ||
        m.clause.toLowerCase().includes(q) ||
        m.paper.toLowerCase().includes(q) ||
        m.shift.toLowerCase().includes(q)
      );
    });
  }, [era, category, query]);

  const hasFilters =
    era !== "all" || category !== "all" || query.trim() !== "";

  const resetFilters = () => {
    setEra("all");
    setCategory("all");
    setQuery("");
  };

  return (
    <div className="space-y-8">
      <div className="space-y-4 rounded-[var(--radius-panel)] border border-line bg-paper-raised p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div
            role="group"
            aria-label="Filter by C++ standard revision"
            className="flex flex-wrap items-center gap-1.5"
          >
            <button
              type="button"
              aria-pressed={era === "all"}
              onClick={() => setEra("all")}
              className={cn(
                "inline-flex h-8 items-center rounded-full px-3.5 text-sm transition-colors cursor-pointer",
                era === "all"
                  ? "bg-sun text-ink font-medium"
                  : "border border-line bg-paper text-ink-soft hover:border-line-strong hover:text-ink"
              )}
            >
              All eras
            </button>
            {STANDARD_ERAS.map((item) => {
              const active = era === item;
              return (
                <button
                  key={item}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setEra(item)}
                  className={cn(
                    "inline-flex h-8 items-center rounded-full px-3.5 text-sm transition-colors cursor-pointer",
                    active
                      ? "bg-sun text-ink font-medium"
                      : "border border-line bg-paper text-ink-soft hover:border-line-strong hover:text-ink"
                  )}
                >
                  {item}
                </button>
              );
            })}
          </div>

          <div className="relative w-full lg:w-80">
            <Search
              className="size-3.5 text-ink-faint absolute left-3.5 top-1/2 -translate-y-1/2"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search milestones by title, clause, paper, or shift"
              placeholder="Search P2996R13, [class.copy.elision], reflection…"
              className="h-9 rounded-full border-line-strong bg-paper pl-9 text-sm text-ink placeholder:text-ink-faint"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
          <div
            role="group"
            aria-label="Filter by standard category"
            className="flex flex-wrap items-center gap-1.5"
          >
            {(
              [
                { value: "all", label: "All" },
                { value: "language", label: "Language" },
                { value: "library", label: "Library" },
              ] as const
            ).map((opt) => {
              const active = category === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setCategory(opt.value)}
                  className={cn(
                    "inline-flex h-7 items-center rounded-full px-3 text-xs transition-colors cursor-pointer",
                    active
                      ? "bg-ink text-paper font-medium"
                      : "border border-line bg-paper text-ink-soft hover:border-line-strong hover:text-ink"
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3 text-xs text-ink-soft">
            <span className="tabular-nums">
              Showing {filtered.length} of {STANDARDS_MILESTONES.length} milestones
            </span>
            {hasFilters ? (
              <button
                type="button"
                onClick={resetFilters}
                className="text-ink underline decoration-line-strong underline-offset-3 hover:decoration-ink cursor-pointer"
              >
                Reset filters
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-[var(--radius-panel)] border border-line bg-paper-raised p-8 text-center space-y-3">
          <p className="text-sm text-ink-soft">
            No standard milestones match your current filter or search query.
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={resetFilters}
            className="cursor-pointer"
          >
            Show all 36 milestones
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {filtered.map((m) => (
            <article
              key={m.id}
              id={m.id}
              className="scroll-mt-28 rounded-[var(--radius-panel)] border border-line bg-paper-raised p-5 sm:p-6 space-y-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-[var(--radius-chip)] bg-sun-wash px-2.5 py-0.5 text-xs font-medium text-ink">
                  {m.era}
                </span>
                <span className="rounded-[var(--radius-chip)] border border-line bg-paper-sunk px-2.5 py-0.5 text-xs text-ink-soft">
                  {m.category === "language" ? "Language" : "Library"}
                </span>
                <span className="rounded-[var(--radius-chip)] border border-line bg-paper px-2.5 py-0.5 font-mono text-xs text-ink">
                  {m.paper}
                </span>
                <a
                  href={standardRefToUrl(m.clause)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-[var(--radius-chip)] border border-line bg-paper px-2.5 py-0.5 font-mono text-xs text-ink-soft transition-colors hover:border-ink/40 hover:text-ink"
                >
                  <span>{m.clause}</span>
                  <ExternalLink className="size-3" aria-hidden />
                </a>
              </div>

              <div className="space-y-2">
                <h2 className="font-display text-2xl leading-snug font-[450] tracking-[-0.02em] text-ink">
                  {m.title}
                </h2>
                <p className="max-w-[70ch] leading-relaxed text-ink-body">
                  {m.shift}
                </p>
              </div>

              <CppCodeBlock code={m.code} caption={`${m.id}.cpp`} />

              <div className="flex flex-wrap items-center gap-5 border-t border-line pt-3 text-sm">
                <Link
                  href={`/topics/${m.topicSlug}`}
                  className="inline-flex items-center gap-1.5 font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
                >
                  <BookOpen className="size-3.5 text-ink-soft" aria-hidden />
                  <span>Study topic</span>
                </Link>
                <Link
                  href={`/w/cpp/${m.cpprefPath}`}
                  className="inline-flex items-center gap-1.5 text-ink-soft underline decoration-line-strong underline-offset-4 hover:text-ink hover:decoration-ink"
                >
                  <span>cppreference</span>
                  <ArrowUpRight className="size-3.5" aria-hidden />
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
