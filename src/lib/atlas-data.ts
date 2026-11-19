import {
  buildAtlasMap,
  type AtlasMap,
  type MapRegionInput,
} from "@/components/atlas-map-geometry";
import { getTracks } from "@/lib/topics";
import { groupTracks } from "@/lib/track-groups";
import type { SimulatorKind } from "@/types/topics";

export interface AtlasTopicRef {
  title: string;
  path: string;
  href: string;
  local: boolean;
}

export interface AtlasTopicData {
  slug: string;
  title: string;
  summary: string;
  trackId: string;
  trackTitle: string;
  regionId: string;
  regionLabel: string;
  minutes: number;
  standard: string[];
  prerequisites: string[];
  simulator?: SimulatorKind;
  questionCount: number;
  questionIds: string[];
  cppreference: AtlasTopicRef[];
}

export interface AtlasTrackData {
  id: string;
  title: string;
  description: string;
  regionId: string;
  regionLabel: string;
  topics: AtlasTopicData[];
}

export interface AtlasRegionData {
  id: string;
  label: string;
  tracks: AtlasTrackData[];
}

export interface AtlasPayload {
  regions: AtlasRegionData[];
  map: AtlasMap;
}

let cachedAtlasPayload: AtlasPayload | undefined;

function buildAtlasPayload(): AtlasPayload {
  const rawTracks = getTracks().filter((track) => track.topics.length > 0);
  const grouped = groupTracks(rawTracks);

  const regions: AtlasRegionData[] = grouped.map((group) => ({
    id: group.id,
    label: group.label,
    tracks: group.tracks.map((track) => ({
      id: track.id,
      title: track.title,
      description: track.description,
      regionId: group.id,
      regionLabel: group.label,
      topics: track.topics.map((topic) => ({
        slug: topic.slug,
        title: topic.title,
        summary: topic.summary,
        trackId: track.id,
        trackTitle: track.title,
        regionId: group.id,
        regionLabel: group.label,
        minutes: topic.minutes,
        standard: topic.standard,
        prerequisites: topic.prerequisites,
        ...(topic.simulator ? { simulator: topic.simulator } : {}),
        questionCount: topic.questionCount,
        questionIds: topic.questionIds,
        cppreference: topic.cppreference.map((ref) => ({
          title: ref.title,
          path: ref.path,
          href: ref.href,
          local: ref.local,
        })),
      })),
    })),
  }));

  const mapInput: MapRegionInput[] = regions.map((region) => ({
    id: region.id,
    label: region.label,
    tracks: region.tracks.map((track) => ({
      id: track.id,
      title: track.title,
      topics: track.topics.map((topic) => ({
        slug: topic.slug,
        title: topic.title,
        minutes: topic.minutes,
        prerequisites: topic.prerequisites,
        ...(topic.simulator ? { simulator: topic.simulator } : {}),
      })),
    })),
  }));

  return {
    regions,
    map: buildAtlasMap(mapInput),
  };
}

export function getAtlasPayload(): AtlasPayload {
  if (process.env.NODE_ENV === "production") {
    cachedAtlasPayload ??= buildAtlasPayload();
    return cachedAtlasPayload;
  }
  return buildAtlasPayload();
}
