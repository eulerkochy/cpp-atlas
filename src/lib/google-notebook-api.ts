import { getGoogleCloudProject } from "@/lib/google-auth";

const NOTEBOOK_API_BASE = "https://notebook.googleapis.com/v1";
const VALID_NOTEBOOK_NAME_RE = /^notebooks\/[A-Za-z0-9_-]+$/;

export interface GoogleNotebookItem {
  name: string;
  id: string;
  displayName: string;
  createTime?: string;
  webUrl: string;
}

export type GoogleNotebookErrorCode =
  | "AUTH_EXPIRED"
  | "WORKSPACE_UNSUPPORTED"
  | "ACCOUNT_NOT_INITIALIZED"
  | "API_NOT_ENABLED"
  | "INVALID_ARGUMENT"
  | "API_ERROR";

export class GoogleNotebookApiError extends Error {
  status: number;
  code: GoogleNotebookErrorCode;

  constructor(
    status: number,
    code: GoogleNotebookErrorCode,
    message: string
  ) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function notebookNameToWebUrl(name: string): string {
  const id = name.replace(/^notebooks\//, "");
  return `https://notebooklm.google.com/notebook/${encodeURIComponent(id)}`;
}

export function assertValidNotebookName(name: string): string {
  const trimmed = name.trim();
  if (!VALID_NOTEBOOK_NAME_RE.test(trimmed)) {
    throw new GoogleNotebookApiError(
      400,
      "INVALID_ARGUMENT",
      "Invalid NotebookLM notebook identifier."
    );
  }
  return trimmed;
}

interface RawGoogleErrorPayload {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: Array<{
      reason?: string;
      message?: string;
    }>;
  };
}

function mapGoogleApiError(
  status: number,
  rawText: string
): GoogleNotebookApiError {
  let message = rawText.trim();
  let reasonText = "";

  try {
    const parsed = JSON.parse(rawText) as RawGoogleErrorPayload;
    if (parsed.error?.message) message = parsed.error.message;
    reasonText = (parsed.error?.details ?? [])
      .map((d) => `${d.reason ?? ""} ${d.message ?? ""}`)
      .join(" ");
  } catch {
    // Keep raw text fallback
  }

  const combined = `${message} ${reasonText}`;

  if (status === 401) {
    return new GoogleNotebookApiError(
      401,
      "AUTH_EXPIRED",
      "Your Google session expired or revoked NotebookLM access. Sign in again to reconnect."
    );
  }

  if (/WORKSPACE_ACCOUNT_NOT_SUPPORTED/i.test(combined)) {
    return new GoogleNotebookApiError(
      403,
      "WORKSPACE_UNSUPPORTED",
      "Google's Gemini Notebook API preview currently supports personal @gmail.com accounts, not managed Google Workspace accounts."
    );
  }

  if (
    status === 404 &&
    /account not found|not found for user/i.test(combined)
  ) {
    return new GoogleNotebookApiError(
      404,
      "ACCOUNT_NOT_INITIALIZED",
      "Open notebooklm.google.com once with this Google account so Google initializes your NotebookLM profile, then retry."
    );
  }

  if (
    status === 403 &&
    /SERVICE_DISABLED|accessNotConfigured|has not been used|not enabled/i.test(
      combined
    )
  ) {
    return new GoogleNotebookApiError(
      403,
      "API_NOT_ENABLED",
      "The Gemini Notebook API (notebook.googleapis.com) is not enabled in the configured Google Cloud project."
    );
  }

  return new GoogleNotebookApiError(
    status >= 400 && status < 600 ? status : 502,
    status === 400 ? "INVALID_ARGUMENT" : "API_ERROR",
    message || `Notebook API request failed (${status}).`
  );
}

async function notebookFetch<T>(
  accessToken: string,
  endpointPath: string,
  init?: RequestInit
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  headers.set("Content-Type", "application/json");

  const project = getGoogleCloudProject();
  if (project) {
    headers.set("x-goog-user-project", project);
  }

  const res = await fetch(`${NOTEBOOK_API_BASE}${endpointPath}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) {
    throw mapGoogleApiError(res.status, text);
  }

  return (text ? JSON.parse(text) : {}) as T;
}

interface RawNotebook {
  name?: string;
  displayName?: string;
  createTime?: string;
}

function normalizeNotebook(raw: RawNotebook): GoogleNotebookItem {
  const name = raw.name?.trim() || "";
  const id = name.replace(/^notebooks\//, "");
  return {
    name,
    id,
    displayName: raw.displayName?.trim() || "Untitled notebook",
    createTime: raw.createTime,
    webUrl: notebookNameToWebUrl(name),
  };
}

export async function listUserNotebooks(
  accessToken: string,
  pageSize = 50
): Promise<GoogleNotebookItem[]> {
  const clamped = Math.max(1, Math.min(100, Math.round(pageSize)));
  const data = await notebookFetch<{ notebooks?: RawNotebook[] }>(
    accessToken,
    `/notebooks?pageSize=${clamped}`,
    { method: "GET" }
  );
  return (data.notebooks ?? [])
    .filter((n) => Boolean(n.name))
    .map(normalizeNotebook);
}

export async function createUserNotebook(
  accessToken: string,
  displayName: string
): Promise<GoogleNotebookItem> {
  const cleaned = displayName.trim().slice(0, 500) || "C++ Atlas Notes";
  const created = await notebookFetch<RawNotebook>(accessToken, "/notebooks", {
    method: "POST",
    body: JSON.stringify({ displayName: cleaned }),
  });
  return normalizeNotebook(created);
}

export async function addMarkdownSourceToNotebook(
  accessToken: string,
  notebookName: string,
  params: { displayName: string; markdown: string }
): Promise<unknown> {
  const safeName = assertValidNotebookName(notebookName);
  return notebookFetch(accessToken, `/${safeName}/sources`, {
    method: "POST",
    body: JSON.stringify({
      displayName: params.displayName.trim().slice(0, 240) || "C++ Atlas Note",
      mimeType: "text/markdown",
      textContent: {
        content: params.markdown,
      },
    }),
  });
}

export async function addWebSourceToNotebook(
  accessToken: string,
  notebookName: string,
  params: { displayName: string; url: string }
): Promise<unknown> {
  const safeName = assertValidNotebookName(notebookName);
  return notebookFetch(accessToken, `/${safeName}/sources`, {
    method: "POST",
    body: JSON.stringify({
      displayName: params.displayName.trim().slice(0, 240) || "C++ Atlas Page",
      webContent: {
        url: params.url,
      },
    }),
  });
}
