/**
 * Geometry for the home page's atlas plate: one island per track, grouped
 * into continents by region, with one town per topic.
 *
 * Everything here is a pure function of the track data. Randomness comes
 * from a PRNG seeded by track ids, so the server and the browser draw the
 * same map.
 */

export const MAP_WIDTH = 1100;
export const MAP_HEIGHT = 620;

export const LABEL_SIZE = 15;
export const LABEL_LEADING = 16.5;
export const TOWN_RADIUS = 4.5;

/** Rough advance width of Fraunces at weight 450, as a fraction of the size. */
const CHAR_WIDTH = 0.55;
const CONTROL_POINTS = 120;
const MIN_TOWN_GAP = 20.5;
const COAST_MARGIN = 11;
/** Negative: countries of one continent overlap and share a border. */
const SAME_REGION_GAP = -50;
/** How far each country is drawn toward its continent's middle before relaxing. */
const CONTINENT_PULL = 0.13;
const OTHER_REGION_GAP = 58;
const MAP_MARGIN = 22;

type LabelSide = "inside" | "below" | "above" | "left" | "right";

interface Placement {
  x: number;
  y: number;
  /** Width over height of the island; 1.3 when omitted. */
  aspect?: number;
  /** Rotation in degrees. */
  rotate?: number;
  /** Where the track name goes; inside unless it does not fit. */
  label?: LabelSide;
}

/** Hand-placed island centres, keyed by track id. */
const ISLANDS: Record<string, Placement> = {
  // Language basics: the western continent.
  "program-structure": { x: 148, y: 196, aspect: 1.3, rotate: -8 },
  "types-and-initialization": { x: 290, y: 178, aspect: 1.15, rotate: 10 },
  "expressions-and-functions": { x: 162, y: 328, aspect: 1.3, rotate: 6 },
  "value-semantics": { x: 300, y: 318, aspect: 1.1, rotate: -14 },
  // Building abstractions: the northern continent.
  templates: { x: 560, y: 150, aspect: 1.35, rotate: -6 },
  classes: { x: 716, y: 118, aspect: 1.3, rotate: 8 },
  errors: { x: 700, y: 236, aspect: 1.3, rotate: -8 },
  // The machine: the southern pair.
  "memory-model": { x: 470, y: 455, aspect: 1.3, rotate: 10 },
  concurrency: { x: 630, y: 475, aspect: 1.25, rotate: -6 },
  // Library and C++26: the eastern continent.
  containers: { x: 852, y: 196, aspect: 1.25, rotate: -10 },
  "algorithms-and-ranges": { x: 1002, y: 226, aspect: 0.9, rotate: 4 },
  utilities: { x: 858, y: 356, aspect: 1.3, rotate: 6 },
  cpp26: { x: 1000, y: 432, aspect: 1.0, rotate: -8 },
};

/** Continent names, set in the sea beside each region. */
const REGION_LABELS: Record<string, { x: number; y: number }> = {
  "Language basics": { x: 232, y: 432 },
  "Building abstractions": { x: 560, y: 312 },
  "The machine": { x: 552, y: 592 },
  "Library and C++26": { x: 930, y: 92 },
};

export interface MapTopic {
  slug: string;
  title: string;
  minutes: number;
}

export interface MapTrackInput {
  id: string;
  title: string;
  topics: MapTopic[];
}

export interface MapRegionInput {
  label: string;
  tracks: MapTrackInput[];
}

export interface MapTown extends MapTopic {
  x: number;
  y: number;
}

export interface MapIsland {
  id: string;
  title: string;
  region: string;
  path: string;
  label: {
    lines: string[];
    /** Centre x and the first baseline. */
    x: number;
    y: number;
    box: Box;
  };
  towns: MapTown[];
}

export interface MapRegionLabel {
  label: string;
  x: number;
  y: number;
}

