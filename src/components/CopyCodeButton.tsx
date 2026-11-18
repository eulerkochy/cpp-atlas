"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { openInGodbolt } from "@/lib/godbolt";
import { cn } from "@/lib/utils";

export function CopyCodeButton({
  code,
  lang = "cpp",
  showGodbolt = true,
}: {
  code: string;
  lang?: "cpp" | "c";
  showGodbolt?: boolean;
}) {
  const [state, setState] = useState<"idle" | "done" | "error">("idle");

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(code.replace(/\n+$/, ""));
      setState("done");
    } catch {
      setState("error");
    }
    window.setTimeout(() => setState("idle"), 1800);
  }

  const copyBtn = (
    <button
      type="button"
      onClick={onCopy}
      aria-label="Copy code"
      className={cn(
        "h-7 rounded-full px-2.5 font-sans text-xs font-medium transition-colors cursor-pointer",
        state === "idle" && "text-ink-soft hover:bg-ink/5 hover:text-ink",
        state === "done" && "text-[color:var(--right)]",
        state === "error" && "text-wrong"
      )}
    >
      {state === "done" ? "Copied" : state === "error" ? "Copy failed" : "Copy"}
    </button>
  );

  if (!showGodbolt) {
    return copyBtn;
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => openInGodbolt(code, { lang })}
        aria-label="Open in Compiler Explorer"
        className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 font-sans text-xs font-medium text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink cursor-pointer"
      >
        <ExternalLink className="size-3" aria-hidden />
        <span>Compiler Explorer</span>
      </button>
      {copyBtn}
    </div>
  );
}
