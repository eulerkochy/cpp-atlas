import { NextResponse } from "next/server";
import { clearGoogleSessionCookie } from "@/lib/google-auth";

export async function POST(request: Request) {
  const res = NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } }
  );
  clearGoogleSessionCookie(res, request);
  return res;
}
