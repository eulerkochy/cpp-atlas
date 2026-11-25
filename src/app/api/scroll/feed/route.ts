import { NextResponse } from "next/server";
import {
  getCoreScrollCorpus,
  getProceduralScrollCorpus,
  getScrollCardById,
  getScrollCorpus,
  getScrollFeedMeta,
} from "@/lib/scroll-corpus";
import { getReferenceScrollBatch } from "@/lib/scroll-reference-cards";
import {
  SCROLL_CARD_KINDS,
  type ScrollCard,
  type ScrollCardKind,
  type ScrollFeedPool,
  type ScrollFeedResponse,
} from "@/lib/scroll-types";

const VALID_KINDS = new Set<string>(SCROLL_CARD_KINDS);
const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 200;
const MAX_REF_LIMIT = 60;

function parsePositiveInt(raw: string | null, fallback: number): number {
  if (raw === null || raw.trim() === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseKindFilter(raw: string | null): Set<ScrollCardKind> | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || trimmed === "all") return null;

  const kinds = new Set<ScrollCardKind>();
  for (const part of trimmed.split(",")) {
    const token = part.trim();
    if (VALID_KINDS.has(token)) {
      kinds.add(token as ScrollCardKind);
    }
  }
  return kinds;
}

function parsePool(raw: string | null): ScrollFeedPool {
  const val = raw?.trim().toLowerCase();
  if (val === "core" || val === "procedural" || val === "reference") {
    return val;
  }
  return "all";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const meta = getScrollFeedMeta();

  // 1. Direct ID hydration across ALL pools (core, simulator, procedural, reference)
  const idsParam = searchParams.get("ids");
  if (idsParam !== null && idsParam.trim().length > 0) {
    const seen = new Set<string>();
    const cards: ScrollCard[] = [];
    for (const rawId of idsParam.split(",")) {
      const id = rawId.trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const card = getScrollCardById(id);
      if (card) cards.push(card);
      if (cards.length >= MAX_LIMIT) break;
    }

    const payload: ScrollFeedResponse = {
      cards,
      total: cards.length,
      cursor: 0,
      nextCursor: null,
      meta,
    };

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  }

  const poolKind = parsePool(searchParams.get("pool"));
  const kindFilter = parseKindFilter(searchParams.get("kind"));
  const rawTrack = searchParams.get("track")?.trim() ?? "";
  const trackFilter = rawTrack && rawTrack !== "all" ? rawTrack : null;
  const pinnedId = searchParams.get("card")?.trim() ?? "";
  const cursor = parsePositiveInt(searchParams.get("cursor"), 0);

  // 2. Lazy streaming over the 6,000+ offline cppreference & C reference markdown pages
  if (poolKind === "reference") {
    const rawLimit = parsePositiveInt(searchParams.get("limit"), DEFAULT_LIMIT);
    const limit = Math.min(Math.max(rawLimit, 1), MAX_REF_LIMIT);
    const seed = parsePositiveInt(searchParams.get("seed"), 0);

    const excludeParam = searchParams.get("exclude");
    const excludeIds = new Set<string>();
    if (excludeParam) {
      for (const rawId of excludeParam.split(",")) {
        const id = rawId.trim();
        if (id) excludeIds.add(id);
      }
    }

    let pinnedCard: ScrollCard | undefined;
    if (pinnedId) {
      pinnedCard = getScrollCardById(pinnedId);
      if (pinnedCard) excludeIds.add(pinnedCard.id);
    }

    const singleKind =
      kindFilter && kindFilter.size === 1
        ? Array.from(kindFilter)[0]
        : undefined;

    const batchLimit = pinnedCard && cursor === 0 ? Math.max(0, limit - 1) : limit;
    const batch =
      kindFilter !== null && kindFilter.size === 0
        ? { cards: [], nextCursor: null, total: 0 }
        : batchLimit === 0
          ? { cards: [], nextCursor: 0, total: meta.poolCounts?.reference ?? 0 }
          : getReferenceScrollBatch({
              cursor,
              limit: batchLimit,
              trackId: trackFilter ?? undefined,
              kind: singleKind,
              excludeIds: excludeIds.size > 0 ? excludeIds : undefined,
              seed,
            });

    const filteredCards =
      kindFilter && kindFilter.size > 1
        ? batch.cards.filter((c) => kindFilter.has(c.kind))
        : batch.cards;

    const cards =
      pinnedCard && cursor === 0
        ? [pinnedCard, ...filteredCards]
        : filteredCards;

    const payload: ScrollFeedResponse = {
      cards,
      total: batch.total,
      cursor,
      nextCursor: batch.nextCursor,
      meta,
    };

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  }

  // 3. Eager offline pools: `all` (core + simulator + procedural), `core`, or `procedural`
  const returnAll =
    searchParams.get("all") === "1" || searchParams.get("all") === "true";
  const rawLimit = parsePositiveInt(searchParams.get("limit"), DEFAULT_LIMIT);
  const limit = Math.min(Math.max(rawLimit, 1), MAX_LIMIT);

  let pool: ScrollCard[] =
    poolKind === "core"
      ? getCoreScrollCorpus()
      : poolKind === "procedural"
        ? getProceduralScrollCorpus()
        : getScrollCorpus();

  if (kindFilter !== null) {
    pool =
      kindFilter.size === 0
        ? []
        : pool.filter((card) => kindFilter.has(card.kind));
  }

  if (trackFilter !== null) {
    pool = pool.filter(
      (card) =>
        card.trackId === trackFilter || card.continentId === trackFilter
    );
  }

  // Deep-link card pinning across ALL pools (including simulator, procedural, and `ref:...`)
  if (pinnedId) {
    const pinnedCard = getScrollCardById(pinnedId);
    if (pinnedCard) {
      pool = [pinnedCard, ...pool.filter((card) => card.id !== pinnedCard.id)];
    }
  }

  const total = pool.length;
  const safeCursor = Math.min(cursor, total);
  const cards = returnAll
    ? pool.slice(safeCursor)
    : pool.slice(safeCursor, safeCursor + limit);
  const nextCursor =
    !returnAll && safeCursor + cards.length < total
      ? safeCursor + cards.length
      : null;

  const payload: ScrollFeedResponse = {
    cards,
    total,
    cursor: safeCursor,
    nextCursor,
    meta,
  };

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
