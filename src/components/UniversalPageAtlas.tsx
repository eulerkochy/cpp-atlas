"use client";

import { useState } from "react";
import { CppCodeBlock } from "@/components/CppCodeBlock";
import { Button } from "@/components/ui/button";
import { Window } from "@/components/Window";
import { cn } from "@/lib/utils";
import type { CppRefHeading, PageInsights, ReferenceLang } from "@/types/cpp";

interface AtlasSpec {
  label: string;
  value: string;
}

interface AtlasNode {
  id: string;
  label: string;
  branch: string;
  note: string;
  detail?: string;
  specs?: AtlasSpec[];
}

export function UniversalPageAtlas({
  lang,
  title,
  fileStem,
  domain,
  insights,
  cppStandards,
  headings,
  childCount,
}: {
  lang: ReferenceLang;
  title: string;
  fileStem: string;
  domain: string | null;
  insights: PageInsights;
  cppStandards: string[];
  headings: CppRefHeading[];
  childCount: number;
}) {
  const isC = lang === "c";
  const anyConstexpr = !isC && insights.signatures.some((s) => s.isConstexpr);
  const anyNoexcept = !isC && insights.signatures.some((s) => s.isNoexcept);
  const signatureBadges = Array.from(
    new Set(insights.signatures.flatMap((s) => s.badges))
  );
  const cRevisions =
    cppStandards.length > 0
      ? cppStandards.slice(0, 6)
      : signatureBadges.slice(0, 6);

  const signatureSpecs: AtlasSpec[] | undefined = !isC
    ? insights.signatures[0]
      ? [
          { label: "constexpr", value: anyConstexpr ? "yes" : "no" },
          { label: "noexcept", value: anyNoexcept ? "yes" : "no" },
        ]
      : undefined
    : signatureBadges.length > 0
      ? [{ label: "Revisions", value: signatureBadges.join(", ") }]
      : cppStandards.length > 0
        ? [{ label: "Standards", value: cppStandards.join(", ") }]
        : undefined;

  const branches: AtlasNode[] = [
    {
      id: "root",
      label: title,
      branch: "Overview",
      note: `Structural overview of ${title}${domain ? ` in ${domain}` : ""}.`,
      detail: cppStandards.length
        ? `Revisions referenced: ${cppStandards.join(", ")}`
        : `Select a branch on the left to inspect header inclusion, ${isC ? "declarations" : "overloads"}, or specification sections.`,
    },
    {
      id: "header",
      label:
        insights.definedInHeaders.length > 0
          ? insights.definedInHeaders.join(", ")
          : domain ?? (isC ? "Reference entry" : "Namespace entry"),
      branch: "Header & origin",
      note:
        insights.definedInHeaders.length > 0
          ? `Defined in header ${insights.definedInHeaders.join(", ")}.`
          : `Defined in ${domain ?? "the core reference"} with ${childCount} linked child ${childCount === 1 ? "page" : "pages"}.`,
      detail:
        insights.definedInHeaders.length > 0
          ? `Include ${insights.definedInHeaders[0]} before referencing ${title}.`
          : undefined,
    },
    {
      id: "signatures",
      label:
        insights.signatureCount > 0
          ? `${insights.signatureCount} ${isC ? "declaration" : "overload"}${insights.signatureCount === 1 ? "" : "s"}`
          : `${childCount} child symbol${childCount === 1 ? "" : "s"}`,
      branch: "Declarations",
      note:
        insights.signatureCount > 0
          ? `Extracted ${insights.signatureCount} declaration signature${insights.signatureCount === 1 ? "" : "s"} from the specification table.`
          : isC
            ? `Index landing linking ${childCount} documented ${childCount === 1 ? "entry" : "entries"}.`
            : `Index or namespace landing linking ${childCount} documented ${childCount === 1 ? "entry" : "entries"}.`,
      specs: signatureSpecs,
    },
    {
      id: "contract",
      label: "Spec cues",
      branch: "Contract",
      note:
        [
          insights.hasComplexity && "Complexity bounds",
          !isC && insights.hasExceptions && "Exception safety",
          insights.hasNotes && "Standard notes",
          insights.hasExample && "Runnable example",
        ]
          .filter(Boolean)
          .join(", ") || "Reference definition and cross-links.",
      detail: cppStandards.length
        ? `Applicable revisions: ${cppStandards.join(", ")}`
        : undefined,
    },
    ...headings.slice(0, 6).map((h, i) => ({
      id: `sec-${i}`,
      label: h.text,
      branch: `Section ${i + 1}`,
      note: `Documents "${h.text}" in the full specification.`,
      detail: `Open the Read view and select "${h.text}" in the outline for the complete text.`,
    })),
  ];

  const [selectedId, setSelectedId] = useState<string>("root");
  const [revealedHeader, setRevealedHeader] = useState(false);
  const [revealedSpecifiers, setRevealedSpecifiers] = useState(false);

  const selected =
    branches.find((b) => b.id === selectedId) ?? branches[0];

  return (
    <div className="space-y-6">
      <Window
        as="section"
        aria-label="Structural mind map"
        title={`${fileStem}.map`}
        bodyClassName="grid lg:grid-cols-[minmax(0,1fr)_320px]"
      >
        <div className="p-5 sm:p-7 space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              aria-pressed={selectedId === "root"}
              onClick={() => setSelectedId("root")}
              className={cn(
                "rounded-full border px-4 py-1.5 text-[13px] font-medium transition-colors cursor-pointer",
                selectedId === "root"
                  ? "border-ink bg-sun text-ink"
                  : "border-line-strong bg-paper-raised text-ink-body hover:border-ink/40 hover:text-ink"
              )}
            >
              {title}
            </button>
          </div>

          <div className="grid gap-3 border-l border-line-strong pl-5 sm:grid-cols-2">
            {branches.slice(1).map((node, idx) => {
              const isSel = selectedId === node.id;
              const isPrimaryBranch = idx < 3;
              return (
                <button
                  key={node.id}
                  type="button"
                  aria-pressed={isSel}
                  onClick={() => setSelectedId(node.id)}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-2xl border px-4 py-2.5 text-left text-[13px] transition-colors cursor-pointer",
                    !isSel &&
                      "border-line-strong bg-paper-raised text-ink-body hover:border-ink/40",
                    isSel &&
                      isPrimaryBranch &&
                      "border-ink bg-sun text-ink font-medium",
                    isSel &&
                      !isPrimaryBranch &&
                      "border-ink bg-sun-wash text-ink font-medium"
                  )}
                >
                  <span className="truncate font-medium">{node.label}</span>
                  <span
                    className={cn(
                      "shrink-0 font-mono text-[11px]",
                      isSel ? "text-ink/80" : "text-ink-soft"
                    )}
                  >
                    {node.branch}
                  </span>
                </button>
              );
            })}
          </div>

          {insights.signatures[0] ? (
            <CppCodeBlock
              caption="Primary declaration"
              code={insights.signatures[0].code}
            />
          ) : null}

          {(insights.definedInHeaders.length > 0 ||
            insights.signatureCount > 0) && (
            <div className="border-t border-line pt-5">
              <p className="mb-3 text-sm font-medium text-ink">
                Active-recall check
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                {insights.definedInHeaders.length > 0 ? (
                  <div className="rounded-2xl border border-line bg-paper p-4 space-y-2.5">
                    <p className="text-sm text-ink-body">
                      Which header declares{" "}
                      <code className="font-mono text-xs">{title}</code>?
                    </p>
                    {revealedHeader ? (
                      <p className="rounded-[var(--radius-chip)] bg-right-wash px-3 py-1.5 font-mono text-xs font-medium text-[color:var(--right)]">
                        #include {insights.definedInHeaders[0]}
                      </p>
                    ) : (
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={() => setRevealedHeader(true)}
                      >
                        Reveal header
                      </Button>
                    )}
                  </div>
                ) : null}

                {insights.signatureCount > 0 ? (
                  <div className="rounded-2xl border border-line bg-paper p-4 space-y-2.5">
                    {!isC ? (
                      <>
                        <p className="text-sm text-ink-body">
                          Is any overload marked{" "}
                          <code className="font-mono text-xs">constexpr</code>{" "}
                          or{" "}
                          <code className="font-mono text-xs">noexcept</code>?
                        </p>
                        {revealedSpecifiers ? (
                          <dl className="flex flex-wrap gap-2">
                            <div className="inline-flex items-center gap-1.5 rounded-[var(--radius-chip)] bg-right-wash px-2.5 py-1 font-mono text-xs font-medium text-[color:var(--right)]">
                              <dt>constexpr:</dt>
                              <dd>{anyConstexpr ? "yes" : "no"}</dd>
                            </div>
                            <div className="inline-flex items-center gap-1.5 rounded-[var(--radius-chip)] bg-right-wash px-2.5 py-1 font-mono text-xs font-medium text-[color:var(--right)]">
                              <dt>noexcept:</dt>
                              <dd>{anyNoexcept ? "yes" : "no"}</dd>
                            </div>
                          </dl>
                        ) : (
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            onClick={() => setRevealedSpecifiers(true)}
                          >
                            Check specifiers
                          </Button>
                        )}
                      </>
                    ) : cRevisions.length > 0 ? (
                      <>
                        <p className="text-sm text-ink-body">
                          Which C standard{" "}
                          {cRevisions.length === 1
                            ? "revision appears"
                            : "revisions appear"}{" "}
                          for{" "}
                          <code className="font-mono text-xs">{title}</code>?
                        </p>
                        {revealedSpecifiers ? (
                          <ul className="flex flex-wrap gap-2">
                            {cRevisions.map((rev) => (
                              <li
                                key={rev}
                                className="rounded-[var(--radius-chip)] bg-right-wash px-2.5 py-1 font-mono text-xs font-medium text-[color:var(--right)]"
                              >
                                {rev}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            onClick={() => setRevealedSpecifiers(true)}
                          >
                            Check revisions
                          </Button>
                        )}
                      </>
                    ) : (
                      <>
                        <p className="text-sm text-ink-body">
                          How many declaration forms are listed for{" "}
                          <code className="font-mono text-xs">{title}</code>?
                        </p>
                        {revealedSpecifiers ? (
                          <p className="rounded-[var(--radius-chip)] bg-right-wash px-3 py-1.5 font-mono text-xs font-medium text-[color:var(--right)]">
                            {insights.signatureCount}{" "}
                            {insights.signatureCount === 1
                              ? "declaration"
                              : "declarations"}
                          </p>
                        ) : (
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            onClick={() => setRevealedSpecifiers(true)}
                          >
                            Reveal count
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>

        <aside
          aria-live="polite"
          className="border-t border-line px-5 py-5 lg:border-t-0 lg:border-l lg:px-6 lg:py-6"
        >
          <p className="mb-2 text-xs text-ink-faint">{selected.branch}</p>
          <h3 className="font-display text-xl leading-snug font-[450] tracking-[-0.01em] text-ink [overflow-wrap:anywhere]">
            {selected.label}
          </h3>
          <p className="mt-2 text-[0.95rem] leading-relaxed text-ink-body">
            {selected.note}
          </p>
          {selected.specs?.length ? (
            <dl className="mt-4 flex flex-wrap gap-2">
              {selected.specs.map((spec) => (
                <div
                  key={spec.label}
                  className="inline-flex items-center gap-1.5 rounded-[var(--radius-chip)] border border-line bg-paper px-2.5 py-1 font-mono text-xs"
                >
                  <dt className="text-ink-soft">{spec.label}:</dt>
                  <dd className="font-medium text-ink">{spec.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {selected.detail ? (
            <p className="mt-4 font-mono text-xs leading-relaxed text-ink-soft">
              {selected.detail}
            </p>
          ) : null}
          <p className="mt-6 text-xs leading-relaxed text-ink-faint">
            Select any branch to inspect its role in the page before diving into
            the full specification.
          </p>
        </aside>
      </Window>
    </div>
  );
}
