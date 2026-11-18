"use client";

import { useState } from "react";
import { CppCodeBlock } from "@/components/CppCodeBlock";
import { Button } from "@/components/ui/button";
import { Window } from "@/components/Window";
import { cn } from "@/lib/utils";
import { standardRefToUrl } from "@/types/topics";

type VtableModeId = "single" | "multiple" | "diamond" | "deducing-this";

interface ObjectField {
  offset: string;
  size: string;
  name: string;
  owner: string;
  kind: "vptr" | "data" | "vbase-vptr" | "vbase-data";
  detail: string;
}

interface VtableSlotRow {
  index: string;
  entry: string;
  target: string;
  isThunk?: boolean;
}

interface VtableSection {
  title: string;
  pointedBy: string;
  rows: VtableSlotRow[];
}

interface VtableModeSpec {
  id: VtableModeId;
  label: string;
  clause: string;
  sizeofDerived: string;
  vptrOverhead: string;
  dispatchKind: string;
  dispatchTone: "indirect" | "thunk" | "static";
  summary: string;
  code: string;
  fields: ObjectField[];
  vtables: VtableSection[];
  dispatchCall: string;
  dispatchSteps: string[];
  tradeoffNote: string;
}

const MODES: VtableModeSpec[] = [
  {
    id: "single",
    label: "Single polymorphic inheritance",
    clause: "[class.virtual]",
    sizeofDerived: "sizeof(Derived) == 24 bytes (0x18)",
    vptrOverhead: "1 vptr (8 bytes, 33% of object)",
    dispatchKind: "Indirect call via primary vptr (no this adjustment)",
    dispatchTone: "indirect",
    summary:
      "Derived shares Base's primary vptr at offset 0x00 and appends Derived::weight after Base::tag. Base* and Derived* hold the exact same numerical address.",
    code: `struct Base {
  int64_t tag{1};
  virtual void draw() const;
  virtual ~Base() = default;
};
struct Derived : Base {
  int64_t weight{42};
  void draw() const override;
};
// sizeof(Derived) == 24 on LP64 (vptr + tag + weight)`,
    fields: [
      {
        offset: "0x00",
        size: "8B",
        name: "vptr_Base",
        owner: "Base / Derived",
        kind: "vptr",
        detail: "Points to _ZTV7Derived + 16 (slot [0])",
      },
      {
        offset: "0x08",
        size: "8B",
        name: "Base::tag",
        owner: "Base subobject",
        kind: "data",
        detail: "int64_t (inherited non-static data member)",
      },
      {
        offset: "0x10",
        size: "8B",
        name: "Derived::weight",
        owner: "Derived",
        kind: "data",
        detail: "int64_t appended directly after Base",
      },
    ],
    vtables: [
      {
        title: "Primary vtable (_ZTV7Derived)",
        pointedBy: "vptr_Base (0x00)",
        rows: [
          { index: "[-2]", entry: "offset_to_top", target: "0" },
          { index: "[-1]", entry: "typeinfo*", target: "&typeinfo(Derived)" },
          { index: "[0]", entry: "Base::draw()", target: "Derived::draw() const" },
          { index: "[1]", entry: "Base::~Base()", target: "Derived::~Derived()" },
        ],
      },
    ],
    dispatchCall: "Base* p = &d; p->draw();",
    dispatchSteps: [
      "1. Base* p == &d (0x7ffee4b2a900, zero pointer adjustment)",
      "2. Load vptr = *(uint64_t*)(p + 0x00)",
      "3. Load fn   = *(vptr + 0x00) -> Derived::draw",
      "4. Indirect call fn(rdi = p)",
    ],
    tradeoffNote:
      "Two dependent memory loads (object -> vptr -> slot) plus an indirect branch predictor slot. Zero thunk adjustment needed because Base is at offset +0x00.",
  },
  {
    id: "multiple",
    label: "Multiple inheritance (secondary vptr + this-thunk)",
    clause: "[class.mi]",
    sizeofDerived: "sizeof(Derived) == 40 bytes (0x28)",
    vptrOverhead: "2 vptrs (16 bytes, 40% of object)",
    dispatchKind: "Secondary vtable + non-virtual this-adjuster thunk (-16B)",
    dispatchTone: "thunk",
    summary:
      "Derived embeds Drawable at 0x00 and Serializable at 0x10. Converting Derived* to Serializable* adds +0x10, so calling save() through Serializable* requires a thunk to subtract 16 before entering Derived::save().",
    code: `struct Drawable     { int64_t z{1}; virtual void draw(); };
struct Serializable { int64_t ver{2}; virtual void save(); };
struct Derived : Drawable, Serializable {
  int64_t id{99};
  void draw() override;
  void save() override;
};
// Serializable* s = &d; // s == (char*)&d + 0x10`,
    fields: [
      {
        offset: "0x00",
        size: "8B",
        name: "vptr_Drawable",
        owner: "Drawable (primary)",
        kind: "vptr",
        detail: "Points to _ZTV7Derived + 16",
      },
      {
        offset: "0x08",
        size: "8B",
        name: "Drawable::z",
        owner: "Drawable",
        kind: "data",
        detail: "int64_t",
      },
      {
        offset: "0x10",
        size: "8B",
        name: "vptr_Serializable",
        owner: "Serializable (secondary)",
        kind: "vptr",
        detail: "Points to _ZTV7Derived + 56 (secondary vtable)",
      },
      {
        offset: "0x18",
        size: "8B",
        name: "Serializable::ver",
        owner: "Serializable",
        kind: "data",
        detail: "int64_t",
      },
      {
        offset: "0x20",
        size: "8B",
        name: "Derived::id",
        owner: "Derived",
        kind: "data",
        detail: "int64_t accessed by Derived::save()",
      },
    ],
    vtables: [
      {
        title: "Primary vtable section (Drawable)",
        pointedBy: "vptr_Drawable (0x00)",
        rows: [
          { index: "[-2]", entry: "offset_to_top", target: "0" },
          { index: "[-1]", entry: "typeinfo*", target: "&typeinfo(Derived)" },
          { index: "[0]", entry: "Drawable::draw()", target: "Derived::draw()" },
          { index: "[1]", entry: "Serializable::save()", target: "Derived::save() (direct)" },
        ],
      },
      {
        title: "Secondary vtable section (Serializable)",
        pointedBy: "vptr_Serializable (0x10)",
        rows: [
          { index: "[-2]", entry: "offset_to_top", target: "-16 (-0x10)" },
          { index: "[-1]", entry: "typeinfo*", target: "&typeinfo(Derived)" },
          {
            index: "[0]",
            entry: "Serializable::save()",
            target: "thunk: sub rdi, 16; jmp Derived::save",
            isThunk: true,
          },
        ],
      },
    ],
    dispatchCall: "Serializable* s = &d; s->save();",
    dispatchSteps: [
      "1. Pointer conversion shifts s = (char*)&d + 0x10",
      "2. Load vptr_Serializable = *(uint64_t*)(s + 0x00)",
      "3. Call vtable[0] -> non-virtual thunk _ZThn16_N7Derived4saveEv",
      "4. Thunk executes: sub rdi, 16 (restores Derived* this); jmp Derived::save",
    ],
    tradeoffNote:
      "dynamic_cast<void*>(s) uses offset_to_top (-16) at vptr[-2] to recover the most-derived object address at runtime in constant time.",
  },
  {
    id: "diamond",
    label: "Virtual diamond inheritance (vbase offset)",
    clause: "[class.mi]",
    sizeofDerived: "sizeof(Derived) == 56 bytes (0x38)",
    vptrOverhead: "3 vptrs (24 bytes, 43% of object)",
    dispatchKind: "Runtime vbase_offset lookup + vcall_offset thunk",
    dispatchTone: "thunk",
    summary:
      "Virtual inheritance shares one Node instance at the tail (0x28). Because Node's offset relative to Right changes inside Derived, even reading Right::r->id loads vbase_offset from Right's vtable first!",
    code: `struct Node { int64_t id{7}; virtual void eval(); };
struct Left  : virtual Node { int64_t lval{10}; void eval() override; };
struct Right : virtual Node { int64_t rval{20}; };
struct Derived : Left, Right {
  int64_t dval{30};
  void eval() override;
};`,
    fields: [
      {
        offset: "0x00",
        size: "8B",
        name: "vptr_Left",
        owner: "Left (primary)",
        kind: "vptr",
        detail: "Holds vbase_offset = +0x28 (+40) at vptr[-3]",
      },
      {
        offset: "0x08",
        size: "8B",
        name: "Left::lval",
        owner: "Left",
        kind: "data",
        detail: "int64_t",
      },
      {
        offset: "0x10",
        size: "8B",
        name: "vptr_Right",
        owner: "Right (secondary)",
        kind: "vptr",
        detail: "Holds vbase_offset = +0x18 (+24) at vptr[-3]",
      },
      {
        offset: "0x18",
        size: "8B",
        name: "Right::rval",
        owner: "Right",
        kind: "data",
        detail: "int64_t",
      },
      {
        offset: "0x20",
        size: "8B",
        name: "Derived::dval",
        owner: "Derived",
        kind: "data",
        detail: "int64_t",
      },
      {
        offset: "0x28",
        size: "8B",
        name: "vptr_Node (shared)",
        owner: "virtual Node",
        kind: "vbase-vptr",
        detail: "Single shared virtual base placed at tail; vcall_offset thunk",
      },
      {
        offset: "0x30",
        size: "8B",
        name: "Node::id (shared)",
        owner: "virtual Node",
        kind: "vbase-data",
        detail: "Reached via *(vptr_base - 24) + base_ptr",
      },
    ],
    vtables: [
      {
        title: "Primary & Secondary sections (Left / Right)",
        pointedBy: "vptr_Left (0x00) / vptr_Right (0x10)",
        rows: [
          { index: "[-3]", entry: "vbase_offset (Left)", target: "+40 (+0x28 to Node)" },
          { index: "[-3]", entry: "vbase_offset (Right)", target: "+24 (+0x18 to Node)" },
          { index: "[-2]", entry: "offset_to_top (Right)", target: "-16 (-0x10)" },
          { index: "[0]", entry: "Node::eval()", target: "Derived::eval()" },
        ],
      },
      {
        title: "Virtual base section (shared Node at 0x28)",
        pointedBy: "vptr_Node (0x28)",
        rows: [
          { index: "[-3]", entry: "vcall_offset", target: "-40 (-0x28 to Derived)" },
          { index: "[-2]", entry: "offset_to_top", target: "-40 (-0x28)" },
          { index: "[-1]", entry: "typeinfo*", target: "&typeinfo(Derived)" },
          {
            index: "[0]",
            entry: "Node::eval()",
            target: "virtual thunk: this -= 40; jmp Derived::eval",
            isThunk: true,
          },
        ],
      },
    ],
    dispatchCall: "Right* r = &d; long x = r->id; Node* n = &d; n->eval();",
    dispatchSteps: [
      "1. Even non-virtual r->id loads vbase_offset = *(vptr_Right - 24) -> +24",
      "2. Computes Node* = (char*)r + 24 (lands at 0x28), then reads *(Node* + 8)",
      "3. n->eval() loads slot [0] of vptr_Node -> virtual thunk (-40 bytes)",
      "4. Thunk shifts rdi to Derived* (0x00) and jumps to Derived::eval()",
    ],
    tradeoffNote:
      "Virtual inheritance solves the diamond ambiguity at the cost of a VTT (construction vtable table) during construction/destruction and vbase_offset loads even for non-virtual member access.",
  },
  {
    id: "deducing-this",
    label: "C++23 deducing this / CRTP (0 vptr bytes, static dispatch)",
    clause: "[dcl.fct]",
    sizeofDerived: "sizeof(Derived) == 16 bytes (0x10)",
    vptrOverhead: "0 vptrs (0 bytes overhead, EBO empty base)",
    dispatchKind: "Direct compile-time static dispatch (inlinable)",
    dispatchTone: "static",
    summary:
      "Explicit object parameters (this auto&& self) in C++23 replace virtual dispatch and CRTP boilerplate when polymorphism is known at compile time. Base contributes 0 bytes via EBO and 0 vtable slots.",
    code: `struct Base {
  void draw(this auto&& self) {
    self.impl(); // static call deduced from Derived&
  }
};
struct Derived : Base {
  int64_t tag{1};
  int64_t weight{42};
  void impl();
}; // sizeof(Derived) == 16, zero vptr!`,
    fields: [
      {
        offset: "0x00",
        size: "0B (EBO)",
        name: "Base subobject",
        owner: "Base (empty)",
        kind: "vbase-data",
        detail: "Empty base optimization: occupies 0 bytes in Derived",
      },
      {
        offset: "0x00",
        size: "8B",
        name: "Derived::tag",
        owner: "Derived",
        kind: "data",
        detail: "int64_t starts immediately at offset 0x00",
      },
      {
        offset: "0x08",
        size: "8B",
        name: "Derived::weight",
        owner: "Derived",
        kind: "data",
        detail: "int64_t packed tightly at 0x08 (total 16 bytes)",
      },
    ],
    vtables: [
      {
        title: "Vtable & RTTI tables",
        pointedBy: "None emitted for static dispatch",
        rows: [
          { index: "-", entry: "vptr slot", target: "0 bytes (does not exist)" },
          { index: "-", entry: "vtable section", target: "0 entries emitted" },
          { index: "-", entry: "this thunk", target: "None needed (self is already Derived&)" },
        ],
      },
    ],
    dispatchCall: "Derived d; d.draw();",
    dispatchSteps: [
      "1. Overload resolution deduces self as Derived& at compile time",
      "2. Base::draw<Derived&>(d) instantiates with exact Derived type",
      "3. self.impl() emits a direct call (call Derived::impl) with 0 pointer loads",
      "4. Optimizer freely inlines Derived::impl() into the caller",
    ],
    tradeoffNote:
      "Saves 8 bytes per object and eliminates indirect-branch stalls, while giving up open-set runtime heterogeneous collections unless paired with std::variant or external type erasure.",
  },
];

