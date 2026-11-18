import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CppRefPageView } from "@/components/CppRefPageView";
import { getReferencePage } from "@/lib/cppref-engine";
import { ALL_CREF_DOMAINS, C_INDEX_STATS } from "@/lib/cppref-index";

export const metadata: Metadata = {
  title: "C Reference (/w/c)",
  description:
    "1:1 indexed overview of the C programming language and standard library headers.",
};

export default async function CRootPage() {
  const page = await getReferencePage("c", []);
  if (!page) {
    notFound();
  }

  return (
    <>
      <CppRefPageView page={page} />

      <section
        aria-labelledby="c-domains-heading"
        className="mx-auto mt-20 max-w-7xl px-4 sm:px-6"
      >
        <div className="border-t border-line pt-10">
          <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
            <h2
              id="c-domains-heading"
              className="font-display text-2xl font-[450] tracking-[-0.02em] text-ink"
            >
              Browse {C_INDEX_STATS.uniquePages.toLocaleString("en-US")} C
              reference pages across {C_INDEX_STATS.domainCount} domains
            </h2>
            <Link
              href="/explore?lang=c"
              className="text-sm text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
            >
              Open C directory
            </Link>
          </div>

          <ul className="grid border-t border-line sm:grid-cols-2 lg:grid-cols-3 sm:gap-x-10">
            {ALL_CREF_DOMAINS.map((d) => (
              <li key={d.slug} className="border-b border-line">
                <Link
                  href={`/explore?lang=c&domain=${encodeURIComponent(d.name)}`}
                  className="group flex items-baseline justify-between gap-4 py-3.5"
                >
                  <span className="font-display text-lg font-[450] text-ink decoration-sun decoration-2 underline-offset-[5px] group-hover:underline">
                    {d.name}
                  </span>
                  <span className="text-sm text-ink-faint tabular-nums">
                    {d.count}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
