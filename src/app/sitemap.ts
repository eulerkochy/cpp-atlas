import type { MetadataRoute } from "next";
import { COMPANION_OVERLAYS } from "@/data/companions";
import { REFERENCE_SNAPSHOT } from "@/lib/cppref-engine";
import { listedReferenceEntries, referenceHref } from "@/lib/reference";
import { SITE } from "@/lib/site";
import { getAllTopics } from "@/lib/topics";

const BASE_URL = SITE.url;
const CONTENT_MODIFIED = "2026-11-19T00:00:00.000Z";

export default function sitemap(): MetadataRoute.Sitemap {
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

  const companionPaths = new Set(COMPANION_OVERLAYS.flatMap((c) => c.cppPaths));
  const companionReferenceRoutes: MetadataRoute.Sitemap = listedReferenceEntries(
    "cpp"
  )
    .filter((e) => e.path !== "" && companionPaths.has(e.path))
    .map((e) => ({
      url: `${BASE_URL}${referenceHref("cpp", e.path)}`,
      lastModified: REFERENCE_SNAPSHOT,
      changeFrequency: "monthly",
      priority: 0.85,
    }));

  return [...coreRoutes, ...topicRoutes, ...companionReferenceRoutes];
}
