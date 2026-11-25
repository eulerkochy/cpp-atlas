import type {
  CodeStageBeat,
  ScrollCaptionCue,
  ScrollCard,
  ScrollCardDifficulty,
} from "@/lib/scroll-types";

// ---------------------------------------------------------------------------
// Shared procedural card helpers
// ---------------------------------------------------------------------------

function buildCaptions(texts: string[], durationSec: number): ScrollCaptionCue[] {
  const cleaned = texts.map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (cleaned.length === 0) return [];
  const step = durationSec / cleaned.length;
  return cleaned.map((text, idx) => ({
    startSec: Number((idx * step).toFixed(2)),
    endSec:
      idx === cleaned.length - 1
        ? durationSec
        : Number(((idx + 1) * step).toFixed(2)),
    text,
  }));
}

interface ProceduralTrapSpec {
  id: string;
  title: string;
  question: string;
  code?: string;
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  explanation: string;
  clause: string;
  trackId: string;
  trackTitle: string;
  continentId: string;
  continentLabel: string;
  accentHex: string;
  topicSlug: string;
  standard?: string;
  difficulty: ScrollCardDifficulty;
  tags: string[];
  prerequisites?: string[];
  summary: string;
}

function makeProceduralTrap(spec: ProceduralTrapSpec): ScrollCard {
  const durationSec = 18;
  return {
    id: `proc:${spec.id}`,
    kind: "trap",
    origin: "procedural",
    sourcePath: `procedural/${spec.topicSlug}/${spec.id}`,
    title: spec.title,
    summary: spec.summary,
    badgeLabel: "Drill Check",
    trackId: spec.trackId,
    trackTitle: spec.trackTitle,
    continentId: spec.continentId,
    continentLabel: spec.continentLabel,
    accentHex: spec.accentHex,
    standard: spec.standard,
    tags: spec.tags.slice(0, 6),
    prerequisites: spec.prerequisites ?? [],
    topicSlug: spec.topicSlug,
    readHref: `/topics/${spec.topicSlug}`,
    readLabel: "Study rule",
    durationSec,
    difficulty: spec.difficulty,
    baseScore: Number((7.85 + spec.difficulty * 0.2).toFixed(2)),
    captions: buildCaptions(
      [
        spec.question,
        `Apply ISO ${spec.clause} and tap an option to check your mental model.`,
      ],
      durationSec
    ),
    stage: {
      type: "trap",
      trapId: `proc:${spec.id}`,
      question: spec.question,
      code: spec.code,
      options: [...spec.options],
      correctIndex: spec.correctIndex,
      explanation: spec.explanation,
      clause: spec.clause,
    },
  };
}

interface ProceduralCodeSpec {
  id: string;
  title: string;
  summary: string;
  filename: string;
  code: string;
  beats: CodeStageBeat[];
  trackId: string;
  trackTitle: string;
  continentId: string;
  continentLabel: string;
  accentHex: string;
  topicSlug: string;
  standard?: string;
  difficulty: ScrollCardDifficulty;
  tags: string[];
  prerequisites?: string[];
}

function makeProceduralCode(spec: ProceduralCodeSpec): ScrollCard {
  const durationSec = Math.max(12, spec.beats.length * 4);
  return {
    id: `proc:${spec.id}`,
    kind: "code",
    origin: "procedural",
    sourcePath: `procedural/${spec.topicSlug}/${spec.id}`,
    title: spec.title,
    summary: spec.summary,
    badgeLabel: "Micro-Walkthrough",
    trackId: spec.trackId,
    trackTitle: spec.trackTitle,
    continentId: spec.continentId,
    continentLabel: spec.continentLabel,
    accentHex: spec.accentHex,
    standard: spec.standard,
    tags: spec.tags.slice(0, 6),
    prerequisites: spec.prerequisites ?? [],
    topicSlug: spec.topicSlug,
    readHref: `/topics/${spec.topicSlug}`,
    readLabel: "Read topic",
    durationSec,
    difficulty: spec.difficulty,
    baseScore: Number((7.95 + spec.difficulty * 0.15).toFixed(2)),
    captions: buildCaptions(
      spec.beats.map((b) => b.caption),
      durationSec
    ),
    stage: {
      type: "code",
      filename: spec.filename,
      language: "cpp",
      code: spec.code,
      beats: spec.beats,
    },
  };
}

function alignUp(offset: number, align: number): number {
  return Math.ceil(offset / align) * align;
}

function rotateOptions(
  correct: string,
  distractors: [string, string, string],
  seed: number
): { options: [string, string, string, string]; correctIndex: 0 | 1 | 2 | 3 } {
  const arr: [string, string, string, string] = [
    correct,
    distractors[0],
    distractors[1],
    distractors[2],
  ];
  const shift = ((seed % 4) + 4) % 4;
  const out = [
    arr[(0 + shift) % 4],
    arr[(1 + shift) % 4],
    arr[(2 + shift) % 4],
    arr[(3 + shift) % 4],
  ] as [string, string, string, string];
  const correctIndex = out.indexOf(correct) as 0 | 1 | 2 | 3;
  return { options: out, correctIndex };
}

// ---------------------------------------------------------------------------
// 1. sizeof / Alignment / Struct Padding Puzzles (LP64 ABI)
// ---------------------------------------------------------------------------

interface AbiType {
  name: string;
  size: number;
  align: number;
}

const ABI_TYPES: Record<string, AbiType> = {
  char: { name: "char", size: 1, align: 1 },
  bool: { name: "bool", size: 1, align: 1 },
  short: { name: "short", size: 2, align: 2 },
  int: { name: "int", size: 4, align: 4 },
  float: { name: "float", size: 4, align: 4 },
  double: { name: "double", size: 8, align: 8 },
  ptr: { name: "void*", size: 8, align: 8 },
  i64: { name: "int64_t", size: 8, align: 8 },
};

interface ComputedLayout {
  offsets: number[];
  size: number;
  align: number;
  rawSum: number;
  paddingBytes: number;
}

function computeStructLayout(
  fields: AbiType[],
  explicitAlign = 1
): ComputedLayout {
  let offset = 0;
  let maxAlign = explicitAlign;
  let rawSum = 0;
  const offsets: number[] = [];

  for (const f of fields) {
    offset = alignUp(offset, f.align);
    offsets.push(offset);
    offset += f.size;
    rawSum += f.size;
    if (f.align > maxAlign) maxAlign = f.align;
  }

  const size = fields.length === 0 ? Math.max(1, explicitAlign) : alignUp(offset, maxAlign);
  return {
    offsets,
    size,
    align: maxAlign,
    rawSum,
    paddingBytes: size - rawSum,
  };
}

function uniqueByteDistractors(
  correct: number,
  candidates: number[]
): [string, string, string] {
  const picked: number[] = [];
  const seen = new Set<number>([correct]);
  for (const c of candidates) {
    if (c > 0 && !seen.has(c)) {
      seen.add(c);
      picked.push(c);
      if (picked.length === 3) break;
    }
  }
  let fallback = Math.max(1, correct - 4);
  while (picked.length < 3) {
    if (!seen.has(fallback)) {
      seen.add(fallback);
      picked.push(fallback);
    }
    fallback += 2;
  }
  return [`${picked[0]} bytes`, `${picked[1]} bytes`, `${picked[2]} bytes`];
}

function generateLayoutCards(): ScrollCard[] {
  const cards: ScrollCard[] = [];
  const fieldNames = ["a", "b", "c", "d"];

  const structSpecs: {
    key: string;
    name: string;
    types: (keyof typeof ABI_TYPES)[];
    alignas?: number;
    ask?: "sizeof" | "offset" | "alignof";
    targetIdx?: number;
  }[] = [
    { key: "c-i-c", name: "Packet", types: ["char", "int", "char"] },
    { key: "c-d-c", name: "Frame", types: ["char", "double", "char"] },
    { key: "d-c-c", name: "PackedFrame", types: ["double", "char", "char"] },
    { key: "b-p-b", name: "Node", types: ["bool", "ptr", "bool"] },
    { key: "p-i-c", name: "Header", types: ["ptr", "int", "char"] },
    { key: "c-s-i", name: "Record", types: ["char", "short", "int"] },
    { key: "s-c-s", name: "Pair16", types: ["short", "char", "short"] },
    { key: "i-d-i", name: "SpanRec", types: ["int", "double", "int"] },
    { key: "d-i-i", name: "DenseSpan", types: ["double", "int", "int"] },
    { key: "c-i-d-c", name: "Blob", types: ["char", "int", "double", "char"] },
    { key: "d-i-c-c", name: "TightBlob", types: ["double", "int", "char", "char"] },
    { key: "c-s-d-s", name: "Metric", types: ["char", "short", "double", "short"] },
    { key: "f-p-f", name: "Sample", types: ["float", "ptr", "float"] },
    { key: "p-f-f", name: "TightSample", types: ["ptr", "float", "float"] },
    { key: "b-s-b-i", name: "Flags", types: ["bool", "short", "bool", "int"] },
    { key: "i-s-b-b", name: "TightFlags", types: ["int", "short", "bool", "bool"] },
    { key: "c-c-c-i", name: "Tag4", types: ["char", "char", "char", "int"] },
    { key: "i-c-c-c", name: "TailTag", types: ["int", "char", "char", "char"] },
    { key: "s-i-s-i", name: "Mixed16", types: ["short", "int", "short", "int"] },
    { key: "i-i-s-s", name: "Grouped16", types: ["int", "int", "short", "short"] },
    { key: "c-i64-s-c", name: "WireMsg", types: ["char", "i64", "short", "char"] },
    { key: "i64-s-c-c", name: "CompactWire", types: ["i64", "short", "char", "char"] },
    { key: "p-c-i-c", name: "Entry", types: ["ptr", "char", "int", "char"] },
    { key: "c-c-d-c", name: "Slot", types: ["char", "char", "double", "char"] },
    { key: "align16-i-c", name: "SimdBox", types: ["int", "char"], alignas: 16 },
    { key: "align32-d-i", name: "CacheLine", types: ["double", "int"], alignas: 32 },
    { key: "align16-p-i-i", name: "AlignedPair", types: ["ptr", "int", "int"], alignas: 16 },
    { key: "align16-c-d-i", name: "AlignedRec", types: ["char", "double", "int"], alignas: 16 },
    { key: "off-c-d-c", name: "Msg", types: ["char", "double", "char"], ask: "offset", targetIdx: 1 },
    { key: "off-c-i-c-d", name: "Chunk", types: ["char", "int", "char", "double"], ask: "offset", targetIdx: 3 },
    { key: "off-s-c-i", name: "Token", types: ["short", "char", "int"], ask: "offset", targetIdx: 2 },
    { key: "off-b-s-p", name: "Handle", types: ["bool", "short", "ptr"], ask: "offset", targetIdx: 2 },
    { key: "off-c-s-c-i", name: "Cell", types: ["char", "short", "char", "int"], ask: "offset", targetIdx: 3 },
    { key: "align-c-s-c", name: "Tiny", types: ["char", "short", "char"], ask: "alignof" },
    { key: "align-c-f-s", name: "Quad", types: ["char", "float", "short"], ask: "alignof" },
    { key: "align-b-p-i", name: "RefSlot", types: ["bool", "ptr", "int"], ask: "alignof" },
  ];

  structSpecs.forEach((spec, idx) => {
    const fields = spec.types.map((k) => ABI_TYPES[k]);
    const layout = computeStructLayout(fields, spec.alignas ?? 1);
    const alignPrefix = spec.alignas ? `alignas(${spec.alignas}) ` : "";
    const memberLines = fields.map((f, i) => `  ${f.name} ${fieldNames[i]};`);
    const code = `struct ${alignPrefix}${spec.name} {\n${memberLines.join("\n")}\n};`;

    if (spec.ask === "offset" && spec.targetIdx !== undefined) {
      const tIdx = spec.targetIdx;
      const targetName = fieldNames[tIdx];
      const correctOff = layout.offsets[tIdx];
      const rawBefore = fields.slice(0, tIdx).reduce((s, f) => s + f.size, 0);
      const { options, correctIndex } = rotateOptions(
        `${correctOff} bytes`,
        uniqueByteDistractors(correctOff, [
          rawBefore,
          correctOff + fields[tIdx].align,
          Math.max(1, correctOff - 2),
          layout.size,
        ]),
        idx + 1
      );
      const trace = fields
        .slice(0, tIdx + 1)
        .map((f, i) => `${fieldNames[i]}@${layout.offsets[i]}`)
        .join(", ");

      cards.push(
        makeProceduralTrap({
          id: `layout-${spec.key}`,
          title: `LP64 offsetof(${spec.name}, ${targetName})`,
          question: `On LP64 x86_64/ARM64, what is offsetof(${spec.name}, ${targetName})?`,
          code,
          options,
          correctIndex,
          explanation: `Each member starts at a multiple of its alignment: ${trace}. So ${targetName} (${fields[tIdx].name}, align ${fields[tIdx].align}) lands at byte offset ${correctOff}.`,
          clause: "[basic.align] & [class.mem]",
          trackId: "memory-model",
          trackTitle: "Memory model",
          continentId: "the-machine",
          continentLabel: "The machine",
          accentHex: "#ff4d5a",
          topicSlug: "object-layout-and-alignment",
          difficulty: 2,
          tags: ["LP64", "Alignment", "[basic.align]", "Memory model"],
          summary: `Trace LP64 member offsets and internal padding inside struct ${spec.name}.`,
        })
      );
      return;
    }

    if (spec.ask === "alignof") {
      const { options, correctIndex } = rotateOptions(
        `${layout.align} bytes`,
        uniqueByteDistractors(layout.align, [
          1,
          layout.size,
          layout.align * 2,
          Math.max(1, layout.align / 2),
        ]),
        idx + 2
      );
      cards.push(
        makeProceduralTrap({
          id: `layout-${spec.key}`,
          title: `LP64 alignof(${spec.name})`,
          question: `On LP64, what is alignof(${spec.name})?`,
          code,
          options,
          correctIndex,
          explanation: `A struct's alignment is the strictest (maximum) alignment among its non-static data members (${fields.map((f) => `${f.name}=${f.align}`).join(", ")}), giving alignof(${spec.name}) == ${layout.align}.`,
          clause: "[basic.align]",
          trackId: "memory-model",
          trackTitle: "Memory model",
          continentId: "the-machine",
          continentLabel: "The machine",
          accentHex: "#ff4d5a",
          topicSlug: "object-layout-and-alignment",
          difficulty: 1,
          tags: ["LP64", "alignof", "[basic.align]", "Memory model"],
          summary: `Determine the alignment requirement of struct ${spec.name} from its member alignments.`,
        })
      );
      return;
    }

    const unalignedTail =
      layout.offsets[layout.offsets.length - 1] + fields[fields.length - 1].size;
    const { options, correctIndex } = rotateOptions(
      `${layout.size} bytes`,
      uniqueByteDistractors(layout.size, [
        layout.rawSum,
        unalignedTail,
        layout.size + layout.align,
        Math.max(4, layout.size - layout.align),
      ]),
      idx
    );
    const trace = fields
      .map((f, i) => `${fieldNames[i]}@${layout.offsets[i]}(${f.size}B)`)
      .join(", ");

    cards.push(
      makeProceduralTrap({
        id: `layout-${spec.key}`,
        title: `LP64 sizeof(${spec.name})`,
        question: `On LP64 (ptr=8, double=8, int=4, short=2), what is sizeof(${spec.name})?`,
        code,
        options,
        correctIndex,
        explanation: `Offsets are ${trace}; raw payload is ${layout.rawSum}B, and tail padding rounds up to a multiple of alignof=${layout.align}, yielding ${layout.size} bytes (${layout.paddingBytes}B padding).`,
        clause: "[basic.align] & [expr.sizeof]",
        trackId: "memory-model",
        trackTitle: "Memory model",
        continentId: "the-machine",
        continentLabel: "The machine",
        accentHex: "#ff4d5a",
        topicSlug: "object-layout-and-alignment",
        standard: spec.alignas ? "C++11" : undefined,
        difficulty: spec.alignas ? 3 : 2,
        tags: ["LP64", "sizeof", "[basic.align]", "Memory model"],
        summary: `Compute member alignment and tail padding for struct ${spec.name} on LP64.`,
      })
    );
  });

  // Special C++ layout edge cases (empty struct, [[no_unique_address]])
  cards.push(
    makeProceduralTrap({
      id: "layout-empty-struct",
      title: "sizeof an Empty C++ Struct",
      question: "What is sizeof(Empty) in standard C++?",
      code: `struct Empty {};\nstatic_assert(sizeof(Empty) == /* ? */);`,
      options: ["0 bytes", "1 byte", "4 bytes", "8 bytes"],
      correctIndex: 1,
      explanation:
        "Complete objects in C++ must have distinct addresses ([intro.object]), so an empty class type has non-zero size—1 byte on standard ABIs.",
      clause: "[intro.object]",
      trackId: "memory-model",
      trackTitle: "Memory model",
      continentId: "the-machine",
      continentLabel: "The machine",
      accentHex: "#ff4d5a",
      topicSlug: "object-layout-and-alignment",
      difficulty: 1,
      tags: ["Empty Class", "sizeof", "[intro.object]", "Memory model"],
      summary: "Why complete empty C++ objects cannot occupy zero bytes.",
    }),
    makeProceduralTrap({
      id: "layout-ebo-no-unique-address",
      title: "C++20 [[no_unique_address]] Empty Member",
      question: "On LP64 (Itanium ABI), what is sizeof(Box) with [[no_unique_address]]?",
      code: `struct EmptyAlloc {};\nstruct Box {\n  [[no_unique_address]] EmptyAlloc alloc;\n  int* ptr;\n};`,
      options: ["8 bytes", "9 bytes", "16 bytes", "12 bytes"],
      correctIndex: 0,
      explanation:
        "[[no_unique_address]] lets an empty data member share the address of another member instead of forcing 1 byte + 7 bytes padding, shrinking Box from 16B to 8B.",
      clause: "[dcl.attr.nouniqueaddr]",
      trackId: "memory-model",
      trackTitle: "Memory model",
      continentId: "the-machine",
      continentLabel: "The machine",
      accentHex: "#ff4d5a",
      topicSlug: "object-layout-and-alignment",
      standard: "C++20",
      difficulty: 2,
      tags: ["C++20", "[[no_unique_address]]", "[dcl.attr.nouniqueaddr]", "Memory model"],
      summary: "Zero-overhead stateless members via C++20 [[no_unique_address]].",
    })
  );

  // 8 procedural layout optimization code walkthroughs
  const reorderPairs: {
    id: string;
    name: string;
    bad: (keyof typeof ABI_TYPES)[];
    good: (keyof typeof ABI_TYPES)[];
  }[] = [
    { id: "opt-1", name: "Event", bad: ["char", "double", "char"], good: ["double", "char", "char"] },
    { id: "opt-2", name: "Task", bad: ["bool", "ptr", "int", "bool"], good: ["ptr", "int", "bool", "bool"] },
    { id: "opt-3", name: "Header", bad: ["char", "int", "double", "char"], good: ["double", "int", "char", "char"] },
    { id: "opt-4", name: "Order", bad: ["short", "i64", "short", "int"], good: ["i64", "int", "short", "short"] },
    { id: "opt-5", name: "Node", bad: ["bool", "short", "ptr", "bool"], good: ["ptr", "short", "bool", "bool"] },
    { id: "opt-6", name: "Span", bad: ["char", "float", "double", "char"], good: ["double", "float", "char", "char"] },
    { id: "opt-7", name: "Cell", bad: ["bool", "int", "bool", "int"], good: ["int", "int", "bool", "bool"] },
    { id: "opt-8", name: "Key", bad: ["char", "short", "char", "short"], good: ["short", "short", "char", "char"] },
  ];

  for (const p of reorderPairs) {
    const badFields = p.bad.map((k) => ABI_TYPES[k]);
    const goodFields = p.good.map((k) => ABI_TYPES[k]);
    const badL = computeStructLayout(badFields);
    const goodL = computeStructLayout(goodFields);
    const saved = badL.size - goodL.size;
    const code = [
      `struct ${p.name}Bad {`,
      ...badFields.map((f, i) => `  ${f.name} ${fieldNames[i]};`),
      `}; // sizeof == ${badL.size} (${badL.paddingBytes}B wasted)`,
      ``,
      `struct ${p.name}Good {`,
      ...goodFields.map((f, i) => `  ${f.name} ${fieldNames[i]};`),
      `}; // sizeof == ${goodL.size} (saves ${saved}B per object)`,
    ].join("\n");
    const goodStart = badFields.length + 4;
    const goodEnd = goodStart + goodFields.length + 1;

    cards.push(
      makeProceduralCode({
        id: `layout-walk-${p.id}`,
        title: `Shrink ${p.name}: ${badL.size}B to ${goodL.size}B via Field Order`,
        summary: `Reordering ${p.name} members from strictest to smallest alignment eliminates ${saved} bytes of padding per instance with zero logic change.`,
        filename: `${p.name.toLowerCase()}_layout.cpp`,
        code,
        beats: [
          {
            title: "Padding Waste",
            badge: "Trap",
            highlightLines: Array.from({ length: badFields.length + 2 }, (_, i) => i + 1),
            annotation: `${p.name}Bad burns ${badL.paddingBytes}B on alignment holes (${badL.size}B total for ${badL.rawSum}B of data).`,
            caption: `${p.name}Bad interleaves small and large alignments, inflating sizeof to ${badL.size} bytes.`,
          },
          {
            title: "Strictest Alignment First",
            badge: "Lifetime",
            highlightLines: [goodStart, goodStart + 1, goodStart + 2],
            annotation: `Place ${goodFields[0].name} (align ${goodFields[0].align}) first so smaller fields pack cleanly into the tail.`,
            caption: `Sorting members by descending alignment eliminates internal holes.`,
          },
          {
            title: `${saved}B Saved Per Element`,
            badge: "Verified",
            highlightLines: [goodEnd],
            annotation: `${p.name}Good drops to ${goodL.size}B—saving ${saved}B per element in contiguous arrays and caches.`,
            caption: `Reordering saves ${saved} bytes per ${p.name} with zero behavior change.`,
          },
        ],
        trackId: "memory-model",
        trackTitle: "Memory model",
        continentId: "the-machine",
        continentLabel: "The machine",
        accentHex: "#ef4444",
        topicSlug: "object-layout-and-alignment",
        difficulty: 2,
        tags: ["LP64", "Padding", "Cache Layout", "Memory model"],
      })
    );
  }

  return cards;
}

