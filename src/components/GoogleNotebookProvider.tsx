"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  Check,
  Copy,
  ExternalLink,
  FolderPlus,
  LogOut,
  RefreshCw,
} from "lucide-react";
import { GoogleIcon, NotebookLmIcon } from "@/components/AiBrandIcons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NOTEBOOKLM_WEB_URL, type AiSourceRef } from "@/lib/ai-links";
import { absoluteUrl } from "@/lib/site";
import { cn } from "@/lib/utils";

export interface GoogleUserProfile {
  email: string;
  name: string;
  picture?: string;
}

export interface GoogleNotebookSummary {
  name: string;
  id: string;
  displayName: string;
  createTime?: string;
  webUrl: string;
}

export interface PushDialogOptions {
  sources: AiSourceRef[];
  defaultTitle?: string;
  includeQuizAnswers?: boolean;
}

interface PushResultState {
  notebook: GoogleNotebookSummary;
  addedCount: number;
  totalCount: number;
  results: Array<{
    title: string;
    urlPath: string;
    ok: boolean;
    error?: string;
  }>;
}

interface GoogleNotebookContextValue {
  loading: boolean;
  configured: boolean;
  connected: boolean;
  user: GoogleUserProfile | null;
  redirectUri: string;
  notebooks: GoogleNotebookSummary[];
  notebooksLoading: boolean;
  notebooksError: string | null;
  notebooksErrorCode: string | null;
  refreshNotebooks: () => Promise<void>;
  signIn: (returnTo?: string) => void;
  signOut: () => Promise<void>;
  openPushDialog: (options: PushDialogOptions) => void;
}

const GoogleNotebookContext = createContext<GoogleNotebookContextValue | null>(
  null
);

export function useGoogleNotebook(): GoogleNotebookContextValue {
  const ctx = useContext(GoogleNotebookContext);
  if (!ctx) {
    throw new Error(
      "useGoogleNotebook must be used inside GoogleNotebookProvider"
    );
  }
  return ctx;
}

function sourceRefToPath(src: AiSourceRef): string {
  if (src.kind === "topic") return `/topics/${src.slug}`;
  return src.path ? `/w/${src.lang}/${src.path}` : `/w/${src.lang}`;
}

