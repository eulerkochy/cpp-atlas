import type { MetadataRoute } from "next";
import { listedReferenceEntries, referenceHref } from "@/lib/reference";
import { SITE } from "@/lib/site";
import { getAllTopics } from "@/lib/topics";

const BASE_URL = SITE.url;
const STATIC_MODIFIED = "2026-11-18T00:00:00.000Z";

export default function sitemap(): MetadataRoute.Sitemap {
  const topics = getAllTopics();

  const coreRoutes: MetadataRoute.Sitemap = [
    {
      url: `${BASE_URL}/`,
      lastModified: STATIC_MODIFIED,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${BASE_URL}/topics`,
      lastModified: STATIC_MODIFIED,
      changeFrequency: "weekly",
      priority: 0.98,
    },
    {
      url: `${BASE_URL}/maps`,
      lastModified: STATIC_MODIFIED,
      changeFrequency: "weekly",
      priority: 0.95,
    },
    {
      url: `${BASE_URL}/study`,
      lastModified: STATIC_MODIFIED,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/standards`,
      lastModified: STATIC_MODIFIED,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/w`,
      lastModified: STATIC_MODIFIED,
      changeFrequency: "weekly",
      priority: 0.95,
    },
    {
      url: `${BASE_URL}/w/cpp`,
      lastModified: STATIC_MODIFIED,
      changeFrequency: "weekly",
      priority: 0.95,
    },
    {
      url: `${BASE_URL}/w/c`,
      lastModified: STATIC_MODIFIED,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/explore`,
      lastModified: STATIC_MODIFIED,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/quiz`,
      lastModified: STATIC_MODIFIED,
      changeFrequency: "weekly",
      priority: 0.85,
    },
    {
      url: `${BASE_URL}/notebook`,
      lastModified: STATIC_MODIFIED,
      changeFrequency: "weekly",
      priority: 0.85,
    },
  ];

  const topicRoutes: MetadataRoute.Sitemap = topics.map((t) => ({
    url: `${BASE_URL}/topics/${t.slug}`,
    lastModified: STATIC_MODIFIED,
    changeFrequency: "weekly",
    priority: 0.92,
  }));

  // Every listed (non-redirect) page of the imported reference, URL-encoded
  // the same way the site links to it. The two roots are in coreRoutes.
  const referenceRoutes = (lang: "cpp" | "c", priority: number) =>
    listedReferenceEntries(lang)
      .filter((e) => e.path !== "")
      .map(
        (e): MetadataRoute.Sitemap[number] => ({
          url: `${BASE_URL}${referenceHref(lang, e.path)}`,
          lastModified: STATIC_MODIFIED,
          changeFrequency: "monthly",
          priority,
        })
      );
  const cppRoutes = referenceRoutes("cpp", 0.7);
  const cRoutes = referenceRoutes("c", 0.65);

  return [...coreRoutes, ...topicRoutes, ...cppRoutes, ...cRoutes];
}
