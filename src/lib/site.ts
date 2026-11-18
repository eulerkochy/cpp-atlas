/** Site identity and absolute URL, used for canonical links, sitemaps, OG cards and JSON-LD. */
const RAW_SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://cpp-atlas.vercel.app"
).replace(/\/+$/, "");

function parseSiteHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "cpp-atlas.vercel.app";
  }
}

export const SITE = {
  name: "C++ Atlas",
  url: RAW_SITE_URL,
  host: parseSiteHost(RAW_SITE_URL),
} as const;

/** Absolute URL for a site path ("/w/cpp/utility/move"). */
export function absoluteUrl(pathname: string): string {
  return `${SITE.url}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

/** Relative /api/og URL for social share cards (resolved against metadataBase). */
export function buildOgImageUrl({
  title,
  kicker,
  meta,
  sub,
}: {
  title: string;
  kicker: string;
  meta: string;
  sub?: string;
}): string {
  const params = new URLSearchParams({ title, kicker, meta });
  if (sub) params.set("sub", sub);
  return `/api/og?${params.toString()}`;
}
