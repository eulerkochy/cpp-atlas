# C++ Atlas — The C++ reference that explains itself

Live at **[cpp-atlas.vercel.app](https://cpp-atlas.vercel.app)**.

A calm, high-signal study layer over an **offline 1:1 copy of `en.cppreference.com`**, built with Next.js 16 (App Router, Cache Components), TypeScript, Tailwind CSS v4, and `shadcn/ui`. Every reference page is imported from the cppreference offline archive and prerendered at build time: nothing is fetched from cppreference.com at request or build time.

## What C++ Atlas includes

- **Interactive World Atlas (`/`, `/maps`, `/topics`, `/topics/[slug]`, `/study`):** The 115-topic curriculum charted across 4 continents (*Language basics*, *Building abstractions*, *The machine*, *Library and C++26*) and 13 track countries, with zoom/pan, search-on-map, prerequisite route arcs, and progress layers:
  - **`/`:** Interactive World Atlas plate directly beneath the hero, mapping all 4 continents, 13 tracks, and 115 towns.
  - **`/maps`:** Full World Atlas explorer with continent cameras, `?topic=` / `?region=` / `?track=` deep links, waypoint details, a `Dependency columns` prerequisite DAG toggle, and all topic concept maps grouped by continent.
  - **`/topics`:** Collapsible World Atlas synced live with the topic gazetteer's search query, status filters (`Next up`, `Saved`, `Completed`), and scroll position.
  - **`/topics/[slug]`:** Engraved local island inset in the right rail showing neighboring coastlines, shared continental borders, sibling towns, and connected prerequisite routes, plus links to `/maps?topic=<slug>`.
  - **`/study`:** Personal **Charted territory** view overlaying completed towns, next-up frontier topics, and saved bookmarks on the World Atlas alongside continent-grouped track progress.
- **Study Topics across 13 Tracks (`/topics` & `/topics/[slug]`):** 115 deep dives pairing mental models, concept maps, Compiler Explorer code links, and clause-cited quizzes (Read / Map / Quiz views). Topic "Further reading" links point directly at the offline `/w/cpp/...` pages, and reference pages link back to their study topics and `/maps?topic=<slug>`.
- **11 Machine-Model Simulators** mounted across 33 study topics and on the matching reference pages.
- **Standardese Quiz (`/quiz`):** 876 clause-cited questions across every topic and reference companion, with **Missed** spaced review, shareable `#trap-` deep links, bookmarks, and browser progress persistence.
- **Study Desk (`/study`):** personal charted territory map, continent-grouped track mastery, completed topics, reviewed reference pages, missed traps, bookmarks, and `cpp-atlas-progress.json` export/import.
- **C++11–C++26 Evolution Timeline (`/standards`).**
- **Offline C++ and C reference (`/w/cpp/...`, `/w/c/...`, `/w`, `/explore`):** 5,971 C++ pages and 616 C pages from the cppreference snapshot of 9 February 2025, with breadcrumbs, "In this section", an on-this-page rail, standards chips, Compiler Explorer buttons on examples, `Study topics` links back to topics and `/maps?topic=<slug>`, and **Focus Mode** to dim pre-C++11/14 rows and defect reports. Links between C and C++ pages stay inside the site. Unknown paths are real 404s and cppreference redirect pages are real 308 redirects; the legacy `/cpp/...` and `/c/...` addresses redirect to `/w/...`.
- **NotebookLM & Gemini Studio (`/notebook`, `/api/ai/...`, `/api/notebook/...`):** Direct in-app **Gemini Studio** (`gemini-4-hydrogen` multi-source grounded chat, Briefing Docs, Study Guides, FAQs, Traps, and two-host **Audio Overviews** via `gemini-3.8-flash-tts`), **Public NotebookLM Workspaces** (Full Atlas + 4 continents via `NEXT_PUBLIC_NOTEBOOKLM_URL_*`), and secondary `.md` export (`/api/notebook/cpp/<path>`, `/api/notebook/c/<path>`, `/api/notebook/topic/[slug]`, `/api/notebook/topics-all`).
- **Ask AI on Every Page:** Compact header action strip and right-rail widget across all topic and reference pages for **Ask Gemini** (in-app streaming tutor drawer grounded on the current page), **Ask ChatGPT**, **Ask Claude**, and **NotebookLM**.
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

Optional AI & NotebookLM environment variables:

- `GEMINI_API_KEY`: Enables the in-app **Ask Gemini** tutor drawer, **Notebook Chat**, **Studio Guides** (`gemini-4-hydrogen`), and two-host **Audio Overviews** (`gemini-3.8-flash-tts`). Visitors can also supply a temporary session key in the UI if unset on the server.
- `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` (plus optional `GOOGLE_OAUTH_SESSION_SECRET` and `GOOGLE_CLOUD_PROJECT`): Enables **Sign in with Google** (`https://www.googleapis.com/auth/notebook` via `notebook.googleapis.com`) so users can list their personal NotebookLM notebooks and push topics/reference pages directly into them. Add `<your-origin>/api/auth/google/callback` as an Authorized Redirect URI in Google Cloud Console. *(Google's Gemini Notebook API preview supports personal `@gmail.com` accounts.)*
- `NEXT_PUBLIC_NOTEBOOKLM_URL_ATLAS`, `NEXT_PUBLIC_NOTEBOOKLM_URL_LANGUAGE_BASICS`, `NEXT_PUBLIC_NOTEBOOKLM_URL_BUILDING_ABSTRACTIONS`, `NEXT_PUBLIC_NOTEBOOKLM_URL_THE_MACHINE`, `NEXT_PUBLIC_NOTEBOOKLM_URL_LIBRARY_AND_CPP26`: Optional public shared NotebookLM workspace URLs surfaced in `/notebook` and on matching pages.

## Attribution

Reference content is from [cppreference.com](https://en.cppreference.com), licensed under [CC-BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) and the [GFDL](https://www.gnu.org/licenses/fdl-1.3.html). It has been modified: restyled, site navigation removed, code windows added. Every reference page links to its original on cppreference.com.
