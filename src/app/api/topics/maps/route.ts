import { NextResponse } from "next/server";
import {
  buildMapPreviewGeometry,
  type MapPreviewGeometry,
} from "@/components/MapPreview";
import { getTracks } from "@/lib/topics";

export async function GET() {
  const geometries: Record<string, MapPreviewGeometry> = {};

  for (const track of getTracks()) {
    for (const topic of track.topics) {
      if (topic.map?.root) {
        geometries[topic.slug] = buildMapPreviewGeometry(topic.map.root);
      }
    }
  }

  return NextResponse.json(geometries, {
    headers: {
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
