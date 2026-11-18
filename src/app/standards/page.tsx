import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { StandardsClient } from "@/components/StandardsClient";

export const metadata: Metadata = {
  title: "C++11 to C++26 Evolution",
  description:
    "36 curated language and standard library shifts from C++11 through C++26 with ISO papers, standard draft clauses, runnable snippets, and links to study topics.",
  alternates: {
    canonical: "/standards",
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
