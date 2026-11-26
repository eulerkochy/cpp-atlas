"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Check, ChevronDown, ChevronUp, Copy, ExternalLink, Terminal } from "lucide-react";
import { CourseRailShell, type RailChallengeInfo } from "@/components/build/CourseRailShell";
import { useBuildDone } from "@/components/build/StageDone";
import type { BuildTopicRef } from "@/lib/build-challenges";

export function ChallengeOverviewRail({
  challenge,
  prerequisites,
  children,
}: {
  challenge: RailChallengeInfo;
  prerequisites: BuildTopicRef[];
  children: ReactNode;
}) {
  const { done, hydrated } = useBuildDone();
  const [copied, setCopied] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(false);

  const nextStage =
    (hydrated
      ? challenge.stages.find((s) => !done.has(`${challenge.slug}/${s.slug}`))
      : undefined) ?? challenge.stages[0];

  const completedCount = hydrated
    ? challenge.stages.filter((s) => done.has(`${challenge.slug}/${s.slug}`)).length
    : 0;

  const submitCmd = "./cppatlas submit";

  function copySubmit() {
    try {
      void navigator.clipboard.writeText(submitCmd);
    } catch {
      // ignore clipboard errors
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  const rightRail = (
    <div className="space-y-6">
      <div className="space-y-2.5">
        {nextStage ? (
          <Link
            href={`/build/${challenge.slug}/${nextStage.slug}`}
            className="flex h-11 w-full items-center justify-between rounded-xl bg-ink px-4 text-sm font-medium text-paper transition-opacity hover:opacity-90"
          >
            <span>
              {completedCount > 0 ? `Continue stage ${nextStage.number}` : `Start stage ${nextStage.number}`}
            </span>
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        ) : null}

        <a
          href={challenge.repoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-line-strong bg-paper-raised px-4 text-sm font-medium text-ink transition-colors hover:border-ink"
        >
          <span>Use the template</span>
          <ExternalLink className="size-3.5" aria-hidden />
        </a>

        <p className="text-xs leading-relaxed text-ink-soft">
          Clone your repository copy and run <code className="font-mono text-[0.92em] text-ink">./cppatlas submit</code>{" "}
          to grade against the remote {challenge.standard} suite.
        </p>
      </div>

      <dl className="space-y-2.5 border-t border-line pt-5 text-xs">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-ink-soft">Standard</dt>
          <dd className="font-mono font-medium text-ink">{challenge.standard}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-ink-soft">Stages</dt>
          <dd className="font-medium text-ink tabular-nums">{challenge.stages.length}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-ink-soft">Workflow</dt>
          <dd className="font-medium text-ink">
            {challenge.hasBrowserGrader ? "Template repo + browser" : "Template repo CLI"}
          </dd>
        </div>
      </dl>

      {prerequisites.length > 0 ? (
        <div className="space-y-2.5 border-t border-line pt-5">
          <h2 className="text-xs font-semibold text-ink">Read first</h2>
          <ul className="space-y-1.5">
            {prerequisites.map((t) => (
              <li key={t.slug}>
                <Link
                  href={`/topics/${t.slug}`}
                  className="text-xs text-ink-soft underline decoration-line-strong underline-offset-3 hover:text-ink hover:decoration-ink"
                >
                  {t.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );

  const bottomDock = (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#131b2b] text-[#e4ecf9] dark:bg-[#050914]">
      {consoleOpen ? (
        <div className="border-b border-white/10 bg-[#0d1422] px-4 py-3 font-mono text-xs sm:px-6">
          <div className="mx-auto max-w-6xl space-y-1.5 text-white/80">
            <div>
              <span className="text-white/45">1.</span> Create your copy from{" "}
              <a
                href={challenge.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#ffc93a] underline"
              >
                {challenge.repoUrl}
              </a>
            </div>
            <div>
              <span className="text-white/45">2.</span> Clone locally and run{" "}
              <code className="text-white">./cppatlas submit</code> (or{" "}
              <code className="text-white">./cppatlas test</code> with CMake + GCC/Clang)
            </div>
          </div>
        </div>
      ) : null}
      <div className="flex h-10 items-center justify-between gap-3 px-4 font-mono text-xs sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex shrink-0 items-center gap-1.5 font-semibold text-white">
            <Terminal className="size-3.5 text-[#ffc93a]" aria-hidden />
            <span>$ {submitCmd}</span>
          </span>
          <span className="hidden truncate text-white/65 sm:inline">
            {challenge.title} · {challenge.stages.length} stages
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={copySubmit}
            className="hidden cursor-pointer items-center gap-1 rounded border border-white/15 px-2 py-0.5 text-[11px] text-white/80 hover:bg-white/10 sm:inline-flex"
          >
            {copied ? <Check className="size-3" aria-hidden /> : <Copy className="size-3" aria-hidden />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
          <button
            type="button"
            onClick={() => setConsoleOpen((o) => !o)}
            className="inline-flex cursor-pointer items-center gap-1 rounded border border-white/20 bg-white/10 px-2.5 py-0.5 text-[11px] font-medium text-white hover:bg-white/15"
          >
            <span>{consoleOpen ? "Close console" : "Open console"}</span>
            {consoleOpen ? <ChevronDown className="size-3" aria-hidden /> : <ChevronUp className="size-3" aria-hidden />}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <CourseRailShell
      challenge={challenge}
      activeStageSlug={null}
      activeLabel={challenge.title}
      wideCenter={challenge.slug === "chess"}
      rightRail={rightRail}
      bottomDock={bottomDock}
    >
      {children}
    </CourseRailShell>
  );
}
