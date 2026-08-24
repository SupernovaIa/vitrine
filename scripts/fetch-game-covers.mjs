#!/usr/bin/env node
/**
 * Attaches box art to the games that have none, without a key.
 *
 * Same split as `fetch-tmdb-covers.mjs` — identity from a queryable source, the
 * image from an open CDN — but games need two stores rather than one, and the
 * shelf's own `platforms` field is why: three of these are Switch exclusives
 * that Steam has never heard of, and two are PC games the eShop has never heard
 * of. Neither store covers the shelf alone.
 *
 *   - **Steam**, for anything with a Steam AppID (`P1733` on Wikidata):
 *     `library_600x900_2x.jpg` is exactly 600×900, which is the 2:3 the grid
 *     crops to, so nothing is lost.
 *   - **The European eShop**, for the rest. Its search is open, it answers in
 *     Spanish, and `image_url` is the *packshot* — the physical box, 500×809.
 *     Not the 2:1 banner or the 1:1 square that sit next to it in the same
 *     record, both of which would be mangled by a 2:3 crop.
 *
 * Neither store's ranking can be trusted on its own: "Mario Kart 8 Deluxe"
 * returns the 2014 Wii U game first. So a candidate has to match the entry's
 * title exactly once folded *and* its year, which is the same guard that caught
 * `super-mario-bros` matching the 1993 film.
 *
 * The accent and the frontmatter write are delegated to add-cover.mjs: one
 * implementation of "what colour is this cover" is enough.
 *
 * Usage:
 *   node scripts/fetch-game-covers.mjs                  # dry run
 *   node scripts/fetch-game-covers.mjs --apply
 *   node scripts/fetch-game-covers.mjs --only isaac --steam 250900 --apply
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
const tmp = flag("--dir") ?? ".cache/game-covers";
const onlySlug = flag("--only");
const pinnedSteam = flag("--steam");

if (pinnedSteam && !onlySlug) {
  console.error("--steam pina un AppID, así que exige --only <slug>");
  process.exit(1);
}

const UA = "vitrine-covers/1.0 (personal media tracker; one-off cover backfill)";
const MIN_WIDTH = 480;  // below this add-cover.mjs itself warns the tile goes soft
const MIN_RATIO = 1.25; // a box is portrait; a banner or a square is not
const MAX_RATIO = 1.9;

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
   errors. Backing off is the difference between finishing and losing the run. */
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

/** Steam AppIDs for every work labelled like one of ours, in one query. */
const steamIds = async (titles) => {
  const values = titles
    .flatMap((t) => [`"${t.replace(/"/g, '\\"')}"@es`, `"${t.replace(/"/g, '\\"')}"@en`])
    .join(" ");
  const rows = await sparql(`SELECT ?work ?label ?steam ?date WHERE {
    VALUES ?label { ${values} }
    ?work rdfs:label ?label ; wdt:P1733 ?steam .
    OPTIONAL { ?work wdt:P577 ?date }
  }`);
  const byTitle = new Map();
  for (const r of rows) {
    const k = fold(r.label.value);
    if (!byTitle.has(k)) byTitle.set(k, []);
    byTitle.get(k).push({
      appid: r.steam.value,
      label: r.label.value,
      year: r.date ? Number(r.date.value.slice(0, 4)) : null,
    });
  }
  return byTitle;
};

/**
 * Second pass for the titles no exact label reaches — "The Binding of Isaac:
 * Rebirth" is filed on Wikidata without its leading article.
 * `wbsearchentities` reads aliases and ignores case, and its proposals go back
 * through the same query that demands an AppID.
 */
