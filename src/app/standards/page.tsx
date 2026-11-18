import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { StandardsClient } from "@/components/StandardsClient";
import { buildOgImageUrl, SITE } from "@/lib/site";

const TITLE = "C++11 to C++26 Evolution";
const DESCRIPTION =
  "36 language and standard library shifts from C++11 through C++26 with ISO papers, standard draft clauses, self-contained code, and links to study topics.";
const OG_IMAGE = buildOgImageUrl({
  title: "C++ Across Revisions (C++11 to C++26)",
  kicker: "36 Language & Library Shifts",
  meta: "ISO papers / draft clauses / Compiler Explorer",
  sub: "C++11 / 14 / 17 / 20 / 23 / 26",
});

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: "/standards",
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/standards",
    siteName: SITE.name,
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: `${TITLE} — ${SITE.name}` }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
};

export default function StandardsPage() {
  return (
    <>
      <PageHeader title="C++ across revisions">
        <p>
          Thirty-six language and library shifts from C++11 through C++26. Each
          milestone pins the ISO paper, standard clause, abstract-machine change,
          and self-contained code ready for Compiler Explorer.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-5 text-sm">
          <Link
            href="/topics"
            className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
          >
            All study topics
          </Link>
          <Link
            href="/maps"
            className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
          >
            Concept maps
          </Link>
          <Link
            href="/study"
            className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
          >
            Study desk
          </Link>
        </div>
      </PageHeader>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <StandardsClient />
      </div>
    </>
  );
}
