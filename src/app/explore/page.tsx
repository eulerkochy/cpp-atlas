import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  ExploreDomainClient,
  ExploreEntryItem,
} from "@/components/ExploreDomainClient";
import { PageHeader } from "@/components/PageHeader";
import { getCompanionForPath } from "@/data/companions";
import {
  getDomainsForLang,
  getEntriesForLangDomain,
  getIndexStats,
} from "@/lib/cppref-index";
import { buildOgImageUrl, SITE } from "@/lib/site";
import { cn } from "@/lib/utils";
import type { ReferenceLang } from "@/types/cpp";

export function generateMetadata(): Metadata {
  const all = getIndexStats("all");
  const title = "C++ & C Reference Directory";
  const description = `Browse all ${all.pages.toLocaleString("en-US")} offline C++ and C reference pages across ${all.domainCount} domains, mapped 1:1 to en.cppreference.com.`;
  const ogImage = buildOgImageUrl({
    title: `${all.pages.toLocaleString("en-US")} C++ & C Reference Pages`,
    kicker: `${all.domainCount} Domains`,
    meta: "Offline 1:1 /w/cpp & /w/c directory",
    sub: "Complete reference index",
  });
  return {
    title,
    description,
    alternates: { canonical: "/explore" },
    openGraph: {
      title,
      description,
      url: "/explore",
      siteName: SITE.name,
      images: [{ url: ogImage, width: 1200, height: 630, alt: `${title} — ${SITE.name}` }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

async function DirectoryContent({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string; domain?: string }>;
}) {
  const { lang: rawLang, domain } = await searchParams;
  const lang: ReferenceLang = rawLang === "c" ? "c" : "cpp";
  const domains = getDomainsForLang(lang);
  const stats = getIndexStats(lang);
  const cppStats = getIndexStats("cpp");
  const cStats = getIndexStats("c");

  const activeDomain =
    domain && domains.some((d) => d.name === domain)
      ? domain
      : domains[0]?.name ?? "Language";

  const rawEntries = getEntriesForLangDomain(lang, activeDomain);

  const enrichedEntries: ExploreEntryItem[] = rawEntries.map((entry) => ({
    ...entry,
    hasCompanion:
      lang === "cpp" && Boolean(getCompanionForPath(entry.path.split("#")[0])),
  }));

  return (
    <div className="space-y-10">
      <div className="space-y-5 border-t border-line pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex w-fit items-center gap-0.5 rounded-full border border-line bg-paper-raised p-1 shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
            <Link
              href="/explore?lang=cpp"
              className={cn(
                "inline-flex h-8 items-center rounded-full px-4 text-sm font-medium transition-colors",
                lang === "cpp"
                  ? "bg-sun text-ink"
                  : "text-ink-soft hover:text-ink"
              )}
            >
              C++ Reference ({cppStats.pages.toLocaleString("en-US")})
            </Link>
            <Link
              href="/explore?lang=c"
              className={cn(
                "inline-flex h-8 items-center rounded-full px-4 text-sm font-medium transition-colors",
                lang === "c" ? "bg-sun text-ink" : "text-ink-soft hover:text-ink"
              )}
            >
              C Reference ({cStats.pages.toLocaleString("en-US")})
            </Link>
          </div>
          <span className="text-sm text-ink-faint tabular-nums">
            {stats.domainCount} domains /{" "}
            {stats.pages.toLocaleString("en-US")} pages
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {domains.map((d) => {
            const isActive = d.name === activeDomain;
            return (
              <Link
                key={d.slug}
                href={`/explore?lang=${lang}&domain=${encodeURIComponent(d.name)}`}
                className={cn(
                  "inline-flex h-7 items-center rounded-full border px-3 text-xs transition-colors",
                  isActive
                    ? "border-ink bg-sun-wash font-medium text-ink"
                    : "border-line bg-paper-raised text-ink-soft hover:border-line-strong hover:text-ink"
                )}
              >
                {d.name} ({d.count})
              </Link>
            );
          })}
        </div>
      </div>

      <ExploreDomainClient
        lang={lang}
        domainName={activeDomain}
        entries={enrichedEntries}
      />
    </div>
  );
}

export default function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string; domain?: string }>;
}) {
  const all = getIndexStats("all");
  return (
    <>
      <PageHeader title="Full reference directory">
        All {all.pages.toLocaleString("en-US")} pages across{" "}
        {all.domainCount} domains of{" "}
        <span className="font-mono text-[0.9em] text-ink">
          en.cppreference.com
        </span>
        , mapped 1:1 to{" "}
        <span className="font-mono text-[0.9em] text-ink">/w/cpp/...</span> and{" "}
        <span className="font-mono text-[0.9em] text-ink">/w/c/...</span>.
      </PageHeader>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Suspense
          fallback={
            <div className="h-64 rounded-[var(--radius-window)] border border-line bg-paper-raised animate-pulse" />
          }
        >
          <DirectoryContent searchParams={searchParams} />
        </Suspense>
      </div>
    </>
  );
}
