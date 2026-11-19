"use client";

import { RadDebuggerShell } from "@/components/rad-debugger/RadDebuggerShell";
import { StatusPill } from "@/components/rad-debugger/PanePrimitives";
import { cn } from "@/lib/utils";
import { TEMPLATES_CONCEPTS_SCENARIOS } from "./scenarios/templates-concepts";

const CONCEPT_CHAIN = [
  { rank: 1, name: "std::input_iterator", ops: "++it, *it (single pass)" },
  { rank: 2, name: "std::forward_iterator", ops: "multi-pass guarantee" },
  { rank: 3, name: "std::bidirectional_iterator", ops: "--it supported" },
  { rank: 4, name: "std::random_access_iterator", ops: "it + n, it[n] in O(1)" },
  { rank: 5, name: "std::contiguous_iterator", ops: "std::to_address(it) -> T*" },
];

export function TemplatesConceptsMap({ topicSlug }: { topicSlug?: string }) {
  return (
    <RadDebuggerShell
      ariaLabel="Concepts subsumption, SFINAE substitution, and requires diagnostics debugger"
      title="raddbg · templates_concepts"
      scenarios={TEMPLATES_CONCEPTS_SCENARIOS}
      topicSlug={topicSlug}
      visualizerTitle="Constraint Graph"
      renderVisualizer={({ step, scenario }) => {
        if (scenario.id === "concept-subsumption") {
          const rankReg = step.registers?.find((r) => r.name === "maxRank");
          const maxRank = Number(rankReg?.value.match(/\d+/)?.[0] ?? "5");

          return (
            <div className="space-y-3">
              <div className="border border-line bg-paper p-2.5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-[11px] font-semibold text-ink">
                    Normalized Subsumption DAG
                  </span>
                  <StatusPill tone={step.verdict.tone}>
                    Rank #{maxRank} wins
                  </StatusPill>
                </div>
                <div className="space-y-1 font-mono text-[11px]">
                  {CONCEPT_CHAIN.map((c) => {
                    const satisfied = c.rank <= maxRank;
                    const winner = c.rank === maxRank;
                    return (
                      <div
                        key={c.rank}
                        className={cn(
                          "flex flex-wrap items-center justify-between gap-2 border px-2 py-1",
                          winner
                            ? "border-ink bg-sun text-ink font-semibold"
                            : satisfied
                              ? "border-[color:var(--right)]/35 bg-right-wash/35 text-ink"
                              : "border-wrong/30 bg-wrong-wash/25 text-ink-faint"
                        )}
                      >
                        <span>
                          #{c.rank} {c.name}
                        </span>
                        <span className="font-sans text-[10.5px] opacity-85">
                          {c.ops}
                        </span>
                        <StatusPill
                          tone={winner ? "active" : satisfied ? "safe" : "danger"}
                          className="text-[10px]"
                        >
                          {winner ? "WINNER" : satisfied ? "SUBSUMED" : "FAILED"}
                        </StatusPill>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        }

        return (
          <div className="space-y-3">
            <div className="border border-line bg-paper p-2.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[11px] font-semibold text-ink">
                  Candidate Substitution &amp; Constraint Trace
                </span>
                <StatusPill tone={step.verdict.tone}>
                  {step.verdict.label}
                </StatusPill>
              </div>
              <div className="space-y-1.5 font-mono text-[11px]">
                {step.watches.map((w) => (
                  <div
                    key={w.id}
                    className="flex flex-wrap items-center justify-between gap-2 border border-line bg-paper-raised px-2 py-1.5"
                  >
                    <span className="font-semibold text-ink">{w.expr}</span>
                    <span className="text-ink-body">{w.value}</span>
                    {w.badge ? (
                      <StatusPill tone={w.tone ?? "neutral"} className="text-[10px]">
                        {w.badge}
                      </StatusPill>
                    ) : null}
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
