import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { DifficultyBadge } from "@/components/build/DifficultyBadge";
import { getBuildCatalog, getBuildChallenge } from "@/lib/build-challenges";

const H2 =
  "font-display text-[clamp(2rem,4.5vw,2.75rem)] leading-[1.1] font-[450] tracking-[-0.03em] text-ink text-balance";
const QUIET_LINK =
  "text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink";

/** Lines the real `./cppatlas test` prints at stage 6 (see challenges/vector/cppatlas). */
const TERMINAL: { text: string; tone?: "ok" | "bad" | "dim" | "cmd" }[] = [
  { text: "$ ./cppatlas test", tone: "cmd" },
  { text: "stage 1 ✓ empty-vector", tone: "ok" },
  { text: "stage 2 ✓ push-back", tone: "ok" },
  { text: "stage 3 ✓ growth", tone: "ok" },
  { text: "stage 4 ✓ copy-and-move", tone: "ok" },
  { text: "stage 5 ✓ emplace-back", tone: "ok" },
  { text: "stage 6 ✗ exception-safety", tone: "bad" },
  { text: "" },
  { text: "TEST CASE: relocation moves a type whose move" },
  { text: "           constructor is noexcept (0 copies)" },
  { text: "  push_back(T&&) of a noexcept-movable T with reallocation", tone: "dim" },
  { text: "  hint: relocate with std::move_if_noexcept(old[i]):", tone: "dim" },
  { text: "        for a noexcept move it moves.", tone: "dim" },
  { text: "" },
  { text: "next: read https://cppatlas.com/build/vector/exception-safety" },
];

const TONE = {
  ok: "text-emerald-400",
  bad: "text-rose-400",
  dim: "text-white/55",
  cmd: "text-white",
} as const;

/** Home page section that introduces the "build it yourself" challenges. */
export function HomeBuildSection() {
  const vector = getBuildChallenge("vector");
  if (!vector) return null;
  const upcoming = getBuildCatalog().filter((c) => c.status === "coming-soon");

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
          Learn std::vector by writing it
        </h2>
        <p className="mx-auto mt-4 max-w-[56ch] text-[1.0625rem] leading-relaxed text-ink-soft text-pretty">
          {vector.stages.length} staged challenges in {vector.standard}. Code in
          your own editor and run the tests locally or on every git push. They
          count every copy and move, inject exceptions and run under
          sanitizers, then tell you what you got wrong.
        </p>
      </div>

      <div className="mt-12 grid items-start gap-8 sm:mt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <ol className="divide-y divide-line overflow-hidden rounded-[var(--radius-window)] border border-line bg-paper">
          {vector.stages.map((s) => (
            <li key={s.slug}>
              <Link
                href={`/build/vector/${s.slug}`}
                className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-ink/[0.03]"
              >
                <span className="w-5 shrink-0 font-mono text-sm text-ink-faint tabular-nums">
                  {s.number}
                </span>
                <span className="min-w-0 flex-1 truncate text-[0.9375rem] text-ink">
                  {s.title}
                </span>
                <DifficultyBadge difficulty={s.difficulty} />
              </Link>
            </li>
          ))}
        </ol>

        <figure
          aria-label="Example ./cppatlas test output at stage 6"
          className="overflow-hidden rounded-[var(--radius-window)] border border-line bg-[#14161a] shadow-[0_24px_48px_-28px_rgb(0_0_0/0.45)]"
        >
          <div aria-hidden className="flex gap-1.5 border-b border-white/10 px-4 py-3">
            <span className="size-2.5 rounded-full bg-white/15" />
            <span className="size-2.5 rounded-full bg-white/15" />
            <span className="size-2.5 rounded-full bg-white/15" />
          </div>
          <pre className="overflow-x-auto px-5 py-4 font-mono text-[0.8125rem] leading-[1.7] text-white/80">
            {TERMINAL.map((line, i) => (
              <div key={i} className={line.tone ? TONE[line.tone] : undefined}>
                {line.text || " "}
              </div>
            ))}
          </pre>
        </figure>
      </div>

      <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
        <Link href="/build/vector" className={buttonVariants({ size: "lg" })}>
          Start the vector challenge
        </Link>
        <Link href="/build" className={QUIET_LINK}>
          See all challenges
        </Link>
      </div>
      {upcoming.length > 0 ? (
        <p className="mt-5 text-center text-sm text-ink-faint">
          Coming next: {upcoming.map((c) => c.title.replace(/^Build your own /, "")).join(", ")}.
        </p>
      ) : null}
    </section>
  );
}
