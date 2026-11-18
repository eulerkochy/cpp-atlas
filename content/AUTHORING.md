# Writing a topic

A topic is one idea taken deep, for a reader who already writes C++ professionally and wants
standard-accurate, expert-level understanding. cppreference is exhaustive; a topic gives the
mental model, the rules that surprise, and the proof in code. Accuracy against the standard is
the top priority: a wrong quiz answer is worse than no quiz.

Each topic lives in `content/topics/<slug>/` as three files. `src/lib/topics.ts` reads them and
`src/types/topics.ts` holds the types; `scripts/check-content.mjs` is the executable version of
the rules below. `content/topics/copy-elision/` is a good style model: read all three of its files
before writing. The slug must be listed in exactly one track of `content/tracks.json`
(`{"tracks": [{id, title, description, topics: [slug, ...]}]}`), and the frontmatter `track`
must be the `id` of that track. Order within a track is reading order.

## article.md

Frontmatter between `---` lines, then a markdown body. The frontmatter is a small YAML subset:
quote every string with double quotes (JSON escapes), one key per line, lists as `  - item`.

```yaml
---
title: "Value categories"
summary: "One or two plain sentences: what the reader will understand."
track: "value-semantics"
minutes: 12
standard:
  - "[basic.lval]"
  - "[conv.rval]"
cppreference:
  - title: "Value categories"
    path: "language/value_category"
prerequisites:
  - "initialization-forms"
---
```

- `title`, `summary`, `track` and `minutes` (reading time, integer) are required. The summary is
  the page description, the search snippet and the subtitle under the title.
- `standard`: stable section labels such as `[basic.lval]`, shown as chips linking to eel.is. Use
  labels from C++23 (N4950) unless the topic is newer; do not guess a label, leave it out if unsure.
- `cppreference`: `{title, path}` pairs, where `path` is what follows `/w/cpp/` on
  cppreference.com (a full `url` is accepted too). The site links each one to its offline copy at
  `/w/cpp/<path>`, so only use pages that exist in the snapshot: every page has a file at
  `data/reference/md/<path>.md`. A path that is missing (for instance a page newer than the
  snapshot) falls back to cppreference.com and `pnpm check:content` warns about it.
- `prerequisites`: slugs from `content/tracks.json`. They feed the curriculum graph on `/maps`, so
  they must not form a cycle.

Body: 1300 to 2000 words. No h1 (the title is the page's only h1). Five to eight `##` sections,
`###` sparingly; the `##` headings become the "On this page" rail. Open with a short section
stating the one mental model in plain words, then build. Show every surprising claim with a short
`cpp` fence whose comments say what happens; code windows get Copy and Compiler Explorer buttons.
Use a `text` fence for ASCII diagrams. End with `## What to remember`, a tight bullet list. Say
which standard version changed a rule (C++11/14/17/20/23/26) when it matters. Separate what the
standard guarantees from what implementations happen to do.

Callouts are blockquotes whose first words are bold; use three to six in total:

- `> **Mental model.** ...`
- `> **Pitfall.** ...`
- `> **Standardese.** ...` paraphrases what the standard says and names the section.

Plain GFM only: tables are fine; no HTML, images or footnotes. Write in your own words; do not
copy cppreference or the standard beyond short phrases. The article is also exported as markdown
for NotebookLM audio overviews (`/api/notebook/topic/<slug>`), so write full sentences and never
refer to "the table above".

## quiz.json

`{"questions": [...]}`, normally 8 questions: 3 `warmup`, 3 `tricky`, 2 `standardese`.

- `id`: `<topic-slug>-<short-name>` (or another kebab-case id), unique across the whole site:
  progress, bookmarks and spaced review are keyed by it, so never rename a shipped id.
- `kind`: `warmup`, `tricky` or `standardese`.
- `prompt` (inline markdown), optional `code`, `options` (3 to 5), `answer` (0-based index),
  `explanation`, `refs` (section labels).
- Favour questions with code: what does this print, is this well-formed, what is this type, how
  many copies, is this a data race, what does the standard guarantee here. Offer "Undefined
  behavior", "Ill-formed", "Implementation-defined" or "Unspecified" as options where honest.
- Distractors are the answers a competent programmer is actually tempted by.
- The explanation (2 to 5 sentences) says why the right answer is right and why the most tempting
  wrong one is wrong.
- Exactly one defensible answer. If it depends on the standard version, name the version in the
  prompt. Never ask for a size or layout number unless the prompt pins the ABI or the standard
  guarantees it. Vary the position of the correct answer.

## map.json

`{"root": {label, note?, children?}}`: a mind map for revision. Root is the topic, four to six
main branches, at most three levels below the root, 18 to 32 nodes. Labels are five words or
fewer. Every non-root node has a `note`: one sentence, at most 160 characters, stating the fact
to recall. Topics with an interactive memory simulator (see `SIMULATOR_BY_TOPIC` in
`src/types/topics.ts`) show it next to the map.

## Verification

Use `g++-16 -std=c++23 -Wall -Wextra` (`-std=c++26` for C++26 topics), and cross-check with
`clang++` where cheap.

- Compile every quiz snippet exactly as written in the JSON. Run the ones that ask about output.
- For "ill-formed" answers, confirm the compiler rejects the code for the reason given.
- For undefined behavior and data races, reason from the standard; never trust observed output.
  Constant evaluation diagnoses most undefined behavior, which makes a good check.
- Only ask about results the standard guarantees. Elision, layout and timing vary by compiler.
- When the compiler and your belief disagree, resolve it before shipping the question.
- Compile every complete article snippet.
- Finish with `pnpm check:content` (structure, ids, tracks, prerequisites, links into the offline
  reference) and `pnpm check:snippets` (advisory `-fsyntax-only` pass over every `cpp` fence and
  quiz snippet; `CXX=clang++ pnpm check:snippets` to use another compiler).
