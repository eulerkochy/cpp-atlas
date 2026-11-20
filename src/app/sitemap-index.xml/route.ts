import { NextResponse } from "next/server";
import { SITEMAP_SHARD_IDS } from "@/lib/sitemap-entries";
import { SITE } from "@/lib/site";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Index for the generateSitemaps shards (/sitemap/0.xml, /sitemap/1.xml, …).
 * next.config rewrites /sitemap.xml here. Next.js 16 serves the shards but
 * does not publish this index itself, and a route at /sitemap.xml conflicts
 * with the sitemap metadata file.
 */
export function GET() {
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...SITEMAP_SHARD_IDS.map((id) => {
      const loc = escapeXml(`${SITE.url}/sitemap/${id}.xml`);
      return `<sitemap><loc>${loc}</loc></sitemap>`;
    }),
    "</sitemapindex>",
    "",
  ].join("\n");

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
