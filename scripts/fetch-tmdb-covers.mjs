#!/usr/bin/env node
/**
 * Attaches posters to the films and series that have none, without a key.
 *
 * Open Library closed the books; `fetch-book-covers.mjs` records why no keyless
 * source reached cine and series, and the conclusion there was "with a TMDB key
 * it closes in one go". The key turns out not to be needed, and the reasons are
 * worth keeping because each was checked rather than assumed:
 *
 *   - iTunes Search is still dead: `media=movie` and `media=tvShow` both answer
 *     `resultCount: 0` for Titanic, Interstellar, Barbie, Gattaca, Breaking Bad.
 *   - Wikipedia's non-free posters *are* reachable — `prop=images` lists them,
 *     it is only `pageimages` that skips them — but fair-use policy caps them
 *     around 275×362, under the 300px floor and far under add-cover.mjs's 480px
 *     warning. Reachable and still unusable.
 *   - **What works:** Wikidata stores the TMDB id itself (`P4947` for a film,
 *     `P4983` for a series), and image.tmdb.org serves artwork with no auth at
 *     all. Only the API is gated.
 *
 * So identity comes from Wikidata — structured, keyless, and already this
 * repo's source of truth in `lookup-metadata.mjs` — and the only thing taken
 * from TMDB's HTML is the poster path. That split matters: the fragile half
 * (scraping markup) decides nothing, it just carries a filename, and the half
 * that decides *which work this is* runs on a queryable database with dates to
 * disambiguate with. Four films are called Titanic; Wikidata separates them by
 * publication date, which a title search never could.
 *
 * The accent and the frontmatter write are delegated to add-cover.mjs: one
 * implementation of "what colour is this cover" is enough.
 *
 * Usage:
 *   node scripts/fetch-tmdb-covers.mjs                    # dry run, both media
 *   node scripts/fetch-tmdb-covers.mjs --apply
 *   node scripts/fetch-tmdb-covers.mjs --medium series
 *   node scripts/fetch-tmdb-covers.mjs --only titanic --id 597 --apply
 */
import { readdir, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";

const run = promisify(execFile);
const argv = process.argv.slice(2);
const flag = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : null);
const apply = argv.includes("--apply");
const tmp = flag("--dir") ?? ".cache/tmdb-covers";
const onlyMedium = flag("--medium");
const onlySlug = flag("--only");
const pinnedId = flag("--id");

if (pinnedId && !onlySlug) {
  console.error("--id pina una obra concreta, así que exige --only <slug>");
  process.exit(1);
}
if (onlyMedium && !["films", "series"].includes(onlyMedium)) {
  console.error(`--medium acepta films o series, no ${onlyMedium}`);
  process.exit(1);
}

const UA = "vitrine-covers/1.0 (personal media tracker; one-off cover backfill)";
/* The public pages answer to a browser string; a script UA gets a challenge
   page with no poster in it. Wikidata, by contrast, wants to be told who is
   asking, so the two fetches identify themselves differently on purpose. */
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/* 780px is the widest TMDB size below add-cover.mjs's own 900px ceiling, so the
   normaliser never upscales and never has much to throw away. */
const SIZE = "w780";
/* A poster is 2:3. The same page carries a 16:9 backdrop through the same CDN
   path, so the ratio is what tells them apart if the markup ever reorders. */
const MIN_RATIO = 1.35;
const MAX_RATIO = 1.7;

const KIND = { films: "movie", series: "tv" };
const PROP = { films: "P4947", series: "P4983" }; // TMDB film id / TMDB series id
const DATE = { films: "P577", series: "P580" };   // publication date / start time

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const overrides = JSON.parse(await readFile("scripts/title-overrides.json", "utf8"));

const frontmatter = (text) => {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  const out = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"|"$/g, "");
  }
  return out;
};

const fold = (s) =>
  String(s).normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/* A public endpoint under someone else's load: 429 and 502 are weather, not
   errors. Backing off and retrying is the difference between finishing and
   losing every poster resolved before the hiccup. */
const sparql = async (query, attempt = 0) => {
  const res = await fetch("https://query.wikidata.org/sparql?" + new URLSearchParams({ query }), {
    headers: { "User-Agent": UA, Accept: "application/sparql-results+json" },
  });
  if (res.ok) return (await res.json()).results.bindings;
  if (attempt < 3 && [429, 500, 502, 503, 504].includes(res.status)) {
    const wait = 1500 * 2 ** attempt;
    console.log(`   (Wikidata ${res.status}, reintento en ${wait / 1000}s)`);
    await sleep(wait);
    return sparql(query, attempt + 1);
  }
  throw new Error(`Wikidata ${res.status}`);
};

/**
 * Every work on Wikidata carrying a TMDB id whose label matches one of ours.
 * One query for the whole medium rather than one per entry: the label index
 * makes an exact-match VALUES cheap, and 30 round trips to a public endpoint
 * for data one round trip holds is rude.
 */
