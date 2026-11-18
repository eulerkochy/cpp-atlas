import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { CppRefPageView } from "@/components/CppRefPageView";
import { getReferencePage, sanitizeSlugParts } from "@/lib/cppref-engine";
import { getPrimaryEntryForLangPath } from "@/lib/cppref-index";

export async function generateStaticParams() {
  return [{ slug: ["language"] }, { slug: ["memory", "malloc"] }];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const sanitized = sanitizeSlugParts(slug);
  if (!sanitized) {
    return { title: "Not Found" };
  }
  const cleanPath = sanitized.join("/");
  const entry = getPrimaryEntryForLangPath("c", cleanPath);
  const title = entry?.name ?? (cleanPath || "C Reference");
  const kicker = entry?.type ?? "C Reference";
  const description = `C++ Atlas 1:1 study view of en.cppreference.com/w/c/${cleanPath} (${kicker}).`;
  const ogImage = `/api/og?title=${encodeURIComponent(title)}&kicker=${encodeURIComponent(kicker)}&meta=${encodeURIComponent(`/w/c/${cleanPath}`)}`;

  return {
    title,
    description,
    alternates: {
      canonical: `/w/c/${cleanPath}`,
    },
    openGraph: {
      title,
      description,
      type: "article",
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: `${title} — C++ Atlas`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

function ReferenceSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-28 pb-12 sm:px-6 sm:pt-36 space-y-6 animate-pulse">
      <div className="h-4 w-56 rounded bg-paper-sunk" />
      <div className="h-12 w-2/3 rounded bg-paper-sunk" />
      <div className="h-64 rounded-[var(--radius-window)] border border-line bg-paper-raised" />
    </div>
  );
}

async function CReferenceArticleLoader({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const page = await getReferencePage("c", slug);
  if (!page) {
    notFound();
  }
  return <CppRefPageView page={page} />;
}

export default function CRefDynamicPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  return (
    <Suspense fallback={<ReferenceSkeleton />}>
      <CReferenceArticleLoader params={params} />
    </Suspense>
  );
}
