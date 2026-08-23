# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary: a visitor who is not the author.** They arrive curious about what the
author has liked, browse without a specific title in mind, and leave with ideas
about what to watch or read. They have no account, no history here, and no reason
to stay unless the content earns it.

**Secondary: the author** (Javier, GitHub `SupernovaIa`), who consults his own
record — what he finished, what he rated highly, what he never started. He is the
only person who writes; there is no second contributor and no sign-in.

## Product Purpose

A single-author public record of the films, series, books and video games the
author has consumed, each judged on one shared scale. It exists so that four
kinds of consumption can be seen together and compared, which no tracker the
author used could do.

Success is a visitor forming a clear picture of the author's taste, and leaving
with something they want to consume.

## Positioning

Four media on one shelf under one verdict scale. Letterboxd, Goodreads, Backloggd
and Trakt each own a single medium; none of them can answer "what are the ten
things that marked this person, across everything". The tier list is the
mechanism: a personal canon, not a catalogue of everything touched.

## Operating Context

- Entries are authored as Markdown files in the repository, through Claude Code
  in conversation ("I finished X, an A"). There is no admin interface, no login
  and no content API by design.
- `git` is the storage, the history and the backup. The repository is public.
- The 73 initial entries were imported from four Notion databases, which the
  author kept irregularly and stopped updating.
- Cover images are sourced by hand, one at a time, and attached with a script.
  This is slow on purpose and will stay incomplete for long stretches.

## Capabilities and Constraints

- Static Astro site, no backend, no database, no runtime. One Markdown file per
  entry, validated by a Zod schema at build time: a malformed entry fails the
  build rather than reaching the site.
- Four statuses (`pending`, `active`, `done`, `dropped`) and a five-step verdict
  scale, **S A B C D**, inherited from the author's own Notion vocabulary. `S` is
  the top. A finished entry with no tier means "not decided yet".
- Per-medium units are stored in the units they are measured in: seasons and
  episodes, pages, hours, runtime, platforms.
- **The repository is public, so nothing private can live here.**
  `visibility: private` removes an entry from the deployed HTML at build time; it
  does not hide the Markdown from anyone reading the repository or its history.
- **No entry has a date.** Notion stored none, so chronological ordering,
  "finished this year" and any time-based statistic are impossible until dates
  are filled in by hand. The shelf currently sorts by status, then tier.

## Brand Commitments

- Name: **vitrine**.
- Interface language is Spanish (Spain). Code, commits and identifiers are
  English.
- The design token contract is shared with the author's `cheatsheets` project: a
  structural scale that themes may not redefine, a semantic colour layer, and the
  rule that a hex value outside a theme file is a bug.

## Evidence on Hand

Real, and the only content that exists:

- **73 entries**: 26 films, 15 series, 24 books, 8 games.
- **10 tier S**: Interstellar, Oppenheimer, Better Call Saul, Death Note, Gambito
  de Dama, Rick y Morty, Hábitos atómicos, Stardew Valley, Silksong, Hollow
  Knight.
- **1 cover image of 73** (Hollow Knight). The other 72 render a typographic
  fallback card.
- **0 reviews written.** Every entry body is empty today.
- **No dates, on any entry.**
- 15 of 24 books are unstarted.

Absences that must not be filled with invention: there are no ratings beyond the
tiers, no dates, no review text, no reader or visitor numbers, and no third-party
endorsement of any kind. An earlier set of 20 placeholder entries was deleted;
nothing fabricated remains.

## Product Principles

1. **One shelf, one scale.** The cross-media comparison is the product. Never
   split the four media into silos that cannot be seen together.
2. **The verdict is the content.** A tier is a claim the author is making. The
   site carries his judgements; it is not an inventory of everything he touched.
3. **Incompleteness is the normal state, not a defect.** At any moment most
   entries will lack a cover, a date or a review. Every surface must read as
   finished while the data behind it is partial.
4. **Reviews are load-bearing.** The author intends to write them, so entry pages
   are built around prose that mostly is not there yet — and must not look broken
   before it arrives.
5. **The backlog is a record of intentions, not a to-do list.** Unstarted things
   inform without competing with what was actually consumed.
6. **Adding an entry must stay cheap.** A tracker that is expensive to update
   stops being updated. Anything that raises the cost of recording one thing is a
   threat to the product.
