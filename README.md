# C++ Atlas — Every cppreference Page Mapped 1:1

A sunlit, calm study layer and **1:1 indexed front-end** for `en.cppreference.com`, built with Next.js 16 (App Router), TypeScript, Tailwind CSS v4, and `shadcn/ui`.

## What C++ Atlas includes

- **33 Study Topics across 13 Tracks (`/topics` & `/topics/[slug]`):** Structured deep dives pairing mental models, interactive concept maps, Compiler Explorer code links, and standard-lawyer quizzes.
- **Curriculum Prerequisite DAG & Concept Maps (`/maps`):** Visualizes prerequisite dependencies across all 33 topics alongside interactive concept maps.
- **11 Machine-Model Simulators:** Interactive labs mounted on study topics and canonical `/w/cpp/...` reference pages (`ValueCategoryMap`, `MemoryModelMap`, `ObjectLifetimeMap`, `MoveForwardingMap`, `TemplatesConceptsMap`, `CoroutineFrameMap`, `VtableLayoutMap`, `ContainerInvalidationMap`, `SmartPointerMap`, `OverloadLookupMap`, and `Cpp26PreviewMap`).
- **220 ISO Clause-Cited Standardese Traps (`/quiz`):** Mixed quiz arena featuring 198 topic questions plus 22 CppCon traps, including **Missed** spaced review, bookmarks, and browser progress persistence.
- **Study Desk (`/study`):** Tracks completed topics, reviewed reference pages, missed traps, and bookmarks with `cpp-atlas-progress.json` export/import backup.
- **C++11–C++26 Evolution Timeline (`/standards`):** Milestone timeline tracing language and library shifts from C++11 through C++26 across topics and reference entries.
- **Compiler Explorer Integration:** Launch topic C++ and C snippets directly in Compiler Explorer right from code blocks.
- **7,589 C++ & C 1:1 Reference Entries (`/w/cpp/...`, `/w/c/...`, `/w`, `/explore`):** Maps 6,588 C++ symbols (5,657 unique pages across 27 domains) and 1,001 C symbols (641 unique pages across 19 domains) for a combined 7,589 entries across 6,298 pages, rewriting internal links locally and adding **Focus Mode** to dim legacy noise.
- **NotebookLM Markdown Studio (`/notebook` & `/api/notebook/...`):** Generates Audio-Overview-ready Markdown packs for individual reference pages (`/api/notebook/[...slug]`), single topics (`/api/notebook/topic/[slug]`), or all topics combined (`/api/notebook/topics-all`).
- **Search & Crawlability:** `⌘K` / `Ctrl+K` / `/` command palette backed by `/api/search`, plus `/sitemap.xml`, `/robots.txt`, and `/llms.txt`.

## Local development

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

## Production build & deployment

```bash
pnpm build
npx vercel --prod
```

Set `NEXT_PUBLIC_SITE_URL` in your deployment environment (e.g. `https://your-domain.vercel.app`) so `sitemap.xml`, `robots.txt`, and `llms.txt` emit your production origin.
