"use client";

import { useEffect, useRef, useState } from "react";
import {
  MapPreviewSvg,
  type MapPreviewGeometry,
} from "@/components/MapPreview";

let cachedMapGeometries: Record<string, MapPreviewGeometry> | null = null;
let inflightMapGeometries: Promise<Record<string, MapPreviewGeometry>> | null =
  null;

function loadMapGeometries(): Promise<Record<string, MapPreviewGeometry>> {
  if (cachedMapGeometries) {
    return Promise.resolve(cachedMapGeometries);
  }
  if (inflightMapGeometries) {
    return inflightMapGeometries;
  }

  inflightMapGeometries = fetch("/api/topics/maps")
    .then(async (res) => {
      if (!res.ok) {
        throw new Error(`Failed to load map previews (${res.status})`);
      }
      const data = (await res.json()) as Record<string, MapPreviewGeometry>;
      cachedMapGeometries = data;
      return data;
    })
    .finally(() => {
      inflightMapGeometries = null;
    });

  return inflightMapGeometries;
}

export function FolioMapPreview({
  slug,
  className,
}: {
  slug: string;
  className?: string;
}) {
  const [geometry, setGeometry] = useState<MapPreviewGeometry | null>(
    () => cachedMapGeometries?.[slug] ?? null
  );
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (geometry) return;
    let cancelled = false;

    const triggerLoad = () => {
      void loadMapGeometries()
        .then((all) => {
          if (!cancelled) {
            setGeometry(all[slug] ?? null);
          }
        })
        .catch(() => {
          // Leave calm placeholder if preview fetch fails
        });
    };

    const el = containerRef.current;
    if (typeof IntersectionObserver === "undefined" || !el) {
      triggerLoad();
      return () => {
        cancelled = true;
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          triggerLoad();
        }
      },
      { rootMargin: "400px" }
    );
    observer.observe(el);

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [geometry, slug]);

  return (
    <div ref={containerRef} className={className ?? "h-32 w-full"}>
      {geometry ? (
        <MapPreviewSvg geometry={geometry} className="h-full w-full" />
      ) : (
        <div
          aria-hidden="true"
          className="h-full w-full rounded-sm bg-paper-sunk/40"
        />
      )}
    </div>
  );
}
