import fs from "node:fs";
import path from "node:path";
import { getTopic } from "@/lib/topics";

export type BuildStatus = "live" | "coming-soon";
export type StageDifficulty = "very-easy" | "easy" | "medium" | "hard";

export interface BuildCatalogEntry {
  slug: string;
  title: string;
  tagline: string;
  status: BuildStatus;
  stageCount?: number;
  dependsOn: string[];
  note: string;
}

export interface BuildTopicRef {
  slug: string;
  title: string;
}

export interface BuildStageMeta {
  number: number;
  slug: string;
  title: string;
  summary: string;
  difficulty: StageDifficulty;
  estimate: string;
  atlasTopics: BuildTopicRef[];
  concepts: string[];
  testFile: string;
}

export interface BuildChallenge {
  slug: string;
  title: string;
  tagline: string;
  description: string;
  standard: string;
  repoPath: string;
  repoUrl: string;
  prerequisites: BuildTopicRef[];
  stages: BuildStageMeta[];
  overview: string;
}

export interface BuildStage {
  challenge: { slug: string; title: string };
  stage: BuildStageMeta;
  stageCount: number;
  body: string;
  prev: BuildStageMeta | null;
  next: BuildStageMeta | null;
}

const BUILD_DIR = path.join(process.cwd(), "content", "build");
const DIFFICULTIES: readonly string[] = ["very-easy", "easy", "medium", "hard"];

function fail(file: string, msg: string): never {
  throw new Error(`[build-challenges] ${path.relative(process.cwd(), file)}: ${msg}`);
}

function isSafeSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(slug);
}

function readJson(file: string): Record<string, unknown> {
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return fail(file, "file is missing or unreadable");
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    return fail(file, `malformed JSON (${(err as Error).message})`);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return fail(file, "expected a JSON object");
  }
  return data as Record<string, unknown>;
}

function str(file: string, obj: Record<string, unknown>, key: string, where = ""): string {
  const v = obj[key];
  if (typeof v !== "string" || !v.trim()) {
    return fail(file, `${where}"${key}" must be a non-empty string`);
  }
  return v;
}

function strList(file: string, obj: Record<string, unknown>, key: string, where = ""): string[] {
  const v = obj[key];
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
    return fail(file, `${where}"${key}" must be an array of strings`);
  }
  return v as string[];
}

function resolveTopics(file: string, slugs: string[], where: string): BuildTopicRef[] {
  return slugs.map((slug) => {
    const topic = getTopic(slug);
    if (!topic) return fail(file, `${where} references unknown topic "${slug}"`);
    return { slug: topic.slug, title: topic.title };
  });
}

function readText(file: string): string {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return fail(file, "file is missing or unreadable");
  }
}

export function getBuildCatalog(): BuildCatalogEntry[] {
  const file = path.join(BUILD_DIR, "catalog.json");
  const data = readJson(file);
  if (!Array.isArray(data.challenges)) return fail(file, '"challenges" must be an array');
  const entries = data.challenges.map((raw: unknown, i: number): BuildCatalogEntry => {
    const where = `challenges[${i}].`;
    if (!raw || typeof raw !== "object") return fail(file, `challenges[${i}] must be an object`);
    const o = raw as Record<string, unknown>;
    const slug = str(file, o, "slug", where);
    if (!isSafeSlug(slug)) return fail(file, `${where}slug "${slug}" is not a safe slug`);
    const status = o.status;
    if (status !== "live" && status !== "coming-soon") {
      return fail(file, `${where}"status" must be "live" or "coming-soon"`);
    }
    if (o.stageCount !== undefined && typeof o.stageCount !== "number") {
      return fail(file, `${where}"stageCount" must be a number`);
    }
    return {
      slug,
      title: str(file, o, "title", where),
      tagline: str(file, o, "tagline", where),
      status,
      stageCount: o.stageCount as number | undefined,
      dependsOn: strList(file, o, "dependsOn", where),
      note: typeof o.note === "string" ? o.note : "",
    };
  });
  const slugs = new Set(entries.map((e) => e.slug));
  for (const e of entries) {
    for (const dep of e.dependsOn) {
      if (!slugs.has(dep)) return fail(file, `challenge "${e.slug}" depends on unknown challenge "${dep}"`);
    }
  }
  return entries;
}