const candidates = async (medium, titles) => {
  const values = titles
    .flatMap((t) => [`"${t.replace(/"/g, '\\"')}"@es`, `"${t.replace(/"/g, '\\"')}"@en`])
    .join(" ");
  const rows = await sparql(`SELECT ?work ?label ?tmdb ?date WHERE {
    VALUES ?label { ${values} }
    ?work rdfs:label ?label ; wdt:${PROP[medium]} ?tmdb .
    OPTIONAL { ?work wdt:${DATE[medium]} ?date }
  }`);
  const byTitle = new Map();
  for (const r of rows) {
    const k = fold(r.label.value);
    if (!byTitle.has(k)) byTitle.set(k, []);
    byTitle.get(k).push({
      qid: r.work.value.split("/").pop(),
      tmdb: r.tmdb.value,
      label: r.label.value,
      year: r.date ? Number(r.date.value.slice(0, 4)) : null,
    });
  }
  return byTitle;
};

/**
 * Second pass, for the entries the exact label misses. Notion wrote its titles
 * in sentence case ("Before sunrise", "In time") and `rdfs:label` is
 * case-sensitive, so those never match; and a Spanish release title is often an
 * *alias* rather than a label — "El indomable Will Hunting" and "El castillo
 * ambulante" are both filed under other names. `wbsearchentities` is blind to
 * case and reads aliases, which covers both.
 *
 * It also returns books, songs and albums under the same words, so its hits are
 * only ever *proposals*: they go back through the same SPARQL that demands a
 * TMDB id and a date, and whatever fails that is not this work.
 */
const search = async (title) => {
  const url = "https://www.wikidata.org/w/api.php?" + new URLSearchParams({
    action: "wbsearchentities", format: "json", language: "es", uselang: "es",
    limit: "6", search: title, origin: "*",
  });
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return [];
  return ((await res.json()).search ?? []).map((h) => h.id);
};

/** The same shape as candidates(), for works already narrowed down to QIDs. */
const byQids = async (medium, qids) => {
  if (!qids.length) return [];
  const rows = await sparql(`SELECT ?work ?label ?tmdb ?date WHERE {
    VALUES ?work { ${qids.map((q) => `wd:${q}`).join(" ")} }
    ?work wdt:${PROP[medium]} ?tmdb .
    OPTIONAL { ?work wdt:${DATE[medium]} ?date }
    OPTIONAL { ?work rdfs:label ?label FILTER(LANG(?label) = "es") }
  }`);
  return rows.map((r) => ({
    qid: r.work.value.split("/").pop(),
    tmdb: r.tmdb.value,
    label: r.label?.value ?? r.work.value.split("/").pop(),
    year: r.date ? Number(r.date.value.slice(0, 4)) : null,
  }));
};

/** The one candidate this entry means, or an explanation of why none is. */
const resolve = (found, data) => {
  if (!found?.length) return { error: "sin ficha en Wikidata con id de TMDB" };
  /* De-duplicate: a work labelled the same in es and en arrives twice. */
  const seen = new Map();
  for (const c of found) if (!seen.has(c.qid)) seen.set(c.qid, c);
  const all = [...seen.values()];
  /* The year is checked even when only one candidate came back. Skipping it
     there is how `super-mario-bros` (year 2023, the animated film) matched the
     1993 live-action one: a lone candidate is not the same as a right one. */
  if (all.length === 1 && (!data.year || !all[0].year)) return { hit: all[0] };

  if (!data.year) {
    return { error: `${all.length} obras con ese título y la entrada no tiene year` +
      ` (${all.map((c) => `${c.tmdb}:${c.year ?? "?"}`).join(", ")})` };
  }
  const year = Number(data.year);
  /* Within a year: a film released in December reaches Spain in January, and
     Wikidata's date is the earliest release anywhere. */
  const close = all.filter((c) => c.year && Math.abs(c.year - year) <= 1);
  if (!close.length) {
    /* A candidate with no date at all is not evidence against itself, so it
       survives where a dated disagreement does not. */
    const undated = all.filter((c) => !c.year);
    if (undated.length === 1) return { hit: undated[0], ambiguous: all.length > 1 };
    return { error: `${all.length} obra(s), ninguna de ${year}` +
      ` (${all.map((c) => `${c.tmdb}:${c.year ?? "?"}`).join(", ")})` };
  }
  close.sort((a, b) => Math.abs(a.year - year) - Math.abs(b.year - year));
  return { hit: close[0], ambiguous: close.length > 1 };
};

