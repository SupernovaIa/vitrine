# vitrine

**https://vitrine-supernovaias-projects.vercel.app**

A personal record of films, series, books and video games. Public to read,
writable only from the repo: no backend, no database, no login.

Every entry is a Markdown file. `git` is the storage, the history and the backup.

The interface is in Spanish (Spain). Everything else here — this file, the code,
the scripts, the commit messages — is in English. The only Spanish that belongs
outside `src/content/` is a string a visitor will read.

The 73 initial entries came from four Notion databases
(`scripts/notion-export.json` + `scripts/import-notion.mjs`). **That import ran
once and is not repeated.** The export keeps the titles exactly as Notion had
them, two of them wrong (*Tregua*, *The Cult of the Lamb*), so re-running it
would trample the corrections. It stays as a record of what was there, not as
something to run again.

## Getting started

```sh
pnpm install
pnpm dev      # http://localhost:4321
pnpm check    # types + schema validation
pnpm build
```

## Adding something

Create a `.md` in the collection it belongs to (`films`, `series`, `books`,
`games`). The filename is the URL.

```md
---
title: "Hollow Knight"
year: 2017                    # optional
by: "Team Cherry"             # direction / authorship / studio — optional
status: done                  # pending | active | done | dropped
tier: S                       # S | A | B | C | D — omit it if undecided
platforms: ["PC", "Switch"]   # games: several at once
hours: 41
completion: "story+extras"    # story | story+extras | full
genre: "Metroidvania"         # the primary classification, exactly one
tags: ["indie"]               # everything else, as many as you like
finished: 2024-11-04
revisits: 1                   # 0 = once only
accent: "#4a6f9c"             # dominant colour of the cover
hook: "One line, no spoilers."
cover: ./hollow-knight.jpg    # optional, next to the .md
quotes:
  - "A line worth keeping."
---

The review, in Markdown. As long or as short as you like.
```

Per-medium fields, on top of the shared trunk: `runtime` (films); `seasons`,
`episodes`, `at: [season, episode]`, `episodesSeen` (series); `pages`,
`pagesRead`, `physical` (books); `platforms`, `hours`, `completion` (games).

### Four modelling decisions

They come from the Notion schema, and each departs from it on purpose:

1. **Four statuses, not six.** `Pendiente` and `Sin empezar` were the same
   thing, kept apart only because the four databases were created separately.
   `De nuevo` mixed a status with a count: it is now `revisits`.
2. **`tier` with no "Por decidir".** That is not a value on the scale, it is the
   absence of one. A finished entry with no `tier` renders as "por decidir",
   derived rather than stored, so the two cannot drift apart.
3. **No `canon`.** Tier S already means "essential", and two fields for one idea
   end up disagreeing.
4. **`platforms` is a list.** Hollow Knight is on PC *and* on Switch.

The full schema, with the reasoning behind each decision, is in
`src/content.config.ts`. If a field is missing or mistyped, **the build fails** —
validation happens before deploying, not after.

## Covers

One per entry, with the script:

```sh
node scripts/add-cover.mjs games hollow-knight ~/Downloads/hk.png
```

It does three things: normalises the image (900px wide at most, JPEG at quality
88 — an 800 KB PNG comes out around 93 KB with no visible loss), derives the
accent colour from it, and writes `cover:` and `accent:` into the frontmatter.
There is no need to touch the `.md` by hand; in fact do not add `cover:` before
the image exists, because the schema validates it at build time and the build
will fail.

Films and series go in one pass, with no API key at all:

```sh
node scripts/fetch-tmdb-covers.mjs            # says which work matches each entry
node scripts/fetch-tmdb-covers.mjs --apply    # and only then places them
```

Wikidata stores the TMDB id itself (`P4947` for films, `P4983` for series) and
`image.tmdb.org` serves the artwork unauthenticated: what needs a key is the
*API*, not the CDN. So identity comes from Wikidata — queryable, and carrying the
publication date that separates the four films called *Titanic* — and the public
page's HTML yields nothing but the poster path. The split is deliberate: the
fragile half (scraping markup) decides nothing, it only carries a filename.

When the exact label does not match — Notion wrote its titles in sentence case
and `rdfs:label` is case-sensitive; and *El indomable Will Hunting* is an alias,
not a label — a second pass goes through `wbsearchentities`, which ignores case
and reads aliases. Its results go back through the same SPARQL that demands a
TMDB id and a date, because it also returns books and songs under those words.

**Always review the dry run before `--apply`.** The entry's year discards the
candidate that does not fit, and that is where you see it: `super-mario-bros`
was matching the 1993 live-action film while carrying `year: 2023`. When no
title can disambiguate at all, `title-overrides.json` accepts a Q-number that
pins the item outright.

Games work the same way, but need two stores because neither covers the shelf
alone:

```sh
node scripts/fetch-game-covers.mjs --apply
```

**Steam** for anything with an AppID (`P1733` on Wikidata):
`library_600x900_2x.jpg` is exactly 600×900, which is the 2:3 the grid crops to.
**The European eShop** for the rest, which are Switch exclusives with no AppID to
find; its search is open, it answers in Spanish, and of the three images each
record carries you take `image_url` **only if it is the packshot** — the physical
box, 500×809. Nintendo has been retiring box art on digital-first listings, and
those records serve the square in its place, which a 2:3 crop destroys.

