import crypto from "node:crypto";
import type { NextResponse } from "next/server";

export const GOOGLE_SESSION_COOKIE = "cpp_atlas_google_nlm";
export const GOOGLE_OAUTH_STATE_COOKIE = "cpp_atlas_google_oauth_state";
export const GOOGLE_OAUTH_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/notebook",
] as const;

const COOKIE_AAD = Buffer.from("cpp-atlas-google-nlm-v1", "utf8");
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days
const STATE_MAX_AGE_SECONDS = 60 * 10; // 10 minutes

export interface GoogleNotebookSession {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scope?: string;
  user: {
    email: string;
    name: string;
    picture?: string;
  };
}

export interface GoogleOAuthStatePayload {
  state: string;
  codeVerifier: string;
  returnTo: string;
  createdAt: number;
}

function getOAuthCredentials(): {
  clientId: string;
  clientSecret: string;
} | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() ?? "";
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function isGoogleOAuthConfigured(): boolean {
  return getOAuthCredentials() !== null;
}

export function getGoogleCloudProject(): string | null {
  const proj = process.env.GOOGLE_CLOUD_PROJECT?.trim();
  return proj || null;
}

function deriveEncryptionKey(): Buffer | null {
  const explicitSecret = process.env.GOOGLE_OAUTH_SESSION_SECRET?.trim();
  if (explicitSecret) {
    return crypto
      .createHash("sha256")
      .update(`cpp-atlas-session:${explicitSecret}`)
      .digest();
  }
  const creds = getOAuthCredentials();
  if (!creds) return null;
  return crypto
    .createHash("sha256")
    .update(`cpp-atlas-google-nlm:${creds.clientSecret}`)
    .digest();
}

function sealCookiePayload(payload: unknown): string | null {
  const key = deriveEncryptionKey();
  if (!key) return null;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(COOKIE_AAD);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

function unsealCookiePayload<T>(raw: string | undefined | null): T | null {
  if (!raw) return null;
  const key = deriveEncryptionKey();
  if (!key) return null;

  try {
    const buf = Buffer.from(raw, "base64url");
    if (buf.length <= 28) return null;
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ciphertext = buf.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(COOKIE_AAD);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return JSON.parse(decrypted.toString("utf8")) as T;
  } catch {
    return null;
  }
}

export function createPkcePair(): {
  codeVerifier: string;
  codeChallenge: string;
} {
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return { codeVerifier, codeChallenge };
}

export function createOAuthState(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export function sanitizeReturnTo(raw: string | null | undefined): string {
  if (!raw) return "/notebook";
  const trimmed = raw.trim();
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("/\\") ||
    trimmed.includes("\\") ||
    /[\r\n\0]/.test(trimmed)
  ) {
    return "/notebook";
  }
  return trimmed;
}

export function getRequestOrigin(request: Request): string {
  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const forwardedProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();

  if (
    forwardedHost &&
    /^[A-Za-z0-9.-]+(?::\d+)?$/.test(forwardedHost) &&
    (forwardedProto === "https" || forwardedProto === "http")
  ) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  return new URL(request.url).origin;
}

export function getGoogleRedirectUri(request: Request): string {
  return `${getRequestOrigin(request)}/api/auth/google/callback`;
}

export function buildReturnRedirectUrl(
  request: Request,
  returnTo: string,
  extraParams: Record<string, string>
): string {
  const safePath = sanitizeReturnTo(returnTo);
  const url = new URL(safePath, getRequestOrigin(request));
  for (const [k, v] of Object.entries(extraParams)) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

export function buildGoogleAuthorizeUrl(params: {
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string | null {
  const creds = getOAuthCredentials();
  if (!creds) return null;

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", creds.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_OAUTH_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent select_account");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", params.state);
  return url.toString();
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

interface UserInfoResponse {
  email?: string;
  name?: string;
  picture?: string;
}

export async function exchangeCodeForSession(params: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<GoogleNotebookSession> {
  const creds = getOAuthCredentials();
  if (!creds) {
    throw new Error("Google OAuth is not configured on this server.");
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: params.code,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      redirect_uri: params.redirectUri,
      grant_type: "authorization_code",
      code_verifier: params.codeVerifier,
    }),
  });

  const tokenJson = (await tokenRes.json()) as TokenResponse;
  if (!tokenRes.ok || !tokenJson.access_token) {
    throw new Error(
      tokenJson.error_description ||
        tokenJson.error ||
        "Failed to exchange Google authorization code."
    );
  }

  const userRes = await fetch(
    "https://openidconnect.googleapis.com/v1/userinfo",
    {
      headers: {
        Authorization: `Bearer ${tokenJson.access_token}`,
      },
    }
  );
  const userJson = userRes.ok
    ? ((await userRes.json()) as UserInfoResponse)
    : {};

  const email = userJson.email?.trim() || "Google account";
  const name = userJson.name?.trim() || email;

  return {
    accessToken: tokenJson.access_token,
    refreshToken: tokenJson.refresh_token,
    expiresAt: Date.now() + (tokenJson.expires_in ?? 3600) * 1000,
    scope: tokenJson.scope,
    user: {
      email,
      name,
      picture: userJson.picture,
    },
  };
}

async function refreshGoogleSession(
  session: GoogleNotebookSession
): Promise<GoogleNotebookSession | null> {
  const creds = getOAuthCredentials();
  if (!creds || !session.refreshToken) return null;

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        refresh_token: session.refreshToken,
        grant_type: "refresh_token",
      }),
    });

    const json = (await res.json()) as TokenResponse;
    if (!res.ok || !json.access_token) return null;

    return {
      ...session,
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? session.refreshToken,
      expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
      scope: json.scope ?? session.scope,
    };
  } catch {
    return null;
  }
}