export function VtableLayoutMap() {
  const [modeId, setModeId] = useState<VtableModeId>("multiple");
  const active = MODES.find((m) => m.id === modeId) ?? MODES[0];

  return (
    <Window
      as="section"
      aria-label="Object layout and vtable dispatch simulator"
      title="object-vtable.sim"
      actions={
        <a
          href={standardRefToUrl(active.clause)}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-xs text-ink-soft underline decoration-line-strong underline-offset-4 hover:text-ink hover:decoration-ink"
        >
          {active.clause}
        </a>
      }
      bodyClassName="p-5 sm:p-7"
    >
      <div className="mb-5">
        <h3 className="font-display text-2xl font-[450] tracking-[-0.02em] text-ink">
          64-bit Object Layout &amp; Vtable Dispatch
        </h3>
        <p className="mt-1 text-sm text-ink-soft">
          Compare byte offsets, <code className="font-mono text-xs text-ink">sizeof(Derived)</code>,
          vtable metadata slots, and pointer adjustment thunks across four C++
          polymorphism strategies.
        </p>
      </div>

      <div className="mb-5 flex flex-wrap gap-1.5">
        {MODES.map((m) => {
          const isSelected = m.id === active.id;
          return (
            <Button
              key={m.id}
              type="button"
              size="xs"
              variant={isSelected ? "default" : "outline"}
              aria-pressed={isSelected}
              onClick={() => setModeId(m.id)}
              className={cn(
                "text-xs cursor-pointer",
                isSelected && "bg-sun text-ink border-ink/30 hover:bg-sun/90"
              )}
            >
              {m.label}
            </Button>
          );
        })}
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-line bg-paper px-4 py-3">
          <div className="text-[11px] text-ink-faint">Object footprint</div>
          <div className="mt-1 font-mono text-xs font-semibold text-ink">
            {active.sizeofDerived}
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-paper px-4 py-3">
          <div className="text-[11px] text-ink-faint">vptr overhead</div>
          <div
            className={cn(
              "mt-1 font-mono text-xs font-semibold",
              active.dispatchTone === "static"
                ? "text-[color:var(--right)]"
                : "text-ink"
            )}
          >
            {active.vptrOverhead}
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-paper px-4 py-3">
          <div className="text-[11px] text-ink-faint">Call dispatch</div>
          <div
            className={cn(
              "mt-1 font-mono text-xs font-semibold",
              active.dispatchTone === "static"
                ? "text-[color:var(--right)]"
                : active.dispatchTone === "thunk"
                  ? "text-ink"
                  : "text-ink-body"
            )}
          >
            {active.dispatchKind}
          </div>
        </div>
      </div>

      <div className="mb-6 space-y-2.5">
        <CppCodeBlock caption={`${active.id}_layout.cpp`} code={active.code} />
        <p
          aria-live="polite"
          className="rounded-2xl border border-line bg-paper px-4 py-3 text-xs leading-relaxed text-ink-body"
        >
          {active.summary}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="min-w-0 rounded-[var(--radius-panel)] border border-line bg-paper p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-ink">
              64-bit Derived Instance Memory Map
            </span>
            <span className="font-mono text-[11px] text-ink-faint">
              alignof(Derived) == 8
            </span>
          </div>

          <div className="space-y-2">
            {active.fields.map((field) => (
              <div
                key={field.offset + field.name}
                className={cn(
                  "rounded-xl border p-3 transition-colors",
                  field.kind === "vptr" && "border-ink/25 bg-sun-wash/75",
                  field.kind === "vbase-vptr" &&
                    "border-wrong/30 bg-wrong-wash/55",
                  field.kind === "vbase-data" &&
                    "border-[color:var(--right)]/35 bg-right-wash/60",
                  field.kind === "data" && "border-line bg-paper-raised"
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded-[var(--radius-chip)] bg-paper-raised border border-line px-2 py-0.5 font-mono text-[11px] font-semibold text-ink">
                      {field.offset}
                    </span>
                    <span className="font-mono text-xs font-semibold text-ink">
                      {field.name}
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-ink-soft">
                    {field.size} / {field.owner}
                  </span>
                </div>
                <p className="mt-1.5 font-mono text-[11px] text-ink-soft">
                  {field.detail}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="rounded-[var(--radius-panel)] border border-line bg-paper p-4 space-y-3">
            <div className="text-xs font-medium text-ink">
              Read-Only Vtable Slot Tables (.rodata)
            </div>

            {active.vtables.map((section) => (
              <div
                key={section.title}
                className="rounded-xl border border-line bg-paper-raised p-3"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-ink">
                    {section.title}
                  </span>
                  <span className="font-mono text-[11px] text-ink-faint">
                    {section.pointedBy}
                  </span>
                </div>

                <div className="space-y-1.5">
                  {section.rows.map((row) => (
                    <div
                      key={section.title + row.index + row.entry}
                      className={cn(
                        "flex flex-wrap items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 font-mono text-[11px]",
                        row.isThunk
                          ? "border-ink/30 bg-sun-wash/70 text-ink"
                          : "border-line bg-paper text-ink-body"
                      )}
                    >
                      <span>
                        <strong className="font-semibold text-ink">
                          {row.index}
                        </strong>{" "}
                        {row.entry}
                      </span>
                      <span
                        className={cn(
                          "font-medium",
                          row.isThunk
                            ? "text-ink"
                            : active.dispatchTone === "static"
                              ? "text-[color:var(--right)]"
                              : "text-ink-soft"
                        )}
                      >
                        {row.target}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-[var(--radius-panel)] border border-line bg-paper p-4 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-ink">
                Call Dispatch Trace
              </span>
              <code className="font-mono text-[11px] text-ink-soft">
                {active.dispatchCall}
              </code>
            </div>

            <ol className="space-y-1 font-mono text-[11px] text-ink-body">
              {active.dispatchSteps.map((step) => (
                <li
                  key={step}
                  className="rounded-lg border border-line bg-paper-raised px-2.5 py-1.5"
                >
                  {step}
                </li>
              ))}
            </ol>

            <p className="rounded-xl bg-sun-wash/60 px-3 py-2.5 text-xs leading-relaxed text-ink-body">
              {active.tradeoffNote}
            </p>
          </div>
        </div>
      </div>
    </Window>
  );
}