// ---------------------------------------------------------------------------
// 2. Value Category & decltype((expr)) Probes
// ---------------------------------------------------------------------------

function generateValueCategoryCards(): ScrollCard[] {
  const cards: ScrollCard[] = [];

  const valueCatProbes: {
    id: string;
    title: string;
    code: string;
    expr: string;
    category: "lvalue" | "xvalue" | "prvalue";
    why: string;
    clause: string;
    diff: ScrollCardDifficulty;
  }[] = [
    {
      id: "named-rref-param",
      title: "Named T&& Parameter Value Category",
      code: `void f(std::string&& s) {\n  // What is the value category of expression \`s\`?\n}`,
      expr: "s",
      category: "lvalue",
      why: "A named variable is ALWAYS an lvalue even when its declared type is an rvalue reference T&&.",
      clause: "[basic.lval]",
      diff: 1,
    },
    {
      id: "std-move-call",
      title: "std::move(x) Value Category",
      code: `std::string x = "cpp";\n// Value category of std::move(x):`,
      expr: "std::move(x)",
      category: "xvalue",
      why: "std::move returns an unnamed T&& (rvalue reference to object), which is an xvalue—has identity and can be moved from.",
      clause: "[basic.lval] & [utility.move]",
      diff: 1,
    },
    {
      id: "string-literal",
      title: "String Literal Value Category",
      code: `auto p = &"atlas"; // legal!\n// Value category of "atlas":`,
      expr: '"atlas"',
      category: "lvalue",
      why: "Unlike numeric literals (prvalues), string literals occupy static storage and are lvalues of type const char[N].",
      clause: "[lex.string]",
      diff: 2,
    },
    {
      id: "int-literal",
      title: "Numeric Literal Value Category",
      code: `int x = 42;\n// Value category of literal 42:`,
      expr: "42",
      category: "prvalue",
      why: "All non-string literals (integers, floats, booleans, nullptr) are prvalues with no storage identity.",
      clause: "[expr.prim.literal]",
      diff: 1,
    },
    {
      id: "pre-increment",
      title: "Prefix ++i Value Category",
      code: `int i = 0;\n++i = 5;\n// Value category of ++i:`,
      expr: "++i",
      category: "lvalue",
      why: "Built-in prefix ++i modifies i in place and yields i itself as an lvalue.",
      clause: "[expr.pre.incr]",
      diff: 1,
    },
    {
      id: "post-increment",
      title: "Postfix i++ Value Category",
      code: `int i = 0;\nauto old = i++;\n// Value category of i++:`,
      expr: "i++",
      category: "prvalue",
      why: "Built-in postfix i++ produces a copy of the prior value as a prvalue (unmaterialized value).",
      clause: "[expr.post.incr]",
      diff: 1,
    },
    {
      id: "temp-member-access",
      title: "Data Member of a Temporary (Widget{}.id)",
      code: `struct Widget { int id; };\n// Value category of Widget{}.id:`,
      expr: "Widget{}.id",
      category: "xvalue",
      why: "Accessing a non-static data member of a class rvalue materializes the temporary and yields an xvalue subobject.",
      clause: "[expr.ref]",
      diff: 2,
    },
    {
      id: "temp-ref-member",
      title: "Reference Member of a Temporary",
      code: `struct View { int& ref; };\nint target = 7;\n// Value category of View{target}.ref:`,
      expr: "View{target}.ref",
      category: "lvalue",
      why: "A non-static member declared as an lvalue reference T& ALWAYS produces an lvalue, even when accessed through a temporary.",
      clause: "[expr.ref]/4.2",
      diff: 3,
    },
    {
      id: "temp-static-member",
      title: "Static Member Accessed via Temporary",
      code: `struct Counter { static int n; };\n// Value category of Counter{}.n:`,
      expr: "Counter{}.n",
      category: "lvalue",
      why: "A static data member has static storage independent of the temporary object, so Counter{}.n is an lvalue.",
      clause: "[expr.ref]/4.1",
      diff: 3,
    },
    {
      id: "fn-return-value",
      title: "Call to Function Returning by Value",
      code: `Widget make_widget();\n// Value category of make_widget():`,
      expr: "make_widget()",
      category: "prvalue",
      why: "A call to a function returning a non-reference type T is a prvalue (C++17 unmaterialized initializer).",
      clause: "[expr.call]",
      diff: 1,
    },
    {
      id: "fn-return-lref",
      title: "Call to Function Returning T&",
      code: `int& front(std::vector<int>& v);\n// Value category of front(v):`,
      expr: "front(v)",
      category: "lvalue",
      why: "A call whose return type is an lvalue reference T& produces an lvalue expression.",
      clause: "[expr.call]",
      diff: 1,
    },
    {
      id: "fn-return-rref",
      title: "Call to Function Returning T&&",
      code: `Widget&& take(Widget& w);\n// Value category of take(w):`,
      expr: "take(w)",
      category: "xvalue",
      why: "A call returning an rvalue reference to an object type (T&&) produces an xvalue.",
      clause: "[expr.call]",
      diff: 2,
    },
    {
      id: "fn-return-rref-func",
      title: "Rvalue Reference to Function Type",
      code: `using Fn = void();\nFn&& get_fn();\n// Value category of get_fn():`,
      expr: "get_fn()",
      category: "lvalue",
      why: "Functions cannot be moved from: an rvalue reference to a function type ALWAYS evaluates as an lvalue!",
      clause: "[basic.lval] & [expr.call]",
      diff: 3,
    },
    {
      id: "cast-to-rref",
      title: "static_cast<T&&>(x) Value Category",
      code: `Widget w;\n// Value category of static_cast<Widget&&>(w):`,
      expr: "static_cast<Widget&&>(w)",
      category: "xvalue",
      why: "A cast to an rvalue reference to an object type produces an xvalue (this is all std::move does).",
      clause: "[expr.static.cast]",
      diff: 1,
    },
    {
      id: "cast-to-val",
      title: "static_cast<double>(n) Value Category",
      code: `int n = 3;\n// Value category of static_cast<double>(n):`,
      expr: "static_cast<double>(n)",
      category: "prvalue",
      why: "Casting to a non-reference object type yields a prvalue.",
      clause: "[expr.static.cast]",
      diff: 1,
    },
    {
      id: "subscript-temp-array",
      title: "Subscripting a Temporary Array",
      code: `using Arr = int[4];\n// Value category of Arr{1,2,3,4}[0]:`,
      expr: "Arr{1,2,3,4}[0]",
      category: "xvalue",
      why: "Since C++17, subscripting an array rvalue yields an xvalue designating the element inside the materialized array.",
      clause: "[expr.sub]",
      diff: 3,
    },
    {
      id: "deref-ptr",
      title: "Pointer Dereference *p Value Category",
      code: `int* p = get_ptr();\n// Value category of *p:`,
      expr: "*p",
      category: "lvalue",
      why: "Built-in unary indirection *p designates the pointed-to object and is always an lvalue.",
      clause: "[expr.unary.op]",
      diff: 1,
    },
    {
      id: "assignment-expr",
      title: "Built-in Assignment (a = b) Value Category",
      code: `int a = 1, b = 2;\n(a = b) = 9;\n// Value category of (a = b):`,
      expr: "(a = b)",
      category: "lvalue",
      why: "In C++ (unlike C), built-in assignment operators return an lvalue referring to the left operand.",
      clause: "[expr.ass]",
      diff: 2,
    },
    {
      id: "ternary-lvalue",
      title: "Ternary (cond ? a : b) with Two int Lvalues",
      code: `int a = 1, b = 2;\n(flag ? a : b) = 10;\n// Value category of (flag ? a : b):`,
      expr: "(flag ? a : b)",
      category: "lvalue",
      why: "When both branches of ?: are lvalues of the same type, the conditional expression itself is an lvalue.",
      clause: "[expr.cond]",
      diff: 2,
    },
    {
      id: "ternary-mixed",
      title: "Ternary (cond ? a : 0) Mixed Lvalue & Prvalue",
      code: `int a = 1;\n// Value category of (flag ? a : 0):`,
      expr: "(flag ? a : 0)",
      category: "prvalue",
      why: "Because 0 is a prvalue, the common category collapses to a prvalue—you cannot assign to (flag ? a : 0).",
      clause: "[expr.cond]",
      diff: 2,
    },
    {
      id: "lambda-expr",
      title: "Lambda Expression Value Category",
      code: `auto fn = [](int x) { return x + 1; };\n// Value category of [](int x){...}:`,
      expr: "[](int x) { return x + 1; }",
      category: "prvalue",
      why: "Evaluating a lambda-expression produces a prvalue of its unique unnamed closure class type.",
      clause: "[expr.prim.lambda]",
      diff: 2,
    },
    {
      id: "this-ptr",
      title: "The `this` Pointer Expression",
      code: `struct S {\n  void f() { /* value category of \`this\`? */ }\n};`,
      expr: "this",
      category: "prvalue",
      why: "`this` is a prvalue pointer to the current object—you cannot assign to `this` or take `&this`.",
      clause: "[expr.prim.this]",
      diff: 2,
    },
  ];

  valueCatProbes.forEach((p, i) => {
    const allCats = ["lvalue", "xvalue", "prvalue", "ill-formed (no category)"] as const;
    const distractors = allCats.filter((c) => c !== p.category) as [string, string, string];
    const { options, correctIndex } = rotateOptions(p.category, distractors, i);
    cards.push(
      makeProceduralTrap({
        id: `vcat-${p.id}`,
        title: p.title,
        question: `What is the C++17+ value category of \`${p.expr}\`?`,
        code: p.code,
        options,
        correctIndex,
        explanation: p.why,
        clause: p.clause,
        trackId: "value-semantics",
        trackTitle: "Value semantics",
        continentId: "language-basics",
        continentLabel: "Language basics",
        accentHex: "#f43f5e",
        topicSlug: "value-categories",
        standard: "C++17",
        difficulty: p.diff,
        tags: ["C++17", "Value Categories", p.clause, "Value semantics"],
        summary: `Classify ${p.expr} along C++17's identity (glvalue) and movability (rvalue) axes.`,
      })
    );
  });

  // decltype vs decltype((expr)) probes across 12 expressions
  const declProbes: {
    id: string;
    code: string;
    target: string;
    answer: string;
    distractors: [string, string, string];
    why: string;
    diff: ScrollCardDifficulty;
  }[] = [
    {
      id: "id-plain",
      code: `int x = 10;\nusing R = decltype(x);`,
      target: "decltype(x)",
      answer: "int",
      distractors: ["int&", "int&&", "const int&"],
      why: "Unparenthesized id-expression `x` yields its declared type `int`.",
      diff: 1,
    },
    {
      id: "id-parens",
      code: `int x = 10;\nusing R = decltype((x));`,
      target: "decltype((x))",
      answer: "int&",
      distractors: ["int", "int&&", "const int&"],
      why: "Parenthesizing `(x)` makes it an lvalue expression, so decltype appends `&` -> `int&`.",
      diff: 1,
    },
    {
      id: "const-id-parens",
      code: `const int cx = 10;\nusing R = decltype((cx));`,
      target: "decltype((cx))",
      answer: "const int&",
      distractors: ["const int", "int&", "int"],
      why: "`(cx)` is a parenthesized lvalue of type `const int`, so decltype yields `const int&`.",
      diff: 2,
    },
    {
      id: "rref-param-bare",
      code: `void f(int&& p) {\n  using R = decltype(p);\n}`,
      target: "decltype(p)",
      answer: "int&&",
      distractors: ["int&", "int", "const int&&"],
      why: "Unparenthesized `p` returns its declared type `int&&` (NOT its lvalue category!).",
      diff: 2,
    },
    {
      id: "rref-param-parens",
      code: `void f(int&& p) {\n  using R = decltype((p));\n}`,
      target: "decltype((p))",
      answer: "int&",
      distractors: ["int&&", "int", "const int&"],
      why: "Parenthesized `(p)` is evaluated as an expression: a named rvalue ref is an lvalue, so decltype yields `int&`!",
      diff: 3,
    },
    {
      id: "move-expr",
      code: `int x = 10;\nusing R = decltype(std::move(x));`,
      target: "decltype(std::move(x))",
      answer: "int&&",
      distractors: ["int&", "int", "const int&&"],
      why: "`std::move(x)` is an xvalue expression, and decltype of an xvalue of type T is `T&&`.",
      diff: 2,
    },
    {
      id: "member-bare",
      code: `struct S { int m; };\nconst S s{1};\nusing R = decltype(s.m);`,
      target: "decltype(s.m)",
      answer: "int",
      distractors: ["const int", "const int&", "int&"],
      why: "Unparenthesized class member access `s.m` yields the declared type of `m` (`int`), ignoring `const` on `s`!",
      diff: 3,
    },
    {
      id: "member-parens",
      code: `struct S { int m; };\nconst S s{1};\nusing R = decltype((s.m));`,
      target: "decltype((s.m))",
      answer: "const int&",
      distractors: ["int", "int&", "const int"],
      why: "Parenthesized `(s.m)` is an lvalue expression of type `const int`, so decltype yields `const int&`.",
      diff: 3,
    },
    {
      id: "prvalue-add",
      code: `int x = 1, y = 2;\nusing R = decltype(x + y);`,
      target: "decltype(x + y)",
      answer: "int",
      distractors: ["int&", "int&&", "const int"],
      why: "`x + y` is a prvalue of type `int`, and decltype of a prvalue is simply `T` (`int`).",
      diff: 1,
    },
    {
      id: "deref-ptr-decl",
      code: `const int* p = nullptr;\nusing R = decltype(*p);`,
      target: "decltype(*p)",
      answer: "const int&",
      distractors: ["const int", "int&", "const int*"],
      why: "`*p` is an lvalue expression (not an id-expression) of type `const int`, yielding `const int&` (never dereferenced at runtime!).",
      diff: 2,
    },
    {
      id: "temp-member-decl",
      code: `struct S { int m; };\nusing R = decltype((S{1}.m));`,
      target: "decltype((S{1}.m))",
      answer: "int&&",
      distractors: ["int", "int&", "const int&"],
      why: "`S{1}.m` is an xvalue expression, so parenthesized `decltype((S{1}.m))` yields `int&&`.",
      diff: 3,
    },
    {
      id: "string-lit-decl",
      code: `using R = decltype("hi");`,
      target: 'decltype("hi")',
      answer: "const char(&)[3]",
      distractors: ["const char*", "const char[3]", "char[3]"],
      why: 'String literal `"hi"` is an lvalue of type `const char[3]` (including null byte), so decltype yields `const char(&)[3]`.',
      diff: 3,
    },
  ];

  declProbes.forEach((d, i) => {
    const { options, correctIndex } = rotateOptions(d.answer, d.distractors, i + 1);
    cards.push(
      makeProceduralTrap({
        id: `decltype-${d.id}`,
        title: `Deduce ${d.target}`,
        question: `What exact type is aliased by \`R\` (${d.target})?`,
        code: d.code,
        options,
        correctIndex,
        explanation: d.why,
        clause: "[dcl.type.decltype]",
        trackId: "types-and-initialization",
        trackTitle: "Types and initialization",
        continentId: "language-basics",
        continentLabel: "Language basics",
        accentHex: "#f43f5e",
        topicSlug: "type-deduction-auto-decltype",
        standard: "C++11",
        difficulty: d.diff,
        tags: ["C++11", "decltype", "[dcl.type.decltype]", "Type deduction"],
        summary: `Distinguish declared-type lookup from value-category inspection in ${d.target}.`,
      })
    );
  });

  return cards;
}

