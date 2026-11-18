/**
 * The atlas's regions: the study tracks grouped into four parts. Shared by
 * the topics index and the home page so both tell the same story.
 */
export interface TrackGroupDefinition {
  id: string;
  label: string;
  trackIds: readonly string[];
}

export const TRACK_GROUPS: readonly TrackGroupDefinition[] = [
  {
    id: "language-basics",
    label: "Language basics",
    trackIds: [
      "program-structure",
      "types-and-initialization",
      "value-semantics",
      "expressions-and-functions",
    ],
  },
  {
    id: "building-abstractions",
    label: "Building abstractions",
    trackIds: ["classes", "templates", "errors"],
  },
  {
    id: "the-machine",
    label: "The machine",
    trackIds: ["memory-model", "concurrency"],
  },
  {
    id: "library-and-cpp26",
    label: "Library and C++26",
    trackIds: ["containers", "algorithms-and-ranges", "utilities", "cpp26"],
  },
];

export interface TrackGroup<T> {
  id: string;
  label: string;
  tracks: T[];
}

/**
 * Sorts tracks into their groups, in group order. Any track whose id is not
 * listed lands at the end of the last group, so a new track is never dropped.
 * Groups left empty are omitted.
 */
export function groupTracks<T extends { id: string }>(
  tracks: readonly T[]
): TrackGroup<T>[] {
  const byId = new Map(tracks.map((track) => [track.id, track]));
  const listed = new Set(TRACK_GROUPS.flatMap((group) => group.trackIds));

  const groups: TrackGroup<T>[] = TRACK_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    tracks: group.trackIds.flatMap((id) => {
      const track = byId.get(id);
      return track ? [track] : [];
    }),
  }));

  const unlisted = tracks.filter((track) => !listed.has(track.id));
  groups[groups.length - 1].tracks.push(...unlisted);

  return groups.filter((group) => group.tracks.length > 0);
}
