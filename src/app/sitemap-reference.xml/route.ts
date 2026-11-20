import { NextResponse } from "next/server";

/** The reference pages now live in the sitemap index shards. */
export function GET(request: Request) {
  return NextResponse.redirect(new URL("/sitemap.xml", request.url), 308);
}
