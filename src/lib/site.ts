/** Site identity and absolute URL, used for canonical links, sitemaps and JSON-LD. */
export const SITE = {
  name: "C++ Atlas",
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "https://cpp-atlas.vercel.app").replace(
    /\/+$/,
    ""
  ),
} as const;

/** Absolute URL for a site path ("/w/cpp/utility/move"). */
export function absoluteUrl(pathname: string): string {
  return `${SITE.url}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}
