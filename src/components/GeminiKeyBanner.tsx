"use client";

import { useId, useState } from "react";
import { Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import { GeminiIcon } from "@/components/AiBrandIcons";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  copyTextWithGesture,
  verifyGeminiKey,
  type GeminiKeyPersistence,
} from "@/lib/ai-client";
import { GEMINI_WEB_URL } from "@/lib/ai-links";

const AI_STUDIO_KEY_URL = "https://aistudio.google.com/app/apikey";

export function GeminiKeyBanner({
  configured,
  sessionKey,
  persistence,
  onSaveKey,
  onClearKey,
  fallbackPrompt,
  onWarmFallback,
  compact = false,
}: {
  configured: boolean | null;
  sessionKey: string;
  persistence: GeminiKeyPersistence | null;
  onSaveKey: (key: string, persistence: GeminiKeyPersistence) => void;
  onClearKey: () => void;
  fallbackPrompt?: string | (() => string | Promise<string>);
  onWarmFallback?: () => void;
  compact?: boolean;
}) {
  const checkboxId = useId();
  const [draftKey, setDraftKey] = useState("");
  const [remember, setRemember] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [copiedFallback, setCopiedFallback] = useState(false);

  if (configured !== false) {
    return null;
  }

  if (sessionKey) {
    return (
      <div
        className={`flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-right/30 bg-right-wash/45 ${
          compact ? "px-3.5 py-2.5" : "px-4 py-3"
        } text-xs text-ink`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-right/15 text-right">
            <Check className="h-3.5 w-3.5" />
          </span>
          <span className="font-medium">Connected to Gemini</span>
          <span className="rounded-full border border-line bg-paper-raised/85 px-2 py-0.5 font-mono text-[11px] text-ink-soft">
            {persistence === "session" ? "This tab only" : "Saved in browser"}
          </span>
        </div>
        <button
          type="button"
          onClick={onClearKey}
          className="rounded-full px-2.5 py-1 text-xs font-medium text-ink-soft transition-colors hover:bg-wrong-wash/60 hover:text-wrong cursor-pointer"
        >
          Disconnect
        </button>
      </div>
    );
  }

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = draftKey.trim();
    if (!trimmed || verifying) return;

    setVerifying(true);
    setVerifyError(null);
    const result = await verifyGeminiKey(trimmed);
    setVerifying(false);

    if (!result.ok) {
      setVerifyError(
        result.error ||
          "Could not verify this API key. Check Google AI Studio and try again."
      );
      return;
    }

    const persistenceChoice: GeminiKeyPersistence = remember
      ? "local"
      : "session";
    setDraftKey("");
    onSaveKey(trimmed, persistenceChoice);
  }

  function handleOpenWebFallback() {
    const copyPromise = fallbackPrompt
      ? copyTextWithGesture(
          typeof fallbackPrompt === "function"
            ? fallbackPrompt()
            : fallbackPrompt
        )
      : null;
    window.open(GEMINI_WEB_URL, "_blank", "noopener,noreferrer");
    if (copyPromise) {
      void copyPromise.then((copied) => {
        if (!copied) return;
        setCopiedFallback(true);
        window.setTimeout(() => setCopiedFallback(false), 2200);
      });
    }
  }

  return (
    <div
      className={`rounded-2xl border border-line-strong bg-sun-wash/35 ${
        compact ? "p-3.5" : "p-4"
      } text-ink`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <GeminiIcon className="h-4 w-4 shrink-0 text-ink" />
          <h3 className="font-display text-sm font-semibold tracking-tight text-ink">
            Connect Gemini
          </h3>
        </div>
        <a
          href={AI_STUDIO_KEY_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-full border border-line-strong bg-paper-raised px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:border-ink/40 hover:bg-sun-wash/60"
        >
          <span>Get free API key</span>
          <ExternalLink className="h-3 w-3 opacity-75" />
        </a>
      </div>

      <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">
        Sign in to Google AI Studio, create a free Gemini API key, and paste it
        below for live Q&amp;A and Audio Overviews.
      </p>

      <form
        onSubmit={handleConnect}
        className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center"
      >
        <Input
          type="password"
          autoComplete="off"
          spellCheck={false}
          aria-label="Gemini API key"
          placeholder="Paste your Gemini API key (AIza…)"
          value={draftKey}
          onChange={(e) => {
            setDraftKey(e.target.value);
            if (verifyError) setVerifyError(null);
          }}
          disabled={verifying}
          className="h-9 flex-1 rounded-full border-line-strong bg-paper-raised px-3.5 font-mono text-xs text-ink placeholder:font-sans placeholder:text-ink-soft/75"
        />
        <Button
          type="submit"
          size="sm"
          disabled={verifying || !draftKey.trim()}
          className="h-9 shrink-0 rounded-full px-4 cursor-pointer"
        >
          {verifying ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Connecting…</span>
            </>
          ) : (
            <span>Connect</span>
          )}
        </Button>
      </form>

      {verifyError && (
        <p
          role="alert"
          className="mt-2 rounded-xl border border-wrong/30 bg-wrong-wash/60 px-3 py-2 text-xs text-wrong"
        >
          {verifyError}
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id={checkboxId}
            checked={remember}
            onCheckedChange={(checked) => setRemember(checked === true)}
            disabled={verifying}
          />
          <label
            htmlFor={checkboxId}
            className="cursor-pointer select-none text-xs text-ink-soft"
          >
            Remember on this browser
          </label>
        </div>

        {fallbackPrompt && (
          <button
            type="button"
            onMouseEnter={() => onWarmFallback?.()}
            onFocus={() => onWarmFallback?.()}
            onClick={handleOpenWebFallback}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft underline-offset-4 transition-colors hover:text-ink hover:underline cursor-pointer"
          >
            {copiedFallback ? (
              <>
                <Check className="h-3.5 w-3.5 text-right" />
                <span>Copied prompt &amp; opening gemini.google.com</span>
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                <span>Copy prompt &amp; open gemini.google.com</span>
                <ExternalLink className="h-3 w-3 opacity-70" />
              </>
            )}
          </button>
        )}
      </div>

      <p className="mt-2.5 text-[11px] leading-relaxed text-ink-soft/85">
        Your key stays in your browser and is never stored on C++ Atlas servers.
      </p>
    </div>
  );
}
