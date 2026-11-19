import { connection, NextResponse } from "next/server";
import {
  attachOAuthStateCookie,
  buildGoogleAuthorizeUrl,
  buildReturnRedirectUrl,
  createOAuthState,
  createPkcePair,
  getGoogleRedirectUri,
  isGoogleOAuthConfigured,
  sanitizeReturnTo,
} from "@/lib/google-auth";

export async function GET(request: Request) {
  await connection();
  const reqUrl = new URL(request.url);
  const returnTo = sanitizeReturnTo(reqUrl.searchParams.get("returnTo"));

  if (!isGoogleOAuthConfigured()) {
    return NextResponse.redirect(
      buildReturnRedirectUrl(request, returnTo, {
        google_error: "not_configured",
      }),
      302
    );
  }

  const state = createOAuthState();
  const { codeVerifier, codeChallenge } = createPkcePair();
  const redirectUri = getGoogleRedirectUri(request);
  const authorizeUrl = buildGoogleAuthorizeUrl({
    redirectUri,
    state,
    codeChallenge,
  });

  if (!authorizeUrl) {
    return NextResponse.redirect(
      buildReturnRedirectUrl(request, returnTo, {
        google_error: "not_configured",
      }),
      302
    );
  }

  const res = NextResponse.redirect(authorizeUrl, 302);
  attachOAuthStateCookie(
    res,
    { state, codeVerifier, returnTo, createdAt: Date.now() },
    request
  );
  return res;
}
