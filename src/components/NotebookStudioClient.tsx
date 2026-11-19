"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  BookOpen,
  Check,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Headphones,
  LogOut,
  MessageSquare,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import {
  ChatGptIcon,
  ClaudeIcon,
  GeminiIcon,
  GoogleIcon,
  NotebookLmIcon,
} from "@/components/AiBrandIcons";
import { AiMarkdown } from "@/components/AiMarkdown";
import { GeminiKeyBanner } from "@/components/GeminiKeyBanner";
import { useGoogleNotebook } from "@/components/GoogleNotebookProvider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Window } from "@/components/Window";
import {
  getPublicNotebooks,
  type PublicNotebookWorkspace,
} from "@/data/notebooks";
import {
  buildAiHeaders,
  fetchAiStatus,
  getCachedMarkdown,
  openExternalAiBundle,
  prefetchMarkdown,
  streamAiSse,
  useSessionGeminiKey,
  type GeminiKeyPersistence,
} from "@/lib/ai-client";
import {
  buildBundlePrompt,
  NOTEBOOKLM_WEB_URL,
  parseAiSourceKey,
  type AiSourceRef,
} from "@/lib/ai-links";
import { cn } from "@/lib/utils";
import type { ReferenceLang } from "@/types/cpp";
import type { UnifiedSearchResultItem } from "@/types/topics";

export interface NotebookTopicOption {
  slug: string;
  title: string;
  trackTitle: string;
  summary: string;
}

type SelectedSource =
  | {
      kind: "reference";
      lang: ReferenceLang;
      path: string;
      name: string;
    }
  | {
      kind: "topic";
      slug: string;
      name: string;
      trackTitle?: string;
    };

type StudioTab = "chat" | "audio" | "guides" | "markdown";
type StudioArtifact = "briefing" | "study-guide" | "faq" | "traps";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  streaming?: boolean;
}

interface AudioTurn {
  speaker: "Alex" | "Maya";
  style: string;
  text: string;
}

interface AudioOverviewResult {
  title: string;
  summary: string;
  turns: AudioTurn[];
  audioBase64: string | null;
  mimeType: string | null;
  ttsWarning: string | null;
}

interface PackPreset {
  id: string;
  label: string;
  sources: SelectedSource[];
}

const PRESETS: PackPreset[] = [
  {
    id: "value-lifetime",
    label: "Value semantics & lifetime",
    sources: [
      {
        kind: "reference",
        lang: "cpp",
        path: "language/value_category",
        name: "Value categories",
      },
      {
        kind: "reference",
        lang: "cpp",
        path: "language/copy_elision",
        name: "Copy elision",
      },
      {
        kind: "reference",
        lang: "cpp",
        path: "language/lifetime",
        name: "Object lifetime",
      },
    ],
  },
  {
    id: "memory-atomics",
    label: "Memory model & atomics",
    sources: [
      {
        kind: "reference",
        lang: "cpp",
        path: "language/memory_model",
        name: "Memory model",
      },
      {
        kind: "reference",
        lang: "cpp",
        path: "atomic/memory_order",
        name: "std::memory_order",
      },
      {
        kind: "reference",
        lang: "cpp",
        path: "atomic/atomic_thread_fence",
        name: "std::atomic_thread_fence",
      },
    ],
  },
  {
    id: "move-concepts",
    label: "Move, forwarding & concepts",
    sources: [
      {
        kind: "reference",
        lang: "cpp",
        path: "utility/move",
        name: "std::move",
      },
      {
        kind: "reference",
        lang: "cpp",
        path: "utility/forward",
        name: "std::forward",
      },
      {
        kind: "reference",
        lang: "cpp",
        path: "container/vector",
        name: "std::vector",
      },
      {
        kind: "reference",
        lang: "cpp",
        path: "language/constraints",
        name: "Constraints and concepts",
      },
    ],
  },
];

const NOTEBOOK_SYNTHESIS_PROMPTS = [
  "Connect these sources into one mental model",
  "Compare the nastiest UB traps across these pages",
  "Give me a 5-question oral exam",
];

const GUIDE_OPTIONS: {
  id: StudioArtifact;
  label: string;
  hint: string;
}[] = [
  {
    id: "briefing",
    label: "Briefing Doc",
    hint: "Executive mental model & C++11–26 guarantees",
  },
  {
    id: "study-guide",
    label: "Study Guide",
    hint: "Prerequisites, clause table & recall questions",
  },
  {
    id: "faq",
    label: "Developer FAQ",
    hint: "High-signal Q&As on subtle contracts",
  },
  {
    id: "traps",
    label: "Standardese Traps",
    hint: "5 broken-vs-fixed UB & edge-case traps",
  },
];

function sourceKey(item: SelectedSource): string {
  return item.kind === "topic"
    ? `topic:${item.slug}`
    : `ref:${item.lang}:${item.path}`;
}

function toAiSourceRef(item: SelectedSource): AiSourceRef {
  return item.kind === "topic"
    ? { kind: "topic", slug: item.slug }
    : { kind: "reference", lang: item.lang, path: item.path };
}

function sourceDisplayPath(item: SelectedSource): string {
  if (item.kind === "topic") return `/topics/${item.slug}`;
  return item.path ? `/w/${item.lang}/${item.path}` : `/w/${item.lang}`;
}

function sourceEndpoint(item: SelectedSource, ansFlag: string): string {
  if (item.kind === "topic") {
    return `/api/notebook/topic/${item.slug}?answers=${ansFlag}`;
  }
  const encoded = item.path
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  return `/api/notebook/${item.lang}${encoded ? `/${encoded}` : ""}?answers=${ansFlag}`;
}

function formatRefLabel(lang: ReferenceLang, refPath: string): string {
  if (!refPath) return lang === "cpp" ? "C++ reference" : "C reference";
  const tail = refPath.split("/").filter(Boolean).pop() ?? refPath;
  return tail.replace(/_/g, " ");
}

function resolveSourcesFromRefs(
  refs: AiSourceRef[],
  topicBySlug: Map<string, NotebookTopicOption>
): SelectedSource[] {
  const out: SelectedSource[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    if (ref.kind === "topic") {
      const topic = topicBySlug.get(ref.slug);
      const item: SelectedSource = {
        kind: "topic",
        slug: ref.slug,
        name: topic?.title ?? ref.slug.replace(/-/g, " "),
        trackTitle: topic?.trackTitle,
      };
      const k = sourceKey(item);
      if (!seen.has(k)) {
        seen.add(k);
        out.push(item);
      }
    } else {
      const item: SelectedSource = {
        kind: "reference",
        lang: ref.lang,
        path: ref.path,
        name: formatRefLabel(ref.lang, ref.path),
      };
      const k = sourceKey(item);
      if (!seen.has(k)) {
        seen.add(k);
        out.push(item);
      }
    }
  }
  return out;
}

function base64ToBlobUrl(base64: string, mimeType: string): string {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType || "audio/wav" });
  return URL.createObjectURL(blob);
}

