import type { MetadataRoute } from "next";
import { COMPANION_OVERLAYS } from "@/data/companions";
import { REFERENCE_SNAPSHOT } from "@/lib/cppref-engine";
import { listedReferenceEntries, referenceHref } from "@/lib/reference";
import { SITE } from "@/lib/site";
import { getAllTopics } from "@/lib/topics";

const BASE_URL = SITE.url;
const CONTENT_MODIFIED = "2026-11-19T00:00:00.000Z";

/** Shard ids served at /sitemap/[id].xml and listed from /sitemap.xml. */
export const SITEMAP_SHARD_IDS = [0, 1, 2] as const;

export type SitemapShardId = (typeof SITEMAP_SHARD_IDS)[number];

function coreAndTopics(): MetadataRoute.Sitemap {
  const topics = getAllTopics();
  const coreRoutes: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: CONTENT_MODIFIED,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${BASE_URL}/topics`,
      lastModified: CONTENT_MODIFIED,
      changeFrequency: "weekly",
      priority: 0.98,
    },
    {
      url: `${BASE_URL}/maps`,
      lastModified: CONTENT_MODIFIED,
      changeFrequency: "weekly",
      priority: 0.95,
    },
    {
      url: `${BASE_URL}/study`,
      lastModified: CONTENT_MODIFIED,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/standards`,
      lastModified: CONTENT_MODIFIED,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/w`,
      lastModified: CONTENT_MODIFIED,
      changeFrequency: "weekly",
      priority: 0.95,
    },
    {
      url: `${BASE_URL}/w/cpp`,
      lastModified: REFERENCE_SNAPSHOT,
      changeFrequency: "monthly",
      priority: 0.95,
    },
    {
      url: `${BASE_URL}/w/c`,
      lastModified: REFERENCE_SNAPSHOT,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/explore`,
      lastModified: CONTENT_MODIFIED,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/quiz`,
      lastModified: CONTENT_MODIFIED,
      changeFrequency: "weekly",
      priority: 0.85,
    },
    {
      url: `${BASE_URL}/notebook`,
      lastModified: CONTENT_MODIFIED,
      changeFrequency: "weekly",
      priority: 0.85,
    },
  ];

  const topicRoutes: MetadataRoute.Sitemap = topics.map((t) => ({
    url: `${BASE_URL}/topics/${t.slug}`,
    lastModified: CONTENT_MODIFIED,
    changeFrequency: "weekly",
    priority: 0.92,
  }));

  return [...coreRoutes, ...topicRoutes];
}

function referenceRoutes(
  lang: "cpp" | "c",
  priority: number
): MetadataRoute.Sitemap {
  const companionPaths =
    lang === "cpp"
      ? new Set(COMPANION_OVERLAYS.flatMap((c) => c.cppPaths))
      : null;

  return listedReferenceEntries(lang)
    .filter((e) => e.path !== "")
    .map((e) => ({
      url: `${BASE_URL}${referenceHref(lang, e.path)}`,
      lastModified: REFERENCE_SNAPSHOT,
      changeFrequency: "monthly" as const,
      priority: companionPaths?.has(e.path) ? 0.85 : priority,
    }));
}

/** One sitemap shard. 0 is the site and topics; 1 is C++; 2 is C. */
export function entriesForShard(id: number): MetadataRoute.Sitemap {
  if (id === 0) return coreAndTopics();
  if (id === 1) return referenceRoutes("cpp", 0.6);
  if (id === 2) return referenceRoutes("c", 0.55);
  return [];
}
