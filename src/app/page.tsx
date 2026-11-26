import type { Metadata } from "next";
import Link from "next/link";
import { HomeBuildSection } from "@/components/build/HomeBuildSection";
import { HomeAtlasPlate } from "@/components/HomeAtlasPlate";
import { HeroExpressionInspector } from "@/components/HeroExpressionInspector";
import { HomeDock } from "@/components/HomeDock";
import { HomeTopicShowcase } from "@/components/HomeTopicShowcase";
import { JsonLd } from "@/components/JsonLd";
import { SearchPrompt } from "@/components/SearchPrompt";
import { TopicMarkdown } from "@/components/TopicMarkdown";
import { buttonVariants } from "@/components/ui/button";
import { getAtlasPayload } from "@/lib/atlas-data";
import { getIndexStats } from "@/lib/cppref-index";
import { SITE } from "@/lib/site";
import { getSiteStats, siteDescription } from "@/lib/site-stats";
import { getTopic } from "@/lib/topics";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const REFERENCE_LINKS = [
  { href: "/w/cpp/language", title: "Language" },
  { href: "/w/cpp/container", title: "Containers" },
  { href: "/w/cpp/utility", title: "Utilities" },
  { href: "/w/cpp/memory", title: "Memory" },
  { href: "/w/cpp/algorithm", title: "Algorithms" },
  { href: "/w/cpp/string", title: "Strings" },
  { href: "/w/cpp/ranges", title: "Ranges" },
  { href: "/w/cpp/thread", title: "Concurrency" },
];

/** The topic shown three ways in the showcase. */
const SHOWCASE_SLUG = "value-categories";

const H2 =
  "font-display text-[clamp(2rem,4.5vw,2.75rem)] leading-[1.1] font-[450] tracking-[-0.03em] text-ink text-balance";
const LEAD =
  "mx-auto mt-4 max-w-[54ch] text-[1.0625rem] leading-relaxed text-ink-soft text-pretty";
const QUIET_LINK =
  "text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink";

/** The article up to its second section heading, for the cropped preview. */
function articleOpening(body: string): string {
  const first = body.indexOf("\n## ");
  const second = first < 0 ? -1 : body.indexOf("\n## ", first + 1);
  return second < 0 ? body : body.slice(0, second);
}

