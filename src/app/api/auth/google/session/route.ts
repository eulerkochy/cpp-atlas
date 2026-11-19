import { connection, NextResponse } from "next/server";
import {
  attachGoogleSessionCookie,
  clearGoogleSessionCookie,
  getGoogleRedirectUri,
  getValidGoogleSession,
  isGoogleOAuthConfigured,
} from "@/lib/google-auth";

export async function GET(request: Request) {
  await connection();
  const configured = isGoogleOAuthConfigured();
  const redirectUri = getGoogleRedirectUri(request);

  if (!configured) {
    return NextResponse.json(
      {
        configured: false,
        connected: false,
        user: null,
        redirectUri,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const { session, refreshed, staleCookie } =
    await getValidGoogleSession(request);

  const res = NextResponse.json(
    {
      configured: true,
      connected: Boolean(session),
      user: session ? session.user : null,
      redirectUri,
    },
    { headers: { "Cache-Control": "no-store" } }
  );

  if (session && refreshed) {
    attachGoogleSessionCookie(res, session, request);
  } else if (!session && staleCookie) {
    clearGoogleSessionCookie(res, request);
  }

  return res;
}