export function NotebookStudioClient({
  topics = [],
}: {
  topics?: NotebookTopicOption[];
}) {
  const searchParams = useSearchParams();
  const topicBySlug = useMemo(
    () => new Map(topics.map((t) => [t.slug, t])),
    [topics]
  );

  const publicWorkspaces = useMemo(() => getPublicNotebooks(), []);
  const google = useGoogleNotebook();
  const [dismissedOAuthBanner, setDismissedOAuthBanner] = useState(false);

  const googleConnectedParam = searchParams.get("google_connected");
  const googleErrorParam = searchParams.get("google_error");
  const oauthErrorMessage =
    googleErrorParam === "not_configured"
      ? "Google OAuth is not configured on this server yet. Add GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET."
      : googleErrorParam === "access_denied"
        ? "Google sign-in was cancelled before granting NotebookLM access."
        : googleErrorParam === "invalid_state"
          ? "Google OAuth session state expired. Try signing in again."
          : googleErrorParam === "exchange_failed"
            ? "Could not complete Google token exchange. Verify your client secret and callback URL."
            : googleErrorParam
              ? "Could not connect your Google account."
              : null;

  const [selectedSources, setSelectedSources] = useState<SelectedSource[]>(() => {
    const rawSources = searchParams
      .getAll("source")
      .flatMap((entry) => entry.split(","))
      .map((s) => s.trim())
      .filter(Boolean);

    if (rawSources.length > 0) {
      const refs = rawSources
        .map(parseAiSourceKey)
        .filter((r): r is AiSourceRef => r !== null);
      const resolved = resolveSourcesFromRefs(refs, topicBySlug);
      if (resolved.length > 0) return resolved;
    }

    return topics.length >= 2
      ? topics.slice(0, 3).map((t) => ({
          kind: "topic",
          slug: t.slug,
          name: t.title,
          trackTitle: t.trackTitle,
        }))
      : PRESETS[0].sources;
  });
  const [activeTab, setActiveTab] = useState<StudioTab>(() => {
    const rawTab = searchParams.get("tab");
    if (
      rawTab === "chat" ||
      rawTab === "audio" ||
      rawTab === "guides" ||
      rawTab === "markdown"
    ) {
      return rawTab;
    }
    return "chat";
  });
  const [includeAnswers, setIncludeAnswers] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UnifiedSearchResultItem[]>(
    []
  );
  const [topicFilter, setTopicFilter] = useState("");
  const [copiedBundleUrls, setCopiedBundleUrls] = useState(false);
  const [copiedWsId, setCopiedWsId] = useState<string | null>(null);

  // Gemini connectivity + session BYOK key
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [chatModel, setChatModel] = useState("gemini-4-hydrogen");
  const [ttsModel, setTtsModel] = useState("gemini-3.8-flash-tts");
  const {
    key: sessionKey,
    persistence,
    setKey: saveSessionKey,
    clearKey: clearSessionKey,
  } = useSessionGeminiKey();
  const [chatConnectNotice, setChatConnectNotice] = useState<string | null>(
    null
  );

  // Tab 1: Notebook Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatStreaming, setChatStreaming] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [interactionState, setInteractionState] = useState<{
    id: string | null;
    sig: string;
  }>({ id: null, sig: "" });
  const chatAbortRef = useRef<AbortController | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  // Tab 2: Audio Overview state
  const [audioLength, setAudioLength] = useState<"short" | "standard">("short");
  const [audioFocus, setAudioFocus] = useState("");
  const [audioGenerating, setAudioGenerating] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [audioResult, setAudioResult] = useState<AudioOverviewResult | null>(
    null
  );
  const [audioObjectUrl, setAudioObjectUrl] = useState<string | null>(null);
  const audioAbortRef = useRef<AbortController | null>(null);

  // Tab 3: Studio Guides state
  const [guideArtifact, setGuideArtifact] =
    useState<StudioArtifact>("briefing");
  const [guideContent, setGuideContent] = useState("");
  const [guideStreaming, setGuideStreaming] = useState(false);
  const [guideError, setGuideError] = useState<string | null>(null);
  const [copiedGuide, setCopiedGuide] = useState(false);
  const guideAbortRef = useRef<AbortController | null>(null);

  // Tab 4: Lazy Raw Markdown state
  const [compiledMd, setCompiledMd] = useState<{ sig: string; text: string }>({
    sig: "",
    text: "",
  });
  const [loadingMd, setLoadingMd] = useState(false);
  const [copiedMd, setCopiedMd] = useState(false);
  const [copiedUrls, setCopiedUrls] = useState(false);

  const sourcesSignature = useMemo(
    () =>
      `${includeAnswers ? "1" : "0"}|${selectedSources.map(sourceKey).join(",")}`,
    [includeAnswers, selectedSources]
  );
  const interactionId =
    interactionState.sig === sourcesSignature ? interactionState.id : null;

  useEffect(() => {
    let cancelled = false;
    fetchAiStatus()
      .then((status) => {
        if (cancelled) return;
        setConfigured(status.configured);
        setChatModel(status.chatModel);
        setTtsModel(status.ttsModel);
      })
      .catch(() => {
        if (!cancelled) setConfigured(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Revoke audio blob URL on change or unmount
  useEffect(() => {
    return () => {
      if (audioObjectUrl) {
        URL.revokeObjectURL(audioObjectUrl);
      }
    };
  }, [audioObjectUrl]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chatMessages, chatError, chatStreaming]);

  // Live search for topics and reference pages
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(q)}&limit=14`
        );
        if (res.ok && !cancelled) {
          const data = (await res.json()) as {
            results: UnifiedSearchResultItem[];
          };
          setSearchResults(data.results ?? []);
        }
      } catch {
        // Ignore transient search error
      }
    }, 120);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [searchQuery]);

  // Lazy-load raw markdown ONLY when Raw Markdown tab is open
  useEffect(() => {
    if (activeTab !== "markdown" || selectedSources.length === 0) return;
    if (compiledMd.sig === sourcesSignature) return;

    let cancelled = false;
    (async () => {
      setLoadingMd(true);
      try {
        const ansFlag = includeAnswers ? "1" : "0";
        const parts = await Promise.all(
          selectedSources.map(async (item) => {
            const res = await fetch(sourceEndpoint(item, ansFlag));
            if (!res.ok) {
              return `# ${item.name}\n\nUnable to load ${sourceDisplayPath(item)}.`;
            }
            return await res.text();
          })
        );
        if (!cancelled) {
          setCompiledMd({
            sig: sourcesSignature,
            text: parts.join("\n\n---\n\n"),
          });
        }
      } finally {
        if (!cancelled) setLoadingMd(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    activeTab,
    compiledMd.sig,
    includeAnswers,
    selectedSources,
    sourcesSignature,
  ]);

  const activeSearchResults = searchQuery.trim() ? searchResults : [];
  const displayedMarkdown =
    selectedSources.length === 0 || compiledMd.sig !== sourcesSignature
      ? ""
      : compiledMd.text;

  const filteredTopicOptions = topics.filter((t) => {
    const q = topicFilter.trim().toLowerCase();
    if (!q) return true;
    return (
      t.title.toLowerCase().includes(q) ||
      t.slug.toLowerCase().includes(q) ||
      t.trackTitle.toLowerCase().includes(q)
    );
  });

  const bundleSources = useMemo(() => {
    const ansFlag = includeAnswers ? "1" : "0";
    return selectedSources.slice(0, 12).map((s) => ({
      name: s.name,
      urlPath: sourceDisplayPath(s),
      endpoint: sourceEndpoint(s, ansFlag),
    }));
  }, [includeAnswers, selectedSources]);

  const [bundlePendingTarget, setBundlePendingTarget] = useState<
    "chatgpt" | "claude" | null
  >(null);
  const [bundleCopiedTarget, setBundleCopiedTarget] = useState<
    "chatgpt" | "claude" | null
  >(null);

  const warmBundleSources = () => {
    if (displayedMarkdown) return;
    bundleSources.forEach((s) => void prefetchMarkdown(s.endpoint));
  };

  const handleOpenBundleExternal = async (target: "chatgpt" | "claude") => {
    if (bundleSources.length === 0 || bundlePendingTarget) return;
    const needsFetch =
      !displayedMarkdown &&
      bundleSources.some((s) => getCachedMarkdown(s.endpoint) === null);
    if (needsFetch) {
      setBundlePendingTarget(target);
    }
    try {
      const res = await openExternalAiBundle(
        target,
        bundleSources,
        displayedMarkdown || undefined
      );
      if (res.copiedFull && res.truncated) {
        setBundleCopiedTarget(target);
        window.setTimeout(() => setBundleCopiedTarget(null), 2200);
      }
    } finally {
      if (needsFetch) {
        setBundlePendingTarget(null);
      }
    }
  };

  const buildBundleFallbackPrompt = () => {
    if (displayedMarkdown) {
      return buildBundlePrompt(bundleSources, displayedMarkdown);
    }
    const allCached = bundleSources.every(
      (s) => getCachedMarkdown(s.endpoint) !== null
    );
    if (allCached) {
      const md = bundleSources
        .map((s) => getCachedMarkdown(s.endpoint))
        .filter((p): p is string => Boolean(p))
        .join("\n\n---\n\n");
      return buildBundlePrompt(bundleSources, md || undefined);
    }
    return Promise.all(
      bundleSources.map((s) => prefetchMarkdown(s.endpoint))
    ).then((parts) => {
      const valid = parts.filter((p): p is string => Boolean(p));
      return buildBundlePrompt(
        bundleSources,
        valid.length > 0 ? valid.join("\n\n---\n\n") : undefined
      );
    });
  };

  const toggleItem = (item: SelectedSource) => {
    const key = sourceKey(item);
    setSelectedSources((prev) => {
      const exists = prev.some((p) => sourceKey(p) === key);
      return exists
        ? prev.filter((p) => sourceKey(p) !== key)
        : [...prev, item];
    });
  };

  const addItem = (item: SelectedSource) => {
    const key = sourceKey(item);
    setSelectedSources((prev) =>
      prev.some((p) => sourceKey(p) === key) ? prev : [...prev, item]
    );
    setSearchQuery("");
    setSearchResults([]);
  };

  const loadWorkspaceIntoStudio = (ws: PublicNotebookWorkspace) => {
    const next = resolveSourcesFromRefs(ws.starterSources, topicBySlug);
    if (next.length > 0) {
      setSelectedSources(next);
      setActiveTab("chat");
      setChatMessages([]);
      setInteractionState({ id: null, sig: "" });
    }
  };

  const handleCopyWorkspaceUrlsAndOpen = async (
    ws: PublicNotebookWorkspace
  ) => {
    try {
      await navigator.clipboard.writeText(ws.sourceUrls.join("\n"));
      setCopiedWsId(ws.id);
      window.setTimeout(() => setCopiedWsId(null), 2600);
    } catch {
      // Ignore clipboard rejection
    }
    window.open(NOTEBOOKLM_WEB_URL, "_blank", "noopener,noreferrer");
  };

  const handleCopyBundleAndOpenNotebookLm = async () => {
    const origin = window.location.origin;
    const text = selectedSources
      .map((p) => `${origin}${sourceDisplayPath(p)}`)
      .join("\n");
    if (text) {
      try {
        await navigator.clipboard.writeText(text);
        setCopiedBundleUrls(true);
        window.setTimeout(() => setCopiedBundleUrls(false), 2600);
      } catch {
        // Ignore clipboard rejection
      }
    }
    window.open(NOTEBOOKLM_WEB_URL, "_blank", "noopener,noreferrer");
  };

  const handleSaveKey = (
    newKey: string,
    nextPersistence: GeminiKeyPersistence
  ) => {
    saveSessionKey(newKey, nextPersistence);
    setChatError(null);
    setChatConnectNotice(null);
    setAudioError(null);
    setGuideError(null);
  };

  const handleClearKey = () => {
    clearSessionKey();
  };

  // --- Notebook Chat Handlers ---
  const stopChat = useCallback(() => {
    chatAbortRef.current?.abort();
    chatAbortRef.current = null;
    setChatStreaming(false);
    setChatMessages((prev) =>
      prev.map((m) => (m.streaming ? { ...m, streaming: false } : m))
    );
  }, []);

  const sendChatMessage = useCallback(
    async (promptText: string) => {
      const cleaned = promptText.trim();
      if (!cleaned || selectedSources.length === 0) return;

      chatAbortRef.current?.abort();
      const controller = new AbortController();
      chatAbortRef.current = controller;

      const userId = `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const assistantId = `a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const historySnapshot = chatMessages.map((m) => ({
        role: m.role,
        text: m.text,
      }));

      setChatError(null);
      setChatStreaming(true);
      setChatMessages((prev) => [
        ...prev,
        { id: userId, role: "user", text: cleaned },
        { id: assistantId, role: "assistant", text: "", streaming: true },
      ]);

      try {
        await streamAiSse({
          url: "/api/ai/chat",
          sessionKey,
          signal: controller.signal,
          body: {
            sources: selectedSources.map(toAiSourceRef),
            message: cleaned,
            previousInteractionId: interactionId ?? undefined,
            history: historySnapshot,
            mode: "notebook",
            includeQuizAnswers: includeAnswers,
          },
          onMeta: (meta) => {
            if (meta.interactionId) {
              setInteractionState({
                id: meta.interactionId,
                sig: sourcesSignature,
              });
            }
          },
          onDelta: (chunk) => {
            setChatMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, text: m.text + chunk } : m
              )
            );
          },
          onDone: (done) => {
            if (done.interactionId) {
              setInteractionState({
                id: done.interactionId,
                sig: sourcesSignature,
              });
            }
          },
        });

        setChatMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, streaming: false } : m
          )
        );
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          setChatMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, streaming: false } : m
            )
          );
          return;
        }
        const typedErr = err as Error & { code?: string };
        if (typedErr.code === "MISSING_API_KEY") {
          setConfigured(false);
        }
        setChatError(typedErr.message || "Failed to contact Gemini.");
        setChatMessages((prev) =>
          prev.filter((m) => !(m.id === assistantId && !m.text))
        );
      } finally {
        if (chatAbortRef.current === controller) {
          chatAbortRef.current = null;
        }
        setChatStreaming(false);
      }
    },
    [
      chatMessages,
      includeAnswers,
      interactionId,
      selectedSources,
      sessionKey,
      sourcesSignature,
    ]
  );

  const handleChatSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (chatStreaming || !chatDraft.trim() || selectedSources.length === 0) {
      return;
    }
    const hasKey = configured === true || Boolean(sessionKey.trim());
    if (!hasKey) {
      setChatConnectNotice("Connect Gemini above to send this prompt.");
      return;
    }
    const prompt = chatDraft;
    setChatDraft("");
    setChatConnectNotice(null);
    void sendChatMessage(prompt);
  };

  // --- Audio Overview Handlers ---
  const handleGenerateAudio = async () => {
    if (selectedSources.length === 0 || audioGenerating) return;
    audioAbortRef.current?.abort();
    const controller = new AbortController();
    audioAbortRef.current = controller;

    setAudioError(null);
    setAudioGenerating(true);

    try {
      const res = await fetch("/api/ai/audio-overview", {
        method: "POST",
        headers: buildAiHeaders(sessionKey),
        signal: controller.signal,
        body: JSON.stringify({
          sources: selectedSources.map(toAiSourceRef),
          focus: audioFocus.trim() || undefined,
          length: audioLength,
          includeQuizAnswers: includeAnswers,
        }),
      });

      const payload = (await res.json()) as Partial<AudioOverviewResult> & {
        error?: string;
        code?: string;
      };

      if (!res.ok) {
        if (payload.code === "MISSING_API_KEY") {
          setConfigured(false);
        }
        throw new Error(
          payload.error || `Audio Overview failed (${res.status})`
        );
      }

      if (audioObjectUrl) {
        URL.revokeObjectURL(audioObjectUrl);
        setAudioObjectUrl(null);
      }

      const audioBase64 = payload.audioBase64 ?? null;
      const mimeType = payload.mimeType ?? "audio/wav";
      if (audioBase64) {
        setAudioObjectUrl(base64ToBlobUrl(audioBase64, mimeType));
      }

      setAudioResult({
        title: payload.title ?? "C++ Atlas Audio Overview",
        summary: payload.summary ?? "",
        turns: Array.isArray(payload.turns) ? payload.turns : [],
        audioBase64,
        mimeType,
        ttsWarning: payload.ttsWarning ?? null,
      });
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setAudioError((err as Error).message || "Audio Overview failed.");
      }
    } finally {
      if (audioAbortRef.current === controller) {
        audioAbortRef.current = null;
      }
      setAudioGenerating(false);
    }
  };

  // --- Studio Guides Handlers ---
  const stopGuide = () => {
    guideAbortRef.current?.abort();
    guideAbortRef.current = null;
    setGuideStreaming(false);
  };

  const handleGenerateGuide = async (artifact: StudioArtifact) => {
    if (selectedSources.length === 0) return;
    guideAbortRef.current?.abort();
    const controller = new AbortController();
    guideAbortRef.current = controller;

    setGuideArtifact(artifact);
    setGuideContent("");
    setGuideError(null);
    setGuideStreaming(true);

    try {
      await streamAiSse({
        url: "/api/ai/studio",
        sessionKey,
        signal: controller.signal,
        body: {
          sources: selectedSources.map(toAiSourceRef),
          artifact,
          includeQuizAnswers: includeAnswers,
        },
        onDelta: (chunk) => {
          setGuideContent((prev) => prev + chunk);
        },
      });
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        const typedErr = err as Error & { code?: string };
        if (typedErr.code === "MISSING_API_KEY") {
          setConfigured(false);
        }
        setGuideError(typedErr.message || "Could not generate guide.");
      }
    } finally {
      if (guideAbortRef.current === controller) {
        guideAbortRef.current = null;
      }
      setGuideStreaming(false);
    }
  };

  const handleCopyGuide = async () => {
    if (!guideContent) return;
    await navigator.clipboard.writeText(guideContent);
    setCopiedGuide(true);
    window.setTimeout(() => setCopiedGuide(false), 1800);
  };

  // --- Raw Markdown Handlers ---
  const handleDownload = () => {
    if (!displayedMarkdown) return;
    const blob = new Blob([displayedMarkdown], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cpp-atlas-notebooklm-pack.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyMarkdown = async () => {
    if (!displayedMarkdown) return;
    await navigator.clipboard.writeText(displayedMarkdown);
    setCopiedMd(true);
    window.setTimeout(() => setCopiedMd(false), 1800);
  };

  const handleCopyUrls = async () => {
    const origin = window.location.origin;
    const text = selectedSources
      .map((p) => `${origin}${sourceDisplayPath(p)}`)
      .join("\n");
    await navigator.clipboard.writeText(text);
    setCopiedUrls(true);
    window.setTimeout(() => setCopiedUrls(false), 1800);
  };

  const handleOpenBundlePush = () => {
    const defaultTitle =
      selectedSources.length === 1
        ? `${selectedSources[0].name} — C++ Atlas`
        : `C++ Atlas (${selectedSources.length} sources)`;
    google.openPushDialog({
      sources: selectedSources.map(toAiSourceRef),
      defaultTitle,
      includeQuizAnswers: includeAnswers,
    });
  };

  return (
    <div className="space-y-10">
      {/* OAuth redirect notice */}
      {!dismissedOAuthBanner &&
      (googleConnectedParam === "1" || oauthErrorMessage) ? (
        <div
          role="status"
          className={cn(
            "flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-xs",
            oauthErrorMessage
              ? "border-[color:var(--wrong)]/25 bg-wrong-wash text-wrong"
              : "border-[color:var(--right)]/30 bg-right-wash text-[color:var(--right)]"
          )}
        >
          <span>
            {oauthErrorMessage ??
              `Connected to Google NotebookLM${google.user ? ` as ${google.user.email}` : ""}. You can now push sources straight into your notebooks.`}
          </span>
          <button
            type="button"
            onClick={() => setDismissedOAuthBanner(true)}
            aria-label="Dismiss status notice"
            className="p-1 opacity-75 hover:opacity-100 cursor-pointer"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}

      {/* Top Panel: Your Google NotebookLM Account */}
      <section aria-labelledby="google-notebook-account-heading">
        <div className="rounded-[var(--radius-panel)] border border-line bg-paper-raised p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="inline-flex size-6 items-center justify-center rounded-full bg-sun text-ink">
                  <GoogleIcon className="size-3.5" />
                </span>
                <h2
                  id="google-notebook-account-heading"
                  className="font-display text-xl font-[450] tracking-[-0.02em] text-ink"
                >
                  Your Google NotebookLM account
                </h2>
                {google.connected && google.user ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-right-wash px-2.5 py-0.5 text-[11px] font-medium text-[color:var(--right)]">
                    <span className="size-1.5 rounded-full bg-[color:var(--right)]" />
                    <span>Connected</span>
                  </span>
                ) : null}
              </div>
              <p className="text-xs leading-relaxed text-ink-soft max-w-2xl">
                {google.connected && google.user
                  ? `Signed in as ${google.user.name} (${google.user.email}). Push your selected C++ Atlas topics or reference pages directly into any of your NotebookLM notebooks.`
                  : "Sign in with Google to browse your NotebookLM notebooks and push selected C++ Atlas topics directly into them without downloading Markdown files."}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {google.connected ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    disabled={selectedSources.length === 0}
                    onClick={handleOpenBundlePush}
                    className="cursor-pointer"
                  >
                    <NotebookLmIcon className="size-3.5" />
                    <span>
                      Send {selectedSources.length} loaded{" "}
                      {selectedSources.length === 1 ? "source" : "sources"} to
                      NotebookLM
                    </span>
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="outline"
                    onClick={() => void google.refreshNotebooks()}
                    disabled={google.notebooksLoading}
                    aria-label="Refresh your NotebookLM notebooks"
                    className="cursor-pointer"
                  >
                    <RefreshCw
                      className={cn(
                        "size-3.5",
                        google.notebooksLoading && "animate-spin"
                      )}
                      aria-hidden
                    />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => void google.signOut()}
                    className="cursor-pointer text-ink-soft"
                  >
                    <LogOut className="size-3.5" aria-hidden />
                    <span>Sign out</span>
                  </Button>
                </>
              ) : google.configured ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => google.signIn()}
                  className="cursor-pointer"
                >
                  <GoogleIcon className="size-3.5" />
                  <span>Sign in with Google</span>
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={selectedSources.length === 0}
                  onClick={handleOpenBundlePush}
                  className="cursor-pointer"
                >
                  <GoogleIcon className="size-3.5" />
                  <span>Connect Google OAuth</span>
                </Button>
              )}
            </div>
          </div>

          {google.connected ? (
            google.notebooksError ? (
              <div className="rounded-2xl border border-[color:var(--wrong)]/25 bg-wrong-wash px-3.5 py-2.5 text-xs text-wrong flex flex-wrap items-center justify-between gap-2">
                <span>{google.notebooksError}</span>
                {google.notebooksErrorCode === "ACCOUNT_NOT_INITIALIZED" ? (
                  <a
                    href={NOTEBOOKLM_WEB_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium underline underline-offset-3"
                  >
                    <span>Open notebooklm.google.com</span>
                    <ExternalLink className="size-3" aria-hidden />
                  </a>
                ) : null}
              </div>
            ) : google.notebooksLoading && google.notebooks.length === 0 ? (
              <p className="text-xs text-ink-faint">
                Loading your NotebookLM notebooks…
              </p>
            ) : google.notebooks.length > 0 ? (
              <div className="space-y-2 border-t border-line pt-3">
                <div className="text-[11px] font-medium text-ink-soft">
                  Your NotebookLM notebooks ({google.notebooks.length})
                </div>
                <div className="flex flex-wrap gap-2">
                  {google.notebooks.slice(0, 8).map((nb) => (
                    <a
                      key={nb.name}
                      href={nb.webUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line-strong bg-paper px-3 text-xs font-medium text-ink transition-colors hover:border-ink/40"
                    >
                      <NotebookLmIcon className="size-3 text-ink-soft" />
                      <span className="max-w-[14rem] truncate">
                        {nb.displayName}
                      </span>
                      <ExternalLink
                        className="size-2.5 text-ink-faint"
                        aria-hidden
                      />
                    </a>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-ink-faint">
                No notebooks found yet — click &ldquo;Send loaded sources to
                NotebookLM&rdquo; above to create your first one.
              </p>
            )
          ) : !google.loading && !google.configured ? (
            <details className="group text-xs text-ink-soft border-t border-line pt-3">
              <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 font-medium text-ink-soft hover:text-ink [&::-webkit-details-marker]:hidden">
                <ChevronDown
                  className="size-3.5 transition-transform duration-150 group-open:rotate-180"
                  aria-hidden
                />
                <span>
                  Enable Google OAuth login for direct NotebookLM sync
                </span>
              </summary>
              <div className="mt-2.5 space-y-1.5 leading-relaxed">
                <p>
                  Create an OAuth 2.0 Web Client in Google Cloud Console, enable
                  the{" "}
                  <code className="font-mono text-ink">
                    notebook.googleapis.com
                  </code>{" "}
                  API, and set{" "}
                  <code className="font-mono text-ink">
                    GOOGLE_OAUTH_CLIENT_ID
                  </code>{" "}
                  and{" "}
                  <code className="font-mono text-ink">
                    GOOGLE_OAUTH_CLIENT_SECRET
                  </code>{" "}
                  in <code className="font-mono text-ink">.env.local</code> or
                  Vercel.
                </p>
                {google.redirectUri ? (
                  <p>
                    Authorized redirect URI:{" "}
                    <code className="font-mono text-ink break-all">
                      {google.redirectUri}
                    </code>
                  </p>
                ) : null}
              </div>
            </details>
          ) : null}
        </div>
      </section>

      {/* Top Shelf: Public NotebookLM Workspaces */}
      <section aria-labelledby="public-notebooks-heading" className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2
              id="public-notebooks-heading"
              className="font-display text-2xl font-[450] tracking-[-0.02em] text-ink"
            >
              Public NotebookLM workspaces
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              Jump directly into a curated Google NotebookLM workspace, or load
              any continent&apos;s starter sources into the live Studio below.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {publicWorkspaces.map((ws) => (
            <div
              key={ws.id}
              className={cn(
                "flex flex-col justify-between gap-4 rounded-[var(--radius-panel)] border p-4",
                ws.scope === "atlas"
                  ? "border-ink/20 bg-sun-wash/35"
                  : "border-line bg-paper-raised"
              )}
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-[var(--radius-chip)] bg-paper px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-ink-soft border border-line">
                    {ws.scope === "atlas" ? "Atlas" : "Continent"}
                  </span>
                  {ws.notebookUrl ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[color:var(--right)]">
                      <span className="size-1.5 rounded-full bg-[color:var(--right)]" />
                      Live link
                    </span>
                  ) : null}
                </div>
                <h3 className="font-display text-base font-[450] tracking-[-0.015em] text-ink">
                  {ws.title}
                </h3>
                <p className="text-xs leading-relaxed text-ink-soft">
                  {ws.subtitle}
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                {ws.notebookUrl ? (
                  <>
                    <a
                      href={ws.notebookUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-7 items-center justify-center gap-1.5 rounded-full bg-ink px-3 text-xs font-medium text-paper transition-colors hover:bg-ink/85"
                    >
                      <NotebookLmIcon className="size-3" />
                      <span>Open in NotebookLM</span>
                      <ExternalLink className="size-2.5" aria-hidden />
                    </a>
                    <button
                      type="button"
                      onClick={() => loadWorkspaceIntoStudio(ws)}
                      className="inline-flex h-7 items-center justify-center gap-1 rounded-full border border-line-strong bg-paper px-3 text-xs font-medium text-ink transition-colors hover:border-ink/40 cursor-pointer"
                    >
                      Load in Studio
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => loadWorkspaceIntoStudio(ws)}
                      className="inline-flex h-7 items-center justify-center gap-1.5 rounded-full bg-ink px-3 text-xs font-medium text-paper transition-colors hover:bg-ink/85 cursor-pointer"
                    >
                      <GeminiIcon className="size-3" />
                      <span>Load in Studio</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopyWorkspaceUrlsAndOpen(ws)}
                      className="inline-flex h-7 items-center justify-center gap-1.5 rounded-full border border-line-strong bg-paper px-2.5 text-[11px] font-medium text-ink-soft transition-colors hover:border-ink/40 hover:text-ink cursor-pointer"
                    >
                      {copiedWsId === ws.id ? (
                        <Check
                          className="size-3 text-[color:var(--right)]"
                          aria-hidden
                        />
                      ) : (
                        <NotebookLmIcon className="size-3" />
                      )}
                      <span>
                        {copiedWsId === ws.id
                          ? "URLs copied — paste!"
                          : "Copy URLs & open"}
                      </span>
                      <ExternalLink className="size-2.5" aria-hidden />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        <details className="group text-xs text-ink-soft">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 font-medium text-ink-soft hover:text-ink [&::-webkit-details-marker]:hidden">
            <ChevronDown
              className="size-3.5 transition-transform duration-150 group-open:rotate-180"
              aria-hidden
            />
            <span>Publish public NotebookLM share links</span>
          </summary>
          <div className="mt-2.5 rounded-2xl border border-line bg-paper-raised p-4 space-y-2 leading-relaxed">
            <p>
              To link permanent Google NotebookLM shared notebooks (&ldquo;Anyone
              with a link&rdquo;) directly on these cards and on every topic/reference
              page, set any of these environment variables (or configure{" "}
              <code className="font-mono text-ink">src/data/notebooks.ts</code>):
            </p>
            <ul className="grid gap-1 font-mono text-[11px] text-ink sm:grid-cols-2">
              {publicWorkspaces.map((ws) => (
                <li key={ws.id}>
                  {ws.envVar}
                  {ws.notebookUrl ? " (active)" : ""}
                </li>
              ))}
            </ul>
          </div>
        </details>
      </section>

      {/* Main Split Workspace */}
      <div className="grid items-start gap-8 lg:grid-cols-[360px_minmax(0,1fr)]">
        {/* Left Column: Source Picker + External Handoff */}
        <div className="space-y-6">
          <Window title="sources.workspace" bodyClassName="p-5 space-y-5">
            <div className="flex items-center justify-between gap-2 text-sm font-medium text-ink">
              <div className="flex items-center gap-2">
                <Headphones className="size-4 text-ink-soft" aria-hidden />
                <span>Curated starter bundles</span>
              </div>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- route handler, not a page */}
              <a
                href="/api/notebook/topics-all?download=1"
                className="text-xs font-medium text-ink-soft underline decoration-line-strong underline-offset-3 hover:text-ink hover:decoration-ink"
              >
                All topics .md
              </a>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((preset) => (
                <Button
                  key={preset.id}
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => setSelectedSources(preset.sources)}
                  className="text-xs cursor-pointer"
                >
                  {preset.label}
                </Button>
              ))}
            </div>

            {topics.length > 0 ? (
              <div className="space-y-2 border-t border-line pt-4">
                <div className="text-xs font-medium text-ink">
                  Add study topics ({topics.length})
                </div>
                <Input
                  value={topicFilter}
                  onChange={(e) => setTopicFilter(e.target.value)}
                  placeholder="Filter study topics…"
                  className="h-8 rounded-full border-line-strong bg-paper px-3.5 text-xs text-ink"
                />
                <div className="max-h-40 divide-y divide-line overflow-y-auto rounded-2xl border border-line bg-paper-raised">
                  {filteredTopicOptions.map((topic) => {
                    const key = `topic:${topic.slug}`;
                    const added = selectedSources.some(
                      (s) => sourceKey(s) === key
                    );
                    return (
                      <button
                        key={topic.slug}
                        type="button"
                        onClick={() =>
                          toggleItem({
                            kind: "topic",
                            slug: topic.slug,
                            name: topic.title,
                            trackTitle: topic.trackTitle,
                          })
                        }
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-sun-wash/50 cursor-pointer"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-xs font-medium text-ink">
                            {topic.title}
                          </div>
                          <div className="truncate text-[10px] text-ink-faint">
                            {topic.trackTitle}
                          </div>
                        </div>
                        {added ? (
                          <Check
                            className="size-3.5 shrink-0 text-[color:var(--right)]"
                            aria-hidden
                          />
                        ) : (
                          <Plus
                            className="size-3.5 shrink-0 text-ink"
                            aria-hidden
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="space-y-2 border-t border-line pt-4">
              <div className="text-xs font-medium text-ink">
                Search topics or cppreference pages
              </div>
              <div className="relative">
                <Search
                  className="size-3.5 text-ink-faint absolute left-3.5 top-1/2 -translate-y-1/2"
                  aria-hidden
                />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search std::span, malloc, coroutines…"
                  className="h-9 rounded-full border-line-strong bg-paper pl-9 text-xs text-ink"
                />
              </div>

              {activeSearchResults.length > 0 ? (
                <div className="max-h-52 divide-y divide-line overflow-y-auto rounded-2xl border border-line bg-paper-raised">
                  {activeSearchResults.map((res) => (
                    <button
                      key={`${res.kind ?? "ref"}-${res.lang}-${res.path}-${res.name}`}
                      type="button"
                      onClick={() =>
                        res.kind === "topic" && res.slug
                          ? addItem({
                              kind: "topic",
                              slug: res.slug,
                              name: res.name,
                              trackTitle: res.companionShortTitle,
                            })
                          : addItem({
                              kind: "reference",
                              lang: res.lang,
                              path: res.path.split("#")[0],
                              name: res.name,
                            })
                      }
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-sun-wash/50 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-mono text-xs text-ink">
                          {res.name}
                        </div>
                        <div className="truncate font-mono text-[10px] text-ink-faint">
                          {res.urlPath}
                        </div>
                      </div>
                      <Plus className="size-3.5 shrink-0 text-ink" aria-hidden />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="space-y-2.5 border-t border-line pt-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-ink">
                  Loaded sources ({selectedSources.length})
                </span>
                {selectedSources.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setSelectedSources([])}
                    className="text-ink-faint hover:text-ink cursor-pointer"
                  >
                    Clear all
                  </button>
                ) : null}
              </div>

              <div className="space-y-2">
                {selectedSources.map((item) => (
                  <div
                    key={sourceKey(item)}
                    className="flex items-center justify-between gap-2 rounded-2xl border border-line bg-paper px-3 py-2"
                  >
                    <label className="flex min-w-0 items-center gap-2.5 cursor-pointer">
                      <Checkbox
                        checked
                        onCheckedChange={() => toggleItem(item)}
                      />
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium text-ink">
                          {item.name}
                        </div>
                        <div className="truncate font-mono text-[10px] text-ink-faint">
                          {sourceDisplayPath(item)}
                        </div>
                      </div>
                    </label>
                    <button
                      type="button"
                      onClick={() => toggleItem(item)}
                      aria-label={`Remove ${item.name}`}
                      className="p-1 text-ink-faint hover:text-ink cursor-pointer"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-line pt-4">
              <label className="flex items-center justify-between gap-3 text-xs text-ink-body cursor-pointer">
                <span>Include Socratic quiz answers</span>
                <Switch
                  checked={includeAnswers}
                  onCheckedChange={setIncludeAnswers}
                  size="sm"
                />
              </label>
            </div>

            {/* External bundle handoff */}
            <div className="space-y-2 border-t border-line pt-4">
              <div className="text-xs font-medium text-ink">
                Ask this bundle externally
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  disabled={bundleSources.length === 0}
                  onMouseEnter={warmBundleSources}
                  onFocus={warmBundleSources}
                  onClick={() => void handleOpenBundleExternal("chatgpt")}
                  className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line-strong bg-paper-raised px-2.5 text-xs font-medium text-ink hover:border-ink/40 cursor-pointer disabled:opacity-40"
                >
                  <ChatGptIcon className="size-3" />
                  <span>
                    {bundlePendingTarget === "chatgpt"
                      ? "Opening…"
                      : bundleCopiedTarget === "chatgpt"
                        ? "Full .md copied"
                        : "Ask ChatGPT"}
                  </span>
                  <ExternalLink className="size-2.5 text-ink-faint" aria-hidden />
                </button>

                <button
                  type="button"
                  disabled={bundleSources.length === 0}
                  onMouseEnter={warmBundleSources}
                  onFocus={warmBundleSources}
                  onClick={() => void handleOpenBundleExternal("claude")}
                  className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line-strong bg-paper-raised px-2.5 text-xs font-medium text-ink hover:border-ink/40 cursor-pointer disabled:opacity-40"
                >
                  <ClaudeIcon className="size-3" />
                  <span>
                    {bundlePendingTarget === "claude"
                      ? "Opening…"
                      : bundleCopiedTarget === "claude"
                        ? "Full .md copied"
                        : "Ask Claude"}
                  </span>
                  <ExternalLink className="size-2.5 text-ink-faint" aria-hidden />
                </button>

                <button
                  type="button"
                  disabled={selectedSources.length === 0}
                  onClick={handleOpenBundlePush}
                  className="inline-flex h-7 items-center gap-1.5 rounded-full bg-ink px-2.5 text-xs font-medium text-paper hover:bg-ink/85 cursor-pointer disabled:opacity-40"
                >
                  {google.connected ? (
                    <NotebookLmIcon className="size-3" />
                  ) : (
                    <GoogleIcon className="size-3" />
                  )}
                  <span>Send to my NotebookLM</span>
                </button>

                <button
                  type="button"
                  disabled={selectedSources.length === 0}
                  onClick={handleCopyBundleAndOpenNotebookLm}
                  className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-paper px-2.5 text-xs font-medium text-ink-soft hover:border-line-strong hover:text-ink cursor-pointer disabled:opacity-40"
                >
                  {copiedBundleUrls ? (
                    <Check
                      className="size-3 text-[color:var(--right)]"
                      aria-hidden
                    />
                  ) : (
                    <NotebookLmIcon className="size-3" />
                  )}
                  <span>
                    {copiedBundleUrls
                      ? "URLs copied — paste!"
                      : "Copy URLs & open NotebookLM"}
                  </span>
                  <ExternalLink className="size-2.5" aria-hidden />
                </button>
              </div>
            </div>
          </Window>
        </div>

        {/* Right Column: Live Gemini Studio Window */}
        <Window
          title={
            activeTab === "markdown" && loadingMd
              ? "notebooklm-pack.md (compiling…)"
              : `studio.notebooklm (${selectedSources.length} ${selectedSources.length === 1 ? "source" : "sources"})`
          }
          bodyClassName="p-5 sm:p-6 space-y-5"
        >
          <GeminiKeyBanner
            configured={configured}
            sessionKey={sessionKey}
            persistence={persistence}
            onSaveKey={handleSaveKey}
            onClearKey={handleClearKey}
            fallbackPrompt={
              bundleSources.length > 0 ? buildBundleFallbackPrompt : undefined
            }
            onWarmFallback={
              bundleSources.length > 0 ? warmBundleSources : undefined
            }
          />

          <Tabs
            value={activeTab}
            onValueChange={(val) => setActiveTab(val as StudioTab)}
            className="space-y-5"
          >
            <TabsList className="w-full justify-start">
              <TabsTrigger value="chat" className="h-8 px-3.5 text-xs sm:text-sm cursor-pointer">
                <MessageSquare className="size-3.5" aria-hidden />
                <span>Notebook Chat</span>
              </TabsTrigger>
              <TabsTrigger value="audio" className="h-8 px-3.5 text-xs sm:text-sm cursor-pointer">
                <Headphones className="size-3.5" aria-hidden />
                <span>Audio Overview</span>
              </TabsTrigger>
              <TabsTrigger value="guides" className="h-8 px-3.5 text-xs sm:text-sm cursor-pointer">
                <BookOpen className="size-3.5" aria-hidden />
                <span>Studio Guides</span>
              </TabsTrigger>
              <TabsTrigger value="markdown" className="h-8 px-3.5 text-xs sm:text-sm cursor-pointer">
                <FileText className="size-3.5" aria-hidden />
                <span>Raw Markdown</span>
              </TabsTrigger>
            </TabsList>

            {/* Tab 1: Grounded Multi-Source Notebook Chat */}
            <TabsContent value="chat" className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-ink-soft">
                  Grounded Q&amp;A across all {selectedSources.length} selected{" "}
                  {selectedSources.length === 1 ? "source" : "sources"} ({chatModel})
                </span>
                {chatMessages.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      stopChat();
                      setChatMessages([]);
                      setInteractionState({ id: null, sig: "" });
                      setChatError(null);
                    }}
                    className="inline-flex items-center gap-1 text-xs text-ink-faint hover:text-ink cursor-pointer"
                  >
                    <RotateCcw className="size-3" aria-hidden />
                    <span>Clear thread</span>
                  </button>
                ) : null}
              </div>

              <div className="h-[420px] overflow-y-auto rounded-[var(--radius-panel)] border border-line bg-paper p-4 space-y-4">
                {selectedSources.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-center text-sm text-ink-soft">
                    Select at least one topic or reference page on the left to
                    start chatting with your sources.
                  </div>
                ) : chatMessages.length === 0 ? (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-line bg-paper-raised p-4 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-ink">
                        <Sparkles className="size-3.5 text-ink-soft" aria-hidden />
                        <span>Multi-source synthesis ready</span>
                      </div>
                      <p className="text-xs leading-relaxed text-ink-soft">
                        Ask cross-cutting C++ questions across{" "}
                        {selectedSources.map((s) => s.name).join(", ")}. Answers
                        cite sources as [1], [2] and ISO clauses.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {NOTEBOOK_SYNTHESIS_PROMPTS.map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          disabled={chatStreaming}
                          onClick={() => {
                            const hasKey =
                              configured === true || Boolean(sessionKey.trim());
                            if (!hasKey) {
                              setChatDraft(prompt);
                              setChatConnectNotice(
                                "Connect Gemini above to send this prompt."
                              );
                              return;
                            }
                            setChatConnectNotice(null);
                            void sendChatMessage(prompt);
                          }}
                          className="rounded-full border border-line-strong bg-paper-raised px-3 py-1.5 text-xs text-ink transition-colors hover:border-ink/40 hover:bg-sun-wash/50 cursor-pointer disabled:opacity-50"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  chatMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex flex-col gap-1",
                        msg.role === "user" ? "items-end" : "items-start"
                      )}
                    >
                      <span className="px-1 text-[10px] font-medium uppercase tracking-wider text-ink-faint">
                        {msg.role === "user" ? "You" : "Gemini"}
                      </span>
                      {msg.role === "user" ? (
                        <div className="max-w-[85%] rounded-2xl bg-sun-wash px-3.5 py-2.5 text-sm leading-relaxed text-ink">
                          {msg.text}
                        </div>
                      ) : (
                        <div className="w-full rounded-2xl border border-line bg-paper-raised px-4 py-3">
                          {msg.text ? (
                            <AiMarkdown content={msg.text} />
                          ) : (
                            <div className="flex items-center gap-2 text-xs text-ink-faint">
                              <span className="size-1.5 animate-pulse rounded-full bg-sun-deep" />
                              <span>Synthesizing across loaded sources…</span>
                            </div>
                          )}
                          {msg.streaming && msg.text ? (
                            <span className="mt-1 inline-block h-3.5 w-1.5 animate-pulse rounded-xs bg-ink/40 align-middle" />
                          ) : null}
                        </div>
                      )}
                    </div>
                  ))
                )}

                {chatError ? (
                  <div className="rounded-2xl border border-[color:var(--wrong)]/25 bg-wrong-wash px-3.5 py-2.5 text-xs text-wrong">
                    {chatError}
                  </div>
                ) : null}

                <div ref={chatBottomRef} />
              </div>

                {chatConnectNotice ? (
                  <p className="mb-2 rounded-xl border border-line-strong bg-sun-wash/45 px-3 py-1.5 text-xs text-ink-soft">
                    {chatConnectNotice}
                  </p>
                ) : null}

              <form onSubmit={handleChatSubmit} className="flex items-end gap-2">
                <Textarea
                  value={chatDraft}
                  onChange={(e) => {
                    setChatDraft(e.target.value);
                    if (chatConnectNotice) setChatConnectNotice(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleChatSubmit();
                    }
                  }}
                  placeholder="Ask across your loaded C++ sources…"
                  rows={2}
                  className="min-h-11 max-h-32 resize-none rounded-2xl border-line-strong bg-paper px-3.5 py-2.5 text-sm text-ink"
                />
                {chatStreaming ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={stopChat}
                    aria-label="Stop response"
                    className="shrink-0 cursor-pointer"
                  >
                    <Square className="size-3.5" aria-hidden />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    size="icon"
                    disabled={!chatDraft.trim() || selectedSources.length === 0}
                    aria-label="Send message"
                    className="shrink-0 cursor-pointer"
                  >
                    <ArrowUp className="size-4" aria-hidden />
                  </Button>
                )}
              </form>
            </TabsContent>

            {/* Tab 2: Two-Host Audio Overview */}
            <TabsContent value="audio" className="space-y-5">
              <div className="rounded-[var(--radius-panel)] border border-line bg-paper p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="text-sm font-medium text-ink">
                      Two-host Audio Overview (Alex &amp; Maya)
                    </div>
                    <p className="text-xs text-ink-soft">
                      Generates a spoken deep-dive over your {selectedSources.length}{" "}
                      loaded sources using {ttsModel}.
                    </p>
                  </div>

                  <div className="inline-flex rounded-full border border-line-strong bg-paper-raised p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setAudioLength("short")}
                      className={cn(
                        "rounded-full px-3 py-1 font-medium transition-colors cursor-pointer",
                        audioLength === "short"
                          ? "bg-sun text-ink"
                          : "text-ink-soft hover:text-ink"
                      )}
                    >
                      Short (~1 min)
                    </button>
                    <button
                      type="button"
                      onClick={() => setAudioLength("standard")}
                      className={cn(
                        "rounded-full px-3 py-1 font-medium transition-colors cursor-pointer",
                        audioLength === "standard"
                          ? "bg-sun text-ink"
                          : "text-ink-soft hover:text-ink"
                      )}
                    >
                      Standard (~2–3 min)
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={audioFocus}
                    onChange={(e) => setAudioFocus(e.target.value)}
                    placeholder="Optional focus (e.g. Focus on C++23/26 pitfalls & lifetime rules)…"
                    className="h-9 min-w-[14rem] flex-1 rounded-full border-line-strong bg-paper-raised px-3.5 text-xs text-ink"
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={audioGenerating || selectedSources.length === 0}
                    onClick={handleGenerateAudio}
                    className="cursor-pointer"
                  >
                    <Headphones className="size-3.5" aria-hidden />
                    <span>
                      {audioGenerating
                        ? "Writing script & voices…"
                        : "Generate Audio Overview"}
                    </span>
                  </Button>
                </div>

                {audioGenerating ? (
                  <p className="text-xs text-ink-soft">
                    Writing two-host script &amp; synthesizing voices… this
                    usually takes 10–25 seconds.
                  </p>
                ) : null}

                {audioError ? (
                  <div className="rounded-2xl border border-[color:var(--wrong)]/25 bg-wrong-wash px-3.5 py-2.5 text-xs text-wrong">
                    {audioError}
                  </div>
                ) : null}
              </div>

              {audioResult ? (
                <div className="space-y-4 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <h3 className="font-display text-lg font-[450] text-ink">
                        {audioResult.title}
                      </h3>
                      {audioResult.summary ? (
                        <p className="text-xs leading-relaxed text-ink-soft">
                          {audioResult.summary}
                        </p>
                      ) : null}
                    </div>

                    {audioObjectUrl ? (
                      <a
                        href={audioObjectUrl}
                        download="cpp-atlas-audio-overview.wav"
                        className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-line-strong bg-paper-raised px-3 text-xs font-medium text-ink hover:border-ink/40"
                      >
                        <Download className="size-3.5" aria-hidden />
                        <span>Download .wav</span>
                      </a>
                    ) : null}
                  </div>

                  {audioObjectUrl ? (
                    <audio
                      controls
                      src={audioObjectUrl}
                      className="w-full"
                    />
                  ) : null}

                  {audioResult.ttsWarning ? (
                    <div className="rounded-2xl border border-line bg-sun-wash/60 px-3.5 py-2.5 text-xs text-ink-body">
                      {audioResult.ttsWarning}
                    </div>
                  ) : null}

                  <div className="space-y-2 border-t border-line pt-4">
                    <div className="text-xs font-medium text-ink">
                      Transcript ({audioResult.turns.length} turns)
                    </div>
                    <div className="max-h-[340px] space-y-2.5 overflow-y-auto pr-1">
                      {audioResult.turns.map((turn, idx) => (
                        <div
                          key={idx}
                          className="rounded-2xl border border-line bg-paper-raised px-3.5 py-2.5 text-xs leading-relaxed"
                        >
                          <div className="mb-1 flex items-center gap-2">
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 font-medium",
                                turn.speaker === "Alex"
                                  ? "bg-sky-wash text-ink"
                                  : "bg-sun-wash text-ink"
                              )}
                            >
                              {turn.speaker}
                            </span>
                            <span className="text-[11px] text-ink-faint">
                              {turn.style}
                            </span>
                          </div>
                          <p className="text-ink-body">{turn.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-[var(--radius-panel)] border border-line bg-paper p-8 text-center text-sm text-ink-soft">
                  Generate an Audio Overview to listen to Alex and Maya break
                  down your loaded C++ topics and trap questions.
                </div>
              )}
            </TabsContent>

            {/* Tab 3: Studio Guides */}
            <TabsContent value="guides" className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2">
                {GUIDE_OPTIONS.map((opt) => {
                  const active = guideArtifact === opt.id && (guideContent || guideStreaming);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={selectedSources.length === 0 || guideStreaming}
                      onClick={() => handleGenerateGuide(opt.id)}
                      className={cn(
                        "rounded-2xl border p-3 text-left transition-colors cursor-pointer disabled:opacity-45",
                        active
                          ? "border-ink/30 bg-sun-wash/55"
                          : "border-line bg-paper hover:border-line-strong"
                      )}
                    >
                      <div className="text-xs font-semibold text-ink">
                        {opt.label}
                      </div>
                      <div className="mt-0.5 text-[11px] text-ink-soft">
                        {opt.hint}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-ink-soft">
                  {guideStreaming
                    ? "Generating artifact from selected sources…"
                    : guideContent
                      ? `Generated ${GUIDE_OPTIONS.find((g) => g.id === guideArtifact)?.label ?? "Guide"}`
                      : "Choose a format above to synthesize your sources."}
                </span>
                <div className="flex items-center gap-2">
                  {guideStreaming ? (
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={stopGuide}
                      className="cursor-pointer"
                    >
                      <Square className="size-3" aria-hidden />
                      <span>Stop</span>
                    </Button>
                  ) : null}
                  {guideContent ? (
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      onClick={handleCopyGuide}
                      className="cursor-pointer"
                    >
                      {copiedGuide ? (
                        <Check
                          className="size-3.5 text-[color:var(--right)]"
                          aria-hidden
                        />
                      ) : (
                        <Copy className="size-3.5" aria-hidden />
                      )}
                      <span>{copiedGuide ? "Copied" : "Copy guide"}</span>
                    </Button>
                  ) : null}
                </div>
              </div>

              {guideError ? (
                <div className="rounded-2xl border border-[color:var(--wrong)]/25 bg-wrong-wash px-3.5 py-2.5 text-xs text-wrong">
                  {guideError}
                </div>
              ) : null}

              <ScrollArea className="h-[430px] rounded-[var(--radius-panel)] border border-line bg-paper p-5">
                {guideContent ? (
                  <AiMarkdown content={guideContent} />
                ) : guideStreaming ? (
                  <div className="flex h-full items-center justify-center py-20 text-sm text-ink-soft">
                    Synthesizing {GUIDE_OPTIONS.find((g) => g.id === guideArtifact)?.label}…
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center py-20 text-sm text-ink-soft">
                    Click Briefing Doc, Study Guide, Developer FAQ, or
                    Standardese Traps to generate a grounded study artifact.
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            {/* Tab 4: Secondary Raw Markdown Export */}
            <TabsContent value="markdown" className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-ink-soft">
                  Plain Markdown bundle for offline tools, local LLMs, or manual
                  uploads.
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={handleCopyUrls}
                    disabled={selectedSources.length === 0}
                    className="cursor-pointer"
                  >
                    {copiedUrls ? (
                      <Check
                        className="size-3.5 text-[color:var(--right)]"
                        aria-hidden
                      />
                    ) : (
                      <Copy className="size-3.5" aria-hidden />
                    )}
                    <span>{copiedUrls ? "Copied URLs" : "Copy URLs"}</span>
                  </Button>

                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={handleCopyMarkdown}
                    disabled={!displayedMarkdown}
                    className="cursor-pointer"
                  >
                    {copiedMd ? (
                      <Check
                        className="size-3.5 text-[color:var(--right)]"
                        aria-hidden
                      />
                    ) : (
                      <Copy className="size-3.5" aria-hidden />
                    )}
                    <span>{copiedMd ? "Copied" : "Copy markdown"}</span>
                  </Button>

                  <Button
                    type="button"
                    size="xs"
                    variant="default"
                    onClick={handleDownload}
                    disabled={!displayedMarkdown}
                    className="cursor-pointer"
                  >
                    <Download className="size-3.5" aria-hidden />
                    <span>Download .md</span>
                  </Button>
                </div>
              </div>

              <ScrollArea className="h-[460px] rounded-[var(--radius-panel)] border border-line bg-paper p-5">
                {displayedMarkdown ? (
                  <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-[var(--code-ink)]">
                    {displayedMarkdown}
                  </pre>
                ) : loadingMd ? (
                  <div className="flex h-full items-center justify-center py-20 text-sm text-ink-soft">
                    Compiling Markdown from selected sources…
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center py-20 text-sm text-ink-soft">
                    Select at least one topic or reference page on the left to
                    compile raw Markdown.
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </Window>
      </div>
    </div>
  );
}
