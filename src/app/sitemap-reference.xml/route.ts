import { NextResponse } from "next/server";
import { COMPANION_OVERLAYS } from "@/data/companions";
import { REFERENCE_SNAPSHOT } from "@/lib/cppref-engine";
import { listedReferenceEntries, referenceHref } from "@/lib/reference";
import { SITE } from "@/lib/site";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildReferenceUrlEntries(
  lang: "cpp" | "c",
  priority: string,
  excludedPaths?: ReadonlySet<string>
): string[] {
  return listedReferenceEntries(lang)
    .filter((e) => e.path !== "" && !excludedPaths?.has(e.path))
    .map((e) => {
      const loc = escapeXml(`${SITE.url}${referenceHref(lang, e.path)}`);
      return `<url><loc>${loc}</loc><lastmod>${REFERENCE_SNAPSHOT}</lastmod><changefreq>monthly</changefreq><priority>${priority}</priority></url>`;
    });
}

export async function GET() {
  const companionPaths = new Set(COMPANION_OVERLAYS.flatMap((c) => c.cppPaths));
  const urls = [
    ...buildReferenceUrlEntries("cpp", "0.6", companionPaths),
    ...buildReferenceUrlEntries("c", "0.55"),
  ];

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
  ].join("\n");

  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