// ---------------------------------------------------------------------------
// 3. Array-to-Pointer Parameter Decay & sizeof Traps
// ---------------------------------------------------------------------------

function generateArrayDecayCards(): ScrollCard[] {
  const cards: ScrollCard[] = [];

  const configs: { type: string; elemSize: number; count: number }[] = [
    { type: "int", elemSize: 4, count: 8 },
    { type: "char", elemSize: 1, count: 16 },
    { type: "double", elemSize: 8, count: 5 },
    { type: "uint16_t", elemSize: 2, count: 12 },
    { type: "int64_t", elemSize: 8, count: 4 },
    { type: "float", elemSize: 4, count: 10 },
  ];

  configs.forEach((cfg, idx) => {
    const arrBytes = cfg.elemSize * cfg.count;

    // Variant A: Array parameter decays to pointer
    {
      const { options, correctIndex } = rotateOptions(
        "8 bytes (pointer size)",
        [
          `${arrBytes} bytes (full array)`,
          `${cfg.count} (element count)`,
          `${cfg.elemSize} bytes (one element)`,
        ],
        idx
      );
      cards.push(
        makeProceduralTrap({
          id: `decay-param-${cfg.type}-${cfg.count}`,
          title: `Parameter ${cfg.type} a[${cfg.count}] Decay`,
          question: `On LP64, what does measure(buf) return?`,
          code: `std::size_t measure(${cfg.type} a[${cfg.count}]) {\n  return sizeof(a);\n}\n${cfg.type} buf[${cfg.count}]{};`,
          options,
          correctIndex,
          explanation: `Function parameters written as \`${cfg.type} a[${cfg.count}]\` are adjusted by the compiler to \`${cfg.type}*\` ([dcl.fct]/5). Therefore \`sizeof(a)\` is \`sizeof(${cfg.type}*)\` == 8 bytes on LP64, NOT ${arrBytes}.`,
          clause: "[dcl.fct]/5 & [conv.array]",
          trackId: "memory-model",
          trackTitle: "Memory model",
          continentId: "the-machine",
          continentLabel: "The machine",
          accentHex: "#ff4d5a",
          topicSlug: "pointers-arrays-and-pointer-arithmetic",
          difficulty: 1,
          tags: ["Array Decay", "sizeof", "[dcl.fct]", "Memory model"],
          summary: `Verify what happens when ${cfg.type}[${cfg.count}] appears in a function parameter list.`,
        })
      );
    }

    // Variant B: Reference to array preserves extent
    {
      const { options, correctIndex } = rotateOptions(
        `${arrBytes} bytes`,
        ["8 bytes", `${cfg.count} bytes`, `${cfg.elemSize} bytes`],
        idx + 1
      );
      cards.push(
        makeProceduralTrap({
          id: `decay-ref-${cfg.type}-${cfg.count}`,
          title: `Reference to Array ${cfg.type} (&a)[${cfg.count}]`,
          question: `On LP64, what does exact_bytes(buf) return?`,
          code: `std::size_t exact_bytes(const ${cfg.type} (&a)[${cfg.count}]) {\n  return sizeof(a);\n}\n${cfg.type} buf[${cfg.count}]{};`,
          options,
          correctIndex,
          explanation: `A reference to an array \`const ${cfg.type} (&a)[${cfg.count}]\` does NOT decay to a pointer. \`sizeof(a)\` returns the full array extent: ${cfg.count} × ${cfg.elemSize} = ${arrBytes} bytes.`,
          clause: "[dcl.fct] & [expr.sizeof]",
          trackId: "memory-model",
          trackTitle: "Memory model",
          continentId: "the-machine",
          continentLabel: "The machine",
          accentHex: "#ff4d5a",
          topicSlug: "pointers-arrays-and-pointer-arithmetic",
          difficulty: 2,
          tags: ["Array Reference", "sizeof", "[expr.sizeof]", "Memory model"],
          summary: `Contrast array-to-pointer decay with passing an array by reference.`,
        })
      );
    }

    // Variant C: auto vs auto& deduction on array
    {
      const isRef = idx % 2 === 1;
      const correctType = isRef ? `${cfg.type} (&)[${cfg.count}]` : `${cfg.type}*`;
      const { options, correctIndex } = rotateOptions(
        correctType,
        [
          isRef ? `${cfg.type}*` : `${cfg.type} (&)[${cfg.count}]`,
          `${cfg.type}[${cfg.count}]`,
          `const ${cfg.type}*`,
        ],
        idx + 2
      );
      cards.push(
        makeProceduralTrap({
          id: `decay-auto-${isRef ? "ref" : "val"}-${cfg.type}`,
          title: isRef ? `auto& on ${cfg.type}[${cfg.count}]` : `auto by Value on ${cfg.type}[${cfg.count}]`,
          question: `What exact type is deduced for \`x\`?`,
          code: `${cfg.type} buf[${cfg.count}]{};\n${isRef ? "auto&" : "auto"} x = buf;`,
          options,
          correctIndex,
          explanation: isRef
            ? `\`auto&\` binds directly to the array without array-to-pointer decay, deducing \`${cfg.type} (&)[${cfg.count}]\`.`
            : `By-value \`auto\` applies array-to-pointer decay just like template value deduction, deducing \`${cfg.type}*\`.`,
          clause: "[dcl.type.auto.deduct] & [conv.array]",
          trackId: "types-and-initialization",
          trackTitle: "Types and initialization",
          continentId: "language-basics",
          continentLabel: "Language basics",
          accentHex: "#f43f5e",
          topicSlug: "type-deduction-auto-decltype",
          standard: "C++11",
          difficulty: 2,
          tags: ["C++11", "auto", "Array Decay", "[conv.array]"],
          summary: `Check whether ${isRef ? "auto&" : "auto"} triggers array-to-pointer decay.`,
        })
      );
    }

    // Variant D: sizeof(buf) vs sizeof(buf + 0)
    {
      const { options, correctIndex } = rotateOptions(
        `${arrBytes} and 8`,
        [`${arrBytes} and ${arrBytes}`, `8 and 8`, `${cfg.count} and 8`],
        idx + 3
      );
      cards.push(
        makeProceduralTrap({
          id: `decay-plus0-${cfg.type}-${cfg.count}`,
          title: `sizeof(buf) vs sizeof(buf + 0)`,
          question: `On LP64, what are the values of \`a\` and \`b\`?`,
          code: `${cfg.type} buf[${cfg.count}]{};\nauto a = sizeof(buf);\nauto b = sizeof(buf + 0);`,
          options,
          correctIndex,
          explanation: `\`sizeof(buf)\` suppresses array decay (${arrBytes}B), whereas \`buf + 0\` performs array-to-pointer conversion first, making \`buf + 0\` a \`${cfg.type}*\` (8B).`,
          clause: "[conv.array] & [expr.sizeof]",
          trackId: "memory-model",
          trackTitle: "Memory model",
          continentId: "the-machine",
          continentLabel: "The machine",
          accentHex: "#ff4d5a",
          topicSlug: "pointers-arrays-and-pointer-arithmetic",
          difficulty: 2,
          tags: ["Array Decay", "sizeof", "[conv.array]", "Memory model"],
          summary: `See how adding + 0 forces array-to-pointer decay even inside sizeof.`,
        })
      );
    }
  });

  return cards;
}

// ---------------------------------------------------------------------------
// 4. const / Pointer-to-Const vs Const-Pointer & Alias Traps
// ---------------------------------------------------------------------------

