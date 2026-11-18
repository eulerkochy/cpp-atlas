import Link from "next/link";
import { HeroExpressionInspector } from "@/components/HeroExpressionInspector";
import { SearchPrompt } from "@/components/SearchPrompt";
import { TrackList } from "@/components/TrackList";
import { ALL_QUIZZES } from "@/data/companions";
import {
  countUniquePagesUnderPrefix,
  C_INDEX_STATS,
  INDEX_STATS,
} from "@/lib/cppref-index";
import { getAllTopics, getTracks } from "@/lib/topics";

const HOME_SECTIONS = [
  { lang: "cpp" as const, path: "language", title: "Language" },
  { lang: "cpp" as const, path: "container", title: "Containers" },
  { lang: "cpp" as const, path: "utility", title: "Utilities" },
  { lang: "cpp" as const, path: "memory", title: "Memory" },
  { lang: "cpp" as const, path: "algorithm", title: "Algorithms" },
  { lang: "cpp" as const, path: "string", title: "Strings" },
  { lang: "cpp" as const, path: "ranges", title: "Ranges" },
  { lang: "cpp" as const, path: "thread", title: "Concurrency" },
];

export default function HomePage() {
  const tracks = getTracks();
  const activeTracks = tracks.filter((t) => t.topics.length > 0);
  const allTopics = getAllTopics();
  const topicQuizCount = allTopics.reduce(
    (sum, t) => sum + t.questions.length,
    0
  );
  const totalQuizCount = ALL_QUIZZES.length + topicQuizCount;

  return (
    <>
      <section className="sunlight relative isolate overflow-hidden pt-28 sm:pt-36">
        <div
          aria-hidden
          className="dapple top-[-8rem] left-[-6rem] h-[28rem] w-[34rem]"
        />
        <div
          aria-hidden
          className="dapple top-[6rem] right-[-10rem] h-[22rem] w-[30rem] opacity-25"
        />
        <div
          aria-hidden
          className="dapple top-[22rem] left-[30%] h-[16rem] w-[26rem] opacity-20"
        />

        <div className="relative z-10 mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h1 className="settle-line font-display text-[clamp(1.75rem,4vw,2.75rem)] leading-[1.1] font-[450] tracking-[-0.025em] text-ink text-balance">
            C++ from the inside out: the standard, mapped and tested
          </h1>
          <p className="settle-line mx-auto mt-4 max-w-[48ch] text-[1.0625rem] leading-relaxed text-ink/70">
            Deep dives into value semantics, object lifetime and the memory
            model. Each study topic pairs a mental model, an interactive map and{" "}
            {totalQuizCount} standard-lawyer quizzes.
          </p>
        </div>

        <div
          aria-hidden
          className="settle-letters font-display relative z-0 mt-6 text-center text-[clamp(8.5rem,33vw,29rem)] leading-[0.78] font-[480] tracking-[-0.055em] text-white/90 select-none sm:mt-8"
          style={{ fontVariationSettings: '"SOFT" 30, "WONK" 0, "opsz" 144' }}
        >
          C++
        </div>

        <div className="settle-window relative z-10 mx-auto -mt-[clamp(1.75rem,11vw,10rem)] max-w-5xl px-4 pb-20 sm:px-6 sm:pb-28">
          <HeroExpressionInspector />
        </div>
        <div aria-hidden className="hero-arc z-[1]" />
      </section>

      <section
        aria-labelledby="topics-heading"
        className="mx-auto max-w-6xl px-4 pt-16 sm:px-6 sm:pt-24"
      >
        <div className="mb-14 max-w-2xl">
          <h2
            id="topics-heading"
            className="font-display text-[clamp(2.2rem,5vw,3.25rem)] leading-[1.05] font-[450] tracking-[-0.03em] text-ink"
          >
            Topics
          </h2>
          <p className="mt-4 text-[1.0625rem] leading-relaxed text-ink-soft">
            {allTopics.length > 0
              ? `${allTopics.length} study topics across ${activeTracks.length} tracks linking directly into their 1:1 `
              : "Interactive study tracks layered directly over their 1:1 "}
            <code className="font-mono text-[0.9em] text-ink">/w/cpp/...</code>{" "}
            pages. Quiz results are saved in this browser so you can track
            CppCon talk prep as you go.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-6 text-sm">
            <Link
              href="/topics"
              className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
            >
              All topics
            </Link>
            <Link
              href="/maps"
              className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
            >
              Concept maps
            </Link>
            <Link
              href="/standards"
              className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
            >
              C++11–C++26 timeline
            </Link>
            <Link
              href="/study"
              className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
            >
              Study desk
            </Link>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- route handler, not a page */}
            <a
              href="/api/notebook/topics-all"
              className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
            >
              Everything as markdown
            </a>
          </div>
        </div>

        <TrackList headingLevel={3} tracks={tracks} />
      </section>

      <section
        aria-labelledby="reference-heading"
        className="mx-auto mt-32 max-w-6xl px-4 sm:px-6"
      >
        <div className="grid gap-12 border-t border-line pt-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-16">
          <div>
            <h2
              id="reference-heading"
              className="font-display text-[clamp(2.2rem,5vw,3.25rem)] leading-[1.05] font-[450] tracking-[-0.03em] text-ink"
            >
              The whole reference, restyled
            </h2>
            <p className="mt-4 max-w-[50ch] text-[1.0625rem] leading-relaxed text-ink-soft">
              When a study track is not enough, all{" "}
              {INDEX_STATS.uniquePages.toLocaleString("en-US")} C++ pages and{" "}
              {C_INDEX_STATS.uniquePages.toLocaleString("en-US")} C pages of
              cppreference.com are mapped 1:1 at their exact addresses:{" "}
              <code className="font-mono text-[0.9em] text-ink">
                /w/cpp/container/vector
              </code>{" "}
              for <code className="font-mono text-[0.9em] text-ink">std::vector</code>{" "}
              or{" "}
              <code className="font-mono text-[0.9em] text-ink">
                /w/c/memory/malloc
              </code>{" "}
              across the C boundary.
            </p>
            <SearchPrompt
              label="Search the reference: shared_ptr, value category, malloc…"
              className="mt-8"
            />
          </div>

          <div>
            <ul className="grid border-t border-line sm:grid-cols-2 sm:gap-x-10">
              {HOME_SECTIONS.map((sec) => (
                <li key={sec.path} className="border-b border-line">
                  <Link
                    href={`/w/cpp/${sec.path}`}
                    className="group flex items-baseline justify-between gap-4 py-4"
                  >
                    <span className="font-display text-xl font-[450] tracking-[-0.015em] text-ink decoration-sun decoration-2 underline-offset-[5px] group-hover:underline">
                      {sec.title}
                    </span>
                    <span className="text-sm text-ink-faint tabular-nums">
                      {countUniquePagesUnderPrefix(sec.lang, sec.path).toLocaleString("en-US")}{" "}
                      pages
                    </span>
                  </Link>
                </li>
              ))}
            </ul>

            <div className="mt-6 flex flex-wrap gap-6 text-sm">
              <Link
                href="/w/cpp"
                className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
              >
                C++ reference (/w/cpp)
              </Link>
              <Link
                href="/w"
                className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
              >
                Unified C++ &amp; C portal (/w)
              </Link>
              <Link
                href="/explore"
                className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
              >
                Browse all {INDEX_STATS.domainCount + C_INDEX_STATS.domainCount}{" "}
                domains
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="views-heading"
        className="mx-auto mt-32 max-w-6xl px-4 sm:px-6"
      >
        <h2
          id="views-heading"
          className="max-w-2xl font-display text-[clamp(2rem,4.5vw,2.75rem)] leading-[1.1] font-[450] tracking-[-0.03em] text-ink"
        >
          Three ways through every page
        </h2>
        <dl className="mt-12 grid gap-x-12 gap-y-10 border-t border-line pt-10 md:grid-cols-3">
          <div>
            <dt className="font-display text-2xl font-[450] tracking-[-0.02em] text-ink">
              Read
            </dt>
            <dd className="mt-3 leading-relaxed text-ink-soft">
              Study prose followed by the full 1:1 specification in one reading
              flow, with a scroll-spy outline on the left, clean window-framed
              code blocks, and Focus mode to dim pre-C++14 deprecations and
              defect reports.
            </dd>
          </div>
          <div>
            <dt className="font-display text-2xl font-[450] tracking-[-0.02em] text-ink">
              Map
            </dt>
            <dd className="mt-3 leading-relaxed text-ink-soft">
              Every flagship topic renders an interactive simulator or
              taxonomy; every other page synthesizes a clickable structural map
              of headers, signatures, and sections.
            </dd>
          </div>
          <div>
            <dt className="font-display text-2xl font-[450] tracking-[-0.02em] text-ink">
              Quiz
            </dt>
            <dd className="mt-3 leading-relaxed text-ink-soft">
              Questions built around the tempting wrong answer. Every verdict
              explains the machine model and cites the ISO C++ clause that
              settles it.
            </dd>
          </div>
        </dl>
      </section>

      <section
        aria-labelledby="notebook-heading"
        className="mx-auto mt-20 max-w-6xl px-4 sm:px-6"
      >
        <div className="grid gap-6 border-t border-line pt-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] md:gap-12">
          <h2
            id="notebook-heading"
            className="font-display text-2xl font-[450] tracking-[-0.02em] text-ink"
          >
            Take it into NotebookLM
          </h2>
          <div className="max-w-[60ch] space-y-3 leading-relaxed text-ink-soft">
            <p>
              Every reference page is also a clean plain Markdown source with
              its study notes, interactive map summary, and Socratic quiz traps.
              Paste a{" "}
              <code className="font-mono text-[0.9em] text-ink">/w/cpp/...</code>{" "}
              URL into NotebookLM, download{" "}
              <code className="font-mono text-[0.9em] text-ink">.md</code> from
              the rail, or bundle topics in the{" "}
              <Link
                href="/notebook"
                className="text-ink underline decoration-line-strong underline-offset-3 hover:decoration-ink"
              >
                NotebookLM studio
              </Link>
              .
            </p>
            <p>
              API routes start at{" "}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- route handler, not a page */}
              <a
                className="font-mono text-[0.9em] text-ink underline decoration-line-strong underline-offset-3 hover:decoration-ink"
                href="/api/notebook/topics-all"
              >
                /api/notebook/topics-all
              </a>{" "}
              and{" "}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- route handler, not a page */}
              <a
                className="font-mono text-[0.9em] text-ink underline decoration-line-strong underline-offset-3 hover:decoration-ink"
                href="/api/notebook/language/value_category"
              >
                /api/notebook/language/value_category
              </a>
              , and machine indexes live at{" "}
              <a
                className="font-mono text-[0.9em] text-ink underline decoration-line-strong underline-offset-3 hover:decoration-ink"
                href="/llms.txt"
              >
                /llms.txt
              </a>
              .
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
