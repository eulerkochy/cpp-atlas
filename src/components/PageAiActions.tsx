"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink, Headphones } from "lucide-react";
import {
  ChatGptIcon,
  ClaudeIcon,
  GeminiIcon,
  GoogleIcon,
  NotebookLmIcon,
} from "@/components/AiBrandIcons";
import { useGeminiTutor } from "@/components/GeminiTutorDrawer";
import { useGoogleNotebook } from "@/components/GoogleNotebookProvider";
import { resolveBestPublicNotebookUrl } from "@/data/notebooks";
import {
  getCachedMarkdown,
  openExternalAiPage,
  prefetchMarkdown,
} from "@/lib/ai-client";
import {
  buildStudioHref,
  contextToSourceRef,
  type AiPageContext,
} from "@/lib/ai-links";

function useMarkdownClipboard(endpoint: string) {
  const [state, setState] = useState<"idle" | "done" | "error">("idle");

  const copyMarkdown = async () => {
    try {
      const cached = getCachedMarkdown(endpoint);
      let text = cached;
      if (text === null) {
        const res = await fetch(endpoint);
        if (!res.ok) throw new Error("Failed");
        text = await res.text();
      }
      await navigator.clipboard.writeText(text);
      setState("done");
    } catch {
      setState("error");
    }
    window.setTimeout(() => setState("idle"), 1800);
  };

  return { state, copyMarkdown };
}

function useExternalAiLaunchers(context: AiPageContext) {
  const [pendingTarget, setPendingTarget] = useState<
    "chatgpt" | "claude" | null
  >(null);
  const [copiedTarget, setCopiedTarget] = useState<"chatgpt" | "claude" | null>(
    null
  );
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const warm = () => {
    void prefetchMarkdown(context.markdownEndpoint);
  };

  const launch = async (target: "chatgpt" | "claude") => {
    if (pendingTarget) return;
    const needsFetch = getCachedMarkdown(context.markdownEndpoint) === null;
    if (needsFetch) {
      setPendingTarget(target);
    }
    try {
      const res = await openExternalAiPage(target, context);
      if (res.copiedFull && res.truncated) {
        setCopiedTarget(target);
        if (timerRef.current !== null) {
          window.clearTimeout(timerRef.current);
        }
        timerRef.current = window.setTimeout(() => {
          setCopiedTarget(null);
          timerRef.current = null;
        }, 2200);
      }
    } finally {
      if (needsFetch) {
        setPendingTarget(null);
      }
    }
  };

  return { pendingTarget, copiedTarget, warm, launch };
}

export function PageAiHeaderBar({ context }: { context: AiPageContext }) {
  const { openTutor } = useGeminiTutor();
  const { connected } = useGoogleNotebook();
  const { state: copyState, copyMarkdown } = useMarkdownClipboard(
    context.markdownEndpoint
  );
  const { pendingTarget, copiedTarget, warm, launch } =
    useExternalAiLaunchers(context);
  const studioHref = buildStudioHref(context);

  return (
    <div
      role="group"
      aria-label="Ask AI and NotebookLM actions"
      className="flex flex-wrap items-center gap-2"
    >
      <span className="hidden text-xs text-ink-faint sm:inline mr-0.5">
        Ask AI
      </span>

      <button
        type="button"
        onClick={() => openTutor(context)}
        className="inline-flex h-7 items-center gap-1.5 rounded-full border border-ink/15 bg-sun-wash/85 px-3 text-xs font-medium text-ink transition-colors hover:bg-sun-wash cursor-pointer"
      >
        <GeminiIcon className="size-3.5" />
        <span>Ask Gemini</span>
      </button>

      <button
        type="button"
        onMouseEnter={warm}
        onFocus={warm}
        onClick={() => void launch("chatgpt")}
        className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line-strong bg-paper-raised px-3 text-xs font-medium text-ink transition-colors hover:border-ink/40 cursor-pointer"
      >
        <ChatGptIcon className="size-3.5" />
        <span>
          {pendingTarget === "chatgpt"
            ? "Opening…"
            : copiedTarget === "chatgpt"
              ? "Full .md copied"
              : "Ask ChatGPT"}
        </span>
      </button>

      <button
        type="button"
        onMouseEnter={warm}
        onFocus={warm}
        onClick={() => void launch("claude")}
        className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line-strong bg-paper-raised px-3 text-xs font-medium text-ink transition-colors hover:border-ink/40 cursor-pointer"
      >
        <ClaudeIcon className="size-3.5" />
        <span>
          {pendingTarget === "claude"
            ? "Opening…"
            : copiedTarget === "claude"
              ? "Full .md copied"
              : "Ask Claude"}
        </span>
      </button>

      <Link
        href={studioHref}
        className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line-strong bg-paper-raised px-3 text-xs font-medium text-ink transition-colors hover:border-ink/40"
      >
        <NotebookLmIcon className="size-3.5" />
        <span>NotebookLM</span>
        {connected ? (
          <span
            aria-label="Google NotebookLM connected"
            className="size-1.5 rounded-full bg-[color:var(--right)]"
          />
        ) : null}
      </Link>

      <button
        type="button"
        onMouseEnter={warm}
        onFocus={warm}
        onClick={copyMarkdown}
        className="inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-ink-faint transition-colors hover:bg-ink/5 hover:text-ink cursor-pointer"
      >
        {copyState === "done" ? (
          <Check className="size-3 text-[color:var(--right)]" aria-hidden />
        ) : (
          <Copy className="size-3" aria-hidden />
        )}
        <span>
          {copyState === "done"
            ? "Copied .md"
            : copyState === "error"
              ? "Copy failed"
              : "Copy .md"}
        </span>
      </button>
    </div>
  );
}

