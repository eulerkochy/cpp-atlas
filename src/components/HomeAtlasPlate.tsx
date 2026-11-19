"use client";

import { WorldAtlas } from "@/components/WorldAtlas";
import type { AtlasMap } from "@/components/atlas-map-geometry";
import type { AtlasRegionData } from "@/lib/atlas-data";

export type AtlasTopic = AtlasRegionData["tracks"][number]["topics"][number];
export type AtlasRegion = AtlasRegionData;

/**
 * The home page's interactive World Atlas plate. Wraps `<WorldAtlas mode="home" />`
 * inside a double-ruled cartographic folio frame.
 */
export function HomeAtlasPlate({
  regions,
  map,
}: {
  regions: AtlasRegionData[];
  /** Built on the server by `getAtlasPayload()`. */
  map: AtlasMap;
}) {
  return <WorldAtlas regions={regions} map={map} mode="home" />;
}
