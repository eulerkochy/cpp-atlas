import type { RadScenario } from "@/components/rad-debugger/types";

export const VTABLE_LAYOUT_SCENARIOS: RadScenario[] = [
  {
    id: "single-vtable",
    label: "1. Single VTable Dispatch",
    subtitle: "LP64 vptr at +0x00, _ZTV7Derived in .rodata, indirect call",
    filename: "vtable_single.cpp",
    standard: "C++23",
    target: "Itanium ABI (LP64)",
    topicSlugs: ["inheritance-and-virtual-functions"],
    defaultBreakpoints: [9, 10],
    quickWatches: [
      { expr: "d", note: "Derived object on stack (24B)" },
      { expr: "p", note: "Base* pointing to same address" },
      { expr: "0x100402010", note: "_ZTV7Derived + 16 (.rodata)" },
    ],
    source: [
      "struct Base {",
      "  int64_t tag{1};",
      "  virtual void draw() const;",
      "  virtual ~Base() = default;",
      "};",
      "struct Derived : Base {",
      "  int64_t weight{42};",
      "  void draw() const override;",
      "};",
      "void render() {",
      "  Derived d;",
      "  Base* p = &d; // identical addr on single inheritance",
      "  p->draw();    // vptr -> vtable[0]",
      "}",
    ],
    steps: [
      {
        id: "vt-construct",
        label: "Derived d constructed (24B); vptr points to _ZTV7Derived + 16",
        line: 11,
        verdict: { tone: "info", label: "CONSTRUCTED · sizeof(Derived) == 24B" },
        clause: "[class.virtual] §11.7.3",
        summary:
          "Base constructor temporarily installs _ZTV4Base, then Derived constructor overwrites +0x00 with _ZTV7Derived + 16 (0x100402010) in .rodata.",
        inlineHints: {
          11: { text: "d @ 0x7ffee4b2a8a0, vptr -> 0x100402010", tone: "info" },
        },
        watches: [
          {
            id: "w-d",
            expr: "d",
            value: "Derived { vptr=0x100402010, tag=1, weight=42 }",
            type: "Derived (24B)",
            address: "0x7ffee4b2a8a0",
            changed: true,
            tone: "info",
            children: [
              { id: "c-vp", expr: "__vptr", offset: "+0x00", value: "0x100402010 (_ZTV7Derived+16)", type: "void**", address: "0x7ffee4b2a8a0" },
              { id: "c-tag", expr: "Base::tag", offset: "+0x08", value: "1", type: "int64_t", address: "0x7ffee4b2a8a8" },
              { id: "c-wt", expr: "Derived::weight", offset: "+0x10", value: "42", type: "int64_t", address: "0x7ffee4b2a8b0" },
            ],
          },
        ],
        memory: [
          {
            id: "stack-vt",
            name: "render() stack object d",
            segment: "STACK",
            baseAddress: "0x7ffee4b2a8a0",
            status: "alive",
            statusLabel: "24B (LP64)",
            cells: [
              { offset: "+0x00", size: 8, label: "vptr_Base", value: "0x100402010 (_ZTV7Derived+16)", hex: "10 20 40 00 01 00 00 00", state: "vptr", address: "0x7ffee4b2a8a0", pointsTo: "0x100402010", changed: true },
              { offset: "+0x08", size: 8, label: "Base::tag", value: "1", hex: "01 00 00 00 00 00 00 00", state: "alive", address: "0x7ffee4b2a8a8" },
              { offset: "+0x10", size: 8, label: "Derived::weight", value: "42", hex: "2a 00 00 00 00 00 00 00", state: "alive", address: "0x7ffee4b2a8b0" },
            ],
          },
          {
            id: "rodata-vt",
            name: ".rodata _ZTV7Derived",
            segment: "RODATA",
            baseAddress: "0x100402000",
            status: "static",
            statusLabel: "READ-ONLY VTABLE",
            cells: [
              { offset: "-0x10", size: 8, label: "offset_to_top", value: "0", hex: "00 00 00 00 00 00 00 00", state: "rodata", address: "0x100402000" },
              { offset: "-0x08", size: 8, label: "RTTI ptr", value: "&typeinfo(Derived)", hex: "80 30 40 00 01 00 00 00", state: "rodata", address: "0x100402008" },
              { offset: "+0x00", size: 8, label: "slot[0] (vptr target)", value: "&Derived::draw()", hex: "40 16 40 00 00 00 00 00", state: "vptr", address: "0x100402010", changed: true },
              { offset: "+0x08", size: 8, label: "slot[1]", value: "&Derived::~Derived()", hex: "90 16 40 00 00 00 00 00", state: "rodata", address: "0x100402018" },
            ],
          },
        ],
        callStack: [
          { id: "f-ren", fn: "render", file: "vtable_single.cpp", line: 11, addr: "0x7ffee4b2a890", isCurrent: true },
        ],
      },
      {
        id: "vt-dispatch",
        label: "p->draw() loads vptr -> slot[0] -> calls Derived::draw()",
        line: 13,
        verdict: { tone: "safe", label: "DISPATCHED · Derived::draw() via vtable[0]" },
        clause: "[class.virtual]/2",
        summary:
          "Dynamic dispatch executes two pointer dereferences: load vptr = *p (0x100402010), read slot[0] (&Derived::draw), and call indirectly with rdi = p (no this adjustment needed).",
        inlineHints: {
          13: { text: "vtable[0] -> Derived::draw()", tone: "safe" },
        },
        watches: [
          {
            id: "w-p",
            expr: "p",
            value: "0x7ffee4b2a8a0 (dynamic type: Derived)",
            type: "Base*",
            address: "0x7ffee4b2a8a0",
            tone: "safe",
            badge: "RTTI: Derived",
          },
        ],
        memory: [
          {
            id: "stack-vt",
            name: "render() stack object d",
            segment: "STACK",
            baseAddress: "0x7ffee4b2a8a0",
            status: "alive",
            cells: [
              { offset: "+0x00", size: 8, label: "vptr_Base", value: "0x100402010", hex: "10 20 40 00 01 00 00 00", state: "vptr", address: "0x7ffee4b2a8a0", pointsTo: "0x100402010" },
              { offset: "+0x08", size: 8, label: "Base::tag", value: "1", hex: "01 00 00 00 00 00 00 00", state: "alive", address: "0x7ffee4b2a8a8" },
              { offset: "+0x10", size: 8, label: "Derived::weight", value: "42", hex: "2a 00 00 00 00 00 00 00", state: "alive", address: "0x7ffee4b2a8b0" },
            ],
          },
          {
            id: "rodata-vt",
            name: ".rodata _ZTV7Derived",
            segment: "RODATA",
            baseAddress: "0x100402000",
            status: "static",
            cells: [
              { offset: "+0x00", size: 8, label: "slot[0] (DISPATCHED)", value: "&Derived::draw()", hex: "40 16 40 00 00 00 00 00", state: "vptr", address: "0x100402010", changed: true },
            ],
          },
        ],
        callStack: [
          { id: "f-draw", fn: "Derived::draw", args: "this=0x7ffee4b2a8a0", file: "vtable_single.cpp", line: 8, addr: "0x7ffee4b2a860", isCurrent: true },
          { id: "f-ren", fn: "render", file: "vtable_single.cpp", line: 13, addr: "0x7ffee4b2a890" },
        ],
        disasmTitle: "Virtual Dispatch Assembly",
        disasm: [
          { addr: "0x401610", op: "mov", operands: "rax, qword ptr [rdi]", comment: "Load vptr from *p" },
          { addr: "0x401613", op: "call", operands: "qword ptr [rax]", comment: "Indirect call to _ZTV7Derived[0] (Derived::draw)", active: true },
        ],
      },
    ],
  },
  {
    id: "diamond-vbase-thunk",
    label: "2. Virtual Diamond & Thunks",
    subtitle: "Secondary vptr (+0x10), vbase_offset lookup, non-virtual thunk",
    filename: "vtable_diamond.cpp",
    standard: "C++23",
    target: "Itanium ABI (LP64)",
    topicSlugs: ["multiple-and-virtual-inheritance"],
    defaultBreakpoints: [8, 9],
    quickWatches: [
      { expr: "io", note: "Complete IOStream (40B)" },
      { expr: "op", note: "OStream* adjusted +0x10" },
    ],
    source: [
      "struct Stream { int64_t fd{3}; virtual ~Stream() = default; };",
      "struct IStream : virtual Stream { int64_t in_buf{0}; virtual void read(); };",
      "struct OStream : virtual Stream { int64_t out_buf{0}; virtual void flush(); };",
      "struct IOStream : IStream, OStream {",
      "  void read() override; void flush() override;",
      "};",
      "void probe(IOStream& io) {",
      "  OStream* op = &io; // ABI shifts pointer by +0x10!",
      "  op->flush();       // Thunk sub rdi, 0x10 -> IOStream::flush",
      "}",
    ],
    steps: [
      {
        id: "dia-upcast",
        label: "OStream* op = &io shifts pointer +0x10 to secondary subobject",
        line: 8,
        verdict: { tone: "warn", label: "ADJUSTED +0x10 · op points to secondary vptr" },
        clause: "[conv.ptr] & Itanium ABI",
        summary:
          "Because IStream sits at +0x00 (16B), OStream begins at +0x10. Converting &io (0x7ffee4b2a880) to OStream* adds +0x10 -> 0x7ffee4b2a890, while shared virtual base Stream lives at the tail (+0x20).",
        inlineHints: {
          8: { text: "&io = 0x7ffee4b2a880 -> op = 0x7ffee4b2a890 (+0x10)", tone: "warn" },
        },
        watches: [
          {
            id: "w-io",
            expr: "&io (complete object)",
            value: "0x7ffee4b2a880 (40B)",
            type: "IOStream*",
            address: "0x7ffee4b2a880",
          },
          {
            id: "w-op",
            expr: "op (OStream*)",
            value: "0x7ffee4b2a890 (+0x10 shifted!)",
            type: "OStream*",
            address: "0x7ffee4b2a890",
            changed: true,
            tone: "warn",
            badge: "SHIFT +16",
          },
        ],
        memory: [
          {
            id: "stack-dia",
            name: "IOStream object layout (40B)",
            segment: "STACK",
            baseAddress: "0x7ffee4b2a880",
            status: "alive",
            statusLabel: "VIRTUAL DIAMOND (40B)",
            cells: [
              { offset: "+0x00", size: 8, label: "vptr_IStream", value: "0x100403018 (primary)", hex: "18 30 40 00 01 00 00 00", state: "vptr", address: "0x7ffee4b2a880", pointsTo: "0x100403018" },
              { offset: "+0x08", size: 8, label: "IStream::in_buf", value: "0", hex: "00 00 00 00 00 00 00 00", state: "alive", address: "0x7ffee4b2a888" },
              { offset: "+0x10", size: 8, label: "vptr_OStream (op target)", value: "0x100403040 (secondary)", hex: "40 30 40 00 01 00 00 00", state: "vptr", address: "0x7ffee4b2a890", pointsTo: "0x100403040", changed: true },
              { offset: "+0x18", size: 8, label: "OStream::out_buf", value: "0", hex: "00 00 00 00 00 00 00 00", state: "alive", address: "0x7ffee4b2a898" },
              { offset: "+0x20", size: 8, label: "vptr_Stream (vbase)", value: "0x100403060", hex: "60 30 40 00 01 00 00 00", state: "vptr", address: "0x7ffee4b2a8a0" },
              { offset: "+0x28", size: 8, label: "Stream::fd (shared)", value: "3", hex: "03 00 00 00 00 00 00 00", state: "alive", address: "0x7ffee4b2a8a8" },
            ],
          },
        ],
        callStack: [
          { id: "f-pr", fn: "probe", file: "vtable_diamond.cpp", line: 8, addr: "0x7ffee4b2a860", isCurrent: true },
        ],
      },
      {
        id: "dia-thunk",
        label: "op->flush() enters _ZThn16 thunk: sub rdi, 0x10; jmp IOStream::flush",
        line: 9,
        verdict: { tone: "info", label: "THUNK ADJUST · rdi -= 0x10 -> 0x7ffee4b2a880" },
        clause: "[class.virtual]",
        summary:
          "op->flush() calls secondary VTable slot[0], which points to non-virtual thunk _ZThn16_N8IOStream5flushEv. The thunk subtracts 16 from rdi to restore the complete IOStream* before tail-jumping into IOStream::flush.",
        inlineHints: {
          9: { text: "Thunk adjusts rdi 0x7ffee4b2a890 -> 0x7ffee4b2a880", tone: "info" },
        },
        watches: [
          {
            id: "w-rdi",
            expr: "this (after thunk)",
            value: "0x7ffee4b2a880 (IOStream*)",
            type: "IOStream* const",
            address: "0x7ffee4b2a880",
            changed: true,
            tone: "safe",
            badge: "THUNKED",
          },
        ],
        memory: [
          {
            id: "rodata-sec",
            name: ".rodata Secondary VTable (OStream-in-IOStream)",
            segment: "RODATA",
            baseAddress: "0x100403028",
            status: "static",
            cells: [
              { offset: "-0x18", size: 8, label: "vbase_offset", value: "+0x10 (to Stream vbase)", hex: "10 00 00 00 00 00 00 00", state: "rodata", address: "0x100403028" },
              { offset: "-0x10", size: 8, label: "offset_to_top", value: "-16 (-0x10)", hex: "f0 ff ff ff ff ff ff ff", state: "rodata", address: "0x100403030" },
              { offset: "+0x00", size: 8, label: "slot[0]", value: "&_ZThn16_N8IOStream5flushEv", hex: "10 17 40 00 00 00 00 00", state: "vptr", address: "0x100403040", changed: true },
            ],
          },
        ],
        callStack: [
          { id: "f-th", fn: "_ZThn16_N8IOStream5flushEv -> IOStream::flush", args: "this=0x7ffee4b2a880", file: "vtable_diamond.cpp", line: 5, addr: "0x7ffee4b2a840", isCurrent: true },
          { id: "f-pr", fn: "probe", file: "vtable_diamond.cpp", line: 9, addr: "0x7ffee4b2a860" },
        ],
        disasmTitle: "Non-Virtual Thunk Assembly",
        disasm: [
          { addr: "0x401710", op: "sub", operands: "rdi, 0x10", comment: "Adjust OStream* (+0x10) back to IOStream*", active: true },
          { addr: "0x401714", op: "jmp", operands: "IOStream::flush()", comment: "Tail jump with restored this pointer", active: true },
        ],
      },
    ],
  },
  {
    id: "padding-alignment",
    label: "3. Struct Padding & Alignment",
    subtitle: "Member ordering (24B vs 16B) & [[no_unique_address]] EBO",
    filename: "layout_padding.cpp",
    standard: "C++23",
    target: "LP64",
    topicSlugs: ["object-layout-and-alignment"],
    defaultBreakpoints: [2],
    source: [
      "struct BadLayout  { char a; double b; char c; }; // sizeof == 24 (14B pad!)",
      "struct TightLayout { double b; char a; char c; }; // sizeof == 16 (6B pad)",
      "struct EmptyTag {};",
      "struct Packed { [[no_unique_address]] EmptyTag tag; int id; }; // sizeof == 4!",
    ],
    steps: [
      {
        id: "pad-compare",
        label: "Reordering members largest-to-smallest saves 8 bytes per object",
        line: 2,
        verdict: { tone: "safe", label: "OPTIMIZED · 24B BadLayout -> 16B TightLayout" },
        clause: "[basic.align] §6.7.6",
        summary:
          "Because double requires 8-byte alignment, BadLayout inserts 7 padding bytes after a and 7 trailing bytes after c (24B total). TightLayout groups both chars together after double, cutting size to 16B.",
        inlineHints: {
          1: { text: "24B (14B wasted padding!)", tone: "danger" },
          2: { text: "16B (saved 33% cache footprint)", tone: "safe" },
        },
        watches: [
          { id: "w-bad", expr: "sizeof(BadLayout)", value: "24 bytes (14B padding)", type: "size_t", tone: "danger" },
          { id: "w-ok", expr: "sizeof(TightLayout)", value: "16 bytes (6B padding)", type: "size_t", tone: "safe", changed: true },
          { id: "w-ebo", expr: "sizeof(Packed)", value: "4 bytes ([[no_unique_address]])", type: "size_t", tone: "safe", changed: true },
        ],
        memory: [
          {
            id: "mem-bad",
            name: "BadLayout (24B)",
            segment: "STACK",
            baseAddress: "0x7ffee4b2a840",
            status: "dangling",
            statusLabel: "14B PADDING",
            cells: [
              { offset: "+0x00", size: 1, label: "a (char)", value: "'A' (0x41)", hex: "41", ascii: "A", state: "alive", address: "0x7ffee4b2a840" },
              { offset: "+0x01", size: 7, label: "<pad for double>", value: "7 bytes wasted", hex: "cc cc cc cc cc cc cc", state: "padding", address: "0x7ffee4b2a841" },
              { offset: "+0x08", size: 8, label: "b (double)", value: "3.5", hex: "00 00 00 00 00 00 0c 40", state: "alive", address: "0x7ffee4b2a848" },
              { offset: "+0x10", size: 1, label: "c (char)", value: "'Z' (0x5a)", hex: "5a", ascii: "Z", state: "alive", address: "0x7ffee4b2a850" },
              { offset: "+0x11", size: 7, label: "<tail pad>", value: "7 bytes wasted", hex: "cc cc cc cc cc cc cc", state: "padding", address: "0x7ffee4b2a851" },
            ],
          },
          {
            id: "mem-tight",
            name: "TightLayout (16B)",
            segment: "STACK",
            baseAddress: "0x7ffee4b2a820",
            status: "alive",
            statusLabel: "16B COMPACT",
            cells: [
              { offset: "+0x00", size: 8, label: "b (double)", value: "3.5", hex: "00 00 00 00 00 00 0c 40", state: "alive", address: "0x7ffee4b2a820" },
              { offset: "+0x08", size: 1, label: "a (char)", value: "'A'", hex: "41", state: "alive", address: "0x7ffee4b2a828" },
              { offset: "+0x09", size: 1, label: "c (char)", value: "'Z'", hex: "5a", state: "alive", address: "0x7ffee4b2a829" },
              { offset: "+0x0a", size: 6, label: "<tail pad>", value: "6 bytes", hex: "cc cc cc cc cc cc", state: "padding", address: "0x7ffee4b2a82a" },
            ],
          },
        ],
        callStack: [
          { id: "f-lay", fn: "layout_check", file: "layout_padding.cpp", line: 2, addr: "0x7ffee4b2a820", isCurrent: true },
        ],
      },
    ],
  },
  {
    id: "crtp-deducing-this",
    label: "4. Deducing this (C++23)",
    subtitle: "Zero vptr, static polymorphism via explicit object parameter",
    filename: "deducing_this.cpp",
    standard: "C++23",
    target: "x86-64 (-O2)",
    topicSlugs: ["crtp-and-deducing-this"],
    defaultBreakpoints: [6],
    source: [
      "struct Drawable {",
      "  template <typename Self>",
      "  void draw(this Self const& self) { self.impl(); }",
      "};",
      "struct Circle : Drawable {",
      "  int64_t r{10};",
      "  void impl() const {}",
      "};",
      "void run(Circle const& c) { c.draw(); } // 0 vptr, direct inline!",
    ],
    steps: [
      {
        id: "dt-call",
        label: "c.draw() deduces Self = Circle -> 0B vptr overhead & direct inline",
        line: 9,
        verdict: { tone: "safe", label: "ZERO OVERHEAD · sizeof(Circle)==8, direct call" },
        clause: "[dcl.fct] §9.3.4.6",
        summary:
          "With C++23 deducing this (`this Self const& self`), Drawable needs neither a virtual vptr nor CRTP template boilerplate (`Drawable<Circle>`). The call resolves statically at compile time and inlines cleanly.",
        inlineHints: {
          9: { text: "Self = Circle (0 vptr, 0 indirect jumps)", tone: "safe" },
        },
        watches: [
          { id: "dt-sz", expr: "sizeof(Circle)", value: "8 bytes (0 vptr!)", type: "size_t", tone: "safe", changed: true },
          { id: "dt-self", expr: "Self (deduced)", value: "Circle", type: "type", tone: "safe" },
        ],
        memory: [
          {
            id: "stack-dt",
            name: "Circle stack object (8B)",
            segment: "STACK",
            baseAddress: "0x7ffee4b2a800",
            status: "alive",
            statusLabel: "NO VPTR",
            cells: [
              { offset: "+0x00", size: 8, label: "Circle::r", value: "10", hex: "0a 00 00 00 00 00 00 00", state: "alive", address: "0x7ffee4b2a800", changed: true },
            ],
          },
        ],
        callStack: [
          { id: "f-dt", fn: "Drawable::draw<Circle>", args: "self=0x7ffee4b2a800", file: "deducing_this.cpp", line: 3, addr: "0x7ffee4b2a800", isCurrent: true },
        ],
        disasmTitle: "Static Polymorphism Assembly",
        disasm: [
          { addr: "0x401a00", op: "ret", operands: "", comment: "c.draw() -> Circle::impl() completely inlined to zero instructions!", active: true, isZeroCost: true },
        ],
      },
    ],
  },
];
