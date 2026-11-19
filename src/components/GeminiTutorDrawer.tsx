"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowUp,
  Check,
  Copy,
  ExternalLink,
  Headphones,
  RotateCcw,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { GeminiIcon, NotebookLmIcon } from "@/components/AiBrandIcons";
import { AiMarkdown } from "@/components/AiMarkdown";
import { GeminiKeyBanner } from "@/components/GeminiKeyBanner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  fetchAiStatus,
  streamAiSse,
  useSessionGeminiKey,
  type GeminiKeyPersistence,
} from "@/lib/ai-client";
import {
  buildExternalPrompt,
  buildStudioHref,
  contextToSourceRef,
  GEMINI_WEB_URL,
  type AiPageContext,
} from "@/lib/ai-links";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  streaming?: boolean;
}

interface TutorContextValue {
  openTutor: (ctx: AiPageContext, initialPrompt?: string) => void;
}

const TutorContext = createContext<TutorContextValue | null>(null);

const STARTER_PROMPTS = [
  "Explain the core mental model",
  "What are the nastiest UB or edge-case traps?",
  "Show a minimal C++23 example",
  "Quiz me with one standard-lawyer question",
];

export function useGeminiTutor(): TutorContextValue {
  const ctx = useContext(TutorContext);
  if (!ctx) {
    throw new Error("useGeminiTutor must be used inside GeminiTutorProvider");
  }
  return ctx;
}

