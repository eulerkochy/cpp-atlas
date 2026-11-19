import { ALL_QUIZZES } from "@/data/companions";
import { getIndexStats } from "@/lib/cppref-index";
import { getAllTopics, getTracks } from "@/lib/topics";
import { MEMORY_MAP_KINDS } from "@/types/cpp";

export interface SiteStats {
  topics: number;
  tracks: number;
  /** Topic quiz questions plus the reference companions' traps. */
  traps: number;
  simulators: number;
  /** Number of topics paired with an interactive simulator. */
  simulatorTopics: number;
  /** Listed C++ and C reference pages in the offline snapshot. */
  referencePages: number;
}

/** Counts shown in site copy, derived from content/ and the imported reference. */
export function getSiteStats(): SiteStats {
  const topics = getAllTopics();
  return {
    topics: topics.length,
    tracks: getTracks().filter((t) => t.topics.length > 0).length,
    traps:
      ALL_QUIZZES.length + topics.reduce((sum, t) => sum + t.questions.length, 0),
    simulators: MEMORY_MAP_KINDS.length,
    simulatorTopics: topics.filter((t) => Boolean(t.simulator)).length,
    referencePages: getIndexStats("all").pages,
  };
}

export function siteTitle(stats: SiteStats = getSiteStats()): string {
  return `C++ Atlas — ${stats.topics} Visual C++ Study Topics, Debuggers & Offline Reference`;
}

export function siteDescription(stats: SiteStats = getSiteStats()): string {
  return `${stats.topics} C++ study topics across ${stats.tracks} tracks, ${stats.simulators} interactive RAD-style debuggers, ${stats.traps.toLocaleString("en-US")} clause-cited quiz questions, and all ${stats.referencePages.toLocaleString("en-US")} C++ and C pages of cppreference.com, served offline and mapped 1:1.`;
}
