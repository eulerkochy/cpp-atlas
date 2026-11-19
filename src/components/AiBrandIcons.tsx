import { cn } from "@/lib/utils";

interface IconProps {
  className?: string;
}

export function GeminiIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={cn("size-3.5 shrink-0", className)}
    >
      <path
        d="M12 2C12.4 7.3 16.7 11.6 22 12C16.7 12.4 12.4 16.7 12 22C11.6 16.7 7.3 12.4 2 12C7.3 11.6 11.6 7.3 12 2Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function ChatGptIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn("size-3.5 shrink-0", className)}
    >
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.5a4.5 4.5 0 0 1 4.2 2.9 4.5 4.5 0 0 1 4.6 5.6 4.5 4.5 0 0 1-2.5 5.4 4.5 4.5 0 0 1-6.3 5.1 4.5 4.5 0 0 1-6.3-5.1A4.5 4.5 0 0 1 3.2 11a4.5 4.5 0 0 1 4.6-5.6A4.5 4.5 0 0 1 12 2.5Z" />
      <path d="M12 8.8V3.2M14.8 10.4l4.8-2.8M14.8 13.6l4.8 2.8M12 15.2v5.6M9.2 13.6l-4.8 2.8M9.2 10.4 4.4 7.6" />
    </svg>
  );
}

export function ClaudeIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
      className={cn("size-3.5 shrink-0", className)}
    >
      <path d="M12 2.5v19M3.8 7.2l16.4 9.6M20.2 7.2 3.8 16.8M6.5 3.8l11 16.4M17.5 3.8l-11 16.4" />
    </svg>
  );
}

export function NotebookLmIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn("size-3.5 shrink-0", className)}
    >
      <path d="M3 17a9 9 0 0 1 18 0" />
      <path d="M6.5 17a5.5 5.5 0 0 1 11 0" />
      <path d="M10 17a2 2 0 0 1 4 0" />
    </svg>
  );
}

export function GoogleIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={cn("size-3.5 shrink-0", className)}
    >
      <path
        d="M21.35 12.23c0-.68-.06-1.36-.18-2.02H12v3.83h5.25a4.5 4.5 0 0 1-1.95 2.95v2.45h3.15c1.85-1.7 2.9-4.21 2.9-7.21Z"
        fill="currentColor"
      />
      <path
        d="M12 21.75c2.63 0 4.84-.87 6.45-2.31l-3.15-2.45c-.87.58-1.99.93-3.3.93-2.54 0-4.69-1.71-5.46-4.02H3.29v2.52A9.75 9.75 0 0 0 12 21.75Z"
        fill="currentColor"
        opacity="0.82"
      />
      <path
        d="M6.54 13.9a5.83 5.83 0 0 1 0-3.8V7.58H3.29a9.76 9.76 0 0 0 0 8.84l3.25-2.52Z"
        fill="currentColor"
        opacity="0.68"
      />
      <path
        d="M12 6.08c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.83 3.18 14.63 2.25 12 2.25A9.75 9.75 0 0 0 3.29 7.58l3.25 2.52C7.31 7.79 9.46 6.08 12 6.08Z"
        fill="currentColor"
        opacity="0.9"
      />
    </svg>
  );
}
