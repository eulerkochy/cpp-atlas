import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The recurring surface: a browser/editor-like window with a slim title bar.
 * `size="code"` is the smaller variant used for code blocks.
 */
export function Window({
  title,
  actions,
  children,
  className,
  bodyClassName,
  size = "window",
  as: Tag = "div",
  ...rest
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  size?: "window" | "code";
  as?: "div" | "section" | "figure";
} & Omit<React.HTMLAttributes<HTMLElement>, "title">) {
  return (
    <Tag
      className={cn(
        "relative overflow-hidden border border-line bg-paper-raised shadow-window",
        size === "window"
          ? "rounded-[var(--radius-window)]"
          : "rounded-[var(--radius-panel)]",
        className
      )}
      {...rest}
    >
      <div
        className={cn(
          "flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line",
          size === "window" ? "min-h-11 px-4 py-1.5" : "min-h-9 px-3.5 py-1"
        )}
      >
        <span className="flex shrink-0 gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-ink/12" />
          <span className="size-2.5 rounded-full bg-ink/12" />
          <span className="size-2.5 rounded-full bg-ink/12" />
        </span>
        {title ? (
          <span className="min-w-0 flex-[1_1_5rem] truncate font-mono text-xs text-ink-soft">
            {title}
          </span>
        ) : null}
        {actions ? (
          <div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2">
            {actions}
          </div>
        ) : null}
      </div>
      <div className={bodyClassName}>{children}</div>
    </Tag>
  );
}