`Leyendas Pokémon: Arceus` is exactly that case, in all five eShop locales, and
its box was placed by hand with `add-cover.mjs`.

If the colour it derives is not the one that dominates the cover,
`--accent "#5ab5c1"` pins it by hand. That happens when the field is dark and
the vivid part is a minority: *El universo elegante* is black with a teal and
orange nebula, and the script answered with a brown, because the orange
filaments are more numerous but sit at lightness 0.26 against the teal core's
0.53.

**What image to look for:** anything from 600×900 is plenty (the largest it is
ever displayed is 300px on the detail page, which covers 3x screens). The ratio
does not matter: it is cropped to 2:3, which is what keeps the grid even.

Astro converts them to AVIF/WebP with `width`/`height` in the HTML, so there is
no layout shift. All of them normalise to 2:3.

Nothing breaks without a cover: a typographic card is drawn with the title, the
authorship and the year, and it occupies exactly the same space as a real cover.

**Over a cover, the caption is the year alone.** It does not label the title or
the authorship, because the cover already carries them printed: a film poster
puts them in a thin band at the bottom and an overlay spares them, but a jacket
puts them in the middle, and *Pensar rápido, pensar despacio* was printing
DANIEL KAHNEMAN underneath our own DANIEL KAHNEMAN, overlapping.

### How the `accent` is chosen

It is not the image's dominant colour. On a poster the most frequent colour is
the black of the background (`#080808` on Hollow Knight), and saturating a grey
**invents a hue** — that turned a blue cover red.

What the script does is sample the image small, discard the pixels too dark, too
light or too grey to have a trustworthy hue, and keep the hue group with the most
chromatic weight behind it. On Hollow Knight that gives `#1d78b9`, the cyan
anyone would name looking at the cover. If the image really is monochrome, it
writes no `accent` and the entry falls back to its medium's colour.

## Privacy

**This repository is public, so nothing goes here that anyone should not be able
to read.** Including the git history: deleting something later does not delete it
from earlier commits.

`visibility: private` still does what it says, but it is worth being precise
about what that is: it removes the entry from the site **at build time**, so it
is neither in the deployed HTML nor hidden with CSS. What it does *not* do, with
the repo public, is hide the `.md` — that is read by opening the repo. It means
"not on the site", not "not public".

The filter lives in `allItems()` (`src/lib/media.ts`), which is the single door
to the content, so that a new page cannot leak an entry marked private by
forgetting to check.

If you ever want an entry that is genuinely private, it cannot live in this
repository.

## Structure

```
src/
  content.config.ts     Zod schema: shared trunk + per-medium fields
  content/{films,series,books,games}/*.md
  lib/media.ts          each medium's vocabulary, progress, statistics
  components/           Cover, ItemCard, Filters, StatStrip
  pages/
    index.astro         the shelf + "right now" + filters
    [medium]/[slug].astro
  styles/               base.css (the scale) + theme.css (colour and type)
scripts/
  add-cover.mjs         places a cover and extracts its accent colour
  fetch-book-covers.mjs  jackets from Open Library (books only)
  fetch-tmdb-covers.mjs  film and series posters, via Wikidata + TMDB, keyless
  fetch-game-covers.mjs  game boxes, via Steam and the European eShop, keyless
  cover-overrides.json   artwork chosen by hand, when the scan will not do
  lookup-metadata.mjs    facts about the work from Wikidata; writes nothing
  lookup-books.mjs       the same from Open Library
  apply-metadata.mjs     applies a reviewed result, without overwriting
  title-overrides.json   the identifier when the title is not enough (or a QID)
  import-notion.mjs      the initial import, run once — do not re-run
  shot.mjs               screenshots at a real viewport, over CDP
```

The tokens follow the same semantic contract as `cheatsheets`: a hex value
outside `theme.css` is a bug.

## Open

- **Covers are done.** 73 of 73. Four were sourced by hand, because no source
  has them: `Leyendas Pokémon: Arceus` lost its packshot in every eShop locale,
  and Open Library's best scans of *La tregua* and *Tus zonas erróneas* are
  246×404 and 128×196.

  What does **not** work, checked rather than assumed: iTunes Search answers
  `resultCount: 0` to both `media=movie` and `media=tvShow`; the anonymous Google
  Books quota is spent; and Wikipedia's *non-free* posters are listed by
  `prop=images` after all — it was only `pageimages` that skipped them — but fair
  use caps them around 275×362, under the usable floor.
- **Dates.** Notion stored none, so the shelf sorts by status and tier. With
  `finished` filled in, chronological ordering and per-year statistics become
  possible (`shelfOrder` in `src/lib/media.ts`).
- **Reviews.** The body of all 73 entries is empty.
- **`episodes` is rendered nowhere.** 14 of 15 are filled in, and neither
  `metaLine` nor the data table shows them: a series page shows seasons and stops
  there. Either the field gets rendered, or filling it in serves no purpose.
- Ingestion from APIs (TMDB / IGDB) if entering things by hand gets tiring.
