import type { ReactNode } from "react";

export function PageHeader({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="mx-auto max-w-6xl px-4 pt-28 pb-12 sm:px-6 sm:pt-36">
      <div className="flex flex-wrap items-center gap-3.5 sm:gap-4">
        {icon ? <span className="shrink-0">{icon}</span> : null}
        <h1 className="font-display text-[clamp(2.6rem,7vw,4.5rem)] leading-[1] font-[450] tracking-[-0.04em] text-ink">
          {title}
        </h1>
      </div>
      {children ? (
        <div className="mt-5 max-w-[58ch] text-[1.125rem] leading-relaxed text-ink-soft">
          {children}
        </div>
      ) : null}
    </header>
  );
}
