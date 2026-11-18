import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { SearchPrompt } from "@/components/SearchPrompt";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <>
      <PageHeader title="Page not found">
        There is no page at this address. The reference covers every page of the
        cppreference.com snapshot under{" "}
        <span className="font-mono text-[0.9em] text-ink">/w/cpp/...</span> and{" "}
        <span className="font-mono text-[0.9em] text-ink">/w/c/...</span>; search
        for what you were after.
      </PageHeader>
      <div className="mx-auto max-w-6xl space-y-8 px-4 sm:px-6">
        <SearchPrompt label="Search the reference: shared_ptr, value category, malloc…" />
        <div className="flex flex-wrap gap-6 text-sm">
          <Link
            href="/w/cpp"
            className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
          >
            C++ reference
          </Link>
          <Link
            href="/w/c"
            className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
          >
            C reference
          </Link>
          <Link
            href="/topics"
            className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
          >
            Study topics
          </Link>
        </div>
      </div>
    </>
  );
}