export interface AtlasMap {
  islands: MapIsland[];
  regions: MapRegionLabel[];
  graticule: string[];
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Point {
  x: number;
  y: number;
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (n: number) => Math.round(n * 10) / 10;

/** Splits a long name into two or three balanced lines. */
function labelLines(title: string): string[] {
  if (title.length <= 13) return [title];
  const words = title.split(" ");
  const parts = title.length > 26 && words.length >= 3 ? 3 : 2;
  let best: string[] = [title];
  let bestLength = Infinity;
  const consider = (lines: string[]) => {
    const longest = Math.max(...lines.map((l) => l.length));
    if (longest < bestLength) {
      best = lines;
      bestLength = longest;
    }
  };
  for (let i = 1; i < words.length; i++) {
    if (parts === 2) {
      consider([words.slice(0, i).join(" "), words.slice(i).join(" ")]);
      continue;
    }
    for (let j = i + 1; j < words.length; j++) {
      consider([
        words.slice(0, i).join(" "),
        words.slice(i, j).join(" "),
        words.slice(j).join(" "),
      ]);
    }
  }
  return best;
}

function labelSize(lines: string[]): { w: number; h: number } {
  const longest = Math.max(...lines.map((l) => l.length));
  return {
    w: longest * LABEL_SIZE * CHAR_WIDTH,
    h: LABEL_SIZE + (lines.length - 1) * LABEL_LEADING,
  };
}

/** An island outline: radii around the centre, varied at three scales. */
class Shape {
  readonly radii: number[];
  readonly sx: number;
  readonly sy: number;
  readonly cos: number;
  readonly sin: number;

  constructor(
    public cx: number,
    public cy: number,
    readonly r: number,
    aspect: number,
    rotate: number,
    rand: () => number
  ) {
    this.sx = Math.sqrt(aspect);
    this.sy = 1 / this.sx;
    const angle = (rotate * Math.PI) / 180;
    this.cos = Math.cos(angle);
    this.sin = Math.sin(angle);

    const phase = () => rand() * Math.PI * 2;
    // Large bays and headlands, then finer wiggle.
    const waves = [
      { k: 2, a: 0.05 + rand() * 0.05, p: phase() },
      { k: 3, a: 0.04 + rand() * 0.04, p: phase() },
      { k: 5, a: 0.03 + rand() * 0.025, p: phase() },
      { k: 7, a: 0.025 + rand() * 0.02, p: phase() },
      { k: 11, a: 0.018 + rand() * 0.014, p: phase() },
      { k: 17, a: 0.01 + rand() * 0.008, p: phase() },
      { k: 29, a: 0.006 + rand() * 0.005, p: phase() },
    ];
    // Headlands, a narrow peninsula and deep inlets, as bumps.
    const bumps = [
      { at: phase(), a: 0.14 + rand() * 0.08, w: 0.2 + rand() * 0.12 },
      { at: phase(), a: 0.12 + rand() * 0.1, w: 0.07 + rand() * 0.06 },
      { at: phase(), a: -(0.12 + rand() * 0.08), w: 0.08 + rand() * 0.06 },
      { at: phase(), a: -(0.08 + rand() * 0.06), w: 0.18 + rand() * 0.1 },
    ];
    const jitter = Array.from(
      { length: CONTROL_POINTS },
      () => (rand() - 0.5) * 0.07
    );
    this.radii = Array.from({ length: CONTROL_POINTS }, (_, i) => {
      const t = (i / CONTROL_POINTS) * Math.PI * 2;
      let radius = 1;
      for (const w of waves) radius += w.a * Math.sin(w.k * t + w.p);
      for (const b of bumps) {
        const d = Math.atan2(Math.sin(t - b.at), Math.cos(t - b.at));
        radius += b.a * Math.exp(-((d / b.w) ** 2));
      }
      // Neighbouring jitter is averaged so the coast wiggles without spikes.
      const n = CONTROL_POINTS;
      return (
        radius +
        (jitter[(i - 1 + n) % n] + 2 * jitter[i] + jitter[(i + 1) % n]) / 4
      );
    });
  }

  /** Relative radius at a local angle, interpolated between control points. */
  radiusAt(theta: number): number {
    const n = CONTROL_POINTS;
    const t = (((theta / (Math.PI * 2)) % 1) + 1) % 1;
    const f = t * n;
    const i = Math.floor(f) % n;
    const j = (i + 1) % n;
    const w = f - Math.floor(f);
    return this.radii[i] * (1 - w) + this.radii[j] * w;
  }

  toWorld(lx: number, ly: number): Point {
    const x = lx * this.sx;
    const y = ly * this.sy;
    return {
      x: this.cx + x * this.cos - y * this.sin,
      y: this.cy + x * this.sin + y * this.cos,
    };
  }

  points(): Point[] {
    return this.radii.map((radius, i) => {
      const t = (i / CONTROL_POINTS) * Math.PI * 2;
      return this.toWorld(
        Math.cos(t) * radius * this.r,
        Math.sin(t) * radius * this.r
      );
    });
  }

  /** How far inside the coast a point is, in map units (negative outside). */
  depth(p: Point): number {
    const dx = p.x - this.cx;
    const dy = p.y - this.cy;
    const lx = (dx * this.cos + dy * this.sin) / this.sx;
    const ly = (-dx * this.sin + dy * this.cos) / this.sy;
    const rho = Math.hypot(lx, ly);
    const edge = this.radiusAt(Math.atan2(ly, lx)) * this.r;
    // Scale by the narrower axis so the margin is never overstated.
    return (edge - rho) * this.sy;
  }

  /** Extent of the outline along a unit direction (its support function). */
  support(ux: number, uy: number): number {
    let best = -Infinity;
    for (const p of this.points()) {
      best = Math.max(best, (p.x - this.cx) * ux + (p.y - this.cy) * uy);
    }
    return best;
  }

  bounds(): Box {
    const pts = this.points();
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }

  /** A closed Catmull-Rom curve through the outline, as cubic Béziers. */
  path(): string {
    const p = this.points();
    const n = p.length;
    let d = `M${round(p[0].x)} ${round(p[0].y)}`;
    for (let i = 0; i < n; i++) {
      const p0 = p[(i - 1 + n) % n];
      const p1 = p[i];
      const p2 = p[(i + 1) % n];
      const p3 = p[(i + 2) % n];
      const c1x = p1.x + (p2.x - p0.x) / 6;
      const c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6;
      const c2y = p2.y - (p3.y - p1.y) / 6;
      d += `C${round(c1x)} ${round(c1y)} ${round(c2x)} ${round(c2y)} ${round(p2.x)} ${round(p2.y)}`;
    }
    return `${d}Z`;
  }
}

/** Island scale: area grows with the topic count, plus room for the name. */
function islandRadius(topics: number): number {
  return Math.sqrt((1450 * topics + 6800) / Math.PI);
}

/** Pushes islands apart until neighbours leave a strait and regions leave open sea. */
function relax(shapes: { shape: Shape; region: string }[]) {
  for (let iteration = 0; iteration < 120; iteration++) {
    let moved = false;
    for (let i = 0; i < shapes.length; i++) {
      for (let j = i + 1; j < shapes.length; j++) {
        const a = shapes[i].shape;
        const b = shapes[j].shape;
        const dx = b.cx - a.cx;
        const dy = b.cy - a.cy;
        const d = Math.hypot(dx, dy) || 1;
        const ux = dx / d;
        const uy = dy / d;
        const gap = d - a.support(ux, uy) - b.support(-ux, -uy);
        const target =
          shapes[i].region === shapes[j].region
            ? SAME_REGION_GAP
            : OTHER_REGION_GAP;
        if (gap < target) {
          const push = (target - gap) / 2 + 0.5;
          a.cx -= ux * push;
          a.cy -= uy * push;
          b.cx += ux * push;
          b.cy += uy * push;
          moved = true;
        }
      }
    }
    for (const { shape } of shapes) {
      const box = shape.bounds();
      const shiftX =
        Math.max(0, MAP_MARGIN - box.x) -
        Math.max(0, box.x + box.w - (MAP_WIDTH - MAP_MARGIN));
      const shiftY =
        Math.max(0, MAP_MARGIN - box.y) -
        Math.max(0, box.y + box.h - (MAP_HEIGHT - MAP_MARGIN));
      shape.cx += shiftX;
      shape.cy += shiftY;
    }
    if (!moved) break;
  }
}

function overlaps(p: Point, box: Box, pad: number): boolean {
  return (
    p.x > box.x - pad &&
    p.x < box.x + box.w + pad &&
    p.y > box.y - pad &&
    p.y < box.y + box.h + pad
  );
}

/**
 * Spreads `count` towns evenly over the island: farthest-point sampling on a
 * fine grid, then a few rounds of Lloyd relaxation.
 */
function placeTowns(
  shape: Shape,
  neighbours: Shape[],
  count: number,
  avoid: Box | null,
  rand: () => number
): Point[] | null {
  if (count === 0) return [];
  const step = 5;
  const box = shape.bounds();
  const candidates: Point[] = [];
  for (let y = box.y; y <= box.y + box.h; y += step) {
    for (let x = box.x; x <= box.x + box.w; x += step) {
      const p = { x, y };
      if (shape.depth(p) < COAST_MARGIN) continue;
      // Stay in this country's own territory, clear of shared borders.
      if (neighbours.some((n) => n.depth(p) > -COAST_MARGIN)) continue;
      if (avoid && overlaps(p, avoid, 12)) continue;
      candidates.push(p);
    }
  }
  if (candidates.length < count) return null;

  const chosen: Point[] = [candidates[Math.floor(rand() * candidates.length)]];
  const nearest = candidates.map((c) =>
    Math.hypot(c.x - chosen[0].x, c.y - chosen[0].y)
  );
  while (chosen.length < count) {
    let bestIndex = 0;
    for (let i = 1; i < candidates.length; i++) {
      if (nearest[i] > nearest[bestIndex]) bestIndex = i;
    }
    const next = candidates[bestIndex];
    chosen.push(next);
    candidates.forEach((c, i) => {
      nearest[i] = Math.min(nearest[i], Math.hypot(c.x - next.x, c.y - next.y));
    });
  }

  let towns = chosen;
  for (let pass = 0; pass < 6; pass++) {
    const sums = towns.map(() => ({ x: 0, y: 0, n: 0 }));
    for (const c of candidates) {
      let best = 0;
      let bestDistance = Infinity;
      towns.forEach((t, i) => {
        const distance = (c.x - t.x) ** 2 + (c.y - t.y) ** 2;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = i;
        }
      });
      sums[best].x += c.x;
      sums[best].y += c.y;
      sums[best].n += 1;
    }
    towns = sums.map((s, i) => {
      if (s.n === 0) return towns[i];
      const centroid = { x: s.x / s.n, y: s.y / s.n };
      let snap = candidates[0];
      let snapDistance = Infinity;
      for (const c of candidates) {
        const distance = (c.x - centroid.x) ** 2 + (c.y - centroid.y) ** 2;
        if (distance < snapDistance) {
          snapDistance = distance;
          snap = c;
        }
      }
      return snap;
    });
  }

  for (let i = 0; i < towns.length; i++) {
    for (let j = i + 1; j < towns.length; j++) {
      if (
        Math.hypot(towns[i].x - towns[j].x, towns[i].y - towns[j].y) <
        MIN_TOWN_GAP
      ) {
        return null;
      }
    }
  }
  // Reading order, so keyboard focus moves across the island in rows.
  return [...towns].sort(
    (a, b) => Math.round(a.y / 18) - Math.round(b.y / 18) || a.x - b.x
  );
}

function labelBox(
  shape: Shape,
  lines: string[],
  side: LabelSide,
  centre: Point = { x: shape.cx, y: shape.cy }
): { x: number; y: number; box: Box } {
  const { w, h } = labelSize(lines);
  const bounds = shape.bounds();
  let cx = centre.x;
  let top = centre.y - h / 2;
  if (side === "below") top = bounds.y + bounds.h + 6;
  if (side === "above") top = bounds.y - h - 10;
  if (side === "left") cx = bounds.x - w / 2 - 10;
  if (side === "right") cx = bounds.x + bounds.w + w / 2 + 10;
  const box = {
    x: round(cx - w / 2),
    y: round(top - 3),
    w: round(w),
    h: round(h + 6),
  };
  // The first baseline sits about 0.78em below the top of the line box.
  return { x: cx, y: top + LABEL_SIZE * 0.78, box };
}

function graticule(): string[] {
  const lines: string[] = [];
  for (let y = 62; y < MAP_HEIGHT; y += 62) {
    lines.push(`M0 ${y}H${MAP_WIDTH}`);
  }
  const cx = MAP_WIDTH / 2;
  const cy = MAP_HEIGHT / 2;
  for (let lon = -7; lon <= 7; lon++) {
    const offset = lon * 92;
    const points: string[] = [];
    for (let k = 0; k <= 24; k++) {
      const y = (k / 24) * MAP_HEIGHT;
      const v = (y - cy) / (MAP_HEIGHT * 0.92);
      const x = cx + offset * Math.sqrt(1 - v * v);
      points.push(`${round(x)} ${round(y)}`);
    }
    lines.push(`M${points.join("L")}`);
  }
  return lines;
}

export function buildAtlasMap(regions: MapRegionInput[]): AtlasMap {
  const entries = regions.flatMap((region) =>
    region.tracks.map((track) => ({ region: region.label, track }))
  );

  // Tracks without a hand-placed spot start beside their region's islands.
  const placed = new Map<string, Point[]>();
  for (const { region, track } of entries) {
    const spot = ISLANDS[track.id];
    if (spot) placed.set(region, [...(placed.get(region) ?? []), spot]);
  }

  const shapes = entries.map(({ region, track }) => {
    const rand = mulberry32(hash(track.id));
    let spot = ISLANDS[track.id];
    if (!spot) {
      const siblings = placed.get(region) ?? [];
      const base = siblings.length
        ? {
            x: siblings.reduce((s, p) => s + p.x, 0) / siblings.length,
            y: siblings.reduce((s, p) => s + p.y, 0) / siblings.length,
          }
        : { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 };
      const angle = rand() * Math.PI * 2;
      spot = {
        x: base.x + Math.cos(angle) * 60,
        y: base.y + Math.sin(angle) * 60,
      };
    }
    const shape = new Shape(
      spot.x,
      spot.y,
      islandRadius(track.topics.length),
      spot.aspect ?? 1.3,
      spot.rotate ?? 0,
      rand
    );
    return { region, track, spot, shape, rand };
  });

  // Draw each continent together so its countries share borders.
  const regionNames = [...new Set(shapes.map((s) => s.region))];
  for (const name of regionNames) {
    const own = shapes.filter((s) => s.region === name);
    const mx = own.reduce((sum, s) => sum + s.shape.cx, 0) / own.length;
    const my = own.reduce((sum, s) => sum + s.shape.cy, 0) / own.length;
    for (const { shape } of own) {
      shape.cx += (mx - shape.cx) * CONTINENT_PULL;
      shape.cy += (my - shape.cy) * CONTINENT_PULL;
    }
  }
  relax(shapes);

  const islands: MapIsland[] = shapes.map(
    ({ region, track, spot, shape, rand }) => {
      // Where two countries overlap, the later one owns the overlap: its
      // outline is the dashed border drawn there. So a country's territory is
      // its shape minus the later countries of its continent.
      const index = shapes.findIndex((o) => o.shape === shape);
      const neighbours = shapes
        .slice(index + 1)
        .filter((o) => o.region === region)
        .map((o) => o.shape);
      const lines = labelLines(track.title);
      let label = labelBox(shape, lines, "inside");
      let towns: Point[] | null = null;

      // Inside first: try label centres across the country's own territory,
      // nearest its middle first, until the towns also fit around it.
      if (!spot.label || spot.label === "inside") {
        const inOwn = (p: Point, margin: number) =>
          shape.depth(p) > margin &&
          neighbours.every((n) => n.depth(p) < -margin);
        const territory: Point[] = [];
        const bounds = shape.bounds();
        for (let y = bounds.y; y <= bounds.y + bounds.h; y += 6) {
          for (let x = bounds.x; x <= bounds.x + bounds.w; x += 6) {
            if (inOwn({ x, y }, 0)) territory.push({ x, y });
          }
        }
        const middle = territory.reduce(
          (m, p) => ({
            x: m.x + p.x / territory.length,
            y: m.y + p.y / territory.length,
          }),
          { x: 0, y: 0 }
        );
        const fitsAt = (centre: Point) => {
          const { box } = labelBox(shape, lines, "inside", centre);
          for (let i = 0; i <= 4; i++) {
            for (const [fx, fy] of [
              [i / 4, 0],
              [i / 4, 1],
              [0, i / 4],
              [1, i / 4],
            ]) {
              const p = { x: box.x + fx * box.w, y: box.y + fy * box.h };
              if (!inOwn(p, 5)) return false;
            }
          }
          return true;
        };
        const centres = territory
          .filter(fitsAt)
          .sort(
            (a, b) =>
              Math.hypot(a.x - middle.x, a.y - middle.y) -
              Math.hypot(b.x - middle.x, b.y - middle.y)
          );
        const tried: Point[] = [];
        for (const centre of centres) {
          if (tried.length >= 24) break;
          if (tried.some((t) => Math.hypot(t.x - centre.x, t.y - centre.y) < 9))
            continue;
          tried.push(centre);
          const attempt = labelBox(shape, lines, "inside", centre);
          towns = placeTowns(
            shape,
            neighbours,
            track.topics.length,
            attempt.box,
            rand
          );
          if (towns) {
            label = attempt;
            break;
          }
        }
      }
      if (!towns) {
        const sides: LabelSide[] =
          spot.label && spot.label !== "inside"
            ? [spot.label]
            : ["below", "above"];
        label = labelBox(shape, lines, sides[0]);
        towns = placeTowns(shape, neighbours, track.topics.length, null, rand);
      }
      if (!towns) {
        // Last resort: crowd the towns rather than drop a topic.
        label = labelBox(shape, lines, "below");
        towns =
          placeTowns(shape, neighbours, track.topics.length, null, rand) ??
          track.topics.map((_, i) => ({
            x: shape.cx + ((i % 5) - 2) * 14,
            y: shape.cy + (Math.floor(i / 5) - 1) * 14,
          }));
      }
      const spots = towns;
      return {
        id: track.id,
        title: track.title,
        region,
        path: shape.path(),
        label: { lines, x: round(label.x), y: round(label.y), box: label.box },
        towns: track.topics.map((topic, i) => ({
          ...topic,
          x: round(spots[i].x),
          y: round(spots[i].y),
        })),
      };
    }
  );

  const regionLabels: MapRegionLabel[] = regions.map((region) => {
    const spot = REGION_LABELS[region.label];
    if (spot) return { label: region.label, ...spot };
    const own = shapes.filter((s) => s.region === region.label);
    const boxes = own.map((s) => s.shape.bounds());
    const bottom = Math.max(...boxes.map((b) => b.y + b.h), 0);
    const centre =
      own.reduce((sum, s) => sum + s.shape.cx, 0) / Math.max(own.length, 1);
    return {
      label: region.label,
      x: round(centre || MAP_WIDTH / 2),
      y: round(Math.min(bottom + 34, MAP_HEIGHT - 16)),
    };
  });

  return { islands, regions: regionLabels, graticule: graticule() };
}