function generateConstPointerCards(): ScrollCard[] {
  const cards: ScrollCard[] = [];

  const types = ["int", "double", "char", "uint32_t"];

  types.forEach((t, i) => {
    // 1. const T* p
    {
      const { options, correctIndex } = rotateOptions(
        "Line 2 compiles; Line 1 is ill-formed",
        [
          "Line 1 compiles; Line 2 is ill-formed",
          "Both lines compile cleanly",
          "Both lines are ill-formed",
        ],
        i
      );
      cards.push(
        makeProceduralTrap({
          id: `const-ptr-to-const-${t}`,
          title: `Pointer to const ${t} (const ${t}*)`,
          question: `Which mutation compiles given \`const ${t}* p = &a;\`?`,
          code: `${t} a = 1, b = 2;\nconst ${t}* p = &a;\n*p = 3;   // Line 1\np = &b;   // Line 2`,
          options,
          correctIndex,
          explanation: `Reading right-to-left, \`p\` is a mutable pointer to \`const ${t}\`. Reassigning \`p = &b\` is valid, while writing \`*p = 3\` is ill-formed.`,
          clause: "[dcl.ptr] & [dcl.type.cv]",
          trackId: "types-and-initialization",
          trackTitle: "Types and initialization",
          continentId: "language-basics",
          continentLabel: "Language basics",
          accentHex: "#f43f5e",
          topicSlug: "const-volatile-and-qualifiers",
          difficulty: 1,
          tags: ["const", "Pointers", "[dcl.ptr]", "Types and initialization"],
          summary: `Distinguish low-level const (pointee) from top-level const (pointer) in const ${t}*.`,
        })
      );
    }

    // 2. T* const p
    {
      const { options, correctIndex } = rotateOptions(
        "Line 1 compiles; Line 2 is ill-formed",
        [
          "Line 2 compiles; Line 1 is ill-formed",
          "Both lines compile cleanly",
          "Both lines are ill-formed",
        ],
        i + 1
      );
      cards.push(
        makeProceduralTrap({
          id: `const-const-ptr-${t}`,
          title: `Const Pointer (${t}* const)`,
          question: `Which mutation compiles given \`${t}* const p = &a;\`?`,
          code: `${t} a = 1, b = 2;\n${t}* const p = &a;\n*p = 3;   // Line 1\np = &b;   // Line 2`,
          options,
          correctIndex,
          explanation: `\`${t}* const p\` is a const pointer to mutable \`${t}\`. Modifying the pointee (\`*p = 3\`) succeeds, while reseating \`p = &b\` is ill-formed.`,
          clause: "[dcl.ptr] & [dcl.type.cv]",
          trackId: "types-and-initialization",
          trackTitle: "Types and initialization",
          continentId: "language-basics",
          continentLabel: "Language basics",
          accentHex: "#f43f5e",
          topicSlug: "const-volatile-and-qualifiers",
          difficulty: 1,
          tags: ["const", "Pointers", "[dcl.ptr]", "Types and initialization"],
          summary: `Check which assignment is rejected by top-level const on ${t}* const.`,
        })
      );
    }

    // 3. Alias trap: using Ptr = T*; const Ptr p;
    {
      const { options, correctIndex } = rotateOptions(
        `${t}* const (const pointer to mutable ${t})`,
        [
          `const ${t}* (pointer to const ${t})`,
          `const ${t}* const (both const)`,
          `${t}* (const is ignored on aliases)`,
        ],
        i + 2
      );
      cards.push(
        makeProceduralTrap({
          id: `const-alias-trap-${t}`,
          title: `Type Alias Trap: const Ptr (${t}*)`,
          question: `What exact type does \`p\` have?`,
          code: `using Ptr = ${t}*;\n${t} a = 1;\nconst Ptr p = &a;`,
          options,
          correctIndex,
          explanation: `Type aliases are NOT text substitution! \`const\` applies to the whole aliased pointer type \`Ptr\`, producing \`${t}* const\` (top-level const), NOT \`const ${t}*\`.`,
          clause: "[dcl.typedef] & [dcl.type.cv]",
          trackId: "types-and-initialization",
          trackTitle: "Types and initialization",
          continentId: "language-basics",
          continentLabel: "Language basics",
          accentHex: "#f43f5e",
          topicSlug: "const-volatile-and-qualifiers",
          standard: "C++11",
          difficulty: 2,
          tags: ["const", "Type Alias", "[dcl.typedef]", "Types and initialization"],
          summary: `Avoid the classic typedef/using trap where const applies to the pointer itself.`,
        })
      );
    }

    // 4. East const equivalence: T const* vs const T*
    {
      const { options, correctIndex } = rotateOptions(
        `Identical to const ${t}* (pointer to const ${t})`,
        [
          `Identical to ${t}* const (const pointer)`,
          `Ill-formed syntax in standard C++`,
          `Identical to const ${t}* const`,
        ],
        i + 3
      );
      cards.push(
        makeProceduralTrap({
          id: `const-east-${t}`,
          title: `East const: ${t} const*`,
          question: `How does C++ parse \`${t} const* p\`?`,
          code: `${t} a = 5;\n${t} const* p = &a;`,
          options,
          correctIndex,
          explanation: `\`const\` qualifies whatever is to its left (or to its right only if nothing is to its left). Both \`const ${t}*\` and \`${t} const*\` declare the exact same type: pointer to const ${t}.`,
          clause: "[dcl.type.cv]",
          trackId: "types-and-initialization",
          trackTitle: "Types and initialization",
          continentId: "language-basics",
          continentLabel: "Language basics",
          accentHex: "#f43f5e",
          topicSlug: "const-volatile-and-qualifiers",
          difficulty: 1,
          tags: ["East const", "Pointers", "[dcl.type.cv]", "Types and initialization"],
          summary: `Verify how east-const placement maps to standard pointer-to-const semantics.`,
        })
      );
    }

    // 5. auto top-level vs low-level const stripping
    {
      const { options, correctIndex } = rotateOptions(
        `x is ${t}, q is const ${t}*`,
        [
          `x is const ${t}, q is const ${t}*`,
          `x is ${t}, q is ${t}*`,
          `x is const ${t}&, q is const ${t}* const`,
        ],
        i
      );
      cards.push(
        makeProceduralTrap({
          id: `const-auto-strip-${t}`,
          title: `auto Top-Level vs Low-Level const (${t})`,
          question: `What types are deduced for \`x\` and \`q\`?`,
          code: `const ${t} c = 1;\nconst ${t}* const p = &c;\nauto x = c;\nauto q = p;`,
          options,
          correctIndex,
          explanation: `By-value \`auto\` drops top-level cv-qualifiers (\`const ${t}\` -> \`${t}\`, \`const ${t}* const\` -> \`const ${t}*\`), while preserving low-level const on the pointee.`,
          clause: "[dcl.type.auto.deduct]",
          trackId: "types-and-initialization",
          trackTitle: "Types and initialization",
          continentId: "language-basics",
          continentLabel: "Language basics",
          accentHex: "#f43f5e",
          topicSlug: "type-deduction-auto-decltype",
          standard: "C++11",
          difficulty: 2,
          tags: ["C++11", "auto", "const", "[dcl.type.auto.deduct]"],
          summary: `See which const qualifiers by-value auto strips and which it preserves.`,
        })
      );
    }
  });

  // Extra classic const conversion traps
  cards.push(
    makeProceduralTrap({
      id: "const-double-ptr-conv",
      title: "Why int** Cannot Convert to const int**",
      question: "Does passing `int**` to `void f(const int**)` compile?",
      code: `void f(const int** pp);\nint x = 1;\nint* p = &x;\nf(&p); // well-formed?`,
      options: [
        "Ill-formed: would allow modifying a const int without a cast",
        "Well-formed: adds const safely to the pointee",
        "Well-formed only in C++20 and later",
        "Compiles with undefined behavior at runtime",
      ],
      correctIndex: 0,
      explanation:
        "Qualification conversion ([conv.qual]) forbids `int** -> const int**` because `f` could store `&const_obj` into `*pp`, making mutable `p` point to a `const int`! `const int* const*` IS allowed.",
      clause: "[conv.qual]",
      trackId: "types-and-initialization",
      trackTitle: "Types and initialization",
      continentId: "language-basics",
      continentLabel: "Language basics",
      accentHex: "#f43f5e",
      topicSlug: "const-volatile-and-qualifiers",
      difficulty: 3,
      tags: ["const", "Qualification Conv", "[conv.qual]", "Types and initialization"],
      summary: "Why adding const at depth 2 without intermediate const breaks const-safety.",
    }),
    makeProceduralTrap({
      id: "const-double-ptr-safe",
      title: "Qualification Conversion: int** to const int* const*",
      question: "Does converting `int**` to `const int* const*` compile?",
      code: `void f(const int* const* pp);\nint x = 1;\nint* p = &x;\nf(&p); // well-formed?`,
      options: [
        "Well-formed: const at every intermediate level closes the hole",
        "Ill-formed: same rule that rejects const int**",
        "Ill-formed unless reinterpret_cast is used",
        "Compiles only when x is declared const",
      ],
      correctIndex: 0,
      explanation:
        "Under [conv.qual], adding `const` deeper in a pointer chain is legal iff every outer pointer level up to the added `const` is also `const`—preventing `*pp` from being overwritten.",
      clause: "[conv.qual]",
      trackId: "types-and-initialization",
      trackTitle: "Types and initialization",
      continentId: "language-basics",
      continentLabel: "Language basics",
      accentHex: "#f43f5e",
      topicSlug: "const-volatile-and-qualifiers",
      difficulty: 3,
      tags: ["const", "Qualification Conv", "[conv.qual]", "Types and initialization"],
      summary: "The exact [conv.qual] rule allowing const int* const* from int**.",
    })
  );

  return cards;
}

// ---------------------------------------------------------------------------
// 5. Integer Promotion & Signed/Unsigned Arithmetic Conversions
// ---------------------------------------------------------------------------

function generateIntegerPromotionCards(): ScrollCard[] {
  const cards: ScrollCard[] = [];

  // A. Small unsigned types promote to signed `int` (not wraparound!)
  const promoPairs: {
    id: string;
    type: string;
    a: number;
    b: number;
    op: "+" | "-";
    result: number;
  }[] = [
    { id: "u8-add-1", type: "uint8_t", a: 200, b: 100, op: "+", result: 300 },
    { id: "u8-add-2", type: "uint8_t", a: 250, b: 250, op: "+", result: 500 },
    { id: "u8-sub-1", type: "uint8_t", a: 5, b: 10, op: "-", result: -5 },
    { id: "u8-sub-2", type: "uint8_t", a: 1, b: 200, op: "-", result: -199 },
    { id: "u16-add-1", type: "uint16_t", a: 40000, b: 40000, op: "+", result: 80000 },
    { id: "u16-sub-1", type: "uint16_t", a: 10, b: 50, op: "-", result: -40 },
    { id: "s8-add-1", type: "int8_t", a: 100, b: 100, op: "+", result: 200 },
    { id: "s16-add-1", type: "short", a: 30000, b: 30000, op: "+", result: 60000 },
  ];

  promoPairs.forEach((p, idx) => {
    const wrap =
      p.type === "uint8_t"
        ? ((p.result % 256) + 256) % 256
        : p.type === "uint16_t"
          ? ((p.result % 65536) + 65536) % 65536
          : p.result - 256;
    const { options, correctIndex } = rotateOptions(
      `int with value ${p.result}`,
      [
        `${p.type} with value ${wrap}`,
        `unsigned int with value ${Math.abs(p.result)}`,
        `Undefined behavior (signed overflow)`,
      ],
      idx
    );
    cards.push(
      makeProceduralTrap({
        id: `promo-${p.id}`,
        title: `Integral Promotion: ${p.type} ${p.op} ${p.type}`,
        question: `On LP64 (32-bit int), what is the type and value of \`r\`?`,
        code: `${p.type} a = ${p.a}, b = ${p.b};\nauto r = a ${p.op} b;`,
        options,
        correctIndex,
        explanation: `Types narrower than \`int\` undergo integral promotion ([conv.prom]) BEFORE arithmetic. Because 32-bit \`int\` can represent all values of \`${p.type}\`, both operands promote to \`int\`, giving \`int(${p.result})\`—no ${p.type} wraparound!`,
        clause: "[conv.prom]",
        trackId: "types-and-initialization",
        trackTitle: "Types and initialization",
        continentId: "language-basics",
        continentLabel: "Language basics",
        accentHex: "#f43f5e",
        topicSlug: "fundamental-types-and-arithmetic-conversions",
        difficulty: 2,
        tags: ["Integral Promotion", "[conv.prom]", "Types and initialization"],
        summary: `Predict exact type and value when adding or subtracting narrow ${p.type} operands.`,
      })
    );
  });

  // B. Signed vs Unsigned usual arithmetic conversion traps
  const signTraps: {
    id: string;
    title: string;
    code: string;
    question: string;
    correct: string;
    distractors: [string, string, string];
    explanation: string;
    clause: string;
    standard?: string;
    diff: ScrollCardDifficulty;
  }[] = [
    {
      id: "s-vs-u-lt",
      title: "Signed -1 < Unsigned 1u",
      code: `int a = -1;\nunsigned int b = 1u;\nbool res = (a < b);`,
      question: "What is the value of `res`?",
      correct: "false",
      distractors: ["true", "Undefined behavior", "Ill-formed (does not compile)"],
      explanation:
        "Usual arithmetic conversions ([expr.arith.conv]) convert `int(-1)` to `unsigned int` (UINT_MAX = 4294967295u), so `4294967295u < 1u` evaluates to `false`!",
      clause: "[expr.arith.conv]",
      diff: 1,
    },
    {
      id: "s-vs-size-t",
      title: "Signed -1 < std::size_t{0}",
      code: `int idx = -1;\nstd::vector<int> v;\nbool ok = (idx < v.size());`,
      question: "What is the value of `ok` on an empty vector?",
      correct: "false (idx converts to SIZE_MAX)",
      distractors: [
        "true (-1 is less than 0)",
        "Undefined behavior",
        "Throws std::out_of_range",
      ],
      explanation:
        "`v.size()` is unsigned `std::size_t` (64-bit on LP64). `int(-1)` converts to `SIZE_MAX`, making `-1 < 0uz` evaluate to `false`!",
      clause: "[expr.arith.conv]",
      diff: 1,
    },
    {
      id: "s-vs-u-add",
      title: "int(-5) + unsigned(2u) Type & Sign",
      code: `int a = -5;\nunsigned int b = 2u;\nauto r = a + b;\nbool neg = (r < 0);`,
      question: "What are the type of `r` and value of `neg`?",
      correct: "unsigned int; neg is false",
      distractors: [
        "int; neg is true (-3)",
        "unsigned int; neg is true",
        "Undefined behavior",
      ],
      explanation:
        "`int` and `unsigned int` share rank, so `a` converts to `unsigned int`. `r` is `unsigned int` (UINT_MAX - 2), which can never be `< 0`.",
      clause: "[expr.arith.conv]",
      diff: 2,
    },
    {
      id: "cmp-less-cpp20",
      title: "C++20 std::cmp_less(-1, 1u)",
      code: `#include <utility>\nbool a = (-1 < 1u);\nbool b = std::cmp_less(-1, 1u);`,
      question: "What are the values of `a` and `b`?",
      correct: "a is false, b is true",
      distractors: [
        "a is true, b is true",
        "a is false, b is false",
        "a is true, b is false",
      ],
      explanation:
        "Raw `-1 < 1u` converts `-1` to `UINT_MAX` (false). C++20's `std::cmp_less` performs mathematically exact cross-sign integer comparison (true).",
      clause: "[utility.intcmp]",
      standard: "C++20",
      diff: 2,
    },
    {
      id: "u16-vs-int-mul",
      title: "uint16_t(60000) * uint16_t(60000) UB Trap!",
      code: `uint16_t a = 60000, b = 60000;\nauto prod = a * b; // 32-bit int!`,
      question: "On a 32-bit int platform, what happens here?",
      correct: "Undefined behavior (signed 32-bit int overflow!)",
      distractors: [
        "Well-defined uint16_t modular wraparound",
        "Well-defined unsigned int wraparound",
        "Promotes to uint64_t = 3600000000",
      ],
      explanation:
        "Notorious C++ trap! Both `uint16_t` operands promote to SIGNED `int`, and `60000 * 60000 = 3.6e9` exceeds `INT_MAX` (~2.14e9)—triggering signed overflow UB!",
      clause: "[conv.prom] & [expr.pre]/4",
      diff: 3,
    },
    {
      id: "long-vs-uint-lp64",
      title: "long(-1) + unsigned int(1u) on LP64",
      code: `long a = -1L;       // 64-bit signed on LP64\nunsigned int b = 1u; // 32-bit unsigned\nauto r = a + b;`,
      question: "On LP64 (64-bit long, 32-bit int), what is the type of `r`?",
      correct: "long (signed, value 0)",
      distractors: [
        "unsigned long (wraps to 0)",
        "unsigned int (value 0)",
        "long long",
      ],
      explanation:
        "Because 64-bit `long` can represent ALL values of 32-bit `unsigned int`, usual arithmetic conversions convert `b` to signed `long` ([expr.arith.conv])!",
      clause: "[expr.arith.conv]",
      diff: 3,
    },
    {
      id: "bool-plus-bool",
      title: "bool + bool Promotion",
      code: `bool x = true, y = true;\nauto z = x + y;`,
      question: "What is the type and value of `z`?",
      correct: "int with value 2",
      distractors: [
        "bool with value true",
        "uint8_t with value 2",
        "Ill-formed: operator+ is deleted for bool",
      ],
      explanation:
        "`bool` undergoes integral promotion to `int` (`false -> 0`, `true -> 1`), so `true + true` is `int(2)`.",
      clause: "[conv.prom]",
      diff: 1,
    },
    {
      id: "u8-bitwise-not",
      title: "Bitwise ~uint8_t(0) Trap",
      code: `uint8_t mask = 0;\nbool eq = (~mask == uint8_t{0xFF});`,
      question: "What is the value of `eq` on 32-bit int?",
      correct: "false (~mask is int(-1), not 255)",
      distractors: [
        "true (~0x00 is 0xFF)",
        "Undefined behavior",
        "Ill-formed comparison",
      ],
      explanation:
        "`mask` promotes to `int(0)` BEFORE `~`, so `~mask` is `int(-1)` (0xFFFFFFFF), which is NOT equal to `int(255)`!",
      clause: "[conv.prom] & [expr.unary.op]",
      diff: 3,
    },
    {
      id: "negate-unsigned",
      title: "Unary Minus on Unsigned Integer",
      code: `unsigned int x = 1u;\nauto y = -x;`,
      question: "What is the type and value of `y`?",
      correct: "unsigned int with value UINT_MAX",
      distractors: [
        "int with value -1",
        "Undefined behavior",
        "Ill-formed: unary minus disallowed on unsigned",
      ],
      explanation:
        "Negating an unsigned integer computes `2^N - x` in the SAME unsigned type—so `-1u` is well-defined `UINT_MAX`.",
      clause: "[expr.unary.op]",
      diff: 2,
    },
    {
      id: "u32-sub-underflow",
      title: "Unsigned Subtraction Wraparound",
      code: `uint32_t a = 0, b = 1;\nbool lt = (a - b < 0);`,
      question: "What is the value of `lt`?",
      correct: "false (0u - 1u wraps to UINT32_MAX)",
      distractors: [
        "true (-1 < 0)",
        "Undefined behavior",
        "Implementation-defined",
      ],
      explanation:
        "Unsigned 32-bit arithmetic wraps modulo 2^32, so `a - b` is `4294967295u`, and an unsigned value is never `< 0`.",
      clause: "[basic.fundamental]",
      diff: 1,
    },
    {
      id: "ssize-cpp20",
      title: "C++20 std::ssize(v) Return Type",
      code: `std::vector<int> v{1, 2, 3};\nauto n = std::ssize(v);`,
      question: "What signedness does `std::ssize(v)` have?",
      correct: "Signed (std::ptrdiff_t)",
      distractors: [
        "Unsigned (std::size_t)",
        "int (always 32-bit)",
        "Same as v.size()",
      ],
      explanation:
        "C++20 added `std::ssize` returning a signed type (`std::ptrdiff_t`) so expressions like `i < std::ssize(v) - 1` never underflow when `v` is empty.",
      clause: "[iterator.range]",
      standard: "C++20",
      diff: 1,
    },
    {
      id: "shift-neg-cpp20",
      title: "C++20 Two's Complement Right Shift",
      code: `int x = -8;\nint y = x >> 1; // Since C++20`,
      question: "What does C++20 guarantee for `(-8) >> 1`?",
      correct: "Well-defined arithmetic shift: -4",
      distractors: [
        "Undefined behavior",
        "Implementation-defined (may be logical shift)",
        "Produces 0x7FFFFFFC",
      ],
      explanation:
        "C++20 standardized two's complement representation (P0907R4) and defined signed right shift as arithmetic shift: `-8 >> 1 == -4`.",
      clause: "[expr.shift]",
      standard: "C++20",
      diff: 2,
    },
  ];

  signTraps.forEach((s, i) => {
    const { options, correctIndex } = rotateOptions(s.correct, s.distractors, i + 1);
    cards.push(
      makeProceduralTrap({
        id: `arith-${s.id}`,
        title: s.title,
        question: s.question,
        code: s.code,
        options,
        correctIndex,
        explanation: s.explanation,
        clause: s.clause,
        trackId: "types-and-initialization",
        trackTitle: "Types and initialization",
        continentId: "language-basics",
        continentLabel: "Language basics",
        accentHex: "#f43f5e",
        topicSlug: "integer-arithmetic-and-overflow",
        standard: s.standard,
        difficulty: s.diff,
        tags: [s.standard ?? "ISO C++", "Conversions", s.clause, "Arithmetic"],
        summary: `Evaluate C++ integral promotion and usual arithmetic conversion rules under ${s.clause}.`,
      })
    );
  });

  return cards;
}

