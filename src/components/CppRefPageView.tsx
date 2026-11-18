import Link from "next/link";
import { Fragment } from "react";
import { ChevronDown, ExternalLink, FileText } from "lucide-react";
import { CppCodeBlock } from "@/components/CppCodeBlock";
import { CppRefArticleInteractive } from "@/components/CppRefArticleInteractive";
import { MemoryMapStage } from "@/components/memory-maps/MemoryMapStage";
import { QuizModule } from "@/components/QuizModule";
import { ReferenceViews } from "@/components/ReferenceViews";
import { SectionRail } from "@/components/SectionRail";
import { TrackProgressCount } from "@/components/TrackProgressCount";
import { UniversalPageAtlas } from "@/components/UniversalPageAtlas";
import { getCompanionForPath } from "@/data/companions";
import { JsonLd } from "@/components/JsonLd";
import { REFERENCE_LICENSE, REFERENCE_SNAPSHOT } from "@/lib/cppref-engine";
import { getSiblingPages } from "@/lib/cppref-index";
import { referenceHref } from "@/lib/reference";
import { absoluteUrl, SITE } from "@/lib/site";
import { getSimulatorForCppPath, topicsForCppPath } from "@/lib/topics";
import { cn } from "@/lib/utils";
import type { CppRefPageData } from "@/types/cpp";

function isCodeTitle(title: string): boolean {
  return (
    /::|<|>|\(\)|_t$/.test(title) ||
    /^(?:std|c)::/i.test(title) ||
    title.includes("operator") ||
    /^[a-z_][a-z0-9_]*$/.test(title)
  );
}

function BreakableTitle({ text }: { text: string }) {
  const parts = text.split(/(::|,)/g);
  return (
    <>
      {parts.map((part, i) =>
        part === "::" || part === "," ? (
          <Fragment key={i}>
            {part}
            <wbr />
          </Fragment>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        )
      )}
    </>
  );
}

const CHILDREN_SHOWN = 12;

function readingMinutes(words: number): number {
  return Math.max(1, Math.round(words / 230));
}

