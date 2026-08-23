import { getCollection, type CollectionEntry } from "astro:content";

export type Medium = "films" | "series" | "books" | "games";
export type Tier = "S" | "A" | "B" | "C" | "D";

/**
 * The one place a medium's vocabulary lives. Components ask this table instead
 * of branching on the type, so adding a fifth medium (cómics, discos) is a new
 * row plus a collection — not a hunt through every template for `=== "books"`.
 */
export const MEDIA: Record<
  Medium,
  { label: string; one: string; byLabel: string; glyph: string }
> = {
  films: { label: "Películas", one: "Película", byLabel: "Dirección", glyph: "◐" },
  series: { label: "Series", one: "Serie", byLabel: "Creación", glyph: "▤" },
  books: { label: "Libros", one: "Libro", byLabel: "Autoría", glyph: "▮" },
  games: { label: "Juegos", one: "Juego", byLabel: "Estudio", glyph: "◈" },
};

export const STATUS: Record<string, { label: string; short: string; rank: number }> = {
  done: { label: "Terminado", short: "Hecho", rank: 0 },
  active: { label: "En curso", short: "En curso", rank: 1 },
  pending: { label: "Pendiente", short: "Pendiente", rank: 2 },
  dropped: { label: "Abandonado", short: "Dejado", rank: 3 },
};

/**
 * The tier list. `rank` orders it; the colour token per tier matches the colours
 * the Notion database already used, so the scale looks like the one it replaces.
 */
export const TIERS: Record<Tier, { rank: number; label: string }> = {
  S: { rank: 0, label: "Imprescindible" },
  A: { rank: 1, label: "Muy bueno" },
  B: { rank: 2, label: "Bueno" },
  C: { rank: 3, label: "Regular" },
  D: { rank: 4, label: "Malo" },
};

export const TIER_ORDER: Tier[] = ["S", "A", "B", "C", "D"];

/** A single entry from any of the four collections, tagged with where it came from. */
export type Item = {
  medium: Medium;
  slug: string;
  url: string;
  data: CollectionEntry<Medium>["data"] & Record<string, unknown>;
  body: string;
  render: CollectionEntry<Medium>;
};

const MEDIA_ORDER: Medium[] = ["films", "series", "books", "games"];

/**
 * Every public entry across every medium.
 *
 * `visibility: private` is dropped here rather than in a template, so a new page
 * cannot leak a private entry by forgetting to filter. This is the only door to
 * the content, and it is locked on the way out.
 */
export async function allItems(): Promise<Item[]> {
  const groups = await Promise.all(
    MEDIA_ORDER.map(async (medium) => {
      const entries = await getCollection(medium, (e) => e.data.visibility === "public");
      return entries.map((entry) => ({
        medium,
        slug: entry.id,
        url: `/${medium}/${entry.id}/`,
        data: entry.data as Item["data"],
        body: entry.body ?? "",
        render: entry,
      }));
    }),
  );
  return groups.flat().sort(shelfOrder);
}

export function tierOf(item: Item): Tier | undefined {
  return item.data.tier as Tier | undefined;
}

const tierRank = (item: Item) => {
  const t = tierOf(item);
  return t ? TIERS[t].rank : 99;
};

/**
 * Default shelf order: finished first, then in flight, then the backlog; and
 * within each, newest release first.
 *
 * Deliberately *not* sorted by tier. It used to be, and that made the first ten
 * shelf cards a verbatim copy of the Tier S row above them — same items, same
 * order. Release year is the only temporal axis this data has (no entry records
 * when it was consumed), and ordering by it mixes the media and the tiers, which
 * is what the shelf is for. The canon lives in its own row.
 *
 * Undated entries sort last rather than first: `?? 0` would have put the seven
 * yearless books at the top of the backlog.
 */
function shelfOrder(a: Item, b: Item) {
  const byStatus = (STATUS[a.data.status]?.rank ?? 9) - (STATUS[b.data.status]?.rank ?? 9);
  if (byStatus !== 0) return byStatus;
  const ya = (a.data.year as number) ?? -Infinity;
  const yb = (b.data.year as number) ?? -Infinity;
  if (ya !== yb) return yb - ya;
  const byTier = tierRank(a) - tierRank(b);
  if (byTier !== 0) return byTier;
  return (a.data.title as string).localeCompare(b.data.title as string, "es");
}