export function PageAiRailWidget({ context }: { context: AiPageContext }) {
  const { openTutor } = useGeminiTutor();
  const { connected, user, openPushDialog } = useGoogleNotebook();
  const { state: copyState, copyMarkdown } = useMarkdownClipboard(
    context.markdownEndpoint
  );
  const { pendingTarget, copiedTarget, warm, launch } =
    useExternalAiLaunchers(context);

  const studioAudioHref = buildStudioHref(context, "audio");
  const publicNotebookUrl = resolveBestPublicNotebookUrl(context.trackId);

  const handleOpenPush = () => {
    openPushDialog({
      sources: [contextToSourceRef(context)],
      defaultTitle: `${context.title} — C++ Atlas`,
      includeQuizAnswers: true,
    });
  };

  return (
    <div className="space-y-3 border-t border-line pt-6">
      <div className="space-y-1">
        <p className="font-medium text-ink">AI &amp; NotebookLM</p>
        <p className="text-xs leading-relaxed text-ink-soft">
          Grounded Q&amp;A, two-host Audio Overviews, or ask an external model.
        </p>
      </div>

      <button
        type="button"
        onClick={() => openTutor(context)}
        className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-full border border-ink/15 bg-sun-wash px-3.5 text-xs font-medium text-ink transition-colors hover:brightness-95 cursor-pointer"
      >
        <GeminiIcon className="size-3.5" />
        <span>Ask Gemini on this page</span>
      </button>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onMouseEnter={warm}
          onFocus={warm}
          onClick={() => void launch("chatgpt")}
          className="inline-flex h-7 items-center justify-center gap-1.5 rounded-full border border-line-strong bg-paper-raised px-2.5 text-xs font-medium text-ink transition-colors hover:border-ink/40 cursor-pointer"
        >
          <ChatGptIcon className="size-3" />
          <span>
            {pendingTarget === "chatgpt"
              ? "Opening…"
              : copiedTarget === "chatgpt"
                ? "Full .md copied"
                : "ChatGPT"}
          </span>
          <ExternalLink className="size-2.5 text-ink-faint" aria-hidden />
        </button>

        <button
          type="button"
          onMouseEnter={warm}
          onFocus={warm}
          onClick={() => void launch("claude")}
          className="inline-flex h-7 items-center justify-center gap-1.5 rounded-full border border-line-strong bg-paper-raised px-2.5 text-xs font-medium text-ink transition-colors hover:border-ink/40 cursor-pointer"
        >
          <ClaudeIcon className="size-3" />
          <span>
            {pendingTarget === "claude"
              ? "Opening…"
              : copiedTarget === "claude"
                ? "Full .md copied"
                : "Claude"}
          </span>
          <ExternalLink className="size-2.5 text-ink-faint" aria-hidden />
        </button>
      </div>

      <div className="space-y-1.5">
        <button
          type="button"
          onClick={handleOpenPush}
          className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-full bg-ink px-3 text-xs font-medium text-paper transition-colors hover:bg-ink/85 cursor-pointer"
        >
          {connected ? (
            <NotebookLmIcon className="size-3.5" />
          ) : (
            <GoogleIcon className="size-3.5" />
          )}
          <span>Send to my NotebookLM</span>
          {connected && user ? (
            <span
              aria-hidden
              className="size-1.5 rounded-full bg-[color:var(--right)]"
            />
          ) : null}
        </button>

        <Link
          href={studioAudioHref}
          className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-full border border-line-strong bg-paper-raised px-3 text-xs font-medium text-ink transition-colors hover:border-ink/40"
        >
          <Headphones className="size-3.5" aria-hidden />
          <span>Audio Overview &amp; Studio</span>
        </Link>

        {publicNotebookUrl ? (
          <a
            href={publicNotebookUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-7 w-full items-center justify-center gap-1.5 rounded-full border border-line bg-paper px-3 text-xs font-medium text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
          >
            <NotebookLmIcon className="size-3" />
            <span>Public NotebookLM</span>
            <ExternalLink className="size-2.5" aria-hidden />
          </a>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-2.5 text-[11px] text-ink-faint">
        <button
          type="button"
          onMouseEnter={warm}
          onFocus={warm}
          onClick={copyMarkdown}
          className="hover:text-ink cursor-pointer"
        >
          {copyState === "done"
            ? "Copied .md"
            : copyState === "error"
              ? "Copy failed"
              : "Copy .md"}
        </button>
        <span aria-hidden>·</span>
        <a
          href={`${context.markdownEndpoint}?download=1`}
          className="hover:text-ink"
        >
          Download .md
        </a>
        <span aria-hidden>·</span>
        <a href={context.markdownEndpoint} className="hover:text-ink">
          Plain text
        </a>
      </div>
    </div>
  );
}
