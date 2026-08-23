import { defineCollection, z, type SchemaContext } from "astro:content";
import { glob } from "astro/loaders";

/**
 * Modelled on the four Notion databases this replaces, with four deliberate
 * departures from them — each noted where it happens.
 *
 * Four collections share a spine and extend it with the units their medium is
 * actually measured in. Storing a normalised "percent complete" instead would
 * throw away the only numbers worth writing down.
 */

/**
 * Where a thing sits now — not how good it was, and not how many times you have
 * been back to it.
 *
 * Departure 1: Notion split this into six values. "Pendiente" and "Sin empezar"
 * were the same idea, kept apart only because the four databases were set up
 * separately (the films one does not even offer "Sin empezar"); they collapse
 * into `pending`. "De nuevo" conflated a state with a count — a status cannot
 * say *how many* times you went back — so it becomes `revisits` below.
 */
const status = z.enum(["pending", "active", "done", "dropped"]);

/**
 * The tier list, best to worst. Deliberately not a 1–10 scale: five buckets is
 * the resolution real judgement has, and a number would invent differences that
 * were never made.
 *
 * Departure 2: Notion's "Por decidir" is not a tier, it is the absence of one.
 * A finished entry with no tier renders as "por decidir" — derived, not stored,
 * so the two cannot drift apart.
 */
const tier = z.enum(["S", "A", "B", "C", "D"]);

const spine = (image: SchemaContext["image"]) =>
  z.object({
    title: z.string(),
    /** Mono subtitle: original title, subtitle, or edition. Never translated. */
    sub: z.string().optional(),
    /** Optional: seven imported books have no year, and a missing year is not an error. */
    year: z.number().int().optional(),
    /**
     * Director, author, studio, developer — the label varies by medium, the
     * field does not. Optional because the imported series carry no creator at
     * all: the Notion database had no such column.
     */
    by: z.string().optional(),
    status: status,
    tier: tier.optional(),
    /**
     * The single primary classification, at most one per entry — what you group
     * and filter by. `tags` below is the open-ended list. Two fields because a
     * primary category and a pile of labels are genuinely different things; the
     * imported books use this, everything else may later.
     */
    genre: z.string().optional(),
    tags: z.array(z.string()).default([]),
    /** Optional: no imported entry has a date. Fill them in and the timeline works. */
    started: z.coerce.date().optional(),
    finished: z.coerce.date().optional(),
    /** Rereads, rewatches, replays. 0 means "once through". */
    revisits: z.number().int().min(0).default(0),
    /** The short verdict shown on the card. One line, no spoilers. */
    hook: z.string().optional(),
    /** Colocated with the entry: `./dune.jpg`. Absent is a supported state. */
    cover: image().optional(),
    /**
     * Dominant colour of the cover, driving the detail page wash and the hover
     * glow. Falls back to the medium's accent when absent.
     */
    accent: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    /** The pieces worth keeping. Rendered as pull quotes on the detail page. */
    quotes: z.array(z.string()).default([]),
    /**
     * Private entries are dropped at build time, not hidden with CSS. The safest
     * place for a secret on a public site is out of the deployed HTML entirely.
     */
    visibility: z.enum(["public", "private"]).default("public"),
  });

/* Departure 3: there is no `canon` flag. Tier S already means "worth pressing on
   other people", and two fields for one idea drift apart. */

const films = (image: SchemaContext["image"]) =>
  spine(image).extend({
    runtime: z.number().int().positive().optional(),
  });

const series = (image: SchemaContext["image"]) =>
  spine(image).extend({
    seasons: z.number().int().positive().optional(),
    episodes: z.number().int().positive().optional(),
    /** How far in: [season, episode]. Reads better than two loose fields. */
    at: z.tuple([z.number().int(), z.number().int()]).optional(),
    episodesSeen: z.number().int().min(0).optional(),
  });

const books = (image: SchemaContext["image"]) =>
  spine(image).extend({
    pages: z.number().int().positive().optional(),
    pagesRead: z.number().int().min(0).optional(),
    /** Whether it is on an actual shelf. A fact about the object, not the text. */
    physical: z.boolean().default(false),
  });

const games = (image: SchemaContext["image"]) =>
  spine(image).extend({
    /**
     * Departure 4: a list, not a string. Hollow Knight is on PC *and* Switch,
     * and a single-value field silently loses one of them.
     */
    platforms: z.array(z.string()).default([]),
    hours: z.number().nonnegative().optional(),
    /** What "finished" meant for this one. Absent for anything unfinished. */
    completion: z.enum(["story", "story+extras", "full"]).optional(),
  });

const collection = (dir: string, schema: (i: SchemaContext["image"]) => z.ZodTypeAny) =>
  defineCollection({
    loader: glob({ pattern: "**/*.md", base: `./src/content/${dir}` }),
    schema: ({ image }) => schema(image),
  });

export const collections = {
  films: collection("films", films),
  series: collection("series", series),
  books: collection("books", books),
  games: collection("games", games),
};