// ---------------------------------------------------------------------------
// 6. Overload Conversion Ranking Puzzles
// ---------------------------------------------------------------------------

function generateOverloadRankingCards(): ScrollCard[] {
  const cards: ScrollCard[] = [];

  const scenarios: {
    id: string;
    title: string;
    code: string;
    correct: string;
    distractors: [string, string, string];
    explanation: string;
    clause: string;
    standard?: string;
    diff: ScrollCardDifficulty;
  }[] = [
    {
      id: "str-vs-bool",
      title: 'Overload: f(bool) vs f(std::string) for "hi"',
      code: `int f(bool)               { return 1; }\nint f(const std::string&) { return 2; }\nint r = f("hi");`,
      correct: "Calls f(bool) -> 1",
      distractors: [
        "Calls f(const std::string&) -> 2",
        "Ambiguous overload error",
        "Ill-formed: no conversion from const char[3]",
      ],
      explanation:
        'Standard conversion (`const char[3]` -> `const char*` -> `bool`) ALWAYS outranks user-defined conversion (`const char*` -> `std::string`) under [over.ics.rank]!',
      clause: "[over.ics.rank]/3.2",
      diff: 2,
    },
    {
      id: "short-int-vs-double",
      title: "Overload: f(int) vs f(double) for short",
      code: `int f(int)    { return 1; }\nint f(double) { return 2; }\nshort s = 5;\nint r = f(s);`,
      correct: "Calls f(int) -> 1 (Integral Promotion)",
      distractors: [
        "Calls f(double) -> 2",
        "Ambiguous overload error",
        "Ill-formed narrowing conversion",
      ],
      explanation:
        "`short -> int` is an Integral Promotion (rank 2), which beats `short -> double` (Standard Conversion, rank 3).",
      clause: "[over.ics.rank]",
      diff: 1,
    },
    {
      id: "float-double-vs-int",
      title: "Overload: f(double) vs f(int) for float",
      code: `int f(int)    { return 1; }\nint f(double) { return 2; }\nint r = f(3.5f);`,
      correct: "Calls f(double) -> 2 (Floating Promotion)",
      distractors: [
        "Calls f(int) -> 1",
        "Ambiguous overload error",
        "Calls neither (narrowing error)",
      ],
      explanation:
        "`float -> double` is a Floating-Point Promotion, which strictly outranks the Standard Conversion `float -> int`.",
      clause: "[conv.fpprom] & [over.ics.rank]",
      diff: 1,
    },
    {
      id: "int-long-vs-double",
      title: "Overload: f(long) vs f(double) for int",
      code: `int f(long)   { return 1; }\nint f(double) { return 2; }\nint r = f(42);`,
      correct: "Ill-formed: ambiguous overload",
      distractors: [
        "Calls f(long) -> 1 (integer prefers integer)",
        "Calls f(double) -> 2",
        "Depends on LP64 vs LLP64",
      ],
      explanation:
        "Neither `int -> long` nor `int -> double` is a promotion; BOTH are Standard Conversions of equal rank, making `f(42)` ambiguous!",
      clause: "[over.ics.rank]",
      diff: 2,
    },
    {
      id: "char-int-vs-long",
      title: "Overload: f(int) vs f(long) for char",
      code: `int f(int)  { return 1; }\nint f(long) { return 2; }\nint r = f('a');`,
      correct: "Calls f(int) -> 1 (Integral Promotion)",
      distractors: [
        "Ill-formed: ambiguous",
        "Calls f(long) -> 2",
        "Ill-formed: char is not numeric",
      ],
      explanation:
        "`char -> int` is an Integral Promotion whereas `char -> long` is a lower-ranked Standard Conversion, so `f(int)` wins.",
      clause: "[conv.prom] & [over.ics.rank]",
      diff: 1,
    },
    {
      id: "nullptr-ptr-vs-int",
      title: "Overload: f(int) vs f(int*) for nullptr vs 0",
      code: `int f(int)  { return 1; }\nint f(int*) { return 2; }\nint a = f(0);\nint b = f(nullptr);`,
      correct: "a == 1 (f(int)), b == 2 (f(int*))",
      distractors: [
        "a == 2, b == 2",
        "a is ambiguous, b == 2",
        "a == 1, b is ambiguous",
      ],
      explanation:
        "`0` has type `int` (exact match for `f(int)`), while `nullptr` has type `std::nullptr_t` which converts only to pointers (`f(int*)`).",
      clause: "[conv.ptr]",
      standard: "C++11",
      diff: 1,
    },
    {
      id: "template-vs-nontemplate-exact",
      title: "Non-Template vs Function Template Exact Match",
      code: `template <class T>\nint f(T)   { return 1; }\nint f(int) { return 2; }\nint r = f(42);`,
      correct: "Calls non-template f(int) -> 2",
      distractors: [
        "Calls template f<int>(int) -> 1",
        "Ill-formed: ambiguous",
        "Calls f<int> in C++20 only",
      ],
      explanation:
        "Both candidates are Exact Matches; [over.match.best] breaks ties in favor of the non-template function.",
      clause: "[over.match.best]/2.4",
      diff: 1,
    },
    {
      id: "template-beats-conv",
      title: "Template Exact Match vs Non-Template Conversion",
      code: `template <class T>\nint f(T)      { return 1; }\nint f(double) { return 2; }\nint r = f(42);`,
      correct: "Calls template f<int>(int) -> 1",
      distractors: [
        "Calls non-template f(double) -> 2",
        "Ill-formed: ambiguous",
        "Non-template always beats templates",
      ],
      explanation:
        "Non-template preference is ONLY a tie-breaker! `f<int>(int)` is an Exact Match while `f(double)` requires `int -> double` Standard Conversion, so the template wins.",
      clause: "[over.match.best]",
      diff: 2,
    },
    {
      id: "const-ref-vs-mut-ref",
      title: "Overload: f(int&) vs f(const int&) on Mutable Lvalue",
      code: `int f(int&)       { return 1; }\nint f(const int&) { return 2; }\nint x = 5;\nint r = f(x);`,
      correct: "Calls f(int&) -> 1 (less cv-qualified)",
      distractors: [
        "Ill-formed: ambiguous",
        "Calls f(const int&) -> 2",
        "Ill-formed: cannot overload on const&",
      ],
      explanation:
        "When binding references to the same type, [over.ics.rank]/3.2.6 prefers the less cv-qualified reference (`int&`) for a non-const lvalue.",
      clause: "[over.ics.rank]/3.2.6",
      diff: 1,
    },
    {
      id: "rref-vs-const-lref",
      title: "Overload: f(const T&) vs f(T&&) on Rvalue",
      code: `int f(const std::string&) { return 1; }\nint f(std::string&&)      { return 2; }\nint r = f(std::string{"hi"});`,
      correct: "Calls f(std::string&&) -> 2",
      distractors: [
        "Ill-formed: ambiguous (both bind rvalues)",
        "Calls f(const std::string&) -> 1",
        "Calls f(const std::string&) due to copy elision",
      ],
      explanation:
        "Both bind an rvalue with Exact Match, and [over.ics.rank]/3.2.3 strictly prefers binding an rvalue to `T&&` over `const T&`.",
      clause: "[over.ics.rank]/3.2.3",
      standard: "C++11",
      diff: 1,
    },
    {
      id: "derived-ptr-hierarchy",
      title: "Pointer Conversion: Base* vs void* for Derived*",
      code: `struct Base {}; struct Derived : Base {};\nint f(Base*) { return 1; }\nint f(void*) { return 2; }\nDerived d;\nint r = f(&d);`,
      correct: "Calls f(Base*) -> 1 (closer base beats void*)",
      distractors: [
        "Ill-formed: ambiguous standard conversions",
        "Calls f(void*) -> 2",
        "Ill-formed without static_cast",
      ],
      explanation:
        "Under [over.ics.rank]/4.4, converting `Derived*` to `Base*` is strictly better than converting `Derived*` to `void*`.",
      clause: "[over.ics.rank]/4.4",
      diff: 2,
    },
    {
      id: "ellipsis-last",
      title: "Overload: User-Defined Conversion vs Ellipsis (...)",
      code: `struct Box { Box(int) {} };\nint f(Box) { return 1; }\nint f(...) { return 2; }\nint r = f(7);`,
      correct: "Calls f(Box) -> 1 (UDC beats ellipsis)",
      distractors: [
        "Calls f(...) -> 2",
        "Ill-formed: ambiguous",
        "Undefined behavior",
      ],
      explanation:
        "Ellipsis conversion `...` has the lowest possible rank in overload resolution; any viable User-Defined Conversion beats it.",
      clause: "[over.ics.rank]/2",
      diff: 1,
    },
    {
      id: "udc-two-step",
      title: "Two User-Defined Conversions in a Row",
      code: `struct A { A(int) {} };\nstruct B { B(A) {} };\nvoid f(B);\nf(42); // compiles?`,
      correct: "Ill-formed: at most ONE user-defined conversion",
      distractors: [
        "Compiles: chains int -> A -> B automatically",
        "Compiles only if A(int) is constexpr",
        "Ambiguous overload",
      ],
      explanation:
        "An implicit conversion sequence can contain at most ONE user-defined conversion ([over.best.ics]). Chaining `int -> A -> B` implicitly is forbidden.",
      clause: "[over.best.ics]",
      diff: 2,
    },
    {
      id: "private-wins-then-errors",
      title: "Access Control Runs AFTER Overload Resolution",
      code: `class C {\n  void f(int);        // private\npublic:\n  void f(double);     // public\n};\n// Outside C: c.f(42);`,
      correct: "Ill-formed: selects private f(int), then fails access check",
      distractors: [
        "Compiles: skips private f(int) and calls public f(double)",
        "Ambiguous overload",
        "Compiles with deprecation warning",
      ],
      explanation:
        "C++ performs overload resolution completely BEFORE access checking ([class.access.general]). `f(int)` wins as Exact Match, then triggers an access error.",
      clause: "[class.access.general] & [over.match]",
      diff: 2,
    },
    {
      id: "deleted-participates",
      title: "= delete Participates in Overload Resolution",
      code: `void log(int);\nvoid log(double) = delete;\nlog(3.14); // what happens?`,
      correct: "Ill-formed: selects deleted log(double) and fails",
      distractors: [
        "Compiles: skips deleted overload and converts 3.14 to int",
        "Ambiguous overload",
        "Compiles with narrowing warning",
      ],
      explanation:
        "Deleted functions ARE viable candidates in overload resolution ([dcl.fct.def.delete]). `log(double)` wins as Exact Match, blocking unintended implicit narrowing to `int`!",
      clause: "[dcl.fct.def.delete]",
      standard: "C++11",
      diff: 1,
    },
    {
      id: "forwarding-ref-hijack",
      title: "Forwarding-Ref Constructor Hijacks Non-Const Copy",
      code: `struct S {\n  S(const S&);                       // #1\n  template <class T> S(T&&);         // #2\n};\nS a;\nS b(a); // non-const lvalue!`,
      correct: "Calls #2 template S(S&) — exact match beats const S&!",
      distractors: [
        "Calls #1 copy constructor S(const S&)",
        "Ambiguous between #1 and #2",
        "Copy constructor always beats templates",
      ],
      explanation:
        "Classic Scott Meyers trap! For non-const `a`, #2 instantiates `S(S&)` (Exact Match) while #1 requires adding `const` (`S& -> const S&`). Constrain #2 with a C++20 concept or `enable_if`!",
      clause: "[over.ics.rank]",
      standard: "C++11",
      diff: 3,
    },
    {
      id: "value-vs-ref-ambig",
      title: "Overload: f(int) vs f(int&) on Lvalue",
      code: `int f(int)  { return 1; }\nint f(int&) { return 2; }\nint x = 5;\nint r = f(x);`,
      correct: "Ill-formed: ambiguous (both are Exact Matches)",
      distractors: [
        "Calls f(int&) -> 2",
        "Calls f(int) -> 1",
        "Ill-formed: cannot declare both overloads",
      ],
      explanation:
        "Both `f(int)` and `f(int&)` are legal declarations and both have Exact Match rank for lvalue `x`, so calling `f(x)` is ambiguous.",
      clause: "[over.ics.rank]",
      diff: 2,
    },
    {
      id: "init-list-ctor-priority",
      title: "std::initializer_list Constructor Priority",
      code: `std::vector<int> a(4, 9); // #1\nstd::vector<int> b{4, 9}; // #2`,
      correct: "a has 4 elements (9,9,9,9); b has 2 elements (4, 9)",
      distractors: [
        "Both have 4 elements of value 9",
        "Both have 2 elements (4, 9)",
        "b is ill-formed due to ambiguity",
      ],
      explanation:
        "Braced initialization strongly prefers `std::initializer_list` constructors ([over.match.list]), so `{4, 9}` constructs a 2-element vector while `(4, 9)` calls the count+value constructor.",
      clause: "[over.match.list]",
      standard: "C++11",
      diff: 1,
    },
    {
      id: "bool-ptr-vs-int-0",
      title: "Overload: f(bool) vs f(void*) for Pointer",
      code: `int f(bool)  { return 1; }\nint f(void*) { return 2; }\nint x = 0;\nint r = f(&x);`,
      correct: "Calls f(void*) -> 2 (ptr->void* beats ptr->bool)",
      distractors: [
        "Ill-formed: ambiguous standard conversions",
        "Calls f(bool) -> 1",
        "Ill-formed: requires static_cast<void*>",
      ],
      explanation:
        "Under [over.ics.rank]/4.3, a pointer conversion to `void*` is strictly better than a boolean conversion `T* -> bool`.",
      clause: "[over.ics.rank]/4.3",
      diff: 2,
    },
    {
      id: "concept-subsumption",
      title: "C++20 Concept Subsumption Tie-Breaker",
      code: `template <std::integral T> int f(T) { return 1; }\ntemplate <std::signed_integral T> int f(T) { return 2; }\nint r = f(-3);`,
      correct: "Calls #2 -> 2 (signed_integral subsumes integral)",
      distractors: [
        "Ill-formed: ambiguous constraints",
        "Calls #1 -> 1 (declared first)",
        "Subsumption only works with requires-expressions",
      ],
      explanation:
        "`std::signed_integral<T>` is defined as `std::integral<T> && std::is_signed_v<T>`, so its constraint expression strictly subsumes `std::integral<T>` ([temp.constr.order]).",
      clause: "[temp.constr.order]",
      standard: "C++20",
      diff: 2,
    },
  ];

  scenarios.forEach((sc, i) => {
    const { options, correctIndex } = rotateOptions(sc.correct, sc.distractors, i);
    cards.push(
      makeProceduralTrap({
        id: `ovl-${sc.id}`,
        title: sc.title,
        question: "Which overload wins (or why does it fail)?",
        code: sc.code,
        options,
        correctIndex,
        explanation: sc.explanation,
        clause: sc.clause,
        trackId: "expressions-and-functions",
        trackTitle: "Expressions and functions",
        continentId: "language-basics",
        continentLabel: "Language basics",
        accentHex: "#f43f5e",
        topicSlug: "overload-resolution",
        standard: sc.standard,
        difficulty: sc.diff,
        tags: [sc.standard ?? "ISO C++", "Overload Ranking", sc.clause],
        summary: `Rank competing candidates using ISO C++ implicit conversion sequences (${sc.clause}).`,
      })
    );
  });

  return cards;
}