export function CppRefPageView({ page }: { page: CppRefPageData }) {
  const basePrefix = referenceHref(page.lang, "");
  const isRoot = page.pagePath === "";
  const href = (p: string) => referenceHref(page.lang, p);
  const companion =
    page.lang === "cpp" && !isRoot
      ? getCompanionForPath(page.pagePath)
      : undefined;
  const mappedSimulator =
    page.lang === "cpp" && !isRoot
      ? getSimulatorForCppPath(page.pagePath)
      : undefined;
  const primarySimulator = mappedSimulator ?? companion?.id;
  // Breadcrumbs and children come straight from the imported page data.
  const parent = page.breadcrumbs.at(-1) ?? null;
  const ancestors = page.breadcrumbs.filter((c) => c.path !== "");
  const children = page.children;
  const siblings = getSiblingPages(page.lang, page.pagePath);
  const studyTopics =
    page.lang === "cpp" && !isRoot ? topicsForCppPath(page.pagePath) : [];
  const fileStem = page.pagePath.split("/").pop() || page.lang;
  const codeTitle = isCodeTitle(page.title);
  const pageUrl = href(page.pagePath);
  const minutes = readingMinutes(page.wordCount);

  const notebookEndpoint = `/api/notebook/${page.lang}${
    isRoot ? "" : pageUrl.slice(basePrefix.length)
  }`;

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      headline: page.title,
      description: page.summary || undefined,
      url: absoluteUrl(pageUrl),
      inLanguage: "en",
      wordCount: page.wordCount,
      isPartOf: { "@type": "WebSite", name: SITE.name, url: SITE.url },
      isBasedOn: {
        "@type": "CreativeWork",
        name: `${page.title} (cppreference.com)`,
        url: page.originalUrl,
      },
      license: REFERENCE_LICENSE.ccBySa,
      dateModified: REFERENCE_SNAPSHOT,
      about: page.cppStandards.map((s) => ({ "@type": "Thing", name: s })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        ...page.breadcrumbs,
        { path: page.pagePath, title: page.title },
      ].map((c, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: c.title,
        item: absoluteUrl(href(c.path)),
      })),
    },
  ];

  const readPanel = (
    <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[12rem_minmax(0,1fr)] xl:grid-cols-[12rem_minmax(0,1fr)_15rem] xl:gap-12">
      <aside className="hidden lg:block">
        {page.headings.length > 0 ? (
          <div className="sticky top-28 max-h-[calc(100vh-8rem)] overflow-y-auto overscroll-contain px-1 pt-1.5 pb-6">
            <SectionRail headings={page.headings} label="On this page" />
          </div>
        ) : null}
      </aside>

      <div className="min-w-0 space-y-12">
        {companion ? (
          <section className="space-y-10">
            <div className="border-t border-line pt-6 space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                {companion.primaryClauses.map((clause) => (
                  <span
                    key={clause}
                    className="rounded-[var(--radius-chip)] border border-line bg-paper-raised px-2 py-0.5 font-mono text-xs text-ink-soft"
                  >
                    {clause}
                  </span>
                ))}
              </div>
              <p className="font-display text-2xl leading-snug font-[450] tracking-[-0.015em] text-ink max-w-[var(--measure)]">
                {companion.mentalModelOneLiner}
              </p>

              <dl className="grid gap-6 border-t border-line pt-5 sm:grid-cols-3 text-sm">
                <div>
                  <dt className="font-medium text-ink">CppCon angle</dt>
                  <dd className="mt-1 leading-relaxed text-ink-soft">
                    {companion.cppconFraming.talkAngle}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-ink">Common audience trap</dt>
                  <dd className="mt-1 leading-relaxed text-ink-soft">
                    {companion.cppconFraming.audienceTrap}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-ink">Stage takeaway</dt>
                  <dd className="mt-1 leading-relaxed text-ink-soft">
                    {companion.cppconFraming.stageTakeaway}
                  </dd>
                </div>
              </dl>
            </div>

            {companion.sections.map((sec) => (
              <section key={sec.id} className="prose-atlas space-y-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2 max-w-[var(--measure)]">
                  <h2 className="!mt-0">{sec.title}</h2>
                  <span className="font-mono text-xs text-ink-faint">
                    {sec.clause}
                  </span>
                </div>
                {sec.prose.map((p, idx) => (
                  <p key={idx} className="max-w-[var(--measure)]">
                    {p}
                  </p>
                ))}
                {sec.codeExample ? (
                  <div className="my-6">
                    <CppCodeBlock
                      caption={sec.codeExample.caption}
                      code={sec.codeExample.code}
                    />
                  </div>
                ) : null}
                <p className="max-w-[var(--measure)] rounded-2xl bg-sun-wash/60 px-4 py-3 text-[0.95rem] leading-relaxed text-ink-body">
                  <strong className="font-semibold text-ink">Key rule: </strong>
                  {sec.keyTakeaway}
                </p>
              </section>
            ))}

            <section className="space-y-4 border-t border-line pt-6 max-w-[var(--measure)]">
              <h2 className="font-display text-2xl font-[450] tracking-[-0.02em] text-ink">
                Across revisions ({companion.standardEra})
              </h2>
              <dl className="space-y-4">
                {companion.standardEvolution.map((diff) => (
                  <div key={diff.standard} className="space-y-2">
                    <dt className="inline-flex rounded-[var(--radius-chip)] bg-paper-sunk px-2 py-0.5 font-mono text-xs font-medium text-ink">
                      {diff.standard}
                    </dt>
                    <dd className="space-y-3">
                      <p className="text-[0.97rem] leading-relaxed text-ink-body">
                        {diff.summary}
                      </p>
                      {(diff.beforeCode || diff.afterCode) && (
                        <div className="grid gap-3">
                          {diff.beforeCode ? (
                            <CppCodeBlock caption="Before" code={diff.beforeCode} />
                          ) : null}
                          {diff.afterCode ? (
                            <CppCodeBlock caption="After" code={diff.afterCode} />
                          ) : null}
                        </div>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>

            <div className="border-t border-line pt-8 max-w-[var(--measure)]">
              <h2 className="font-display text-2xl font-[450] tracking-[-0.02em] text-ink">
                Full 1:1 cppreference specification
              </h2>
              <p className="mt-1.5 text-sm text-ink-soft">
                Original specification mirrored from cppreference.com with
                restyled declaration panels and code windows.
              </p>
            </div>
          </section>
        ) : null}

        <CppRefArticleInteractive
          lang={page.lang}
          // Progress keys predate the "" root path; the root keeps its old "index" key.
          pagePath={page.pagePath || "index"}
          bodyHtml={page.bodyHtml}
        />
      </div>

      <aside className="space-y-10 text-sm lg:col-start-2 xl:col-start-3 xl:row-start-1">
        <div className="space-y-10 xl:sticky xl:top-28 xl:max-h-[calc(100vh-8rem)] xl:overflow-y-auto xl:overscroll-contain xl:px-1.5 xl:pt-1.5 xl:pb-6">
          {studyTopics.length > 0 ? (
            <div className="space-y-2.5 border-b border-line pb-6">
              <p className="font-medium text-ink">
                {studyTopics.length === 1 ? "Study topic" : "Study topics"}
              </p>
              <ul className="space-y-2">
                {studyTopics.map((topic) => (
                  <li key={topic.slug}>
                    <Link
                      href={`/topics/${topic.slug}`}
                      className="group block rounded-xl border border-line bg-paper-raised px-3 py-2 transition-colors hover:border-ink/40"
                    >
                      <div className="font-display text-sm font-[450] text-ink decoration-sun decoration-2 underline-offset-3 group-hover:underline">
                        {topic.title}
                      </div>
                      <div className="mt-0.5 text-xs text-ink-soft">
                        {topic.trackTitle} / {topic.minutes} min
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {(parent || children.length > 0 || siblings.length > 0) && (
            <nav aria-label="In this section" className="space-y-6">
              {parent ? (
                <div>
                  <p className="mb-2 font-medium text-ink">Parent page</p>
                  <Link href={href(parent.path)} className="block font-mono text-xs leading-snug text-ink-soft underline decoration-line-strong underline-offset-3 [overflow-wrap:anywhere] hover:text-ink hover:decoration-ink">
                    {parent.title}
                  </Link>
                </div>
              ) : null}

              {children.length > 0 ? (
                <div>
                  <p className="mb-2 font-medium text-ink">
                    In this section ({children.length.toLocaleString("en-US")})
                  </p>
                  <ul className="space-y-1.5">
                    {children.slice(0, CHILDREN_SHOWN).map((ch) => (
                      <li key={ch.path}>
                        <Link href={href(ch.path)} className="block font-mono text-xs leading-snug text-ink-soft underline decoration-line-strong underline-offset-3 [overflow-wrap:anywhere] hover:text-ink hover:decoration-ink">
                          {ch.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {children.length > CHILDREN_SHOWN ? (
                    <details className="group mt-2">
                      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-ink [&::-webkit-details-marker]:hidden">
                        <ChevronDown
                          className="size-3.5 transition-transform duration-150 group-open:rotate-180"
                          aria-hidden
                        />
                        <span className="group-open:hidden">
                          Show all {children.length.toLocaleString("en-US")}
                        </span>
                        <span className="hidden group-open:inline">
                          Show fewer
                        </span>
                      </summary>
                      <ul className="mt-2 space-y-1.5">
                        {children.slice(CHILDREN_SHOWN).map((ch) => (
                          <li key={ch.path}>
                            <Link href={href(ch.path)} className="block font-mono text-xs leading-snug text-ink-soft underline decoration-line-strong underline-offset-3 [overflow-wrap:anywhere] hover:text-ink hover:decoration-ink">
                              {ch.title}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </div>
              ) : null}

              {siblings.length > 0 ? (
                <div>
                  <p className="mb-2 font-medium text-ink">Nearby pages</p>
                  <ul className="space-y-1.5">
                    {siblings.slice(0, 10).map((sib) => (
                      <li key={sib.path}>
                        <Link href={href(sib.path)} className="block font-mono text-xs leading-snug text-ink-soft underline decoration-line-strong underline-offset-3 [overflow-wrap:anywhere] hover:text-ink hover:decoration-ink">
                          {sib.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {siblings.length > 10 && parent ? (
                    <Link
                      href={href(parent.path)}
                      className="mt-2 inline-block text-xs text-ink-soft underline decoration-line-strong underline-offset-3 hover:text-ink hover:decoration-ink"
                    >
                      All {(siblings.length + 1).toLocaleString("en-US")} pages under {parent.title}
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </nav>
          )}

          <div className="space-y-2 border-t border-line pt-6">
            <p className="font-medium text-ink">Use in NotebookLM</p>
            <p className="leading-relaxed text-ink-soft">
              Paste this page&apos;s URL or download plain Markdown into
              NotebookLM as a source.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <a
                href={`${notebookEndpoint}?download=1`}
                className="inline-flex h-7 items-center gap-1.5 rounded-full bg-paper-raised border border-line-strong px-3 text-xs font-medium text-ink hover:border-ink/40"
              >
                <FileText className="size-3.5" aria-hidden />
                Download .md
              </a>
              <a
                href={notebookEndpoint}
                className="inline-flex h-7 items-center rounded-full px-2.5 text-xs font-medium text-ink-soft hover:bg-ink/5 hover:text-ink"
              >
                Open plain text
              </a>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );

  const pageAtlas = (
    <UniversalPageAtlas
      lang={page.lang}
      title={page.title}
      fileStem={fileStem}
      domain={page.domain}
      insights={page.insights}
      cppStandards={page.cppStandards}
      headings={page.headings}
      childCount={children.length}
    />
  );

  const mapPanel = (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 space-y-4">
      <h2 className="sr-only">Interactive map</h2>
      {primarySimulator ? (
        companion && primarySimulator === companion.id ? (
          <MemoryMapStage kind={primarySimulator} />
        ) : (
          <div className="space-y-8">
            <MemoryMapStage kind={primarySimulator} />
            {pageAtlas}
          </div>
        )
      ) : (
        pageAtlas
      )}
    </div>
  );

  const quizPanel = companion ? (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-2xl font-[450] tracking-[-0.02em] text-ink">
          Standardese traps for this topic
        </h2>
        <Link
          href="/quiz"
          className="text-sm text-ink-soft underline decoration-line-strong underline-offset-4 hover:text-ink hover:decoration-ink"
        >
          Open all quizzes
        </Link>
      </div>
      <QuizModule questions={companion.quizzes} />
    </div>
  ) : undefined;

  return (
    <>
      <JsonLd data={jsonLd} />
      <header className="mx-auto max-w-7xl px-4 pt-28 pb-10 sm:px-6 sm:pt-36">
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-ink-soft">
            <li>
              <Link
                href="/w"
                className="underline decoration-transparent underline-offset-4 hover:text-ink hover:decoration-line-strong"
              >
                Portal
              </Link>
            </li>
            <li aria-hidden className="text-ink-faint">
              /
            </li>
            <li>
              <Link
                href={basePrefix}
                aria-current={isRoot ? "page" : undefined}
                className={cn(
                  "underline decoration-transparent underline-offset-4 hover:text-ink hover:decoration-line-strong",
                  isRoot && "font-medium text-ink"
                )}
              >
                {page.lang === "c" ? "C reference" : "C++ reference"}
              </Link>
            </li>
            {ancestors.map((crumb) => (
              <li key={crumb.path} className="flex min-w-0 items-center gap-x-1.5">
                <span aria-hidden className="text-ink-faint">
                  /
                </span>
                <Link
                  href={href(crumb.path)}
                  className="underline decoration-transparent underline-offset-4 [overflow-wrap:anywhere] hover:text-ink hover:decoration-line-strong"
                >
                  {crumb.title}
                </Link>
              </li>
            ))}
            {!isRoot ? (
              <li className="flex min-w-0 items-center gap-x-1.5">
                <span aria-hidden className="text-ink-faint">
                  /
                </span>
                <span
                  aria-current="page"
                  className="font-mono text-[0.85em] font-medium text-ink [overflow-wrap:anywhere]"
                >
                  {fileStem}
                </span>
              </li>
            ) : null}
          </ol>
        </nav>

        <h1
          className={cn(
            "ref-title mt-4 text-ink text-balance",
            codeTitle
              ? "max-w-[34ch] font-mono text-[clamp(1.55rem,3.6vw,2.6rem)] leading-[1.15] font-medium tracking-[-0.03em]"
              : "max-w-[24ch] font-display text-[clamp(2.2rem,5.5vw,4rem)] leading-[1.04] font-[450] tracking-[-0.035em]"
          )}
        >
          <BreakableTitle text={page.title} />
        </h1>

        {companion ? (
          <p className="mt-5 max-w-[60ch] text-[1.125rem] leading-relaxed text-ink-soft sm:text-[1.2rem]">
            {companion.subtitle}
          </p>
        ) : page.summary ? (
          <p className="mt-5 max-w-[60ch] text-[1.05rem] leading-relaxed text-ink-soft">
            {page.summary}
          </p>
        ) : null}

        <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm text-ink-faint">
          {page.domain ? (
            <Link
              href={`/explore?lang=${page.lang}&domain=${encodeURIComponent(page.domain)}`}
              className="rounded-[var(--radius-chip)] bg-sun-wash px-2.5 py-0.5 text-xs font-medium text-ink hover:brightness-95"
            >
              {page.domain}
            </Link>
          ) : null}

          {page.cppStandards.length > 0 ? (
            <ul
              className="flex flex-wrap gap-1.5"
              aria-label="Standard revisions marked on this page"
            >
              {page.cppStandards.map((s) => (
                <li
                  key={s}
                  className="inline-flex rounded-[var(--radius-chip)] border border-line bg-paper-raised px-2 py-0.5 font-mono text-xs text-ink-soft"
                >
                  {s}
                </li>
              ))}
            </ul>
          ) : null}

          {companion ? (
            <TrackProgressCount
              questionIds={companion.quizzes.map((q) => q.id)}
              className="text-xs"
            />
          ) : null}

          {page.wordCount > 0 ? (
            <span className="text-xs tabular-nums">
              {minutes} min read
            </span>
          ) : null}

          <a
            href={page.originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-ink-soft underline decoration-line-strong underline-offset-4 hover:text-ink hover:decoration-ink"
          >
            View on cppreference
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </div>
      </header>

      <ReferenceViews
        read={readPanel}
        map={mapPanel}
        quiz={quizPanel}
        questionCount={companion?.quizzes.length ?? 0}
      />
    </>
  );
}
