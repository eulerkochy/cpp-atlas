import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CircleCheck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

const title = "Grader connected";
const description =
  "The c-atlas-grader GitHub App is installed. Pushes to repositories with a .cppatlas.json are graded and receive a cppatlas check.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/build/connected" },
  robots: { index: false },
};

const H2 = "font-display text-2xl font-[450] tracking-[-0.02em] text-ink";
const CODE = "rounded-[var(--radius-chip)] border border-line bg-paper-sunk px-1.5 py-0.5 font-mono text-[0.85em] break-words";
const PANEL = "rounded-[var(--radius-panel)] border border-line bg-paper-raised p-6 sm:p-7";

/**
 * Landing page GitHub sends people to after installing the grader app. GitHub
 * appends ?installation_id=...&setup_action=install; the page ignores them so
 * it stays static.
 */
export default function ConnectedPage() {
  return (
    <>
      <header className="mx-auto max-w-6xl px-4 pt-28 pb-10 sm:px-6 sm:pt-36">
        <span className="flex size-12 items-center justify-center rounded-full bg-right-wash text-right">
          <CircleCheck className="size-7" aria-hidden />
        </span>
        <h1 className="mt-5 font-display text-[clamp(2.2rem,5.5vw,4rem)] leading-[1.04] font-[450] tracking-[-0.035em] text-ink">
          Grader connected
        </h1>
        <p className="mt-5 max-w-[60ch] text-[1.125rem] leading-relaxed text-ink-soft sm:text-[1.2rem]">
          The c-atlas-grader GitHub App is installed. You do not need to do
          anything else on GitHub.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link href="/build" className={buttonVariants({ size: "lg" })}>
            Browse challenges
            <ArrowRight className="size-4" aria-hidden />
          </Link>
          <Link href="/build/vector" className={buttonVariants({ size: "lg", variant: "outline" })}>
            Vector challenge
          </Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 pb-16 sm:px-6 lg:grid-cols-2">
        <section aria-labelledby="push-heading" className={PANEL}>
          <h2 id="push-heading" className={H2}>
            What happens when you push
          </h2>
          <ul className="mt-4 space-y-3 leading-relaxed text-ink-soft">
            <li>
              The app looks for a <code className={CODE}>.cppatlas.json</code> in
              the repository. Repositories without one are ignored.
            </li>
            <li>
              It reads that file and your solution files at the pushed commit.
            </li>
            <li>It grades stages 1 through your current stage.</li>
            <li>
              It posts a check named{" "}
              <code className={CODE}>cppatlas / &lt;challenge&gt;</code> on the
              commit.
            </li>
          </ul>
        </section>

        <section aria-labelledby="next-heading" className={PANEL}>
          <h2 id="next-heading" className={H2}>
            Next steps
          </h2>
          <ol className="mt-4 space-y-3 leading-relaxed text-ink-soft">
            {[
              <>
                Run <code className={CODE}>./cppatlas submit</code> to grade
                without pushing. It prints the same log and advances{" "}
                <code className={CODE}>.cppatlas.json</code> when a stage passes.
              </>,
              <>
                Commit <code className={CODE}>.cppatlas.json</code> when it
                advances, so the next push is graded on the new stage.
              </>,
              <>Push, then look for the check on your commit.</>,
            ].map((item, i) => (
              <li key={i} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3">
                <span className="font-display text-xl leading-snug font-[450] text-ink-faint tabular-nums">
                  {i + 1}
                </span>
                <span className="min-w-0">{item}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}