// ---------------------------------------------------------------------------
// 7. Reference Collapsing (T&&) & Forwarding Deduction Puzzles
// ---------------------------------------------------------------------------

function generateForwardingCards(): ScrollCard[] {
  const cards: ScrollCard[] = [];

  // A. Reference collapsing matrix across types
  const collapseTypes = ["int", "const int", "std::string", "Widget"];
  const collapseForms: {
    key: string;
    aliasDecl: (t: string) => string;
    expr: string;
    result: (t: string) => string;
    wrong: (t: string) => [string, string, string];
  }[] = [
    {
      key: "lref-lref",
      aliasDecl: (t) => `using L = ${t}&;`,
      expr: "L&",
      result: (t) => `${t}&`,
      wrong: (t) => [`${t}&&`, `${t}`, "Ill-formed: reference to reference"],
    },
    {
      key: "lref-rref",
      aliasDecl: (t) => `using L = ${t}&;`,
      expr: "L&&",
      result: (t) => `${t}&`,
      wrong: (t) => [`${t}&&`, `${t}`, "Ill-formed: reference to reference"],
    },
    {
      key: "rref-lref",
      aliasDecl: (t) => `using R = ${t}&&;`,
      expr: "R&",
      result: (t) => `${t}&`,
      wrong: (t) => [`${t}&&`, `${t}`, "Ill-formed: reference to reference"],
    },
    {
      key: "rref-rref",
      aliasDecl: (t) => `using R = ${t}&&;`,
      expr: "R&&",
      result: (t) => `${t}&&`,
      wrong: (t) => [`${t}&`, `${t}`, "Ill-formed: reference to reference"],
    },
  ];

  collapseTypes.forEach((t, ti) => {
    collapseForms.forEach((form, fi) => {
      const correct = form.result(t);
      const { options, correctIndex } = rotateOptions(
        correct,
        form.wrong(t),
        ti + fi
      );
      cards.push(
        makeProceduralTrap({
          id: `collapse-${form.key}-${ti}`,
          title: `Reference Collapsing: ${form.expr} (${t})`,
          question: `What type does \`Out\` collapse to under [dcl.ref]/6?`,
          code: `${form.aliasDecl(t)}\nusing Out = ${form.expr};`,
          options,
          correctIndex,
          explanation: `Reference collapsing rule: ONLY \`&&\` + \`&&\` collapses to \`&&\`; any \`&\` in the combination collapses to an lvalue reference \`&\`. Thus \`${form.expr}\` becomes \`${correct}\`.`,
          clause: "[dcl.ref]/6",
          trackId: "templates",
          trackTitle: "Templates",
          continentId: "building-abstractions",
          continentLabel: "Building abstractions",
          accentHex: "#ec4899",
          topicSlug: "forwarding-references-and-perfect-forwarding",
          standard: "C++11",
          difficulty: 2,
          tags: ["C++11", "Ref Collapsing", "[dcl.ref]", "Templates"],
          summary: `Apply C++11 reference collapsing rules to alias-formed ${form.expr}.`,
        })
      );
    });
  });

  // B. Forwarding reference template argument deduction T&&
  const fwdCases: {
    id: string;
    title: string;
    code: string;
    correct: string;
    distractors: [string, string, string];
    explanation: string;
    diff: ScrollCardDifficulty;
  }[] = [
    {
      id: "deduce-lval",
      title: "Forwarding Ref: f(T&&) Called with Lvalue",
      code: `template <class T> void f(T&& x);\nint a = 10;\nf(a);`,
      correct: "T = int&, param x has type int&",
      distractors: [
        "T = int, param x has type int&&",
        "T = int, param x has type int&",
        "Ill-formed: cannot bind lvalue to T&&",
      ],
      explanation:
        "For an lvalue `int` argument, [temp.deduct.call] deduces `T = int&`. Substituting into `T&&` collapses `int& &&` -> `int&`.",
      diff: 1,
    },
    {
      id: "deduce-const-lval",
      title: "Forwarding Ref: f(T&&) with const Lvalue",
      code: `template <class T> void f(T&& x);\nconst int ca = 10;\nf(ca);`,
      correct: "T = const int&, param x has type const int&",
      distractors: [
        "T = int&, param x has type int&",
        "T = const int, param x has type const int&&",
        "Ill-formed: drops const",
      ],
      explanation:
        "Const lvalue `ca` deduces `T = const int&`; reference collapsing turns `const int& &&` into `const int&`.",
      diff: 2,
    },
    {
      id: "deduce-prval",
      title: "Forwarding Ref: f(T&&) Called with Prvalue",
      code: `template <class T> void f(T&& x);\nf(42);`,
      correct: "T = int, param x has type int&&",
      distractors: [
        "T = int&&, param x has type int&&",
        "T = const int&, param x has type const int&",
        "T = int&, param x has type int&",
      ],
      explanation:
        "For an rvalue argument, `T` is deduced as the non-reference type `int` (NOT `int&&`!), so `T&&` becomes `int&&`.",
      diff: 1,
    },
    {
      id: "deduce-xval",
      title: "Forwarding Ref: f(T&&) Called with std::move(a)",
      code: `template <class T> void f(T&& x);\nstd::string a = "ok";\nf(std::move(a));`,
      correct: "T = std::string, param x has type std::string&&",
      distractors: [
        "T = std::string&&, param x has type std::string&&",
        "T = std::string&, param x has type std::string&",
        "T = const std::string&, param x has type const std::string&",
      ],
      explanation:
        "`std::move(a)` is an xvalue (an rvalue), so `T` deduces to non-reference `std::string` and `T&&` becomes `std::string&&`.",
      diff: 2,
    },
    {
      id: "deduce-const-move",
      title: "Forwarding Ref: f(T&&) with std::move(constObj)",
      code: `template <class T> void f(T&& x);\nconst std::string cs = "hi";\nf(std::move(cs));`,
      correct: "T = const std::string, param x is const std::string&&",
      distractors: [
        "T = std::string, param x is std::string&&",
        "T = const std::string&, param x is const std::string&",
        "Ill-formed: cannot std::move a const object",
      ],
      explanation:
        "`std::move(cs)` yields a `const std::string&&` xvalue, so `T` deduces as `const std::string`—preserving constness so a move constructor won't mutate `cs`!",
      diff: 3,
    },
    {
      id: "not-fwd-class-param",
      title: "Class Template Method push(T&&) Is NOT Forwarding!",
      code: `template <class T>\nstruct Box { void push(T&& x); };\nBox<int> b;\nint a = 1;\nb.push(a); // compiles?`,
      correct: "Ill-formed: T is already fixed to int, so push(int&&) rejects lvalues",
      distractors: [
        "Compiles: T&& deduces as int&",
        "Compiles: copies a into a temporary",
        "Compiles only in C++20",
      ],
      explanation:
        "`T&&` is a forwarding reference ONLY when `T` is deduced on THAT function call. In `Box<int>`, `T` is already known (`int`), so `push(int&&)` is a plain rvalue reference!",
      diff: 2,
    },
    {
      id: "not-fwd-const-t",
      title: "const T&& Is NOT a Forwarding Reference",
      code: `template <class T>\nvoid f(const T&& x);\nint a = 1;\nf(a); // compiles?`,
      correct: "Ill-formed: cv-qualified const T&& binds rvalues only",
      distractors: [
        "Compiles: T deduces as int&",
        "Compiles: T deduces as const int&",
        "Compiles: binds const lvalue reference",
      ],
      explanation:
        "A forwarding reference must be an UNQUALIFIED `T&&` ([temp.deduct.call]/3). Adding `const` turns `const T&&` into a strict rvalue reference.",
      diff: 2,
    },
    {
      id: "not-fwd-vector-t",
      title: "std::vector<T>&& Is NOT a Forwarding Reference",
      code: `template <class T>\nvoid f(std::vector<T>&& v);\nstd::vector<int> xs{1, 2};\nf(xs); // compiles?`,
      correct: "Ill-formed: std::vector<T>&& is an rvalue ref, not bare T&&",
      distractors: [
        "Compiles: deduces T = int&",
        "Compiles: collapses to std::vector<int>&",
        "Compiles: moves xs implicitly",
      ],
      explanation:
        "Only bare `T&&` (or `auto&&`) is a forwarding reference. `std::vector<T>&&` only binds rvalue vectors.",
      diff: 2,
    },
    {
      id: "auto-rref-lval",
      title: "auto&& Binds Both Lvalues and Rvalues",
      code: `int a = 5;\nauto&& r1 = a;\nauto&& r2 = 5;`,
      correct: "r1 is int&, r2 is int&&",
      distractors: [
        "r1 is int&&, r2 is int&&",
        "r1 is ill-formed, r2 is int&&",
        "r1 is const int&, r2 is const int&",
      ],
      explanation:
        "`auto&&` follows the exact same forwarding-reference deduction rules as `template <class T> void f(T&&)`—collapsing to `int&` for lvalue `a` and `int&&` for prvalue `5`.",
      diff: 1,
    },
    {
      id: "forward-missing-cast",
      title: "Why relay(T&& x) Must Use std::forward<T>(x)",
      code: `void sink(int&); void sink(int&&);\ntemplate <class T> void relay(T&& x) {\n  sink(x); // forgot std::forward!\n}\nrelay(42);`,
      correct: "Calls sink(int&) because named `x` is an lvalue!",
      distractors: [
        "Calls sink(int&&) because 42 is an rvalue",
        "Ambiguous between sink(int&) and sink(int&&)",
        "Ill-formed without std::forward",
      ],
      explanation:
        "Even when `T = int` and `x` has type `int&&`, the expression `x` has a name so it is an lvalue! `std::forward<T>(x)` casts `x` back to `T&&` (`int&&` for rvalues, `int&` for lvalues).",
      diff: 1,
    },
  ];

  fwdCases.forEach((fc, i) => {
    const { options, correctIndex } = rotateOptions(fc.correct, fc.distractors, i + 2);
    cards.push(
      makeProceduralTrap({
        id: `fwd-${fc.id}`,
        title: fc.title,
        question: "What does C++ template deduction / overload resolution produce?",
        code: fc.code,
        options,
        correctIndex,
        explanation: fc.explanation,
        clause: "[temp.deduct.call] & [dcl.ref]",
        trackId: "templates",
        trackTitle: "Templates",
        continentId: "building-abstractions",
        continentLabel: "Building abstractions",
        accentHex: "#ec4899",
        topicSlug: "forwarding-references-and-perfect-forwarding",
        standard: "C++11",
        difficulty: fc.diff,
        tags: ["C++11", "Forwarding Ref", "[temp.deduct.call]", "Templates"],
        summary: `Trace forwarding-reference deduction and reference collapsing under [temp.deduct.call].`,
      })
    );
  });

  // C. 6 crisp procedural code walkthroughs for perfect forwarding & decay
  const fwdWalks: ProceduralCodeSpec[] = [
    {
      id: "walk-std-forward",
      title: "How std::forward<T> Actually Works in 4 Lines",
      summary: "Under the hood, std::forward is just a conditional static_cast<T&&> powered by reference collapsing.",
      filename: "std_forward_impl.cpp",
      code: `template <class T>\nconstexpr T&& my_forward(std::remove_reference_t<T>& t) noexcept {\n  return static_cast<T&&>(t);\n}\n// Lvalue call: T = int&  -> static_cast<int& &&>(t) -> int&\n// Rvalue call: T = int   -> static_cast<int&&>(t)   -> int&&`,
      beats: [
        {
          title: "Non-Deduced Parameter",
          badge: "Constraint",
          highlightLines: [1, 2],
          annotation: "remove_reference_t<T>& blocks automatic T deduction, forcing callers to pass T explicitly.",
          caption: "std::remove_reference_t<T>& ensures the caller supplies the deduced template parameter T.",
        },
        {
          title: "Conditional Cast",
          badge: "Value Cat",
          highlightLines: [3],
          annotation: "static_cast<T&&>(t) compiles to zero instructions—pure compile-time category restoration.",
          caption: "static_cast<T&&>(t) restores the original value category at compile time.",
        },
        {
          title: "Reference Collapsing Payoff",
          badge: "Verified",
          highlightLines: [5, 6],
          annotation: "T=int& collapses T&& to int& (lvalue); T=int leaves T&& as int&& (xvalue).",
          caption: "Reference collapsing turns one cast into both lvalue and rvalue forwarding.",
        },
      ],
      trackId: "templates",
      trackTitle: "Templates",
      continentId: "building-abstractions",
      continentLabel: "Building abstractions",
      accentHex: "#a855f7",
      topicSlug: "forwarding-references-and-perfect-forwarding",
      standard: "C++11",
      difficulty: 2,
      tags: ["C++11", "std::forward", "Ref Collapsing", "Templates"],
    },
    {
      id: "walk-std-move",
      title: "Why std::move Never Moves Any Bytes",
      summary: "std::move unconditionally casts an expression to an xvalue; the receiving overload decides whether to steal resources.",
      filename: "std_move_impl.cpp",
      code: `template <class T>\nconstexpr std::remove_reference_t<T>&& my_move(T&& t) noexcept {\n  return static_cast<std::remove_reference_t<T>&&>(t);\n}\nconst std::string cs = "immutable";\nauto copy = std::string(my_move(cs)); // const std::string&& -> COPIES!`,
      beats: [
        {
          title: "Accept Anything via T&&",
          badge: "Setup",
          highlightLines: [1, 2],
          annotation: "Forwarding reference T&& accepts lvalues, rvalues, and const objects uniformly.",
          caption: "my_move accepts any value category using a forwarding reference T&&.",
        },
        {
          title: "Strip Ref & Cast to &&",
          badge: "Value Cat",
          highlightLines: [3],
          annotation: "remove_reference_t<T>&& yields an unnamed rvalue reference (xvalue)—zero runtime code.",
          caption: "Stripping the reference before adding && unconditionally produces an xvalue.",
        },
        {
          title: "The const Move Trap",
          badge: "Trap",
          highlightLines: [5, 6],
          annotation: "Moving a const string yields const std::string&&, silently falling back to the COPY constructor!",
          caption: "std::move preserves const, so moving a const object silently copies instead of moving.",
        },
      ],
      trackId: "value-semantics",
      trackTitle: "Value semantics",
      continentId: "language-basics",
      continentLabel: "Language basics",
      accentHex: "#0ea5e9",
      topicSlug: "copy-and-move",
      standard: "C++11",
      difficulty: 2,
      tags: ["C++11", "std::move", "Value semantics", "Trap"],
    },
    {
      id: "walk-nrvo-return",
      title: "Why return std::move(local) Hurts Performance",
      summary: "Writing return std::move(local) disables Named Return Value Optimization (NRVO), forcing a move where C++ could do zero moves.",
      filename: "nrvo_return.cpp",
      code: `std::string build_good() {\n  std::string out = "payload";\n  return out;            // NRVO eligible (0 moves) or implicit move!\n}\nstd::string build_worse() {\n  std::string out = "payload";\n  return std::move(out); // Type is string&&, NOT local name -> blocks NRVO!\n}`,
      beats: [
        {
          title: "NRVO-Eligible Return",
          badge: "Value Cat",
          highlightLines: [1, 2, 3],
          annotation: "Returning a local variable name lets the compiler construct `out` directly in the caller's slot.",
          caption: "Returning a bare local name enables zero-copy NRVO—and falls back to implicit move automatically.",
        },
        {
          title: "Blocking NRVO",
          badge: "Trap",
          highlightLines: [5, 6, 7],
          annotation: "std::move(out) is a function call, not an id-expression, disqualifying NRVO and forcing a move.",
          caption: "Wrapping a returned local in std::move prevents NRVO and forces an unnecessary move.",
        },
      ],
      trackId: "value-semantics",
      trackTitle: "Value semantics",
      continentId: "language-basics",
      continentLabel: "Language basics",
      accentHex: "#0ea5e9",
      topicSlug: "copy-elision",
      standard: "C++17",
      difficulty: 2,
      tags: ["C++17", "NRVO", "Copy Elision", "Value semantics"],
    },
    {
      id: "walk-span-vs-decay",
      title: "Fix Array Decay Bugs with C++20 std::span",
      summary: "Replace raw T a[N] parameters with std::span<const T> so the length never silently decays to pointer size.",
      filename: "span_no_decay.cpp",
      code: `// BUG: decays to const int* -> sizeof(a) == 8!\nstd::size_t bad_len(const int a[16]) { return sizeof(a); }\n\n// SAFE: preserves pointer + length across C arrays, std::array, std::vector\nstd::size_t good_len(std::span<const int> s) { return s.size(); }\n\nint buf[16]{};\nauto n = good_len(buf); // deduces extent 16 with zero overhead`,
      beats: [
        {
          title: "Silent Pointer Decay",
          badge: "Trap",
          highlightLines: [1, 2],
          annotation: "const int a[16] is identical to const int* a; the 16 is ignored by the compiler!",
          caption: "Array parameter syntax silently decays to a raw pointer and forgets the element count.",
        },
        {
          title: "Non-Owning View",
          badge: "C++20",
          highlightLines: [4, 5],
          annotation: "std::span carries both pointer and size in two registers with zero allocations.",
          caption: "std::span<const int> preserves bounds across C arrays, std::array, and std::vector.",
        },
        {
          title: "Zero-Friction Call Site",
          badge: "Verified",
          highlightLines: [7, 8],
          annotation: "C array buf[16] converts implicitly to std::span with s.size() == 16.",
          caption: "Passing buf to std::span retains the true extent of 16 elements.",
        },
      ],
      trackId: "containers",
      trackTitle: "Containers and strings",
      continentId: "library-and-cpp26",
      continentLabel: "Library and C++26",
      accentHex: "#14b8a6",
      topicSlug: "span-and-mdspan",
      standard: "C++20",
      difficulty: 1,
      tags: ["C++20", "std::span", "Array Decay", "Containers"],
    },
  ];

  for (const w of fwdWalks) {
    cards.push(makeProceduralCode(w));
  }

  return cards;
}

