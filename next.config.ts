import fs from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

type IndexEntry = { path: string; kind: string; redirectTo?: string };
type Lang = "cpp" | "c";

const DATA_DIRS: Record<Lang, string> = {
  cpp: "data/reference",
  c: "data/reference-c",
};

/** Same encoding as referenceHref in src/lib/reference.ts. */
function referenceHref(lang: Lang, p: string) {
  if (!p) return `/w/${lang}`;
  return `/w/${lang}/${p
    .split("/")
    .map((s) =>
      encodeURIComponent(s).replace(/%(3D|2B|2C|40|3A)/g, (m) =>
        decodeURIComponent(m)
      )
    )
    .join("/")}`;
}

/** Escape path-to-regexp syntax so a source matches one literal path. */
function literalSource(href: string) {
  return href.replace(/[()[\]{}*+?:!\\]/g, (c) => `\\${c}`);
}

/**
 * cppreference redirect pages (e.g. /w/cpp/language/ctad) become real 308s,
 * for the page, its legacy /cpp/... or /c/... address, and its markdown.
 * They are excluded from prerendering; the page route keeps a fallback.
 */
function referenceRedirects() {
  return (["cpp", "c"] as const).flatMap((lang) => {
    const file = path.join(process.cwd(), DATA_DIRS[lang], "index.json");
    if (!fs.existsSync(file)) return [];
    const entries = JSON.parse(fs.readFileSync(file, "utf8")) as IndexEntry[];
    return entries
      .filter((e) => e.kind === "redirect" && e.redirectTo !== undefined)
      .flatMap((e) => {
        const from = referenceHref(lang, e.path);
        const to = referenceHref(lang, e.redirectTo!);
        const legacy = from.slice(2); // "/cpp/..." or "/c/..."
        const api = (href: string) => `/api/notebook${href.slice(2)}`;
        return [
          { source: literalSource(from), destination: to, permanent: true },
          { source: literalSource(legacy), destination: to, permanent: true },
          { source: literalSource(api(from)), destination: api(to), permanent: true },
        ];
      });
  });
}

const REFERENCE_INDEXES = [
  "./data/reference/index.json",
  "./data/reference-c/index.json",
];

const AI_TRACE_FILES = [
  "./content/**/*",
  "./data/reference/pages/**/*",
  "./data/reference/md/**/*",
  "./data/reference-c/pages/**/*",
  "./data/reference-c/md/**/*",
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Reference pages are prerendered; these routes still read the imported data
  // at request time (on-demand pages such as the numeric/math/NAN case
  // collision, markdown export, search, the directory and the topic pages).
  outputFileTracingIncludes: {
    "/*": ["./content/**/*", ...REFERENCE_INDEXES],
    "/w/cpp/\\[\\.\\.\\.slug\\]": ["./data/reference/pages/**/*"],
    "/w/c/\\[\\.\\.\\.slug\\]": ["./data/reference-c/pages/**/*"],
    "/api/notebook/\\[\\.\\.\\.slug\\]": [
      "./data/reference/pages/**/*",
      "./data/reference/md/**/*",
      "./data/reference-c/pages/**/*",
      "./data/reference-c/md/**/*",
    ],
    "/api/ai/chat": AI_TRACE_FILES,
    "/api/ai/studio": AI_TRACE_FILES,
    "/api/ai/audio-overview": AI_TRACE_FILES,
    "/api/notebooklm/push": AI_TRACE_FILES,
    "/api/search": REFERENCE_INDEXES,
    "/explore": REFERENCE_INDEXES,
    "/api/og": ["./src/assets/fonts/*"],
    "/opengraph-image": ["./src/assets/fonts/*"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async redirects() {
    return [
      // Reference redirect pages first, so /cpp/<old name> goes straight to the target.
      ...referenceRedirects(),
      {
        source: "/cpp",
        destination: "/w/cpp",
        permanent: true,
      },
      {
        source: "/cpp/:path*",
        destination: "/w/cpp/:path*",
        permanent: true,
      },
      {
        source: "/c",
        destination: "/w/c",
        permanent: true,
      },
      {
        source: "/c/:path*",
        destination: "/w/c/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
