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
import { getRelatedPagesForLangPath } from "@/lib/cppref-index";
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

export function CppRefPageView({ page }: { page: CppRefPageData }) {
  const basePrefix = `/w/${page.lang}`;
  const companion =
    page.lang === "cpp" && page.pagePath !== "index"
      ? getCompanionForPath(page.pagePath)
      : undefined;
  const mappedSimulator =
    page.lang === "cpp" && page.pagePath !== "index"
      ? getSimulatorForCppPath(page.pagePath)
      : undefined;
  const primarySimulator = mappedSimulator ?? companion?.id;
  const related = getRelatedPagesForLangPath(page.lang, page.pagePath);
  const studyTopics =
    page.lang === "cpp" && page.pagePath !== "index"
      ? topicsForCppPath(page.pagePath)
      : [];
  const segments =
    page.pagePath === "index" ? [] : page.pagePath.split("/").filter(Boolean);
  const fileStem = segments[segments.length - 1] ?? page.lang;
  const codeTitle = isCodeTitle(page.title);

  const notebookEndpoint =
    page.lang === "c"
      ? `/api/notebook/c/${page.pagePath === "index" ? "index" : page.pagePath}`
      : page.pagePath === "index"
        ? "/api/notebook/index"
        : `/api/notebook/${page.pagePath}`;

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
          pagePath={page.pagePath}
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

          {(related.parent ||
            related.children.length > 0 ||
            related.siblings.length > 0) && (
            <nav aria-label="In this section" className="space-y-6">
              {related.parent ? (
                <div>
                  <p className="mb-2 font-medium text-ink">Parent page</p>
                  <Link
                    href={`${basePrefix}/${related.parent.path}`}
                    className="block font-mono text-xs leading-snug text-ink-soft underline decoration-line-strong underline-offset-3 [overflow-wrap:anywhere] hover:text-ink hover:decoration-ink"
                  >
                    {related.parent.name}
                  </Link>
                </div>
              ) : null}

              {related.children.length > 0 ? (
                <div>
                  <p className="mb-2 font-medium text-ink">
                    In this section (
                    {related.totalChildren > related.children.length
                      ? `${related.children.length} of ${related.totalChildren.toLocaleString("en-US")}`
                      : related.totalChildren.toLocaleString("en-US")}
                    )
                  </p>
                  <ul className="space-y-1.5">
                    {related.children.slice(0, 12).map((ch) => (
                      <li key={ch.path + ch.name}>
                        <Link
                          href={`${basePrefix}/${ch.path}`}
                          className="block font-mono text-xs leading-snug text-ink-soft underline decoration-line-strong underline-offset-3 [overflow-wrap:anywhere] hover:text-ink hover:decoration-ink"
                        >
                          {ch.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {related.children.length > 12 ? (
                    <details className="group mt-2">
                      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-ink [&::-webkit-details-marker]:hidden">
                        <ChevronDown
                          className="size-3.5 transition-transform duration-150 group-open:rotate-180"
                          aria-hidden
                        />
                        <span className="group-open:hidden">
                          {related.totalChildren > related.children.length
                            ? `Show ${related.children.length} listed`
                            : `Show all ${related.children.length}`}
                        </span>
                        <span className="hidden group-open:inline">
                          Show fewer
                        </span>
                      </summary>
                      <ul className="mt-2 space-y-1.5">
                        {related.children.slice(12).map((ch) => (
                          <li key={ch.path + ch.name}>
                            <Link
                              href={`${basePrefix}/${ch.path}`}
                              className="block font-mono text-xs leading-snug text-ink-soft underline decoration-line-strong underline-offset-3 [overflow-wrap:anywhere] hover:text-ink hover:decoration-ink"
                            >
                              {ch.name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                  {related.totalChildren > related.children.length ? (
                    <Link
                      href={
                        page.domain
                          ? `/explore?lang=${page.lang}&domain=${encodeURIComponent(page.domain)}`
                          : `/explore?lang=${page.lang}`
                      }
                      className="mt-2 inline-block text-xs text-ink-soft underline decoration-line-strong underline-offset-3 hover:text-ink hover:decoration-ink"
                    >
                      Browse all in directory
                    </Link>
                  ) : null}
                </div>
              ) : null}

              {related.siblings.length > 0 ? (
                <div>
                  <p className="mb-2 font-medium text-ink">Nearby topics</p>
                  <ul className="space-y-1.5">
                    {related.siblings.slice(0, 10).map((sib) => (
                      <li key={sib.path + sib.name}>
                        <Link
                          href={`${basePrefix}/${sib.path}`}
                          className="block font-mono text-xs leading-snug text-ink-soft underline decoration-line-strong underline-offset-3 [overflow-wrap:anywhere] hover:text-ink hover:decoration-ink"
                        >
                          {sib.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
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
      childCount={related.totalChildren}
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
                aria-current={segments.length === 0 ? "page" : undefined}
                className={cn(
                  "underline decoration-transparent underline-offset-4 hover:text-ink hover:decoration-line-strong",
                  segments.length === 0 && "font-medium text-ink"
                )}
              >
                {page.lang === "c" ? "C reference" : "C++ reference"}
              </Link>
            </li>
            {segments.map((seg, i) => {
              const pathUpTo = segments.slice(0, i + 1).join("/");
              const isCurrent = i === segments.length - 1;
              return (
                <li
                  key={pathUpTo}
                  className="flex min-w-0 items-center gap-x-1.5"
                >
                  <span aria-hidden className="text-ink-faint">
                    /
                  </span>
                  <Link
                    href={`${basePrefix}/${pathUpTo}`}
                    aria-current={isCurrent ? "page" : undefined}
                    className={cn(
                      "font-mono text-[0.85em] underline decoration-transparent underline-offset-4 hover:text-ink hover:decoration-line-strong",
                      isCurrent && "font-medium text-ink"
                    )}
                  >
                    {seg}
                  </Link>
                </li>
              );
            })}
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
        ) : (
          <p className="mt-5 max-w-[60ch] text-[1.05rem] leading-relaxed text-ink-soft">
            1:1 specification page for{" "}
            <span className="font-mono text-[0.9em] text-ink">
              en.cppreference.com{basePrefix}
              {page.pagePath === "index" ? "" : `/${page.pagePath}`}
            </span>
            .
          </p>
        )}

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
              aria-label="Standard revisions mentioned on this page"
            >
              {page.cppStandards.slice(0, 6).map((s) => (
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