/** The poster path off the public page. The first w500 on it is the poster. */
const posterPath = async (medium, id) => {
  const res = await fetch(`https://www.themoviedb.org/${KIND[medium]}/${id}`, {
    headers: { "User-Agent": BROWSER_UA, "Accept-Language": "es-ES,es;q=0.9" },
    redirect: "follow",
  });
  if (!res.ok) return null;
  const html = await res.text();
  return html.match(/\/t\/p\/w500(\/[A-Za-z0-9]+\.jpg)/)?.[1] ?? null;
};

await mkdir(tmp, { recursive: true });

const done = [];
const skipped = [];

for (const medium of onlyMedium ? [onlyMedium] : ["films", "series"]) {
  const dir = `src/content/${medium}`;
  const files = (await readdir(dir)).filter((f) => f.endsWith(".md")).sort();

  const pending = [];
  for (const file of files) {
    const slug = file.replace(/\.md$/, "");
    if (onlySlug && slug !== onlySlug) continue;
    const data = frontmatter(await readFile(join(dir, file), "utf8"));
    if (data.cover && !pinnedId) continue;
    /* A Q-number in the overrides pins a Wikidata item outright; anything else
       is the title the databases can actually reach. */
    const raw = overrides[`${medium}/${slug}`];
    pending.push({
      slug, data,
      qid: raw && /^Q\d+$/.test(raw) ? raw : null,
      title: raw && !/^Q\d+$/.test(raw) ? raw : data.title,
    });
  }
  if (!pending.length) continue;

  const lookup = pinnedId
    ? new Map()
    : await candidates(medium, [...new Set(pending.flatMap((p) => [p.title, p.data.title]))]);

  for (const { slug, data, title, qid } of pending) {
    const label = `${medium}/${slug}`;
    let id = pinnedId;
    let note = pinnedId ? "  ← a mano" : "";
    let named = "";

    if (!id) {
      let found = [...(lookup.get(fold(title)) ?? []), ...(lookup.get(fold(data.title)) ?? [])];
      if (!found.length) {
        const hits = qid ? [qid] : await search(title);
        await sleep(400); // the search endpoint answers 429 well before the query one
        found = await byQids(medium, hits).catch((e) => {
          console.log(`   (${e.message} al resolver ${slug})`);
          return [];
        });
        await sleep(200);
        if (found.length) note = "  ← por búsqueda, no por etiqueta";
      }
      /* A pinned QID overrides the title match: it exists precisely for the
         entries where no title disambiguates. */
      const byQid = qid ? found.filter((c) => c.qid === qid) : found;
      const got = resolve(byQid.length ? byQid : found, data);
      if (got.error) {
        skipped.push({ slug: label, reason: got.error });
        console.log(`— ${label.padEnd(46)} ${got.error}`);
        continue;
      }
      id = got.hit.tmdb;
      named = `${got.hit.label} (${got.hit.year ?? "?"})`;
      if (got.ambiguous) note += "  ← varios candidatos del mismo año";
    }

    const path = await posterPath(medium, id);
    await sleep(400); // a public page, not an API: go slowly
    if (!path) {
      skipped.push({ slug: label, reason: `la ficha ${id} no lleva póster` });
      console.log(`✗ ${label.padEnd(46)} la ficha ${id} no lleva póster`);
      continue;
    }

    const res = await fetch(`https://image.tmdb.org/t/p/${SIZE}${path}`, {
      headers: { "User-Agent": UA },
    });
    await sleep(150);
    if (!res.ok) {
      skipped.push({ slug: label, reason: `la imagen responde ${res.status}` });
      console.log(`✗ ${label.padEnd(46)} la imagen responde ${res.status}`);
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const meta = await sharp(buf).metadata().catch(() => null);
    const ratio = meta?.width ? meta.height / meta.width : 0;
    if (ratio < MIN_RATIO || ratio > MAX_RATIO) {
      const why = `${meta?.width ?? "?"}×${meta?.height ?? "?"}: no es un póster`;
      skipped.push({ slug: label, reason: why });
      console.log(`✗ ${label.padEnd(46)} ${why}`);
      continue;
    }

    const staged = join(tmp, `${medium}-${slug}.jpg`);
    await writeFile(staged, buf);
    console.log(`✓ ${label.padEnd(46)} ${meta.width}×${meta.height}  tmdb:${id}  ${named}${note}`);

    if (apply) {
      const { stdout } = await run("node", ["scripts/add-cover.mjs", medium, slug, staged]);
      console.log(`   → ${stdout.match(/accent\s+(\S+)/)?.[1] ?? "?"}`);
    }
    done.push({ slug: label, id });
  }
}

if (!apply) await rm(tmp, { recursive: true, force: true });

console.log(`\n${done.length} con póster${apply ? " aplicado" : " localizado"}, ${skipped.length} sin él`);
for (const s of skipped) console.log(`   ${s.slug}: ${s.reason}`);
if (!apply && done.length) console.log("\nrepasa los títulos de arriba y vuelve con --apply");
