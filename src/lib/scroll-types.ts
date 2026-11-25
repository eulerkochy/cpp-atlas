export type ScrollCardKind = "concept" | "code" | "evolution" | "trap";

export const SCROLL_CARD_KINDS: readonly ScrollCardKind[] = [
  "concept",
  "code",
  "evolution",
  "trap",
] as const;

export type ScrollCardDifficulty = 1 | 2 | 3;

export type ScrollCardOrigin =
  | "core"
  | "simulator"
  | "procedural"
  | "reference"
  | "ai";

export type ScrollFeedPool = "all" | "core" | "procedural" | "reference";

export interface ScrollCaptionCue {
  startSec: number;
  endSec: number;
  text: string;
}

export interface ConceptStageNode {
  id: string;
  label: string;
  sub?: string;
  group?: string;
}

export interface ConceptStageEdge {
  from: string;
  to: string;
  label?: string;
}

export interface ConceptStageBeat {
  title: string;
  caption: string;
  activeNodeIds: string[];
  highlightEdgeIndices?: number[];
  callout?: string;
}

export interface ConceptStageData {
  type: "concept";
  nodes: ConceptStageNode[];
  edges: ConceptStageEdge[];
  beats: ConceptStageBeat[];
}

export interface CodeStageBeat {
  title: string;
  caption: string;
  highlightLines: number[];
  badge?: string;
  annotation: string;
}

export interface CodeStageData {
  type: "code";
  filename?: string;
  language: "cpp";
  code: string;
  beats: CodeStageBeat[];
}

export type EvolutionBeatPhase = "problem" | "shift" | "modern" | "payoff";

export interface EvolutionStageBeat {
  phase: EvolutionBeatPhase;
  title: string;
  caption: string;
  highlight: string;
}

export interface EvolutionStageData {
  type: "evolution";
  era: string;
  feature: string;
  beforeLabel: string;
  beforeCode: string;
  afterLabel: string;
  afterCode: string;
  beats: EvolutionStageBeat[];
}

export interface TrapStageData {
  type: "trap";
  trapId: string;
  question: string;
  code?: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  clause?: string;
}

export type ScrollStageData =
  | ConceptStageData
  | CodeStageData
  | EvolutionStageData
  | TrapStageData;

export interface ScrollCard {
  id: string;
  kind: ScrollCardKind;
  title: string;
  summary: string;
  badgeLabel: string;
  trackId: string;
  trackTitle: string;
  continentId: string;
  continentLabel: string;
  accentHex: string;
  standard?: string;
  tags: string[];
  prerequisites: string[];
  topicSlug?: string;
  readHref: string;
  readLabel: string;
  durationSec: number;
  difficulty: ScrollCardDifficulty;
  baseScore: number;
  captions: ScrollCaptionCue[];
  stage: ScrollStageData;
  origin?: ScrollCardOrigin;
  aiReason?: string;
  sourcePath?: string;
}

export interface ScrollFeedTrackMeta {
  id: string;
  title: string;
  continentId: string;
  continentLabel: string;
  count: number;
}

export interface ScrollFeedPoolCounts {
  core: number;
  simulator: number;
  procedural: number;
  reference: number;
}

export interface ScrollFeedMeta {
  tracks: ScrollFeedTrackMeta[];
  countsByKind: Record<ScrollCardKind, number>;
  totalAvailable?: number;
  poolCounts?: ScrollFeedPoolCounts;
}

export interface ScrollFeedResponse {
  cards: ScrollCard[];
  total: number;
  cursor: number;
  nextCursor: number | null;
  meta: ScrollFeedMeta;
}

export type ScrollGenerateTrigger =
  | "remediate"
  | "deep-dive"
  | "escalate"
  | "explore";

export interface ScrollGenerateMissedTrap {
  cardId: string;
  trapId: string;
  topicSlug?: string;
  trackId: string;
  question: string;
  clause?: string;
  explanation: string;
}

export interface ScrollGenerateLikedCard {
  cardId: string;
  topicSlug?: string;
  trackId: string;
  title: string;
  tags: string[];
  sourcePath?: string;
}

export interface ScrollGenerateRequest {
  trigger: ScrollGenerateTrigger;
  topTracks?: string[];
  difficultyTarget?: ScrollCardDifficulty;
  seenCardIds?: string[];
  seenSourcePaths?: string[];
  missedTrap?: ScrollGenerateMissedTrap;
  likedCard?: ScrollGenerateLikedCard;
  count?: number;
}

export interface ScrollGenerateResponse {
  cards: ScrollCard[];
  cached: boolean;
  sourceTitles: string[];
  model: string;
}
