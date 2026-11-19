import { connection, NextResponse } from "next/server";
import {
  attachGoogleSessionCookie,
  clearGoogleSessionCookie,
  getValidGoogleSession,
} from "@/lib/google-auth";
import {
  createUserNotebook,
  GoogleNotebookApiError,
  listUserNotebooks,
} from "@/lib/google-notebook-api";

function handleNotebookError(
  err: unknown,
  request: Request
): NextResponse {
  if (err instanceof GoogleNotebookApiError) {
    const res = NextResponse.json(
      { error: err.message, code: err.code },
      { status: err.status, headers: { "Cache-Control": "no-store" } }
    );
    if (err.code === "AUTH_EXPIRED") {
      clearGoogleSessionCookie(res, request);
    }
    return res;
  }
  return NextResponse.json(
    {
      error: "Unexpected error talking to Google NotebookLM.",
      code: "API_ERROR",
    },
    { status: 502, headers: { "Cache-Control": "no-store" } }
  );
}

export async function GET(request: Request) {
  await connection();
  const { session, refreshed, staleCookie } =
    await getValidGoogleSession(request);

  if (!session) {
    const res = NextResponse.json(
      {
        code: "NOT_CONNECTED",
        error: "Sign in with Google to view your NotebookLM notebooks.",
      },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
    if (staleCookie) clearGoogleSessionCookie(res, request);
    return res;
  }

  try {
    const notebooks = await listUserNotebooks(session.accessToken);
    const res = NextResponse.json(
      { notebooks },
      { headers: { "Cache-Control": "no-store" } }
    );
    if (refreshed) attachGoogleSessionCookie(res, session, request);
    return res;
  } catch (err) {
    return handleNotebookError(err, request);
  }
}

export async function POST(request: Request) {
  const { session, refreshed, staleCookie } =
    await getValidGoogleSession(request);

  if (!session) {
    const res = NextResponse.json(
      {
        code: "NOT_CONNECTED",
        error: "Sign in with Google to create a NotebookLM notebook.",
      },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
    if (staleCookie) clearGoogleSessionCookie(res, request);
    return res;
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body.", code: "INVALID_ARGUMENT" },
      { status: 400 }
    );
  }

  const displayName =
    typeof body.displayName === "string" ? body.displayName.trim() : "";
  if (!displayName) {
    return NextResponse.json(
      { error: "Provide a notebook title.", code: "INVALID_ARGUMENT" },
      { status: 400 }
    );
  }

  try {
    const notebook = await createUserNotebook(session.accessToken, displayName);
    const res = NextResponse.json(
      { notebook },
      { headers: { "Cache-Control": "no-store" } }
    );
    if (refreshed) attachGoogleSessionCookie(res, session, request);
    return res;
  } catch (err) {
    return handleNotebookError(err, request);
  }
}