function readCookieFromRequest(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key === name) {
      const val = part.slice(idx + 1).trim();
      try {
        return decodeURIComponent(val);
      } catch {
        return val;
      }
    }
  }
  return null;
}

export async function getValidGoogleSession(request: Request): Promise<{
  session: GoogleNotebookSession | null;
  refreshed: boolean;
  staleCookie: boolean;
}> {
  const raw = readCookieFromRequest(request, GOOGLE_SESSION_COOKIE);
  if (!raw) {
    return { session: null, refreshed: false, staleCookie: false };
  }

  const parsed = unsealCookiePayload<GoogleNotebookSession>(raw);
  if (!parsed || !parsed.accessToken || !parsed.user?.email) {
    return { session: null, refreshed: false, staleCookie: true };
  }

  if (parsed.expiresAt - Date.now() > 60_000) {
    return { session: parsed, refreshed: false, staleCookie: false };
  }

  const refreshedSession = await refreshGoogleSession(parsed);
  if (!refreshedSession) {
    return { session: null, refreshed: false, staleCookie: true };
  }

  return { session: refreshedSession, refreshed: true, staleCookie: false };
}

function isSecureCookie(request: Request): boolean {
  return getRequestOrigin(request).startsWith("https://");
}

export function attachGoogleSessionCookie(
  response: NextResponse,
  session: GoogleNotebookSession,
  request: Request
): void {
  const sealed = sealCookiePayload(session);
  if (!sealed) return;
  response.cookies.set(GOOGLE_SESSION_COOKIE, sealed, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie(request),
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function clearGoogleSessionCookie(
  response: NextResponse,
  request: Request
): void {
  response.cookies.set(GOOGLE_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie(request),
    path: "/",
    maxAge: 0,
  });
}

export function attachOAuthStateCookie(
  response: NextResponse,
  payload: GoogleOAuthStatePayload,
  request: Request
): void {
  const sealed = sealCookiePayload(payload);
  if (!sealed) return;
  response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, sealed, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie(request),
    path: "/",
    maxAge: STATE_MAX_AGE_SECONDS,
  });
}

export function readOAuthStateCookie(
  request: Request
): GoogleOAuthStatePayload | null {
  const raw = readCookieFromRequest(request, GOOGLE_OAUTH_STATE_COOKIE);
  const parsed = unsealCookiePayload<GoogleOAuthStatePayload>(raw);
  if (!parsed) return null;
  if (Date.now() - parsed.createdAt > STATE_MAX_AGE_SECONDS * 1000) {
    return null;
  }
  return parsed;
}

export function clearOAuthStateCookie(
  response: NextResponse,
  request: Request
): void {
  response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie(request),
    path: "/",
    maxAge: 0,
  });
}