/**
 * Where to go next from an entry, by rule rather than by hand — an entry page
 * with one outbound link is a dead end, and nothing here can depend on data the
 * author has not written yet.
 *
 * Same tier first, and across media on purpose: "other things I rated this
 * highly" is the comparison no single-medium tracker can make, and it is the
 * whole positioning claim. Same medium fills the rest.
 */
export function siblingsOf(item: Item, all: Item[], limit = 6): Item[] {
  const others = all.filter((i) => i.url !== item.url);
  const tier = tierOf(item);
  const sameTier = tier ? others.filter((i) => tierOf(i) === tier) : [];
  const sameMedium = others.filter(
    (i) => i.medium === item.medium && !sameTier.includes(i),
  );
  return [...sameTier, ...sameMedium].slice(0, limit);
}

/** Tier S, the things worth pressing on other people. Best first. */
export function canon(items: Item[]): Item[] {
  return items.filter((i) => tierOf(i) === "S");
}

/**
 * True when something is finished but unrated — Notion's "Por decidir", derived
 * rather than stored so the two cannot disagree.
 */
export function undecided(item: Item): boolean {
  return item.data.status === "done" && !item.data.tier;
}

/**
 * How far through it we are, 0–1, or null when the medium has no meaningful
 * midpoint (a film is not 40% watched, it is watched or it is not).
 */
export function progressOf(item: Item): number | null {
  if (item.data.status !== "active") return null;
  const d = item.data;
  if (item.medium === "books" && d.pages && d.pagesRead != null) {
    return clamp((d.pagesRead as number) / (d.pages as number));
  }
  if (item.medium === "series" && d.episodes && d.episodesSeen != null) {
    return clamp((d.episodesSeen as number) / (d.episodes as number));
  }
  return null;
}

const clamp = (n: number) => Math.max(0, Math.min(1, n));

/** "T2 E4", "184/416 pág.", "23 h" — progress in the units it was measured in. */
export function progressLabel(item: Item): string | null {
  /* Progress is only news while something is in flight. */
  if (item.data.status !== "active") return null;
  const d = item.data;
  if (item.medium === "series" && Array.isArray(d.at)) {
    const [season, episode] = d.at as [number, number];
    return `T${season} E${episode}`;
  }
  if (item.medium === "books" && d.pagesRead != null) {
    return d.pages ? `${d.pagesRead}/${d.pages} pág.` : `${d.pagesRead} pág.`;
  }
  if (item.medium === "games" && d.hours != null) return `${d.hours} h`;
  return null;
}

/**
 * The metadata line: year, author, and whatever unit the medium counts in.
 *
 * `compact` drops that last part, for the caption under a card. At 185px wide,
 * "2017 · Team Cherry · PC · Switch" wraps to two cramped lines — and the detail
 * page carries the full record anyway.
 */
export function metaLine(item: Item, { compact = false } = {}): string {
  const d = item.data;
  const bits: (string | undefined)[] = [
    d.year ? String(d.year) : undefined,
    d.by as string | undefined,
  ];
  if (compact) return bits.filter(Boolean).join(" · ");
  if (item.medium === "films" && d.runtime) bits.push(`${d.runtime} min`);
  if (item.medium === "series" && d.seasons)
    bits.push(`${d.seasons} ${d.seasons === 1 ? "temporada" : "temporadas"}`);
  if (item.medium === "books" && d.pages) bits.push(`${d.pages} pág.`);
  if (item.medium === "games" && (d.platforms as string[])?.length)
    bits.push((d.platforms as string[]).join(" · "));
  return bits.filter(Boolean).join(" · ");
}

/** Accent for an item: its own extracted colour, else the medium's. */
export function accentOf(item: Item): string {
  return (item.data.accent as string) ?? `var(--medium-${item.medium})`;
}

export type Stats = {
  total: number;
  done: number;
  byMedium: { medium: Medium; done: number; total: number }[];
  byTier: { tier: Tier; count: number }[];
  canon: number;
};

/** Headline numbers. Counts what is finished, not what is owned. */
export function statsOf(items: Item[]): Stats {
  return {
    total: items.length,
    done: items.filter((i) => i.data.status === "done").length,
    byMedium: MEDIA_ORDER.map((medium) => {
      const of = items.filter((i) => i.medium === medium);
      return {
        medium,
        done: of.filter((i) => i.data.status === "done").length,
        total: of.length,
      };
    }),
    byTier: TIER_ORDER.map((tier) => ({
      tier,
      count: items.filter((i) => tierOf(i) === tier).length,
    })),
    canon: canon(items).length,
  };
}
