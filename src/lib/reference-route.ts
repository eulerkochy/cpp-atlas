import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getCompanionForPath } from "@/data/companions";
import { REFERENCE_SNAPSHOT, resolveReferencePage } from "@/lib/cppref-engine";
import { getIndexStats } from "@/lib/cppref-index";
import {
  prerenderedReferenceEntries,
  referenceHref,
} from "@/lib/reference";
import { buildOgImageUrl, SITE } from "@/lib/site";
import type { CppRefPageData, ReferenceLang } from "@/types/cpp";

/*
 * Shared by /w/cpp, /w/cpp/[...slug], /w/c and /w/c/[...slug].
 *
 * Every non-redirect page in the imported index is prerendered at build time
 * (bar one case-collision, see prerenderedReferenceEntries). Redirect entries
 * are answered by next.config redirects with 308s; the permanentRedirect here
 * is the fallback. Unknown paths are rewritten to a 404 by src/proxy.ts before
 * the page renders; the notFound() here is the fallback.
 */

const LANG_NAME: Record<ReferenceLang, string> = { cpp: "C++", c: "C" };

export function referenceStaticParams(lang: ReferenceLang): { slug: string[] }[] {
  return prerenderedReferenceEntries(lang)
    .filter((e) => e.path !== "")
    .map((e) => ({ slug: e.path.split("/") }));
}

/** The page for a route, or notFound() / permanentRedirect(). */
export function loadReferencePage(
  lang: ReferenceLang,
  slug: string[] | undefined
): CppRefPageData {
  const resolved = resolveReferencePage(lang, slug);
  if (resolved.kind === "redirect") permanentRedirect(resolved.to);
  if (resolved.kind === "missing") notFound();
  return resolved.page;
}

export function referenceMetadata(
  lang: ReferenceLang,
  slug: string[] | undefined
): Metadata {
  const page = loadReferencePage(lang, slug);
  const url = referenceHref(lang, page.pagePath);
  const isRoot = page.pagePath === "";
  const name = LANG_NAME[lang];
  const title = isRoot ? `${name} reference` : page.title;
  const description = isRoot
    ? `An offline, restyled copy of all ${getIndexStats(lang).pages.toLocaleString("en-US")} ${name} pages of cppreference.com, with outlines, memory maps and quizzes.`
    : page.summary || `${page.title}: ${name} reference${page.domain ? ` (${page.domain})` : ""}.`;
  const kicker = page.domain ?? `${name} Reference`;
  const hasCompanion =
    lang === "cpp" && Boolean(getCompanionForPath(page.pagePath));
  const image = buildOgImageUrl({
    title,
    kicker,
    meta: url,
    sub: hasCompanion ? "Read / Simulator / Quiz" : `Offline ${name} reference`,
  });
  const markdown = `/api/notebook/${lang}${url.slice(`/w/${lang}`.length)}`;

  return {
    title,
    description,
    alternates: {
      canonical: url,
      types: { "text/markdown": markdown },
    },
    openGraph: {
      type: isRoot ? "website" : "article",
      title,
      description,
      url,
      siteName: SITE.name,
      images: [{ url: image, width: 1200, height: 630, alt: `${title} | ${SITE.name}` }],
      ...(isRoot ? {} : { modifiedTime: REFERENCE_SNAPSHOT, tags: page.cppStandards }),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}
