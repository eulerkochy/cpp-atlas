"use client";

import { Suspense, type ReactNode } from "react";
import { useSelectedLayoutSegment } from "next/navigation";

function ChromeSlot({ children }: { children: ReactNode }) {
  const segment = useSelectedLayoutSegment();
  if (segment === "scroll") {
    return null;
  }
  return <>{children}</>;
}

export function SiteChrome({
  header,
  footer,
  children,
}: {
  header: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <Suspense fallback={header}>
        <ChromeSlot>{header}</ChromeSlot>
      </Suspense>
      <main id="main" className="flex-1">
        {children}
      </main>
      <Suspense fallback={footer}>
        <ChromeSlot>{footer}</ChromeSlot>
      </Suspense>
    </>
  );
}
