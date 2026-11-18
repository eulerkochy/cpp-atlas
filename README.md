# C++ Atlas — The C++ reference that explains itself

Live at **[cpp-atlas.vercel.app](https://cpp-atlas.vercel.app)**.

A calm, high-signal study layer over an **offline 1:1 copy of `en.cppreference.com`**, built with Next.js 16 (App Router, Cache Components), TypeScript, Tailwind CSS v4, and `shadcn/ui`. Every reference page is imported from the cppreference offline archive and prerendered at build time: nothing is fetched from cppreference.com at request or build time.

## What C++ Atlas includes

- **Study Topics across 13 Tracks (`/topics` & `/topics/[slug]`):** 115 deep dives pairing mental models, concept maps, Compiler Explorer code links, and clause-cited quizzes (Read / Map / Quiz views). Topic "Further reading" links point directly at the offline `/w/cpp/...` pages.
- **Curriculum Prerequisite DAG & Concept Maps (`/maps`).**
- **11 Machine-Model Simulators** mounted across 33 study topics and on the matching reference pages.
- **Standardese Quiz (`/quiz`):** 876 clause-cited questions across every topic and reference companion, with **Missed** spaced review, shareable `#trap-` deep links, bookmarks, and browser progress persistence.
- **Study Desk (`/study`):** completed topics, reviewed reference pages, missed traps, bookmarks, `cpp-atlas-progress.json` export/import.
- **C++11–C++26 Evolution Timeline (`/standards`).**
- **Offline C++ and C reference (`/w/cpp/...`, `/w/c/...`, `/w`, `/explore`):** 5,971 C++ pages and 616 C pages from the cppreference snapshot of 9 February 2025, with breadcrumbs, "In this section", an on-this-page rail, standards chips, Compiler Explorer buttons on examples, and **Focus Mode** to dim pre-C++11/14 rows and defect reports. Links between C and C++ pages stay inside the site. Unknown paths are real 404s and cppreference redirect pages are real 308 redirects; the legacy `/cpp/...` and `/c/...` addresses redirect to `/w/...`.
- **NotebookLM Markdown Studio (`/notebook` & `/api/notebook/...`):** Audio-Overview-ready markdown for reference pages (`/api/notebook/cpp/<path>`, `/api/notebook/c/<path>`), single topics (`/api/notebook/topic/[slug]`), or all topics (`/api/notebook/topics-all`).
- **Search & Crawlability:** `⌘K` / `Ctrl+K` / `/` command palette backed by `/api/search`, plus `/sitemap.xml`, `/robots.txt`, `/llms.txt`, canonical URLs, OpenGraph cards and JSON-LD.

Counts shown in the UI are derived from the data at build time.

## Local development

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

## Reference data

The reference lives in the repository as generated data, which is the single source of truth for which pages exist (routes, 404s, redirects, sitemap, search, explore):

| Directory | Contents |
| --- | --- |
| `data/reference/` | C++ (`en/cpp`): `index.json` (every page in tree order), `paths.json` (route lookup for `src/proxy.ts`), `tree.json`, `pages/<path>.json` (sanitized HTML plus metadata), `md/<path>.md` |
| `data/reference-c/` | The same for C (`en/c`) |

To regenerate it, download the cppreference offline archive (`html-book-20250209.tar.xz` from the cppreference "Offline archives" page), then run the importer. The archive location is configurable:

```bash
# default location: .archive/book/reference (the .tar.xz in .archive/ is extracted when missing)
pnpm import:cppreference
# or point at an extracted archive elsewhere
pnpm import:cppreference --archive /path/to/book/reference
CPPREFERENCE_ARCHIVE=/path/to/book/reference pnpm import:cppreference
# one language only
pnpm import:cppreference --lang c

# verify: every internal link resolves, redirects point at pages, C <-> C++ links work
pnpm check:reference
```

`.archive/` is git-ignored. If the snapshot date changes, update `REFERENCE_SNAPSHOT` in `src/lib/cppref-engine.ts`.

## Writing topics

See [`content/AUTHORING.md`](content/AUTHORING.md). Before committing content:

```bash
pnpm check:content    # structure, quiz ids, tracks, prerequisites, links into the offline reference
pnpm check:snippets   # advisory g++-16 -fsyntax-only pass (C++23, then C++26) over every cpp snippet
```

## Production build & deployment

```bash
pnpm build
npx vercel --prod
```

Set `NEXT_PUBLIC_SITE_URL` in your deployment environment (e.g. `https://your-domain.vercel.app`) so canonical URLs, `sitemap.xml`, `robots.txt`, and `llms.txt` emit your production origin.

## Attribution

Reference content is from [cppreference.com](https://en.cppreference.com), licensed under [CC-BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) and the [GFDL](https://www.gnu.org/licenses/fdl-1.3.html). It has been modified: restyled, site navigation removed, code windows added. Every reference page links to its original on cppreference.com.
