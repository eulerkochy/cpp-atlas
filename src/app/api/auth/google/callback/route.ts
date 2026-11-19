import { connection, NextResponse } from "next/server";
import {
  attachGoogleSessionCookie,
  buildReturnRedirectUrl,
  clearOAuthStateCookie,
  exchangeCodeForSession,
  getGoogleRedirectUri,
  readOAuthStateCookie,
} from "@/lib/google-auth";

export async function GET(request: Request) {
  await connection();
  const reqUrl = new URL(request.url);
  const savedState = readOAuthStateCookie(request);
  const returnTo = savedState?.returnTo ?? "/notebook";

  const oauthError = reqUrl.searchParams.get("error");
  if (oauthError) {
    const res = NextResponse.redirect(
      buildReturnRedirectUrl(request, returnTo, {
        google_error: oauthError === "access_denied" ? "access_denied" : "oauth_failed",
      }),
      302
    );
    clearOAuthStateCookie(res, request);
    return res;
  }

  const code = reqUrl.searchParams.get("code")?.trim();
  const state = reqUrl.searchParams.get("state")?.trim();

  if (!savedState || !code || !state || state !== savedState.state) {
    const res = NextResponse.redirect(
      buildReturnRedirectUrl(request, returnTo, {
        google_error: "invalid_state",
      }),
      302
    );
    clearOAuthStateCookie(res, request);
    return res;
  }

  try {
    const session = await exchangeCodeForSession({
      code,
      codeVerifier: savedState.codeVerifier,
      redirectUri: getGoogleRedirectUri(request),
    });

    const res = NextResponse.redirect(
      buildReturnRedirectUrl(request, returnTo, {
        google_connected: "1",
      }),
      302
    );
    attachGoogleSessionCookie(res, session, request);
    clearOAuthStateCookie(res, request);
    return res;
  } catch {
    const res = NextResponse.redirect(
      buildReturnRedirectUrl(request, returnTo, {
        google_error: "exchange_failed",
      }),
      302
    );
    clearOAuthStateCookie(res, request);
    return res;
  }
}
