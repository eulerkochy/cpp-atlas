"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Window } from "@/components/Window";
import { cn } from "@/lib/utils";

interface IteratorCandidate {
  id: string;
  label: string;
  container: string;
  maxRank: number;
  winningAlgorithm: string;
  complexity: string;
}

const CONCEPTS = [
  { rank: 1, name: "std::input_iterator", ops: "++it, *it (single pass)" },
  { rank: 2, name: "std::forward_iterator", ops: "multi-pass guarantee" },
  { rank: 3, name: "std::bidirectional_iterator", ops: "--it supported" },
  { rank: 4, name: "std::random_access_iterator", ops: "it + n, it[n] in O(1)" },
  {
    rank: 5,
    name: "std::contiguous_iterator",
    ops: "std::to_address(it) → T*",
  },
];

const CANDIDATES: IteratorCandidate[] = [
  {
    id: "vector",
    label: "std::vector<int>::iterator",
    container: "Contiguous heap array",
    maxRank: 5,
    winningAlgorithm:
      "advance(contiguous_iterator) → raw pointer += n / memcpy",
    complexity: "O(1) with SIMD and contiguous span support",
  },
  {
    id: "deque",
    label: "std::deque<int>::iterator",
    container: "Segmented fixed-size blocks",
    maxRank: 4,
    winningAlgorithm:
      "advance(random_access_iterator) → block-offset jump without raw contiguous memory",
    complexity: "O(1) jump, NOT contiguous",
  },
  {
    id: "list",
    label: "std::list<int>::iterator",
    container: "Doubly linked heap nodes",
    maxRank: 3,
    winningAlgorithm:
      "advance(bidirectional_iterator) → walks ++it or --it depending on n sign",
    complexity: "O(|n|) node hops",
  },
  {
    id: "istream",
    label: "std::istream_iterator<int>",
    container: "Single-pass input stream",
    maxRank: 1,
    winningAlgorithm:
      "advance(input_iterator) → single-pass forward increment only (n >= 0)",
    complexity: "O(n) single-pass",
  },
];

export function TemplatesConceptsMap() {
  const [selectedId, setSelectedId] = useState<string>("vector");
  const active =
    CANDIDATES.find((c) => c.id === selectedId) ?? CANDIDATES[0];

  return (
    <Window
      as="section"
      aria-label="Concept subsumption chain"
      title="concepts_subsumption.map"
      actions={
        <span className="font-mono text-xs text-ink-soft">
          [temp.constr.order]
        </span>
      }
      bodyClassName="p-5 sm:p-7"
    >
      <div className="mb-4">
        <h3 className="font-display text-2xl font-[450] tracking-[-0.02em] text-ink">
          C++20 Concept Subsumption Chain
        </h3>
        <p className="mt-1 text-sm text-ink-soft">
          Select an iterator type to watch{" "}
          <code className="font-mono text-xs text-ink">
            [temp.constr.order]
          </code>{" "}
          prune weaker overloads and select the most constrained match.
        </p>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {CANDIDATES.map((cand) => (
          <Button
            key={cand.id}
            type="button"
            size="sm"
            variant={selectedId === cand.id ? "default" : "outline"}
            aria-pressed={selectedId === cand.id}
            onClick={() => setSelectedId(cand.id)}
            className={cn(
              "font-mono text-xs cursor-pointer",
              selectedId === cand.id &&
                "bg-sun text-ink border-ink/30 hover:bg-sun/90"
            )}
          >
            {cand.label}
          </Button>
        ))}
      </div>

      <div className="mb-5 space-y-2">
        {CONCEPTS.map((c) => {
          const satisfied = c.rank <= active.maxRank;
          const isWinner = c.rank === active.maxRank;
          return (
            <div
              key={c.name}
              className={cn(
                "flex flex-wrap items-center justify-between gap-2 rounded-2xl border px-4 py-2.5 transition-colors",
                isWinner && "border-ink bg-sun-wash text-ink",
                !isWinner &&
                  satisfied &&
                  "border-line-strong bg-paper-raised text-ink-body",
                !satisfied && "border-line bg-paper-sunk text-ink-soft"
              )}
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
                <span className="font-mono text-xs font-semibold text-ink">
                  {c.name}
                </span>
                <span className="text-xs text-ink-soft">{c.ops}</span>
              </div>
              <span
                className={cn(
                  "font-mono text-[11px] font-medium",
                  isWinner
                    ? "text-[color:var(--right)]"
                    : satisfied
                      ? "text-ink"
                      : "text-ink-soft"
                )}
              >
                {isWinner
                  ? "winner (most constrained)"
                  : satisfied
                    ? "satisfied (subsumed)"
                    : "constraint failed"}
              </span>
            </div>
          );
        })}
      </div>

      <dl
        aria-live="polite"
        className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2"
      >
        <div>
          <dt className="text-xs text-ink-faint">
            Selected overload ({active.container})
          </dt>
          <dd className="mt-1 font-mono text-xs font-semibold text-[color:var(--right)]">
            {active.winningAlgorithm}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-faint">Guaranteed cost</dt>
          <dd className="mt-1 font-mono text-xs text-ink">
            {active.complexity}
          </dd>
        </div>
      </dl>
    </Window>
  );
}