export function GoogleNotebookProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [connected, setConnected] = useState(false);
  const [user, setUser] = useState<GoogleUserProfile | null>(null);
  const [redirectUri, setRedirectUri] = useState("");

  const [notebooks, setNotebooks] = useState<GoogleNotebookSummary[]>([]);
  const [notebooksLoading, setNotebooksLoading] = useState(false);
  const [notebooksError, setNotebooksError] = useState<string | null>(null);
  const [notebooksErrorCode, setNotebooksErrorCode] = useState<string | null>(
    null
  );

  // Push dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pushOptions, setPushOptions] = useState<PushDialogOptions | null>(
    null
  );
  const [targetMode, setTargetMode] = useState<"new" | "existing">("new");
  const [newTitle, setNewTitle] = useState("");
  const [selectedNotebookName, setSelectedNotebookName] = useState("");
  const [sourceFormat, setSourceFormat] = useState<"markdown" | "url">(
    "markdown"
  );
  const [pushing, setPushing] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushErrorCode, setPushErrorCode] = useState<string | null>(null);
  const [pushResult, setPushResult] = useState<PushResultState | null>(null);
  const [copiedFallbackUrls, setCopiedFallbackUrls] = useState(false);

  const refreshNotebooks = useCallback(async () => {
    setNotebooksLoading(true);
    setNotebooksError(null);
    setNotebooksErrorCode(null);

    try {
      const res = await fetch("/api/notebooklm/notebooks", {
        cache: "no-store",
      });
      const data = (await res.json()) as {
        notebooks?: GoogleNotebookSummary[];
        error?: string;
        code?: string;
      };
      if (!res.ok) {
        if (data.code === "NOT_CONNECTED" || data.code === "AUTH_EXPIRED") {
          setConnected(false);
          setUser(null);
        }
        setNotebooksError(data.error || "Could not load your notebooks.");
        setNotebooksErrorCode(data.code || null);
        return;
      }
      const list = data.notebooks ?? [];
      setNotebooks(list);
      setSelectedNotebookName((prev) =>
        prev && list.some((n) => n.name === prev)
          ? prev
          : (list[0]?.name ?? "")
      );
    } catch {
      setNotebooksError("Network error while loading NotebookLM notebooks.");
    } finally {
      setNotebooksLoading(false);
    }
  }, []);

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/google/session", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        configured?: boolean;
        connected?: boolean;
        user?: GoogleUserProfile | null;
        redirectUri?: string;
      };
      setConfigured(Boolean(data.configured));
      setConnected(Boolean(data.connected));
      setUser(data.user ?? null);
      if (data.redirectUri) setRedirectUri(data.redirectUri);
      if (data.connected) {
        void refreshNotebooks();
      }
    } finally {
      setLoading(false);
    }
  }, [refreshNotebooks]);

  useEffect(() => {
    void fetchSession();
  }, [fetchSession]);

  const signIn = useCallback(
    (returnTo?: string) => {
      const currentUrl =
        typeof window !== "undefined"
          ? `${window.location.pathname}${window.location.search}`
          : pathname || "/notebook";
      const dest = returnTo ?? currentUrl;
      const authUrl = new URL(
        `/api/auth/google?returnTo=${encodeURIComponent(dest)}`,
        window.location.origin
      ).toString();
      window.location.assign(authUrl);
    },
    [pathname]
  );

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/google/logout", { method: "POST" });
    } finally {
      setConnected(false);
      setUser(null);
      setNotebooks([]);
      setNotebooksError(null);
      setNotebooksErrorCode(null);
      setPushResult(null);
    }
  }, []);

  const openPushDialog = useCallback(
    (options: PushDialogOptions) => {
      setPushOptions(options);
      setNewTitle(options.defaultTitle?.trim() || "C++ Atlas Notes");
      setTargetMode("new");
      setSourceFormat("markdown");
      setPushError(null);
      setPushErrorCode(null);
      setPushResult(null);
      setDialogOpen(true);

      if (connected) {
        void refreshNotebooks();
      }
    },
    [connected, refreshNotebooks]
  );

  const handlePush = async () => {
    if (!pushOptions || pushOptions.sources.length === 0 || pushing) return;
    if (targetMode === "existing" && !selectedNotebookName) {
      setPushError("Select an existing notebook or switch to Create new.");
      return;
    }

    setPushing(true);
    setPushError(null);
    setPushErrorCode(null);

    try {
      const selectedExisting = notebooks.find(
        (n) => n.name === selectedNotebookName
      );
      const res = await fetch("/api/notebooklm/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sources: pushOptions.sources,
          mode: sourceFormat,
          includeQuizAnswers: pushOptions.includeQuizAnswers ?? true,
          ...(targetMode === "existing"
            ? {
                notebookName: selectedNotebookName,
                notebookTitle: selectedExisting?.displayName,
              }
            : {
                newNotebookTitle: newTitle.trim() || "C++ Atlas Notes",
              }),
        }),
      });

      const data = (await res.json()) as Partial<PushResultState> & {
        error?: string;
        code?: string;
      };

      if (!res.ok) {
        if (data.code === "NOT_CONNECTED" || data.code === "AUTH_EXPIRED") {
          setConnected(false);
          setUser(null);
        }
        setPushError(data.error || "Failed to send sources to NotebookLM.");
        setPushErrorCode(data.code || null);
        return;
      }

      if (data.notebook) {
        setPushResult({
          notebook: data.notebook,
          addedCount: data.addedCount ?? 0,
          totalCount: data.totalCount ?? pushOptions.sources.length,
          results: data.results ?? [],
        });
        void refreshNotebooks();
      }
    } catch {
      setPushError("Network error while pushing sources to NotebookLM.");
    } finally {
      setPushing(false);
    }
  };

  const handleCopyFallbackAndOpen = async () => {
    if (!pushOptions) return;
    const urls = pushOptions.sources
      .map((s) => absoluteUrl(sourceRefToPath(s)))
      .join("\n");
    try {
      await navigator.clipboard.writeText(urls);
      setCopiedFallbackUrls(true);
      window.setTimeout(() => setCopiedFallbackUrls(false), 2600);
    } catch {
      // Ignore clipboard rejection
    }
    window.open(NOTEBOOKLM_WEB_URL, "_blank", "noopener,noreferrer");
  };

  const sourceCount = pushOptions?.sources.length ?? 0;

  return (
    <GoogleNotebookContext.Provider
      value={{
        loading,
        configured,
        connected,
        user,
        redirectUri,
        notebooks,
        notebooksLoading,
        notebooksError,
        notebooksErrorCode,
        refreshNotebooks,
        signIn,
        signOut,
        openPushDialog,
      }}
    >
      {children}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg rounded-[var(--radius-window)] border border-line bg-paper p-6 text-ink shadow-window ring-0">
          <DialogHeader className="pr-8">
            <div className="flex items-center gap-2">
              <span className="inline-flex size-7 items-center justify-center rounded-full bg-sun text-ink">
                <NotebookLmIcon className="size-4" />
              </span>
              <DialogTitle className="font-display text-xl font-[450] tracking-[-0.02em] text-ink">
                Send to NotebookLM
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs leading-relaxed text-ink-soft">
              Push {sourceCount} {sourceCount === 1 ? "source" : "sources"} from
              C++ Atlas straight into your personal Google NotebookLM workspace.
            </DialogDescription>
          </DialogHeader>

          {!configured ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-line bg-sun-wash/60 p-4 text-xs leading-relaxed text-ink-body space-y-2">
                <p className="font-medium text-ink">
                  Google OAuth is not configured on this server yet
                </p>
                <p className="text-ink-soft">
                  To enable 1-click Google login and direct NotebookLM pushes,
                  configure a Google Cloud OAuth 2.0 Web Client with the Gemini
                  Notebook API (<code className="font-mono text-ink">notebook.googleapis.com</code>):
                </p>
                <ul className="list-disc space-y-1 pl-4 font-mono text-[11px] text-ink">
                  <li>GOOGLE_OAUTH_CLIENT_ID</li>
                  <li>GOOGLE_OAUTH_CLIENT_SECRET</li>
                  <li>GOOGLE_CLOUD_PROJECT (optional)</li>
                </ul>
                {redirectUri ? (
                  <p className="text-[11px] text-ink-soft">
                    Authorized redirect URI:{" "}
                    <code className="font-mono text-ink break-all">
                      {redirectUri}
                    </code>
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleCopyFallbackAndOpen}
                  className="cursor-pointer"
                >
                  {copiedFallbackUrls ? (
                    <Check
                      className="size-3.5 text-[color:var(--right)]"
                      aria-hidden
                    />
                  ) : (
                    <Copy className="size-3.5" aria-hidden />
                  )}
                  <span>
                    {copiedFallbackUrls
                      ? "URLs copied — paste!"
                      : "Copy URLs & open notebooklm.google.com"}
                  </span>
                  <ExternalLink className="size-3" aria-hidden />
                </Button>
              </div>
            </div>
          ) : !connected ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-line bg-paper-raised p-4 text-xs leading-relaxed text-ink-soft space-y-2">
                <p className="font-medium text-ink">
                  Connect your Google account
                </p>
                <p>
                  Sign in with Google to list your notebooks, create new ones,
                  and upload clean C++ Atlas Markdown or URLs directly via
                  Google&apos;s Notebook API.
                </p>
                <p className="text-[11px] text-ink-faint">
                  Note: Google&apos;s Notebook API preview supports personal{" "}
                  <span className="font-mono">@gmail.com</span> accounts that
                  have signed in to NotebookLM at least once.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={handleCopyFallbackAndOpen}
                  className="cursor-pointer text-ink-soft"
                >
                  <Copy className="size-3.5" aria-hidden />
                  <span>Copy URLs manually</span>
                </Button>

                <Button
                  type="button"
                  size="sm"
                  onClick={() => signIn()}
                  className="cursor-pointer"
                >
                  <GoogleIcon className="size-3.5" />
                  <span>Sign in with Google</span>
                </Button>
              </div>
            </div>
          ) : pushResult ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-[color:var(--right)]/30 bg-right-wash p-4 text-xs space-y-1.5">
                <div className="flex items-center gap-2 font-medium text-[color:var(--right)]">
                  <Check className="size-4" aria-hidden />
                  <span>
                    Added {pushResult.addedCount} of {pushResult.totalCount}{" "}
                    {pushResult.totalCount === 1 ? "source" : "sources"} to{" "}
                    &ldquo;{pushResult.notebook.displayName}&rdquo;
                  </span>
                </div>
                {pushResult.results.some((r) => !r.ok) ? (
                  <ul className="mt-2 space-y-1 text-[11px] text-wrong">
                    {pushResult.results
                      .filter((r) => !r.ok)
                      .map((r) => (
                        <li key={r.urlPath}>
                          {r.title}: {r.error}
                        </li>
                      ))}
                  </ul>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setPushResult(null)}
                  className="text-xs text-ink-soft underline decoration-line-strong underline-offset-3 hover:text-ink cursor-pointer"
                >
                  Send more sources
                </button>

                <a
                  href={pushResult.notebook.webUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-8 items-center gap-1.5 rounded-full bg-ink px-4 text-xs font-medium text-paper transition-colors hover:bg-ink/85"
                >
                  <NotebookLmIcon className="size-3.5" />
                  <span>Open in NotebookLM</span>
                  <ExternalLink className="size-3" aria-hidden />
                </a>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Signed-in account bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-paper-raised px-3.5 py-2.5 text-xs">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-sun-wash font-medium text-ink">
                    {(user?.name?.[0] || user?.email?.[0] || "G").toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate font-medium text-ink">
                      {user?.name}
                    </div>
                    <div className="truncate text-[11px] text-ink-faint">
                      {user?.email}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={signOut}
                  className="inline-flex items-center gap-1 text-xs text-ink-soft hover:text-ink cursor-pointer"
                >
                  <LogOut className="size-3" aria-hidden />
                  <span>Sign out</span>
                </button>
              </div>

              {/* Destination: New vs Existing */}
              <div className="space-y-2.5">
                <div className="inline-flex rounded-full border border-line-strong bg-paper-raised p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setTargetMode("new")}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium transition-colors cursor-pointer",
                      targetMode === "new"
                        ? "bg-sun text-ink"
                        : "text-ink-soft hover:text-ink"
                    )}
                  >
                    <FolderPlus className="size-3" aria-hidden />
                    <span>New notebook</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetMode("existing")}
                    className={cn(
                      "rounded-full px-3 py-1 font-medium transition-colors cursor-pointer",
                      targetMode === "existing"
                        ? "bg-sun text-ink"
                        : "text-ink-soft hover:text-ink"
                    )}
                  >
                    Existing notebook ({notebooks.length})
                  </button>
                </div>

                {targetMode === "new" ? (
                  <Input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Notebook title…"
                    aria-label="New notebook title"
                    className="h-9 rounded-full border-line-strong bg-paper-raised px-3.5 text-xs text-ink"
                  />
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedNotebookName}
                        onChange={(e) =>
                          setSelectedNotebookName(e.target.value)
                        }
                        aria-label="Select existing NotebookLM notebook"
                        disabled={notebooksLoading || notebooks.length === 0}
                        className="h-9 min-w-0 flex-1 rounded-full border border-line-strong bg-paper-raised px-3.5 text-xs text-ink outline-none focus:border-ink"
                      >
                        {notebooks.length === 0 ? (
                          <option value="">
                            {notebooksLoading
                              ? "Loading notebooks…"
                              : "No notebooks found"}
                          </option>
                        ) : (
                          notebooks.map((nb) => (
                            <option key={nb.name} value={nb.name}>
                              {nb.displayName}
                            </option>
                          ))
                        )}
                      </select>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="outline"
                        onClick={() => void refreshNotebooks()}
                        disabled={notebooksLoading}
                        aria-label="Refresh notebooks"
                        className="cursor-pointer shrink-0"
                      >
                        <RefreshCw
                          className={cn(
                            "size-3.5",
                            notebooksLoading && "animate-spin"
                          )}
                          aria-hidden
                        />
                      </Button>
                    </div>
                    {notebooksError ? (
                      <p className="text-[11px] text-wrong">{notebooksError}</p>
                    ) : null}
                  </div>
                )}
              </div>

              {/* Format choice */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-ink-soft">Source format:</span>
                <div className="inline-flex rounded-full border border-line bg-paper-raised p-0.5">
                  <button
                    type="button"
                    onClick={() => setSourceFormat("markdown")}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer",
                      sourceFormat === "markdown"
                        ? "bg-sun-wash text-ink"
                        : "text-ink-soft hover:text-ink"
                    )}
                  >
                    Full Markdown notes
                  </button>
                  <button
                    type="button"
                    onClick={() => setSourceFormat("url")}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer",
                      sourceFormat === "url"
                        ? "bg-sun-wash text-ink"
                        : "text-ink-soft hover:text-ink"
                    )}
                  >
                    Public page URL
                  </button>
                </div>
              </div>

              {pushError ? (
                <div className="rounded-2xl border border-[color:var(--wrong)]/25 bg-wrong-wash px-3.5 py-2.5 text-xs text-wrong space-y-2">
                  <p>{pushError}</p>
                  {pushErrorCode === "ACCOUNT_NOT_INITIALIZED" ? (
                    <a
                      href={NOTEBOOKLM_WEB_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-medium underline underline-offset-3"
                    >
                      <span>Open notebooklm.google.com</span>
                      <ExternalLink className="size-3" aria-hidden />
                    </a>
                  ) : pushErrorCode === "AUTH_EXPIRED" ? (
                    <button
                      type="button"
                      onClick={() => signIn()}
                      className="inline-flex items-center gap-1 font-medium underline underline-offset-3 cursor-pointer"
                    >
                      Sign in again
                    </button>
                  ) : null}
                </div>
              ) : null}

              <div className="flex items-center justify-end gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    pushing ||
                    sourceCount === 0 ||
                    (targetMode === "existing" && !selectedNotebookName)
                  }
                  onClick={handlePush}
                  className="cursor-pointer"
                >
                  <NotebookLmIcon className="size-3.5" />
                  <span>
                    {pushing
                      ? "Sending to NotebookLM…"
                      : `Send ${sourceCount} ${sourceCount === 1 ? "source" : "sources"} to NotebookLM`}
                  </span>
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </GoogleNotebookContext.Provider>
  );
}
