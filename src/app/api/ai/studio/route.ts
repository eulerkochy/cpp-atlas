import { NextResponse } from "next/server";
import {
  createInteractionSseResponse,
  sanitizeAiSources,
} from "@/lib/ai-route-helpers";
import { resolveAiSources } from "@/lib/ai-sources";
import {
  createGeminiClient,
  GEMINI_STUDIO_MODEL,
  resolveGeminiApiKey,
} from "@/lib/gemini";

type StudioArtifact = "briefing" | "study-guide" | "faq" | "traps";

const ARTIFACT_PROMPTS: Record<StudioArtifact, string> = {
  briefing: [
    "Create an executive **Briefing Doc** synthesizing the loaded C++ Atlas sources.",
    "Include:",
    "1. **One-paragraph mental model** connecting all loaded sources.",
    "2. **Core language & library guarantees** (bulleted, with [1]/[2] source citations and ISO clauses where given).",
    "3. **Evolution across C++11–C++26** (highlight only changes backed by the sources).",
    "4. **Key invariants to remember in code review**.",
  ].join("\n"),
  "study-guide": [
    "Create a structured **Study Guide** from the loaded C++ Atlas sources.",
    "Include:",
    "1. **Prerequisite checklist** — what must be solid before reading deeper.",
    "2. **Key terms & ISO C++ clauses table** (Markdown table: Term | Rule / Contract | Source).",
    "3. **5 active-recall study questions** followed by concise, self-testable model answers citing [1]/[2].",
  ].join("\n"),
  faq: [
    "Generate a crisp **Developer FAQ** (6 to 8 high-signal Q&As) directly grounded in the loaded C++ Atlas sources.",
    "Focus on subtle misconceptions, lifetime/aliasing edge cases, overload/deduction surprises, and standard-library contracts.",
    "Include minimal ```cpp snippets where helpful and cite [1]/[2].",
  ].join("\n"),
  traps: [
    "Extract the **5 nastiest standard-lawyer / undefined-behavior traps** from the loaded C++ Atlas sources.",
    "For each trap, include:",
    "- **The trap** (one crisp title + ISO clause / source citation [1])",
    "- **Broken vs. fixed** minimal ```cpp snippet",
    "- **Why the standard behaves this way** (2–3 precise sentences).",
  ].join("\n"),
};

function isStudioArtifact(value: unknown): value is StudioArtifact {
  return (
    value === "briefing" ||
    value === "study-guide" ||
    value === "faq" ||
    value === "traps"
  );
}

export async function POST(request: Request) {
  const keyInfo = resolveGeminiApiKey(request);
  if (!keyInfo) {
    return NextResponse.json(
      {
        code: "MISSING_API_KEY",
        error: "Gemini API key is not configured on this server.",
      },
      { status: 401 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body." },
      { status: 400 }
    );
  }

  const sources = sanitizeAiSources(body.sources);
  const artifact = body.artifact;
  const includeQuizAnswers = body.includeQuizAnswers !== false;

  if (sources.length === 0) {
    return NextResponse.json(
      { error: "Select at least one topic or reference page first." },
      { status: 400 }
    );
  }
  if (!isStudioArtifact(artifact)) {
    return NextResponse.json(
      { error: "Invalid studio artifact type." },
      { status: 400 }
    );
  }

  const { documents, contextText } = resolveAiSources(sources, {
    includeQuizAnswers,
    maxSources: 10,
    maxTotalChars: 160_000,
  });

  if (documents.length === 0) {
    return NextResponse.json(
      { error: "None of the requested C++ Atlas sources could be resolved." },
      { status: 404 }
    );
  }

  const ai = createGeminiClient(keyInfo.apiKey);

  return createInteractionSseResponse({
    ai,
    primaryParams: {
      model: GEMINI_STUDIO_MODEL,
      store: false,
      stream: true,
      system_instruction: [
        "You are generating a NotebookLM-style studio artifact strictly grounded in the C++ Atlas sources provided.",
        "Cite loaded sources using [1], [2], etc. Never invent APIs or standard rules absent from the sources.",
        "",
        "=== LOADED C++ ATLAS SOURCES ===",
        contextText,
      ].join("\n"),
      input: ARTIFACT_PROMPTS[artifact],
    },
    sources: documents.map((d) => ({
      key: d.key,
      title: d.title,
      urlPath: d.urlPath,
    })),
    signal: request.signal,
  });
}
