import { NextResponse } from "next/server";
import { sanitizeAiSources } from "@/lib/ai-route-helpers";
import { resolveAiSources } from "@/lib/ai-sources";
import {
  attachGoogleSessionCookie,
  clearGoogleSessionCookie,
  getValidGoogleSession,
} from "@/lib/google-auth";
import {
  addMarkdownSourceToNotebook,
  addWebSourceToNotebook,
  assertValidNotebookName,
  createUserNotebook,
  GoogleNotebookApiError,
  notebookNameToWebUrl,
  type GoogleNotebookItem,
} from "@/lib/google-notebook-api";
import { absoluteUrl } from "@/lib/site";

const FATAL_CODES = new Set([
  "AUTH_EXPIRED",
  "WORKSPACE_UNSUPPORTED",
  "ACCOUNT_NOT_INITIALIZED",
  "API_NOT_ENABLED",
]);

export async function POST(request: Request) {
  const { session, refreshed, staleCookie } =
    await getValidGoogleSession(request);

  if (!session) {
    const res = NextResponse.json(
      {
        code: "NOT_CONNECTED",
        error: "Sign in with Google to send sources to your NotebookLM.",
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

  const sources = sanitizeAiSources(body.sources);
  const mode = body.mode === "url" ? "url" : "markdown";
  const includeQuizAnswers = body.includeQuizAnswers !== false;
  const rawNotebookName =
    typeof body.notebookName === "string" ? body.notebookName.trim() : "";
  const rawNewTitle =
    typeof body.newNotebookTitle === "string"
      ? body.newNotebookTitle.trim()
      : "";

  if (sources.length === 0) {
    return NextResponse.json(
      {
        error: "Select at least one topic or reference page to send.",
        code: "INVALID_ARGUMENT",
      },
      { status: 400 }
    );
  }

  const { documents } = resolveAiSources(sources, {
    includeQuizAnswers,
    maxSources: 10,
    maxTotalChars: 400_000,
  });

  if (documents.length === 0) {
    return NextResponse.json(
      {
        error: "None of the selected sources could be resolved.",
        code: "INVALID_ARGUMENT",
      },
      { status: 404 }
    );
  }

  let targetNotebook: GoogleNotebookItem;
  try {
    if (rawNotebookName) {
      const safeName = assertValidNotebookName(rawNotebookName);
      targetNotebook = {
        name: safeName,
        id: safeName.replace(/^notebooks\//, ""),
        displayName:
          typeof body.notebookTitle === "string" && body.notebookTitle.trim()
            ? body.notebookTitle.trim()
            : "Selected Notebook",
        webUrl: notebookNameToWebUrl(safeName),
      };
    } else {
      const defaultTitle =
        documents.length === 1
          ? `${documents[0].title} — C++ Atlas`
          : `C++ Atlas (${documents.length} sources)`;
      targetNotebook = await createUserNotebook(
        session.accessToken,
        rawNewTitle || defaultTitle
      );
    }
  } catch (err) {
    if (err instanceof GoogleNotebookApiError) {
      const res = NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status, headers: { "Cache-Control": "no-store" } }
      );
      if (err.code === "AUTH_EXPIRED") clearGoogleSessionCookie(res, request);
      return res;
    }
    return NextResponse.json(
      { error: "Failed to prepare target NotebookLM notebook.", code: "API_ERROR" },
      { status: 502 }
    );
  }

  const results: Array<{
    title: string;
    urlPath: string;
    ok: boolean;
    error?: string;
  }> = [];

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    try {
      if (mode === "url") {
        await addWebSourceToNotebook(session.accessToken, targetNotebook.name, {
          displayName: doc.title,
          url: absoluteUrl(doc.urlPath),
        });
      } else {
        await addMarkdownSourceToNotebook(
          session.accessToken,
          targetNotebook.name,
          {
            displayName: doc.title,
            markdown: doc.markdown,
          }
        );
      }
      results.push({ title: doc.title, urlPath: doc.urlPath, ok: true });
    } catch (err) {
      if (
        err instanceof GoogleNotebookApiError &&
        i === 0 &&
        FATAL_CODES.has(err.code)
      ) {
        const res = NextResponse.json(
          { error: err.message, code: err.code },
          { status: err.status, headers: { "Cache-Control": "no-store" } }
        );
        if (err.code === "AUTH_EXPIRED") clearGoogleSessionCookie(res, request);
        return res;
      }

      results.push({
        title: doc.title,
        urlPath: doc.urlPath,
        ok: false,
        error: err instanceof Error ? err.message : "Failed to add source.",
      });
    }
  }

  const addedCount = results.filter((r) => r.ok).length;
  const res = NextResponse.json(
    {
      notebook: targetNotebook,
      addedCount,
      totalCount: results.length,
      results,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
  if (refreshed) attachGoogleSessionCookie(res, session, request);
  return res;
}
