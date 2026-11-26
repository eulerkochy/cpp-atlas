"use client";

import { Suspense, type ReactNode } from "react";
import { usePathname, useSelectedLayoutSegment } from "next/navigation";

function isCourseRailRoute(pathname: string): boolean {
  if (!pathname.startsWith("/build/")) return false;
  return pathname !== "/build/connected" && !pathname.startsWith("/build/connected/");
}

function ChromeSlot({ children }: { children: ReactNode }) {
  const segment = useSelectedLayoutSegment();
  const pathname = usePathname();
  if (segment === "scroll" || isCourseRailRoute(pathname)) {
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