export function getLiveChallengeSlugs(): string[] {
  return getBuildCatalog()
    .filter((c) => c.status === "live")
    .map((c) => c.slug);
}

export function getBuildChallenge(slug: string): BuildChallenge | null {
  if (!isSafeSlug(slug)) return null;
  const entry = getBuildCatalog().find((c) => c.slug === slug && c.status === "live");
  if (!entry) return null;

  const dir = path.join(BUILD_DIR, slug);
  const file = path.join(dir, "challenge.json");
  const data = readJson(file);
  if (str(file, data, "slug") !== slug) return fail(file, `"slug" does not match directory "${slug}"`);
  if (!Array.isArray(data.stages) || data.stages.length === 0) {
    return fail(file, '"stages" must be a non-empty array');
  }

  const seen = new Set<string>();
  const stages = data.stages.map((raw: unknown, i: number): BuildStageMeta => {
    const where = `stages[${i}].`;
    if (!raw || typeof raw !== "object") return fail(file, `stages[${i}] must be an object`);
    const o = raw as Record<string, unknown>;
    const stageSlug = str(file, o, "slug", where);
    if (!isSafeSlug(stageSlug)) return fail(file, `${where}slug "${stageSlug}" is not a safe slug`);
    if (seen.has(stageSlug)) return fail(file, `duplicate stage slug "${stageSlug}"`);
    seen.add(stageSlug);
    if (o.number !== i + 1) return fail(file, `${where}"number" must be ${i + 1} (stages must be ordered)`);
    const difficulty = str(file, o, "difficulty", where);
    if (!DIFFICULTIES.includes(difficulty)) {
      return fail(file, `${where}"difficulty" must be one of ${DIFFICULTIES.join(", ")}`);
    }
    return {
      number: i + 1,
      slug: stageSlug,
      title: str(file, o, "title", where),
      summary: str(file, o, "summary", where),
      difficulty: difficulty as StageDifficulty,
      estimate: str(file, o, "estimate", where),
      atlasTopics: resolveTopics(file, strList(file, o, "atlasTopics", where), `${where}atlasTopics`),
      concepts: strList(file, o, "concepts", where),
      testFile: str(file, o, "testFile", where),
    };
  });

  return {
    slug,
    title: str(file, data, "title"),
    tagline: str(file, data, "tagline"),
    description: str(file, data, "description"),
    standard: str(file, data, "standard"),
    repoPath: str(file, data, "repoPath"),
    repoUrl: str(file, data, "repoUrl"),
    prerequisites: resolveTopics(file, strList(file, data, "prerequisites"), "prerequisites"),
    stages,
    overview: readText(path.join(dir, "overview.md")),
  };
}

export function getBuildStage(challengeSlug: string, stageSlug: string): BuildStage | null {
  const challenge = getBuildChallenge(challengeSlug);
  if (!challenge || !isSafeSlug(stageSlug)) return null;
  const idx = challenge.stages.findIndex((s) => s.slug === stageSlug);
  if (idx < 0) return null;
  const stage = challenge.stages[idx];
  const file = path.join(
    BUILD_DIR,
    challengeSlug,
    "stages",
    `${String(stage.number).padStart(2, "0")}-${stage.slug}.md`
  );
  return {
    challenge: { slug: challenge.slug, title: challenge.title },
    stage,
    stageCount: challenge.stages.length,
    body: readText(file),
    prev: challenge.stages[idx - 1] ?? null,
    next: challenge.stages[idx + 1] ?? null,
  };
}