// ---------------------------------------------------------------------------
// 8. Additional C++ Standardese Micro-Drills (RAII, Atomics, Constexpr, Ranges)
// ---------------------------------------------------------------------------

function generateExtraMicroDrills(): ScrollCard[] {
  const specs: ProceduralTrapSpec[] = [
    {
      id: "raii-init-order",
      title: "Member Initializer List Evaluation Order",
      question: "In what order are `a` and `b` initialized when constructing `S{5}`?",
      code: `struct S {\n  int a;\n  int b;\n  S(int x) : b(x), a(b) {}\n};`,
      options: [
        "a first (reading uninitialized b -> UB/EB!), then b",
        "b first (5), then a (5)",
        "Unspecified order chosen by the optimizer",
        "Ill-formed: compiler rejects out-of-order initializers",
      ],
      correctIndex: 0,
      explanation:
        "Non-static data members are ALWAYS initialized in their class DECLARATION order (`a`, then `b`), completely ignoring the order written in the member initializer list!",
      clause: "[class.base.init]/13.3",
      trackId: "classes",
      trackTitle: "Classes",
      continentId: "building-abstractions",
      continentLabel: "Building abstractions",
      accentHex: "#ec4899",
      topicSlug: "constructors-and-initialization-order",
      difficulty: 2,
      tags: ["Classes", "Init Order", "[class.base.init]"],
      summary: "Check why initializer list order can silently read uninitialized members.",
    },
    {
      id: "raii-dtor-virtual",
      title: "Deleting Derived Through Base* Without Virtual ~Base()",
      question: "What happens when `delete p;` executes?",
      code: `struct Base { ~Base() = default; };\nstruct Derived : Base { std::string name{"cpp"}; };\nBase* p = new Derived();\ndelete p;`,
      options: [
        "Undefined behavior (static type lacks virtual destructor)",
        "Well-defined: runs ~Base() and leaks name only",
        "Well-defined: compiler devirtualizes ~Derived()",
        "Ill-formed: fails to compile",
      ],
      correctIndex: 0,
      explanation:
        "Deleting a derived object through a base pointer whose destructor is non-virtual is outright Undefined Behavior ([expr.delete]/3)—not merely a memory leak!",
      clause: "[expr.delete]/3",
      trackId: "classes",
      trackTitle: "Classes",
      continentId: "building-abstractions",
      continentLabel: "Building abstractions",
      accentHex: "#ec4899",
      topicSlug: "inheritance-and-virtual-functions",
      difficulty: 1,
      tags: ["Polymorphism", "UB", "[expr.delete]", "Classes"],
      summary: "Why a polymorphic base class needs a public virtual or protected non-virtual destructor.",
    },
    {
      id: "virtual-in-ctor",
      title: "Calling a Virtual Function Inside a Base Constructor",
      question: "Which `who()` executes when constructing `Derived d;`?",
      code: `struct Base {\n  Base() { who(); }\n  virtual void who() { /* Base */ }\n};\nstruct Derived : Base {\n  void who() override { /* Derived */ }\n};`,
      options: [
        "Base::who() — dynamic type is Base during Base's ctor",
        "Derived::who() — vtable already points to Derived",
        "Undefined behavior",
        "Pure virtual call abort",
      ],
      correctIndex: 0,
      explanation:
        "During `Base::Base()`, the `Derived` subobject does not exist yet; the object's dynamic type is `Base`, so virtual dispatch resolves to `Base::who()` ([class.cdtor]).",
      clause: "[class.cdtor]/4",
      trackId: "classes",
      trackTitle: "Classes",
      continentId: "building-abstractions",
      continentLabel: "Building abstractions",
      accentHex: "#ec4899",
      topicSlug: "inheritance-and-virtual-functions",
      difficulty: 2,
      tags: ["Virtual Dispatch", "Constructors", "[class.cdtor]", "Classes"],
      summary: "Understand how an object's dynamic type evolves during construction and destruction.",
    },
    {
      id: "default-arg-virtual",
      title: "Default Arguments on Virtual Functions",
      question: "What value is passed to `x` in `b->f()`?",
      code: `struct Base    { virtual int f(int x = 1) { return x; } };\nstruct Derived : Base { int f(int x = 2) override { return x; } };\nDerived d;\nBase* b = &d;\nint r = b->f();`,
      options: [
        "1 (default args are bound statically, function dynamically!)",
        "2 (both function and default arg dispatch dynamically)",
        "Ill-formed: overriding default arg is forbidden",
        "Undefined behavior",
      ],
      correctIndex: 0,
      explanation:
        "Virtual function dispatch is dynamic (`Derived::f` runs), but default arguments are substituted STATICALLY using the pointer's static type (`Base*` -> `x = 1`)!",
      clause: "[dcl.fct.default]/10",
      trackId: "classes",
      trackTitle: "Classes",
      continentId: "building-abstractions",
      continentLabel: "Building abstractions",
      accentHex: "#ec4899",
      topicSlug: "function-parameters-and-default-arguments",
      difficulty: 3,
      tags: ["Virtual", "Default Args", "[dcl.fct.default]", "Classes"],
      summary: "Why you should never redefine an inherited default argument on an override.",
    },
    {
      id: "noexcept-move-vector",
      title: "Why std::vector Checks noexcept on Move Constructors",
      question: "When `std::vector<T>` reallocates and `T(T&&)` is NOT `noexcept`, what happens?",
      code: `struct Item {\n  Item(const Item&);\n  Item(Item&&); // NOT noexcept!\n};\nstd::vector<Item> v; // reallocates on push_back`,
      options: [
        "Copies every element instead of moving (strong exception safety)",
        "Moves every element anyway",
        "Calls std::terminate if reallocation occurs",
        "Fails to compile",
      ],
      correctIndex: 0,
      explanation:
        "To preserve the strong exception guarantee, `std::vector` uses `std::move_if_noexcept`: if `T(T&&)` can throw and `T` is copyable, vector silently falls back to COPYING!",
      clause: "[vector.modifiers] & [utility.move]",
      trackId: "errors",
      trackTitle: "Exceptions and error handling",
      continentId: "building-abstractions",
      continentLabel: "Building abstractions",
      accentHex: "#ec4899",
      topicSlug: "noexcept",
      standard: "C++11",
      difficulty: 2,
      tags: ["C++11", "noexcept", "std::vector", "[utility.move]"],
      summary: "See how omitting noexcept on a move constructor silently degrades vector growth to copies.",
    },
    {
      id: "noexcept-throw-terminate",
      title: "Throwing Out of a noexcept Function",
      question: "What happens if a `noexcept` function allows an exception to escape?",
      code: `void work() noexcept {\n  throw std::runtime_error("boom");\n}`,
      options: [
        "Calls std::terminate() (stack unwinding is implementation-defined)",
        "Caught automatically by the nearest outer try/catch",
        "Undefined behavior",
        "Rejected at compile time",
      ],
      correctIndex: 0,
      explanation:
        "Escaping a `noexcept` boundary invokes `std::terminate()` immediately; whether the stack is unwound before terminating is implementation-defined ([except.spec]).",
      clause: "[except.spec]/5",
      trackId: "errors",
      trackTitle: "Exceptions and error handling",
      continentId: "building-abstractions",
      continentLabel: "Building abstractions",
      accentHex: "#ec4899",
      topicSlug: "noexcept",
      standard: "C++11",
      difficulty: 1,
      tags: ["C++11", "noexcept", "[except.spec]", "Exceptions"],
      summary: "Know the exact runtime consequence of letting an exception escape a noexcept function.",
    },
    {
      id: "map-subscript-insert",
      title: "std::map::operator[] Default-Inserts on Miss",
      question: "What is `m.size()` after checking `if (m[\"missing\"] == 0)`?",
      code: `std::map<std::string, int> m;\nif (m["missing"] == 0) { /* ... */ }\nauto sz = m.size();`,
      options: [
        "1 (operator[] inserted {\"missing\", 0}!)",
        "0 (lookup does not mutate the map)",
        "Throws std::out_of_range",
        "Undefined behavior",
      ],
      correctIndex: 0,
      explanation:
        "`map::operator[]` inserts a value-initialized entry when the key is absent (and cannot even be called on a `const map`). Use `.find()` or `.contains()` (C++20) for read-only lookups.",
      clause: "[map.access]",
      trackId: "containers",
      trackTitle: "Containers and strings",
      continentId: "library-and-cpp26",
      continentLabel: "Library and C++26",
      accentHex: "#f43f5e",
      topicSlug: "associative-and-unordered-containers",
      difficulty: 1,
      tags: ["std::map", "[map.access]", "Containers"],
      summary: "Avoid accidental key insertion when probing std::map or std::unordered_map.",
    },
    {
      id: "string-view-dangling",
      title: "Dangling std::string_view from Temporary std::string",
      question: "What happens when `sv` is read on line 2?",
      code: `std::string make_name();\nstd::string_view sv = make_name();\nchar first = sv[0];`,
      options: [
        "Undefined behavior: temporary std::string died at the semicolon",
        "Well-defined: string_view extends temporary lifetime",
        "Well-defined because of SSO",
        "Ill-formed: string_view cannot bind temporaries",
      ],
      correctIndex: 0,
      explanation:
        "`std::string_view` is a non-owning pointer+length struct, NOT a reference; it does NOT extend temporary lifetime. `sv` dangles immediately after `;`!",
      clause: "[string.view.template]",
      trackId: "containers",
      trackTitle: "Containers and strings",
      continentId: "library-and-cpp26",
      continentLabel: "Library and C++26",
      accentHex: "#f43f5e",
      topicSlug: "strings-and-string-view",
      standard: "C++17",
      difficulty: 1,
      tags: ["C++17", "string_view", "Lifetime", "Containers"],
      summary: "Why std::string_view never extends the lifetime of a temporary std::string.",
    },
    {
      id: "vector-bool-ref",
      title: "std::vector<bool> Proxy Reference Trap",
      question: "Does `bool& r = flags[0];` compile for `std::vector<bool>`?",
      code: `std::vector<bool> flags{true, false};\nbool& r = flags[0];`,
      options: [
        "Ill-formed: operator[] returns a temporary bit-proxy object, not bool&",
        "Compiles cleanly and aliases bit 0",
        "Compiles with undefined behavior",
        "Fixed in C++20 to return bool&",
      ],
      correctIndex: 0,
      explanation:
        "`std::vector<bool>` bit-packs elements, so `flags[0]` returns a prvalue `std::vector<bool>::reference` proxy that cannot bind to a non-const `bool&`.",
      clause: "[vector.bool]",
      trackId: "containers",
      trackTitle: "Containers and strings",
      continentId: "library-and-cpp26",
      continentLabel: "Library and C++26",
      accentHex: "#f43f5e",
      topicSlug: "array-bitset-and-vector-bool",
      difficulty: 2,
      tags: ["vector<bool>", "Proxy Ref", "[vector.bool]", "Containers"],
      summary: "Why std::vector<bool> breaks generic code expecting T& from operator[].",
    },
    {
      id: "ranges-dangling-find",
      title: "C++20 std::ranges::dangling Safety Net",
      question: "What type does `it` have when searching a temporary vector with `std::ranges::find`?",
      code: `std::vector<int> get_nums();\nauto it = std::ranges::find(get_nums(), 42);`,
      options: [
        "std::ranges::dangling (dereferencing *it fails at compile time!)",
        "std::vector<int>::iterator (dangles silently at runtime)",
        "std::optional<int>",
        "Ill-formed: ranges::find rejects rvalue ranges",
      ],
      correctIndex: 0,
      explanation:
        "`std::vector` is NOT a `borrowed_range`, so `std::ranges::find` returns `std::ranges::dangling`—turning a silent use-after-free into a compile-time error if you try `*it`!",
      clause: "[ranges.dangling]",
      trackId: "algorithms-and-ranges",
      trackTitle: "Iterators, algorithms and ranges",
      continentId: "library-and-cpp26",
      continentLabel: "Library and C++26",
      accentHex: "#f43f5e",
      topicSlug: "borrowed-ranges-and-dangling",
      standard: "C++20",
      difficulty: 2,
      tags: ["C++20", "Ranges", "Borrowed Range", "[ranges.dangling]"],
      summary: "How C++20 borrowed_range turns dangling iterator bugs into compile-time errors.",
    },
    {
      id: "atomic-relaxed-no-sync",
      title: "memory_order_relaxed Does Not Synchronize Other Writes",
      question: "If Producer writes `data = 42; flag.store(1, relaxed);` and Consumer sees `flag.load(relaxed) == 1`, what can Consumer read for `data`?",
      code: `// T1: data = 42; flag.store(1, memory_order_relaxed);\n// T2: if (flag.load(memory_order_relaxed) == 1) use(data);`,
      options: [
        "Data race (Undefined Behavior): relaxed creates no happens-before edge",
        "Guaranteed 42 because store is sequenced after data = 42",
        "Either 0 or 42, well-defined",
        "Guaranteed 42 on x86 and ARM alike",
      ],
      correctIndex: 0,
      explanation:
        "`memory_order_relaxed` guarantees atomicity of `flag` alone—it creates NO synchronizes-with edge! Reading non-atomic `data` in T2 is a data race (UB); use release/acquire.",
      clause: "[atomics.order]",
      trackId: "memory-model",
      trackTitle: "Memory model",
      continentId: "the-machine",
      continentLabel: "The machine",
      accentHex: "#ff4d5a",
      topicSlug: "atomics-and-memory-ordering",
      standard: "C++11",
      difficulty: 2,
      tags: ["C++11", "Atomics", "Data Race", "[atomics.order]"],
      summary: "Why relaxed atomics cannot safely publish non-atomic payload writes across threads.",
    },
    {
      id: "lock-guard-unnamed-temp",
      title: "The Unnamed std::lock_guard Temporary Bug",
      question: "How long is `mtx` locked on line 1?",
      code: `std::lock_guard<std::mutex>(mtx); // missing variable name!\nshared_counter++;`,
      options: [
        "Only until the semicolon! shared_counter++ runs UNLOCKED",
        "Until the end of the enclosing block",
        "Fails to compile without a variable name",
        "Locks forever (deadlock)",
      ],
      correctIndex: 0,
      explanation:
        "Without a variable name, `std::lock_guard<std::mutex>(mtx)` constructs a temporary (or declares a variable `mtx` if parens are parsed as declaration!)—if temporary, it unlocks immediately at `;`! C++17 `[[nodiscard]]` / CTAD `std::scoped_lock lock{mtx};` prevents this.",
      clause: "[class.temporary]",
      trackId: "concurrency",
      trackTitle: "Concurrency",
      continentId: "the-machine",
      continentLabel: "The machine",
      accentHex: "#ff4d5a",
      topicSlug: "mutexes-and-locks",
      standard: "C++11",
      difficulty: 1,
      tags: ["C++11", "Mutex", "RAII", "Concurrency"],
      summary: "Spot the infamous unnamed RAII lock temporary that unlocks before the critical section.",
    },
    {
      id: "unique-ptr-array-form",
      title: "unique_ptr<int>(new int[10]) vs unique_ptr<int[]>",
      question: "What happens when `p` goes out of scope?",
      code: `std::unique_ptr<int> p(new int[10]);`,
      options: [
        "Undefined behavior: default_delete<int> calls delete instead of delete[]",
        "Well-defined: unique_ptr detects array allocations",
        "Ill-formed: fails to compile",
        "Leaks elements 1..9 cleanly without UB",
      ],
      correctIndex: 0,
      explanation:
        "`std::unique_ptr<int>` uses `delete` (scalar), mismatching `new int[10]` (UB!). Always use `std::unique_ptr<int[]>` + `std::make_unique<int[]>(10)`—or `std::vector<int>`.",
      clause: "[unique.ptr.runtime]",
      trackId: "memory-model",
      trackTitle: "Memory model",
      continentId: "the-machine",
      continentLabel: "The machine",
      accentHex: "#ff4d5a",
      topicSlug: "smart-pointers",
      standard: "C++11",
      difficulty: 1,
      tags: ["C++11", "unique_ptr", "UB", "Memory model"],
      summary: "Why scalar unique_ptr<T> must never own a new T[] array.",
    },
    {
      id: "constexpr-not-guaranteed-ct",
      title: "constexpr Function Called at Runtime",
      question: "When is `sq(n)` guaranteed to evaluate at compile time?",
      code: `constexpr int sq(int x) { return x * x; }\nint a = sq(5);           // Line 1\nconstexpr int b = sq(5); // Line 2`,
      options: [
        "Only Line 2 is guaranteed; Line 1 MAY run at runtime",
        "Both Line 1 and Line 2 are guaranteed compile-time",
        "Neither unless marked consteval",
        "Line 1 fails to compile without constexpr",
      ],
      correctIndex: 0,
      explanation:
        "`constexpr` on a function means CAN run at compile time, not MUST. Only a constant-expression context (`constexpr` var, template arg, `static_assert`, or C++20 `consteval`) guarantees compile-time evaluation.",
      clause: "[dcl.constexpr]",
      trackId: "expressions-and-functions",
      trackTitle: "Expressions and functions",
      continentId: "language-basics",
      continentLabel: "Language basics",
      accentHex: "#f43f5e",
      topicSlug: "constant-expressions",
      standard: "C++11",
      difficulty: 1,
      tags: ["C++11", "constexpr", "[dcl.constexpr]", "Compile-Time"],
      summary: "Distinguish constexpr (may evaluate at compile time) from consteval (must).",
    },
    {
      id: "lambda-mutable-value",
      title: "Why Lambda Captures by Value Are const by Default",
      question: "Does `[x]() { ++x; }` compile?",
      code: `int x = 0;\nauto inc = [x]() { ++x; };`,
      options: [
        "Ill-formed unless `mutable` is added (operator() is const by default)",
        "Compiles and increments outer x",
        "Compiles and increments the closure's copy of x",
        "Compiles only in C++20+",
      ],
      correctIndex: 0,
      explanation:
        "A lambda's generated `operator()` is `const`-qualified by default ([expr.prim.lambda.closure]). Add `mutable` (`[x]() mutable { ++x; }`) to modify value-captured members.",
      clause: "[expr.prim.lambda.closure]",
      trackId: "expressions-and-functions",
      trackTitle: "Expressions and functions",
      continentId: "language-basics",
      continentLabel: "Language basics",
      accentHex: "#f43f5e",
      topicSlug: "lambdas",
      standard: "C++11",
      difficulty: 1,
      tags: ["C++11", "Lambdas", "mutable", "[expr.prim.lambda.closure]"],
      summary: "Understand why value captures require mutable to modify inside a lambda.",
    },
    {
      id: "most-vexing-parse",
      title: "The Most Vexing Parse: Widget w()",
      question: "What does `Widget w();` declare in C++?",
      code: `struct Widget { Widget() = default; };\nWidget w();`,
      options: [
        "A function `w` taking no args and returning `Widget`!",
        "A default-constructed `Widget` object",
        "A syntax error in C++17+",
        "A zero-initialized `Widget`",
      ],
      correctIndex: 0,
      explanation:
        "Anything that can be parsed as a function declaration IS parsed as one ([dcl.ambig.res]). Write `Widget w;` or `Widget w{};` to construct an object.",
      clause: "[dcl.ambig.res]",
      trackId: "types-and-initialization",
      trackTitle: "Types and initialization",
      continentId: "language-basics",
      continentLabel: "Language basics",
      accentHex: "#f43f5e",
      topicSlug: "initialization-forms",
      difficulty: 1,
      tags: ["Initialization", "MVP", "[dcl.ambig.res]"],
      summary: "Recognize C++'s classic declaration-vs-object ambiguity.",
    },
    {
      id: "dependent-typename",
      title: "Dependent Name `typename T::value_type`",
      question: "Why is `typename` required before `T::value_type` inside a template?",
      code: `template <class T>\nvoid f() {\n  typename T::value_type x{};\n}`,
      options: [
        "During phase-1 parsing, dependent names default to non-types (values)",
        "It forces T to be a class instead of a struct",
        "It disables ADL on value_type",
        "It is optional in all contexts since C++11",
      ],
      correctIndex: 0,
      explanation:
        "Without knowing `T`, the parser assumes `T::value_type` names a static value (so `T::value_type * x` parses as multiplication!). `typename` tells phase-1 parsing it names a type ([temp.res]).",
      clause: "[temp.res.general]",
      trackId: "templates",
      trackTitle: "Templates",
      continentId: "building-abstractions",
      continentLabel: "Building abstractions",
      accentHex: "#ec4899",
      topicSlug: "dependent-names-and-two-phase-lookup",
      difficulty: 2,
      tags: ["Templates", "Two-Phase Lookup", "[temp.res.general]"],
      summary: "Why phase-1 template parsing treats dependent qualified names as values unless marked typename.",
    },
    {
      id: "fold-empty-pack",
      title: "C++17 Unary Fold Over an Empty Parameter Pack",
      question: "What does `(... && args)` evaluate to when `args` is empty?",
      code: `template <class... B>\nconstexpr bool all_true(B... args) {\n  return (... && args);\n}\nstatic_assert(all_true() == /* ? */);`,
      options: [
        "true (identity element for &&)",
        "false",
        "Ill-formed: empty unary fold is always an error",
        "0 (type int)",
      ],
      correctIndex: 0,
      explanation:
        "Only three operators support empty unary folds ([temp.variadic]): `&&` yields `true`, `||` yields `false`, and `,` yields `void()`. All other operators (like `+`) are ill-formed on empty packs!",
      clause: "[temp.variadic] & [expr.prim.fold]",
      trackId: "templates",
      trackTitle: "Templates",
      continentId: "building-abstractions",
      continentLabel: "Building abstractions",
      accentHex: "#ec4899",
      topicSlug: "variadic-templates-and-fold-expressions",
      standard: "C++17",
      difficulty: 2,
      tags: ["C++17", "Fold Expressions", "[expr.prim.fold]", "Templates"],
      summary: "Remember the exact 3 operators with defined empty-pack unary fold values.",
    },
    {
      id: "odr-inline-var",
      title: "C++17 Header Constants: inline constexpr vs constexpr",
      question: "Why prefer `inline constexpr int kMax = 64;` in a header over `constexpr int kMax = 64;`?",
      code: `// header.hpp\ninline constexpr int kMax = 64;`,
      options: [
        "External linkage with a single shared address across all TUs",
        "Allows mutating kMax at runtime",
        "Non-inline constexpr in headers violates the ODR",
        "Required to use kMax in static_assert",
      ],
      correctIndex: 0,
      explanation:
        "Namespace-scope `constexpr` variables default to internal linkage (a distinct address in each TU). Adding `inline` (C++17) gives external linkage with one unified address across the entire program ([dcl.inline]).",
      clause: "[dcl.inline] & [basic.link]",
      trackId: "program-structure",
      trackTitle: "Program structure",
      continentId: "language-basics",
      continentLabel: "Language basics",
      accentHex: "#f43f5e",
      topicSlug: "one-definition-rule",
      standard: "C++17",
      difficulty: 2,
      tags: ["C++17", "ODR", "inline", "[dcl.inline]"],
      summary: "Understand how inline constexpr unifies variable identity across translation units.",
    },
    {
      id: "cpp26-pack-indexing",
      title: "C++26 Pack Indexing (`args...[0]`)",
      question: "What does `args...[1]` return in C++26 (P2662R3)?",
      code: `template <class... Ts>\nconstexpr auto second(Ts... args) {\n  return args...[1];\n}\nstatic_assert(second(10, 20, 30) == /* ? */);`,
      options: [
        "20 (0-based direct pack indexing, zero tuple overhead!)",
        "10 (1-based indexing)",
        "std::tuple{20}",
        "Ill-formed: packs can only be indexed via std::get",
      ],
      correctIndex: 0,
      explanation:
        "C++26 pack indexing (`Ts...[I]` for types, `args...[I]` for expressions) accesses the 0-based I-th element directly in the compiler without instantiating `std::tuple`!",
      clause: "[temp.variadic] (P2662R3)",
      trackId: "cpp26",
      trackTitle: "C++26",
      continentId: "library-and-cpp26",
      continentLabel: "Library and C++26",
      accentHex: "#f43f5e",
      topicSlug: "pack-indexing-and-cpp26-templates",
      standard: "C++26",
      difficulty: 2,
      tags: ["C++26", "Pack Indexing", "P2662R3", "Templates"],
      summary: "Direct 0-based parameter pack indexing in C++26 without std::tuple metaprogramming.",
    },
  ];

  // Rotate options deterministically so correct answers aren't always index 0
  return specs.map((spec, idx) => {
    const correct = spec.options[spec.correctIndex];
    const distractors = spec.options.filter((_, i) => i !== spec.correctIndex) as [
      string,
      string,
      string,
    ];
    const { options, correctIndex } = rotateOptions(correct, distractors, idx + 1);
    return makeProceduralTrap({
      ...spec,
      options,
      correctIndex,
    });
  });
}

// ---------------------------------------------------------------------------
// Memoized Public Export
// ---------------------------------------------------------------------------

let cachedProcedural: ScrollCard[] | null = null;

export function getProceduralScrollCards(): ScrollCard[] {
  if (cachedProcedural) return cachedProcedural;
  cachedProcedural = [
    ...generateLayoutCards(),
    ...generateValueCategoryCards(),
    ...generateArrayDecayCards(),
    ...generateConstPointerCards(),
    ...generateIntegerPromotionCards(),
    ...generateOverloadRankingCards(),
    ...generateForwardingCards(),
    ...generateExtraMicroDrills(),
  ];
  return cachedProcedural;
}
