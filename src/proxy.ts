import { NextResponse, type NextRequest } from "next/server";
import cPaths from "../data/reference-c/paths.json";
import cppPaths from "../data/reference/paths.json";
import tracks from "../content/tracks.json";

/**
 * Unknown reference and topic paths get a real (and fast) 404 status.
 *
 * Reference pages are prerendered, and a path that was not prerendered would
 * otherwise render on demand before it could call notFound(). Checking the
 * path against the imported index here (bundled, so no file reads at request
 * time) answers unknown paths with the not-found page and 404 straight away.
 * Redirect sources never reach this (next.config redirects run first) and
 * known paths pass straight through.
 */

const KNOWN = {
  cpp: new Set<string>(cppPaths),
  c: new Set<string>(cPaths),
};
const TOPICS = new Set<string>(tracks.tracks.flatMap((t) => t.topics));

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/") {
    const rawHost =
      request.headers.get("x-forwarded-host") ??
      request.headers.get("host") ??
      request.nextUrl.hostname;
    const hostname = rawHost.split(",")[0].trim().split(":")[0].toLowerCase();
    if (hostname.startsWith("scroll.")) {
      const url = request.nextUrl.clone();
      url.pathname = "/scroll";
      return NextResponse.rewrite(url);
    }
    return NextResponse.next();
  }

  const topic = pathname.match(/^\/topics\/([^/]+)\/?$/);
  if (topic) {
    return TOPICS.has(topic[1]) ? NextResponse.next() : notFound(request);
  }
  const m = pathname.match(/^\/w\/(cpp|c)\/(.+?)\/?$/);
  if (!m) return NextResponse.next();
  const lang = m[1] as keyof typeof KNOWN;
  let decoded: string;
  try {
    decoded = m[2].split("/").map(decodeURIComponent).join("/");
  } catch {
    decoded = "\0";
  }
  if (KNOWN[lang].has(decoded)) return NextResponse.next();
  return notFound(request);
}

/** No route matches this path, so Next answers with the not-found page and 404. */
function notFound(request: NextRequest) {
  return NextResponse.rewrite(new URL("/_reference-not-found", request.url));
}

export const config = {
  matcher: ["/", "/w/cpp/:path+", "/w/c/:path+", "/topics/:slug"],
};