export default function HomePage() {
  const cppStats = getIndexStats("cpp");
  const cStats = getIndexStats("c");
  const stats = getSiteStats();
  const { regions, map } = getAtlasPayload();
  const showcase = getTopic(SHOWCASE_SLUG);

  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE.name,
    url: SITE.url,
    description: siteDescription(stats),
    inLanguage: "en",
  };

  return (
    <>
      <JsonLd data={websiteJsonLd} />
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
          <h1 className="settle-line font-display text-[clamp(1.85rem,4.2vw,2.9rem)] leading-[1.08] font-[450] tracking-[-0.028em] text-ink text-balance">
            The C++ reference that explains itself
          </h1>
          <p className="settle-line mx-auto mt-4 max-w-[52ch] text-[1.0625rem] leading-relaxed text-ink/75 text-balance">
            All {stats.referencePages.toLocaleString("en-US")} pages of
            cppreference, with {stats.topics} deep-dive topics,{" "}
            {stats.simulators} interactive debuggers and{" "}
            {stats.traps.toLocaleString("en-US")} quiz questions that cite the
            standard.
          </p>
          <div className="settle-line mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/topics/object-layout-and-alignment?view=debugger"
              className={buttonVariants({ size: "lg" })}
            >
              Try a debugger
            </Link>
            <Link
              href="/topics"
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              Browse topics
            </Link>
          </div>
          <p className="settle-line mt-4 text-sm text-ink-soft">
            New:{" "}
            <Link href="/build" className={QUIET_LINK}>
              build std::vector or a chess engine, stage by stage
            </Link>
          </p>
        </div>

        <div
          aria-hidden
          className="settle-letters font-display relative z-0 mt-6 text-center text-[clamp(8.5rem,33vw,29rem)] leading-[0.78] font-[480] tracking-[-0.055em] text-[var(--hero-glyph)] select-none sm:mt-8"
          style={{ fontVariationSettings: '"SOFT" 30, "WONK" 0, "opsz" 144' }}
        >
          C++
        </div>

        <div className="settle-window relative z-10 mx-auto -mt-[clamp(3.5rem,12vw,13rem)] max-w-5xl px-4 pb-16 sm:px-6 sm:pb-24">
          <HeroExpressionInspector />
        </div>
        <div aria-hidden className="hero-arc z-[1]" />
      </section>

      <section
        aria-labelledby="tracks-heading"
        className="mx-auto max-w-6xl px-4 pt-8 text-center sm:px-6 sm:pt-12"
      >
        <div className="mx-auto max-w-2xl">
          <h2 id="tracks-heading" className={H2}>
            The whole language on one map
          </h2>
          <p className={LEAD}>
            Explore {regions.length} continents, {stats.tracks} countries, and{" "}
            {stats.topics} towns across C++, trace prerequisite routes between
            ideas, or{" "}
            <Link href="/maps" className={QUIET_LINK}>
              open the full-screen world atlas
            </Link>
            .
          </p>
        </div>
        <div className="mt-10 sm:mt-14">
          <HomeAtlasPlate regions={regions} map={map} />
        </div>
        <p className="mt-10 sm:mt-12">
          <Link href="/topics" className={QUIET_LINK}>
            Browse all {stats.topics} topics
          </Link>
        </p>
      </section>

      <section
        aria-labelledby="showcase-heading"
        className="mx-auto mt-32 max-w-6xl px-4 sm:mt-40 sm:px-6"
      >
        <div className="mx-auto max-w-2xl text-center">
          <h2 id="showcase-heading" className={H2}>
            Inside every town: Read it. See it. Trace it.
          </h2>
          <p className={LEAD}>
            Every topic is an article and a concept map, and some add a live
            debugger.
          </p>
        </div>
        {showcase ? (
          <div className="mt-12 sm:mt-16">
            <HomeTopicShowcase
              slug={showcase.slug}
              title={showcase.title}
              article={<TopicMarkdown content={articleOpening(showcase.body)} />}
              mapRoot={showcase.map?.root ?? null}
            />
          </div>
        ) : null}
      </section>

      <HomeBuildSection />

      <section
        aria-labelledby="reference-heading"
        className="mx-auto mt-32 max-w-4xl px-4 text-center sm:mt-40 sm:px-6"
      >
        <h2 id="reference-heading" className={H2}>
          All of cppreference, at the same addresses
        </h2>
        <p className={LEAD}>
          <Link href="/w/cpp" className={QUIET_LINK}>
            {cppStats.pages.toLocaleString("en-US")} C++ pages
          </Link>{" "}
          and{" "}
          <Link href="/w/c" className={QUIET_LINK}>
            {cStats.pages.toLocaleString("en-US")} C pages
          </Link>
          , each at the path you already know.
        </p>
        <SearchPrompt
          label="/w/cpp/container/vector"
          className="mx-auto mt-8 h-14 max-w-lg font-mono text-[0.9375rem] text-ink"
        />
        <ul className="mt-8 flex flex-wrap justify-center gap-2">
          {REFERENCE_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="inline-flex h-9 items-center rounded-full border border-line px-4 text-sm text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
              >
                {link.title}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="start-heading"
        className="mx-auto mt-32 max-w-5xl px-4 sm:mt-40 sm:px-6"
      >
        <div className="rounded-[var(--radius-window)] border border-dashed border-line-strong px-6 py-16 text-center sm:py-24">
          <h2 id="start-heading" className={H2}>
            No account, nothing to install
          </h2>
          <p className={LEAD}>
            Your progress stays in your browser, and every page is also plain
            Markdown.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
            <Link href="/topics" className={buttonVariants({ size: "lg" })}>
              Browse topics
            </Link>
            <Link href="/w/cpp" className={QUIET_LINK}>
              Open the C++ reference
            </Link>
          </div>
        </div>
      </section>
      <HomeDock topics={stats.topics} referencePages={stats.referencePages} />
    </>
  );
}
