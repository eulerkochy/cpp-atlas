import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { buttonVariants } from "@/components/ui/button";
import { getDomainsForLang, getIndexStats } from "@/lib/cppref-index";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "cppreference Portal (/w)",
  description:
    "Unified 1:1 index portal to both C++ (/w/cpp) and C (/w/c) specifications on en.cppreference.com.",
};

export default function WPortalPage() {
  const all = getIndexStats("all");
  const cpp = getIndexStats("cpp");
  const cStats = getIndexStats("c");
  return (
    <>
      <PageHeader title="The C++ and C reference">
        All {all.pages.toLocaleString("en-US")} pages across{" "}
        {all.domainCount} domains, served from an offline snapshot of
        cppreference.com and mapped 1:1 to{" "}
        <span className="font-mono text-[0.9em] text-ink">/w/cpp/...</span> and{" "}
        <span className="font-mono text-[0.9em] text-ink">/w/c/...</span> so
        every cross-link resolves seamlessly.
      </PageHeader>

      <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 md:grid-cols-2">
        <section className="space-y-6 border-t border-line pt-8">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-sm font-medium text-ink">
              /w/cpp
            </span>
            <span className="rounded-[var(--radius-chip)] bg-sun-wash px-2.5 py-0.5 font-mono text-xs text-ink">
              C++98 to C++26
            </span>
          </div>

          <h2 className="font-display text-3xl font-[450] tracking-[-0.025em] text-ink">
            C++ Language &amp; Standard Library
          </h2>

          <p className="leading-relaxed text-ink-soft">
            {cpp.pages.toLocaleString("en-US")} pages across{" "}
            {cpp.domainCount} domains, layered with interactive memory
            maps and CppCon standard-lawyer quizzes.
          </p>

          <ul className="flex flex-wrap gap-1.5">
            {getDomainsForLang("cpp").slice(0, 10).map((d) => (
              <li key={d.slug}>
                <Link
                  href={`/explore?lang=cpp&domain=${encodeURIComponent(d.name)}`}
                  className="inline-flex rounded-[var(--radius-chip)] border border-line bg-paper-raised px-2.5 py-1 text-xs text-ink-soft transition-colors hover:border-ink/40 hover:text-ink"
                >
                  {d.name}
                </Link>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link
              href="/w/cpp"
              className={cn(buttonVariants({ variant: "default" }))}
            >
              Open /w/cpp
            </Link>
            <Link
              href="/w/cpp/header"
              className={cn(buttonVariants({ variant: "secondary" }))}
            >
              Standard headers
            </Link>
          </div>
        </section>

        <section className="space-y-6 border-t border-line pt-8">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-sm font-medium text-ink">
              /w/c
            </span>
            <span className="rounded-[var(--radius-chip)] border border-line bg-paper-raised px-2.5 py-0.5 font-mono text-xs text-ink-soft">
              C89 to C23
            </span>
          </div>

          <h2 className="font-display text-3xl font-[450] tracking-[-0.025em] text-ink">
            C Language &amp; Standard Library
          </h2>

          <p className="leading-relaxed text-ink-soft">
            {cStats.pages.toLocaleString("en-US")} pages across{" "}
            {cStats.domainCount} domains—resolving every C
            compatibility reference linked from C++ headers.
          </p>

          <ul className="flex flex-wrap gap-1.5">
            {getDomainsForLang("c").slice(0, 10).map((d) => (
              <li key={d.slug}>
                <Link
                  href={`/explore?lang=c&domain=${encodeURIComponent(d.name)}`}
                  className="inline-flex rounded-[var(--radius-chip)] border border-line bg-paper-raised px-2.5 py-1 text-xs text-ink-soft transition-colors hover:border-ink/40 hover:text-ink"
                >
                  {d.name}
                </Link>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link
              href="/w/c"
              className={cn(buttonVariants({ variant: "default" }))}
            >
              Open /w/c
            </Link>
            <Link
              href="/w/c/language"
              className={cn(buttonVariants({ variant: "secondary" }))}
            >
              C Language
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