const search = async (title) => {
  const ask = async (q, attempt = 0) => {
    const url = "https://www.wikidata.org/w/api.php?" + new URLSearchParams({
      action: "wbsearchentities", format: "json", language: "es", uselang: "es",
      limit: "6", search: q, origin: "*",
    });
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.ok) return ((await res.json()).search ?? []).map((h) => h.id);
    /* This endpoint rate-limits well before the query one, and a swallowed 429
       is worse than a crash: the entry falls through to the eShop and gets
       blamed on the eShop, which never saw it. */
    if (attempt < 3 && [429, 500, 502, 503, 504].includes(res.status)) {
      const wait = 1500 * 2 ** attempt;
      console.log(`   (búsqueda ${res.status}, reintento en ${wait / 1000}s)`);
      await sleep(wait);
      return ask(q, attempt + 1);
    }
    throw new Error(`búsqueda de Wikidata ${res.status}`);
  };
  const hits = await ask(title);
  if (hits.length) return hits;
  /* The search matches on prefix, so an article the item does not carry loses
     it outright — not ranked low, absent. The shelf used to call this game "The
     Cult of the Lamb" and the search returned nothing at all for it; the title
     has since been corrected, but any entry can pick up a stray article, so the
     retry stays. Dropping it is safe because whatever comes back still has to
     survive the AppID and year checks. */
  const bare = title.replace(/^(the|el|la|los|las) /i, "");
  if (bare === title) return [];
  await sleep(300);
  return ask(bare);
};

const steamByQids = async (qids) => {
  if (!qids.length) return [];
  const rows = await sparql(`SELECT ?work ?label ?steam ?date WHERE {
    VALUES ?work { ${qids.map((q) => `wd:${q}`).join(" ")} }
    ?work wdt:P1733 ?steam .
    OPTIONAL { ?work wdt:P577 ?date }
    OPTIONAL { ?work rdfs:label ?label FILTER(LANG(?label) = "es") }
  }`);
  return rows.map((r) => ({
    appid: r.steam.value,
    label: r.label?.value ?? r.work.value.split("/").pop(),
    year: r.date ? Number(r.date.value.slice(0, 4)) : null,
  }));
};

/** Steam publishes two sizes of the same library art; take the larger. */
const fromSteam = async (appid) => {
  for (const file of ["library_600x900_2x.jpg", "library_600x900.jpg"]) {
    const res = await fetch(`https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/${file}`, {
      headers: { "User-Agent": UA },
    });
    await sleep(150);
    if (res.ok) return { buf: Buffer.from(await res.arrayBuffer()), where: `steam:${appid}` };
  }
  return null;
};

/**
 * The packshot off the European eShop. `image_url` is the box; the `_h2x1_` and
 * `_sq_` siblings in the same record are a banner and a square, and a 2:3 crop
 * of either loses the artwork the box was designed around.
 */
const fromEshop = async (title, year) => {
  const url = "https://search.nintendo-europe.com/es/select?" + new URLSearchParams({
    q: title, fq: "type:GAME", rows: "24", wt: "json",
  });
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  await sleep(250);
  if (!res.ok) return { error: `el eShop responde ${res.status}` };
  const docs = (await res.json()).response?.docs ?? [];

  /* `image_url` is *usually* the packshot but not always: Nintendo has been
     retiring box art for digital-first listings, and those records serve the
     square there instead. The path says which it is, so ask rather than crop a
     square into a 2:3 tile and call it a cover. */
  const isPackshot = (u) => /\/packshots\//.test(u) || /\/PS_[^/]*$/.test(u);
  const named = docs.filter((d) => fold(d.title) === fold(title));
  if (!named.length) {
    return { error: docs.length
      ? `${docs.length} resultado(s) en el eShop, ninguno con ese título exacto`
      : "sin resultados en el eShop" };
  }
  const dated = (d) => Number((d.dates_released_dts ?? [])[0]?.slice(0, 4)) || null;
  /* Relevance puts "Mario Kart 8" (Wii U, 2014) above "Mario Kart 8 Deluxe",
     so the year is what decides, not the order. */
  const close = year ? named.filter((d) => dated(d) && Math.abs(dated(d) - year) <= 1) : named;
  if (!close.length) {
    return { error: `${named.length} con ese título, ninguno de ${year}` +
      ` (${named.map((d) => dated(d) ?? "?").join(", ")})` };
  }
  const doc = close.find((d) => d.image_url && isPackshot(d.image_url));
  if (!doc) {
    return { error: "su ficha del eShop ya no tiene packshot, solo cuadrado y banner" };
  }
  const img = await fetch(doc.image_url, { headers: { "User-Agent": UA } });
  await sleep(150);
  if (!img.ok) return { error: `el packshot responde ${img.status}` };
  return {
    buf: Buffer.from(await img.arrayBuffer()),
    where: `eshop:${(doc.system_names_txt ?? ["?"])[0]}`,
    label: `${doc.title} (${dated(doc) ?? "?"})`,
  };
};

