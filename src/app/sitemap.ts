import type { MetadataRoute } from "next";
import { UNIQUE_CPPREF_PATHS, UNIQUE_CREF_PATHS } from "@/lib/cppref-index";
import { getAllTopics } from "@/lib/topics";

const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://cpp-atlas.vercel.app";
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

  const cppRoutes: MetadataRoute.Sitemap = UNIQUE_CPPREF_PATHS.map((path) => ({
    url: `${BASE_URL}/w/cpp/${path}`,
    lastModified: STATIC_MODIFIED,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const cRoutes: MetadataRoute.Sitemap = UNIQUE_CREF_PATHS.map((path) => ({
    url: `${BASE_URL}/w/c/${path}`,
    lastModified: STATIC_MODIFIED,
    changeFrequency: "monthly",
    priority: 0.65,
  }));

  return [...coreRoutes, ...topicRoutes, ...cppRoutes, ...cRoutes];
}
