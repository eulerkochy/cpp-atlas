import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { DifficultyBadge } from "@/components/build/DifficultyBadge";
import {
  getBuildCatalog,
  getBuildChallenge,
  type BuildChallenge,
} from "@/lib/build-challenges";

const H2 =
  "font-display text-[clamp(2rem,4.5vw,2.75rem)] leading-[1.1] font-[450] tracking-[-0.03em] text-ink text-balance";
const QUIET_LINK =
  "inline-flex min-h-10 items-center rounded-[var(--radius-chip)] text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

/** Lines the real `./cppatlas submit` prints for a passing stage 1. */
const TERMINAL: { text: string; tone?: "ok" | "dim" | "cmd" }[] = [
  { text: "$ ./cppatlas submit", tone: "cmd" },
  { text: "[tester::#1] Running tests for Stage #1", tone: "dim" },
  { text: "[tester::#1] ✓ all stage 1 checks passed" },
  { text: "[tester::#1] 9 of 9 test cases passed (17 ms)" },
  { text: "[tester::#1] Test passed." },
  { text: "" },
  { text: "stage 1 passed ✓ — advanced to stage 2.", tone: "ok" },
];

const TONE = {
  ok: "text-emerald-400",
  dim: "text-white/55",
  cmd: "text-white",
} as const;

function TerminalPreview({ className }: { className?: string }) {
  return (
    <figure
      aria-label="Example ./cppatlas submit output for a passing stage 1"
      className={`overflow-hidden rounded-[var(--radius-window)] border border-line bg-[#14161a] shadow-[0_24px_48px_-28px_rgb(0_0_0/0.45)] ${className ?? ""}`}
    >
      <div aria-hidden className="flex gap-1.5 border-b border-white/10 px-4 py-3">
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="size-2.5 rounded-full bg-white/15" />
      </div>
      <pre
        tabIndex={0}
        className="overflow-x-auto px-5 py-4 font-mono text-[0.8125rem] leading-[1.7] text-white/80 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white/60"
      >
        {TERMINAL.map((line, i) => (
          <div key={i} className={line.tone ? TONE[line.tone] : undefined}>
            {line.text || "\u00a0"}
          </div>
        ))}
      </pre>
    </figure>
  );
}

function ChallengeStageCard({ challenge }: { challenge: BuildChallenge }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-[var(--radius-window)] border border-line bg-paper">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-lg font-[450] tracking-[-0.015em] text-ink">
              <Link
                href={`/build/${challenge.slug}`}
                className="decoration-sun decoration-2 underline-offset-4 hover:underline"
              >
                {challenge.title}
              </Link>
            </h3>
            <span className="rounded-[var(--radius-chip)] border border-line bg-paper-sunk px-2 py-0.5 font-mono text-[11px] text-ink-soft">
              {challenge.standard}
            </span>
          </div>
          <p className="text-xs leading-relaxed text-ink-soft">
            {challenge.tagline}
          </p>
        </div>
      </div>

      <ol className="divide-y divide-line">
        {challenge.stages.map((s) => (
          <li key={s.slug}>
            <Link
              href={`/build/${challenge.slug}/${s.slug}`}
              className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-ink/[0.03] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink"
            >
              <span className="w-5 shrink-0 font-mono text-xs text-ink-faint tabular-nums">
                {s.number}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-ink">
                {s.title}
              </span>
              <DifficultyBadge difficulty={s.difficulty} />
            </Link>
          </li>
        ))}
      </ol>

      <div className="mt-auto border-t border-line bg-paper-sunk/40 px-5 py-3">
        <Link
          href={`/build/${challenge.slug}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink decoration-sun decoration-2 underline-offset-4 hover:underline"
        >
          Start {challenge.slug}
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    </div>
  );
}

/** Home page section that introduces the "build it yourself" challenges. */
export function HomeBuildSection() {
  const catalog = getBuildCatalog();
  const liveChallenges = catalog
    .filter((c) => c.status === "live")
    .map((c) => getBuildChallenge(c.slug))
    .filter((c): c is BuildChallenge => c !== null);

  if (liveChallenges.length === 0) return null;
  const upcoming = catalog.filter((c) => c.status === "coming-soon");
  const single = liveChallenges.length === 1 ? liveChallenges[0] : null;

  return (
    <section
      aria-labelledby="build-heading"
      className="mx-auto mt-32 max-w-6xl px-4 sm:mt-40 sm:px-6"
    >
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-medium tracking-[0.14em] text-ink-faint uppercase">
          New · Build it yourself
        </p>
        <h2 id="build-heading" className={`${H2} mt-3`}>
          {single
            ? `Learn ${single.slug === "vector" ? "std::vector" : single.title.replace(/^Build your own /, "")} by writing it`
            : "Build real C++ systems from scratch"}
        </h2>
        <p className="mx-auto mt-4 max-w-[56ch] text-[1.0625rem] leading-relaxed text-ink-soft text-pretty">
          {single
            ? `${single.stages.length} staged challenges in ${single.standard}. `
            : `${liveChallenges.map((c) => c.title.replace(/^Build your own /, "")).join(" and ")} — staged challenges in C++23. `}
          Code in your own editor, grade with one command or on every git push,
          and skip the local compiler. The test suite runs under sanitizers and
          tells you exactly what failed.
        </p>
      </div>

      {single ? (
        <div className="mt-12 grid items-start gap-8 sm:mt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <ChallengeStageCard challenge={single} />
          <TerminalPreview />
        </div>
      ) : (
        <div className="mt-12 space-y-8 sm:mt-16">
          <div className="grid gap-6 lg:grid-cols-2">
            {liveChallenges.map((challenge) => (
              <ChallengeStageCard key={challenge.slug} challenge={challenge} />
            ))}
          </div>
          <TerminalPreview className="mx-auto max-w-3xl" />
        </div>
      )}

      <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
        <Link href="/build" className={buttonVariants({ size: "lg" })}>
          Explore all challenges
        </Link>
        {liveChallenges.map((c) => (
          <Link key={c.slug} href={`/build/${c.slug}`} className={QUIET_LINK}>
            Start {c.slug}
          </Link>
        ))}
      </div>
      {upcoming.length > 0 ? (
        <p className="mt-5 text-center text-sm text-ink-faint">
          Coming next:{" "}
          {upcoming.map((c) => c.title.replace(/^Build your own /, "")).join(", ")}.
        </p>
      ) : null}
    </section>
  );
}
