import type { ReactNode } from "react";

export function PageHeader({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <header className="mx-auto max-w-6xl px-4 pt-28 pb-12 sm:px-6 sm:pt-36">
      <h1 className="font-display text-[clamp(2.6rem,7vw,4.5rem)] leading-[1] font-[450] tracking-[-0.04em] text-ink">
        {title}
      </h1>
      {children ? (
        <div className="mt-5 max-w-[58ch] text-[1.125rem] leading-relaxed text-ink-soft">
          {children}
        </div>
      ) : null}
    </header>
  );
}
