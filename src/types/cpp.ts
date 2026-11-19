export type ValueCategoryKind = "lvalue" | "xvalue" | "prvalue";

export type ReferenceLang = "cpp" | "c";

export const MEMORY_MAP_KINDS = [
  "value-categories",
  "memory-model",
  "object-lifetime",
  "move-and-forwarding",
  "templates-and-concepts",
  "coroutine-frame",
  "vtable-layout",
  "container-invalidation",
  "smart-pointers",
  "overload-lookup",
  "cpp26-preview",
  "lambda-closures",
] as const;

export type MemoryMapKind = (typeof MEMORY_MAP_KINDS)[number];

export type TrapLevel = "subtle" | "standard-lawyer" | "cppcon-stage";

export interface CppRefIndexEntry {
  name: string;
  path: string;
  type: string;
}

export interface CppRefDomain {
  name: string;
  count: number;
  slug: string;
}

export interface CppRefHeading {
  id: string;
  text: string;
  level: 2 | 3 | 4;
}

export interface PageSignatureInsight {
  code: string;
  badges: string[];
  isNoexcept: boolean;
  isConstexpr: boolean;
}

export interface PageInsights {
  definedInHeaders: string[];
  signatureCount: number;
  signatures: PageSignatureInsight[];
  hasComplexity: boolean;
  hasExceptions: boolean;
  hasNotes: boolean;
  hasExample: boolean;
}

export interface CppRefCrumb {
  path: string;
  title: string;
}

/** A reference page as the views consume it (built from the imported page data). */
export interface CppRefPageData {
  lang: ReferenceLang;
  /** Wiki path below /w/<lang>/; "" for the root page. */
  pagePath: string;
  title: string;
  /** Title with cppreference markup (the greyed "std::vector<T>::" prefix). */
  titleHtml: string;
  /** Plain-text lead of the page, at most 240 characters. */
  summary: string;
  kind: "page" | "index";
  bodyHtml: string;
  headings: CppRefHeading[];
  /** Revision marks on the page, oldest first ("C++11", "C++20" / "C99"). */
  cppStandards: string[];
  /** Ancestors from the root down, excluding the page itself. */
  breadcrumbs: CppRefCrumb[];
  /** Direct children in the reference tree. */
  children: CppRefCrumb[];
  originalUrl: string;
  domain: string | null;
  wordCount: number;
  insights: PageInsights;
}

export interface StandardDiff {
  standard: "C++11" | "C++14" | "C++17" | "C++20" | "C++23";
  summary: string;
  beforeCode?: string;
  afterCode?: string;
}

export interface ConceptSection {
  id: string;
  title: string;
  clause: string;
  summary: string;
  prose: string[];
  codeExample?: {
    caption: string;
    code: string;
  };
  keyTakeaway: string;
}

export interface QuizQuestion {
  id: string;
  companionId: MemoryMapKind;
  canonicalPath: string;
  topicTitle: string;
  trapLevel: TrapLevel;
  standardClause: string;
  prompt: string;
  code?: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  cppconNote?: string;
  href?: string;
  linkLabel?: string;
  filterGroupId?: string;
  difficultyLabel?: string;
}

export interface CompanionOverlay {
  id: MemoryMapKind;
  primaryPath: string;
  cppPaths: string[];
  title: string;
  shortTitle: string;
  subtitle: string;
  standardEra: string;
  primaryClauses: string[];
  mentalModelOneLiner: string;
  cppconFraming: {
    talkAngle: string;
    audienceTrap: string;
    stageTakeaway: string;
  };
  memoryMapTitle: string;
  memoryMapDescription: string;
  memoryMapAudioSummary: string;
  sections: ConceptSection[];
  standardEvolution: StandardDiff[];
  quizzes: QuizQuestion[];
  podcastPrompts: string[];
}

export interface HeroExpressionProbe {
  id: string;
  expression: string;
  contextSnippet: string;
  declType: string;
  exprType: string;
  category: ValueCategoryKind;
  hasIdentity: boolean;
  canMoveFrom: boolean;
  storageRegion: string;
  materialized: string;
  clause: string;
  canonicalPath: string;
  verdict: string;
  trapNote: string;
}