export function GeminiTutorProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pageCtx, setPageCtx] = useState<AiPageContext | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [interactionId, setInteractionId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectNotice, setConnectNotice] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [chatModel, setChatModel] = useState("gemini-4-hydrogen");
  const {
    key: sessionKey,
    persistence,
    setKey: saveSessionKey,
    clearKey: clearSessionKey,
  } = useSessionGeminiKey();
  const [copiedWebPrompt, setCopiedWebPrompt] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const activeUrlRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || configured !== null) return;
    let cancelled = false;
    fetchAiStatus()
      .then((status) => {
        if (cancelled) return;
        setConfigured(status.configured);
        setChatModel(status.chatModel);
      })
      .catch(() => {
        if (!cancelled) setConfigured(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, configured]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, error, streaming]);

  const stopStream = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
    setMessages((prev) =>
      prev.map((m) => (m.streaming ? { ...m, streaming: false } : m))
    );
  }, []);

  const sendMessage = useCallback(
    async (
      promptText: string,
      targetCtx: AiPageContext,
      currentHistory: ChatMessage[],
      prevInteractionId: string | null,
      keyOverride?: string
    ) => {
      const cleaned = promptText.trim();
      if (!cleaned) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const userId = `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const assistantId = `a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      setError(null);
      setStreaming(true);
      setMessages([
        ...currentHistory,
        { id: userId, role: "user", text: cleaned },
        { id: assistantId, role: "assistant", text: "", streaming: true },
      ]);

      try {
        await streamAiSse({
          url: "/api/ai/chat",
          sessionKey: keyOverride ?? sessionKey,
          signal: controller.signal,
          body: {
            sources: [contextToSourceRef(targetCtx)],
            message: cleaned,
            previousInteractionId: prevInteractionId ?? undefined,
            history: currentHistory.map((m) => ({ role: m.role, text: m.text })),
            mode: "tutor",
            includeQuizAnswers: true,
          },
          onMeta: (meta) => {
            if (meta.interactionId) {
              setInteractionId(meta.interactionId);
            }
          },
          onDelta: (chunk) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, text: m.text + chunk } : m
              )
            );
          },
          onDone: (done) => {
            if (done.interactionId) {
              setInteractionId(done.interactionId);
            }
          },
        });

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, streaming: false } : m
          )
        );
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, streaming: false } : m
            )
          );
          return;
        }
        const typedErr = err as Error & { code?: string };
        if (typedErr.code === "MISSING_API_KEY") {
          setConfigured(false);
        }
        setError(typedErr.message || "Failed to contact Gemini.");
        setMessages((prev) =>
          prev.filter((m) => !(m.id === assistantId && !m.text))
        );
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
        setStreaming(false);
      }
    },
    [sessionKey]
  );

  const openTutor = useCallback(
    (ctx: AiPageContext, initialPrompt?: string) => {
      const switchedPage = activeUrlRef.current !== ctx.urlPath;
      if (switchedPage) {
        abortRef.current?.abort();
        abortRef.current = null;
        activeUrlRef.current = ctx.urlPath;
        setPageCtx(ctx);
        setMessages([]);
        setInteractionId(null);
        setError(null);
        setConnectNotice(null);
        setStreaming(false);
      } else {
        setPageCtx(ctx);
      }
      setOpen(true);

      if (initialPrompt?.trim()) {
        const currentMsgs = switchedPage ? [] : messages;
        const currentPrevId = switchedPage ? null : interactionId;
        const hasKey = configured === true || Boolean(sessionKey.trim());
        if (hasKey) {
          setConnectNotice(null);
          void sendMessage(initialPrompt, ctx, currentMsgs, currentPrevId);
        } else {
          setDraft(initialPrompt);
          setConnectNotice("Connect Gemini above to send this prompt.");
        }
      }
    },
    [configured, interactionId, messages, sendMessage, sessionKey]
  );

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      stopStream();
    }
    setOpen(nextOpen);
  };

  const handleSaveKey = (
    newKey: string,
    nextPersistence: GeminiKeyPersistence
  ) => {
    saveSessionKey(newKey, nextPersistence);
    setError(null);
    setConnectNotice(null);
  };

  const handleClearKey = () => {
    clearSessionKey();
  };

  const handleOpenGeminiWeb = async () => {
    if (!pageCtx) return;
    try {
      await navigator.clipboard.writeText(buildExternalPrompt(pageCtx));
      setCopiedWebPrompt(true);
      window.setTimeout(() => setCopiedWebPrompt(false), 2400);
    } catch {
      // Ignore clipboard rejection
    }
    window.open(GEMINI_WEB_URL, "_blank", "noopener,noreferrer");
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!pageCtx || streaming || !draft.trim()) return;
    const hasKey = configured === true || Boolean(sessionKey.trim());
    if (!hasKey) {
      setConnectNotice("Connect Gemini above to send this prompt.");
      return;
    }
    const prompt = draft;
    setDraft("");
    setConnectNotice(null);
    void sendMessage(prompt, pageCtx, messages, interactionId);
  };

  const fallbackPrompt = pageCtx ? buildExternalPrompt(pageCtx) : undefined;
  const kindLabel =
    pageCtx?.kind === "topic"
      ? "Study topic"
      : pageCtx?.lang === "c"
        ? "C reference"
        : "C++ reference";

  return (
    <TutorContext.Provider value={{ openTutor }}>
      {children}

      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="data-[side=right]:w-full data-[side=right]:sm:max-w-xl border-line bg-paper p-0 gap-0"
        >
          {/* Drawer Header */}
          <div className="border-b border-line bg-paper-raised px-5 pt-4 pb-3.5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="inline-flex size-6 items-center justify-center rounded-full bg-sun text-ink">
                    <GeminiIcon className="size-3.5" />
                  </span>
                  <SheetTitle className="font-display text-lg font-[450] tracking-[-0.02em] text-ink">
                    Ask Gemini
                  </SheetTitle>
                  {pageCtx ? (
                    <span className="rounded-[var(--radius-chip)] bg-sun-wash px-2 py-0.5 text-[11px] font-medium text-ink">
                      {kindLabel}
                    </span>
                  ) : null}
                </div>

                {pageCtx ? (
                  <p className="truncate font-mono text-xs text-ink-soft">
                    {pageCtx.title}
                  </p>
                ) : null}

                {pageCtx?.clauses && pageCtx.clauses.length > 0 ? (
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {pageCtx.clauses.slice(0, 3).map((clause) => (
                      <span
                        key={clause}
                        className="rounded-[var(--radius-chip)] border border-line bg-paper px-1.5 py-0.5 font-mono text-[10px] text-ink-faint"
                      >
                        {clause}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              <SheetClose
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Close Ask Gemini drawer"
                    className="shrink-0 cursor-pointer"
                  />
                }
              >
                <X className="size-4" />
              </SheetClose>
            </div>

            {pageCtx ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <Link
                  href={buildStudioHref(pageCtx)}
                  onClick={() => handleOpenChange(false)}
                  className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line-strong bg-paper px-2.5 text-xs font-medium text-ink transition-colors hover:border-ink/40"
                >
                  <NotebookLmIcon className="size-3" />
                  <span>Open in Studio</span>
                </Link>

                <Link
                  href={buildStudioHref(pageCtx, "audio")}
                  onClick={() => handleOpenChange(false)}
                  className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line-strong bg-paper px-2.5 text-xs font-medium text-ink transition-colors hover:border-ink/40"
                >
                  <Headphones className="size-3" aria-hidden />
                  <span>Audio Overview</span>
                </Link>

                <button
                  type="button"
                  onClick={handleOpenGeminiWeb}
                  className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink cursor-pointer"
                >
                  {copiedWebPrompt ? (
                    <Check
                      className="size-3 text-[color:var(--right)]"
                      aria-hidden
                    />
                  ) : (
                    <Copy className="size-3" aria-hidden />
                  )}
                  <span>
                    {copiedWebPrompt ? "Copied — ⌘V in Gemini" : "gemini.google.com"}
                  </span>
                  <ExternalLink className="size-2.5" aria-hidden />
                </button>

                {messages.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      stopStream();
                      setMessages([]);
                      setInteractionId(null);
                      setError(null);
                    }}
                    className="ml-auto inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs text-ink-faint hover:bg-ink/5 hover:text-ink cursor-pointer"
                  >
                    <RotateCcw className="size-3" aria-hidden />
                    <span>New chat</span>
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Scrollable Message Thread */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            <GeminiKeyBanner
              configured={configured}
              sessionKey={sessionKey}
              persistence={persistence}
              onSaveKey={handleSaveKey}
              onClearKey={handleClearKey}
              fallbackPrompt={fallbackPrompt}
              compact
            />

            {messages.length === 0 && pageCtx ? (
              <div className="space-y-4 pt-2">
                <div className="rounded-2xl border border-line bg-paper-raised p-4 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-ink">
                    <Sparkles className="size-3.5 text-ink-soft" aria-hidden />
                    <span>Grounded on this page</span>
                  </div>
                  <p className="text-xs leading-relaxed text-ink-soft">
                    Ask anything about{" "}
                    <strong className="font-medium text-ink">
                      {pageCtx.title}
                    </strong>
                    . Answers draw directly from its C++ Atlas notes, examples,
                    and ISO clause traps.
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="text-[11px] font-medium uppercase tracking-wider text-ink-faint">
                    Try asking
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {STARTER_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        disabled={streaming}
                        onClick={() => {
                          const hasKey =
                            configured === true || Boolean(sessionKey.trim());
                          if (!hasKey) {
                            setDraft(prompt);
                            setConnectNotice(
                              "Connect Gemini above to send this prompt."
                            );
                            return;
                          }
                          setConnectNotice(null);
                          void sendMessage(
                            prompt,
                            pageCtx,
                            messages,
                            interactionId
                          );
                        }}
                        className="rounded-full border border-line-strong bg-paper-raised px-3 py-1.5 text-left text-xs text-ink transition-colors hover:border-ink/40 hover:bg-sun-wash/50 cursor-pointer disabled:opacity-50"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex flex-col gap-1",
                  msg.role === "user" ? "items-end" : "items-start"
                )}
              >
                <span className="px-1 text-[10px] font-medium uppercase tracking-wider text-ink-faint">
                  {msg.role === "user" ? "You" : "Gemini"}
                </span>
                {msg.role === "user" ? (
                  <div className="max-w-[85%] rounded-2xl bg-sun-wash px-3.5 py-2.5 text-sm leading-relaxed text-ink">
                    {msg.text}
                  </div>
                ) : (
                  <div className="w-full rounded-2xl border border-line bg-paper-raised px-4 py-3">
                    {msg.text ? (
                      <AiMarkdown content={msg.text} />
                    ) : (
                      <div className="flex items-center gap-2 text-xs text-ink-faint">
                        <span className="size-1.5 animate-pulse rounded-full bg-sun-deep" />
                        <span>Reading page context…</span>
                      </div>
                    )}
                    {msg.streaming && msg.text ? (
                      <span className="mt-1 inline-block h-3.5 w-1.5 animate-pulse rounded-xs bg-ink/40 align-middle" />
                    ) : null}
                  </div>
                )}
              </div>
            ))}

            {error ? (
              <div className="rounded-2xl border border-[color:var(--wrong)]/25 bg-wrong-wash px-3.5 py-2.5 text-xs text-wrong">
                {error}
              </div>
            ) : null}

            <div ref={bottomRef} />
          </div>

          {/* Composer Footer */}
          <form
            onSubmit={handleSubmit}
            className="border-t border-line bg-paper-raised px-5 py-3.5 space-y-2"
          >
            {connectNotice ? (
              <p className="rounded-xl border border-line-strong bg-sun-wash/45 px-3 py-1.5 text-xs text-ink-soft">
                {connectNotice}
              </p>
            ) : null}
            <div className="flex items-end gap-2">
              <Textarea
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  if (connectNotice) setConnectNotice(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder={
                  pageCtx
                    ? `Ask about ${pageCtx.title}…`
                    : "Ask a C++ question…"
                }
                rows={2}
                className="min-h-11 max-h-32 resize-none rounded-2xl border-line-strong bg-paper px-3.5 py-2.5 text-sm text-ink"
              />
              {streaming ? (
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={stopStream}
                  aria-label="Stop response"
                  className="shrink-0 cursor-pointer"
                >
                  <Square className="size-3.5" aria-hidden />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="icon"
                  disabled={!draft.trim() || !pageCtx}
                  aria-label="Send message"
                  className="shrink-0 cursor-pointer"
                >
                  <ArrowUp className="size-4" aria-hidden />
                </Button>
              )}
            </div>
            <div className="flex items-center justify-between text-[11px] text-ink-faint">
              <span>Grounded on this page · {chatModel}</span>
              <span>Enter to send · Shift+Enter for newline</span>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </TutorContext.Provider>
  );
}