await mkdir(tmp, { recursive: true });

const dir = "src/content/games";
const files = (await readdir(dir)).filter((f) => f.endsWith(".md")).sort();

const pending = [];
for (const file of files) {
  const slug = file.replace(/\.md$/, "");
  if (onlySlug && slug !== onlySlug) continue;
  const data = frontmatter(await readFile(join(dir, file), "utf8"));
  if (data.cover && !pinnedSteam) continue;
  const raw = overrides[`games/${slug}`];
  pending.push({ slug, data, title: raw && !/^Q\d+$/.test(raw) ? raw : data.title });
}

const lookup = pending.length && !pinnedSteam
  ? await steamIds([...new Set(pending.flatMap((p) => [p.title, p.data.title]))])
  : new Map();

const done = [];
const skipped = [];

for (const { slug, data, title } of pending) {
  const label = `games/${slug}`;
  const year = data.year ? Number(data.year) : null;
  let got = null;
  let why = "";

  if (pinnedSteam) {
    got = await fromSteam(pinnedSteam);
    why = got ? "" : `el AppID ${pinnedSteam} no tiene arte de biblioteca`;
  } else {
    let hits = [...(lookup.get(fold(title)) ?? []), ...(lookup.get(fold(data.title)) ?? [])];
    if (!hits.length) {
      try {
        hits = await steamByQids(await search(title));
      } catch (e) {
        /* Never let a lookup failure masquerade as "not on Steam": that sends
           a PC game to the eShop and reports the eShop's confusion as the cause. */
        skipped.push({ slug: label, reason: e.message });
        console.log(`✗ ${label.padEnd(40)} ${e.message}`);
        continue;
      }
      await sleep(600); // the search endpoint rate-limits well before the query one
    }
    const seen = new Map();
    for (const h of hits) if (!seen.has(h.appid)) seen.set(h.appid, h);
    const steam = [...seen.values()].filter((h) => !year || !h.year || Math.abs(h.year - year) <= 1);
    if (steam.length === 1) got = await fromSteam(steam[0].appid);
    else if (steam.length > 1) why = `${steam.length} AppIDs para ese título y año`;

    /* Nothing on Steam is the normal case here, not a failure: a Switch
       exclusive has no AppID to find. */
    if (!got && !why) {
      const eshop = await fromEshop(title, year);
      if (eshop.error) why = eshop.error;
      else got = eshop;
    }
  }

  if (!got) {
    skipped.push({ slug: label, reason: why || "sin arte en ninguna de las dos tiendas" });
    console.log(`— ${label.padEnd(40)} ${why || "sin arte"}`);
    continue;
  }

  const meta = await sharp(got.buf).metadata().catch(() => null);
  const ratio = meta?.width ? meta.height / meta.width : 0;
  if (!meta?.width || meta.width < MIN_WIDTH || ratio < MIN_RATIO || ratio > MAX_RATIO) {
    const bad = `${meta?.width ?? "?"}×${meta?.height ?? "?"}: no es una caja utilizable`;
    skipped.push({ slug: label, reason: bad });
    console.log(`✗ ${label.padEnd(40)} ${bad}`);
    continue;
  }

  const staged = join(tmp, `${slug}.jpg`);
  await writeFile(staged, got.buf);
  console.log(`✓ ${label.padEnd(40)} ${meta.width}×${meta.height}  ${got.where}` +
    `${got.label ? `  ← ${got.label}` : ""}`);

  if (apply) {
    const { stdout } = await run("node", ["scripts/add-cover.mjs", "games", slug, staged]);
    console.log(`   → ${stdout.match(/accent\s+(\S+)/)?.[1] ?? "?"}`);
  }
  done.push({ slug: label });
}

if (!apply) await rm(tmp, { recursive: true, force: true });

console.log(`\n${done.length} con caja${apply ? " aplicada" : " localizada"}, ${skipped.length} sin ella`);
for (const s of skipped) console.log(`   ${s.slug}: ${s.reason}`);
if (!apply && done.length) console.log("\nrepasa los títulos de arriba y vuelve con --apply");
