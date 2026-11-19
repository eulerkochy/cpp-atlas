"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, KeyRound, X } from "lucide-react";
import { GeminiIcon } from "@/components/AiBrandIcons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GEMINI_WEB_URL } from "@/lib/ai-links";

export function GeminiKeyBanner({
  configured,
  sessionKey,
  onSaveKey,
  onClearKey,
  fallbackPrompt,
  compact = false,
}: {
  configured: boolean | null;
  sessionKey: string;
  onSaveKey: (key: string) => void;
  onClearKey: () => void;
  fallbackPrompt?: string;
  compact?: boolean;
}) {
  const [draftKey, setDraftKey] = useState("");
  const [copiedWeb, setCopiedWeb] = useState(false);

  if (configured !== false) return null;

  if (sessionKey) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-paper-sunk/70 px-3 py-2 text-xs text-ink-soft">
        <span className="inline-flex items-center gap-1.5">
          <KeyRound className="size-3.5 text-ink" aria-hidden />
          <span>Using your session Gemini API key</span>
        </span>
        <button
          type="button"
          onClick={onClearKey}
          className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft underline decoration-line-strong underline-offset-3 hover:text-ink cursor-pointer"
        >
          <X className="size-3" aria-hidden />
          <span>Clear key</span>
        </button>
      </div>
    );
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = draftKey.trim();
    if (!cleaned) return;
    onSaveKey(cleaned);
    setDraftKey("");
  };

  const handleOpenWebGemini = async () => {
    if (fallbackPrompt) {
      try {
        await navigator.clipboard.writeText(fallbackPrompt);
        setCopiedWeb(true);
        window.setTimeout(() => setCopiedWeb(false), 2600);
      } catch {
        // Ignore clipboard rejection
      }
    }
    window.open(GEMINI_WEB_URL, "_blank", "noopener,noreferrer");
  };

  return (
    <div
      className={
        compact
          ? "space-y-2.5 rounded-2xl border border-line bg-sun-wash/60 p-3 text-xs text-ink-body"
          : "space-y-3 rounded-2xl border border-line bg-sun-wash/60 p-4 text-xs text-ink-body"
      }
    >
      <div className="flex items-start gap-2">
        <GeminiIcon className="mt-0.5 size-4 text-ink" />
        <div className="min-w-0 space-y-1">
          <p className="font-medium text-ink">
            Connect Gemini to run live Q&amp;A and Audio Overviews here
          </p>
          <p className="leading-relaxed text-ink-soft">
            Paste a temporary Gemini API key for this browser session, or open{" "}
            <span className="font-mono text-ink">gemini.google.com</span> with
            your grounded prompt copied.
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="flex flex-wrap items-center gap-2">
        <Input
          type="password"
          value={draftKey}
          onChange={(e) => setDraftKey(e.target.value)}
          placeholder="AIza… (stored in sessionStorage only)"
          aria-label="Temporary Gemini API key"
          className="h-8 min-w-[12rem] flex-1 rounded-full border-line-strong bg-paper px-3 font-mono text-xs text-ink"
        />
        <Button
          type="submit"
          size="xs"
          disabled={!draftKey.trim()}
          className="cursor-pointer"
        >
          Use for session
        </Button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
        {fallbackPrompt ? (
          <button
            type="button"
            onClick={handleOpenWebGemini}
            className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line-strong bg-paper-raised px-3 text-xs font-medium text-ink transition-colors hover:border-ink/40 cursor-pointer"
          >
            {copiedWeb ? (
              <Check
                className="size-3.5 text-[color:var(--right)]"
                aria-hidden
              />
            ) : (
              <Copy className="size-3.5" aria-hidden />
            )}
            <span>
              {copiedWeb
                ? "Copied — press ⌘V in Gemini"
                : "Copy prompt & open gemini.google.com"}
            </span>
            <ExternalLink className="size-3 text-ink-faint" aria-hidden />
          </button>
        ) : null}

        <span className="text-[11px] text-ink-faint">
          Self-hosting: set{" "}
          <code className="font-mono text-ink">GEMINI_API_KEY</code> in{" "}
          <code className="font-mono text-ink">.env.local</code> or Vercel env
          vars.
        </span>
      </div>
    </div>
  );
}
