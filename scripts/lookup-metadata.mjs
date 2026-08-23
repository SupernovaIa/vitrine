#!/usr/bin/env node
/**
 * Looks up facts about the *work* on Wikidata — never facts about the reader.
 *
 * Prints a review table and writes nothing. A wrong director on a public page is
 * worse than a blank one, so the write step is deliberately separate: eyeball the
 * matched Wikidata label against the entry title before anything is committed.
 *
 * Wikidata over the friendlier APIs because it is the only keyless source with
 * Spanish labels *and* aliases: this shelf holds "Gambito de Dama", while the
 * item is labelled "Gambito de Reina" and titled "The Queen's Gambit".
 *
 * Usage: node scripts/lookup-metadata.mjs <films|series|books|games> [--json out.json]
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const [medium, ...rest] = process.argv.slice(2);
const jsonOut = rest.includes("--json") ? rest[rest.indexOf("--json") + 1] : null;

/** Type constraint per medium, so a chess opening cannot answer for a TV series. */
const SHAPE = {
  films: { type: "wd:Q11424", props: { by: "P57", runtime: "P2047", genre: "P136" }, label: "película" },
  series: { type: "wd:Q5398426", props: { by: "P170", episodes: "P1113", genre: "P136" }, label: "serie" },
  books: { type: "wd:Q7725634", props: { by: "P50", pages: "P1104", year: "P577", genre: "P136" }, label: "obra escrita" },
  games: { type: "wd:Q7889", props: { by: "P178", genre: "P136" }, label: "videojuego" },
};

if (!SHAPE[medium]) {
  console.error("uso: node scripts/lookup-metadata.mjs <films|series|books|games> [--json out.json]");
  process.exit(1);
}
const shape = SHAPE[medium];

const dir = join("src/content", medium);
const files = (await readdir(dir)).filter((f) => f.endsWith(".md")).sort();

const frontmatter = (text) => {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  const out = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"|"$/g, "");
  }
  return out;
};

const UA = "vitrine-metadata/1.0 (personal media tracker; one-off backfill)";

const sparql = async (query) => {
  const res = await fetch("https://query.wikidata.org/sparql?" + new URLSearchParams({ query }), {
    headers: { "User-Agent": UA, Accept: "application/sparql-results+json" },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()).results.bindings;
};

/* Resolution is two steps, and the order matters.
   Matching rdfs:label directly is case-sensitive and exact, which lost "Bojack
   Horseman" (labelled "BoJack"), "Cómo Conocí a Vuestra Madre" and "Gambito de
   Dama" — and no mechanical re-casing fixes a capital in the middle of a word.
   So: use the search endpoint, which is case-insensitive, fuzzy and searches
   aliases, to get candidates; then ask SPARQL which of them is actually the right
   kind of thing, so a chess opening cannot answer for a TV series. */
const search = async (title, lang) => {
  const url = "https://www.wikidata.org/w/api.php?" + new URLSearchParams({
    action: "wbsearchentities", search: title, language: lang, uselang: lang,
    type: "item", limit: "12", format: "json", origin: "*",
  });
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return [];
  return ((await res.json()).search ?? []).map((r) => r.id);
};

/* Exact label or alias, constrained by type. This is the accurate path — it hit
   12 of 15 where the fuzzy search hit 6 — but it is case-sensitive, so it cannot
   find a capital in the middle of a word. Search is the fallback for those. */
const byLabel = async (title, year, lang) => {
  const props = Object.entries(shape.props)
    .map(([k, pr]) => `  OPTIONAL { ?item wdt:${pr} ?${k} . }`)
    .join("\n");
  const yearFilter = year
    ? `  OPTIONAL { ?item wdt:P577 ?pub . }\n  FILTER(!BOUND(?pub) || ABS(YEAR(?pub) - ${year}) <= 3)`
    : "";
  const query = `SELECT ?item ?itemLabel ${Object.keys(shape.props).map((k) => `?${k}Label`).join(" ")} WHERE {
  ?item rdfs:label|skos:altLabel ${JSON.stringify(title)}@${lang} .
  ?item wdt:P31/wdt:P279* ${shape.type} .
${props}
${yearFilter}
  SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
} LIMIT 20`;
  return sparql(query);
};

const claimsFor = async (qids, year) => {
  if (!qids.length) return [];
  const props = Object.entries(shape.props)
    .map(([k, p]) => `  OPTIONAL { ?item wdt:${p} ?${k} . }`)
    .join("\n");
  const values = qids.map((q) => `wd:${q}`).join(" ");
  const yearFilter = year
    ? `  OPTIONAL { ?item wdt:P577 ?pub . }\n  FILTER(!BOUND(?pub) || ABS(YEAR(?pub) - ${year}) <= 3)`
    : "";
  const query = `SELECT ?item ?itemLabel ${Object.keys(shape.props).map((k) => `?${k}Label`).join(" ")} WHERE {
  VALUES ?item { ${values} }
  ?item wdt:P31/wdt:P279* ${shape.type} .
${props}
${yearFilter}
  SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
}`;
  return sparql(query);
};

/* Wikidata's duration is not in one unit: Interstellar comes back as 169 and
   Oppenheimer as 10809, which is the same film length expressed in seconds.
   Anything over ten hours is not a runtime in minutes. */
const normaliseMinutes = (v) => {
  const n = parseInt(String(v).replace(/\D/g, ""), 10);
  if (!Number.isFinite(n)) return null;
  return n > 600 ? Math.round(n / 60) : n;
};

/* The label service sometimes hands back the raw entity id — "Q25191" instead of
   "Christopher Nolan". That is not a name. */
const isUnresolved = (v) => /^Q\d+$/.test(String(v).trim());

/* Fold accents and punctuation so "Thelma y Louise" can be compared with
   "Thelma & Louise", and surnames can be matched loosely. */
const fold = (s) =>
  String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

const results = [];
for (const file of files) {
  const data = frontmatter(await readFile(join(dir, file), "utf8"));
  const title = data.title;
  let rows = [];
  let err = null;
  try {
    /* Accurate path first. */
    for (const lang of ["es", "en"]) {
      rows = await byLabel(title, data.year, lang);
      if (rows.length) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    /* Fuzzy fallback only for what the exact match could not reach. */
    if (!rows.length) {
      const seen = new Set();
      for (const lang of ["es", "en"]) for (const q of await search(title, lang)) seen.add(q);
      if (seen.size) rows = await claimsFor([...seen], data.year);
    }
  } catch (e) {
    err = e.message;
  }

  const gather = (key) => {
    let vals = [...new Set(rows.map((r) => r[`${key}Label`]?.value).filter(Boolean))];
    vals = vals.filter((v) => !isUnresolved(v));
    if (key === "runtime") {
      vals = [...new Set(vals.map(normaliseMinutes).filter((n) => n && n > 5 && n < 400))].map(String);
    }
    return vals;
  };
  const qids = [...new Set(rows.map((r) => r.item.value.split("/").pop()))];

  /* Verification, where the entry already knows the answer. Films and books
     record their own author, so a Wikidata creator that disagrees means the
     title matched the wrong work — this is what caught the 1996 Titanic
     miniseries standing in for Cameron's 1997 film. Series had no such key,
     which is why they needed a human read instead. */
  let mismatch = null;
  if (data.by && rows.length) {
    const theirs = gather("by");
    if (theirs.length) {
      const mine = fold(data.by).split(" ").filter((w) => w.length > 3);
      const ok = theirs.some((t) => {
        const words = fold(t).split(" ");
        return mine.some((w) => words.includes(w));
      });
      if (!ok) mismatch = `${data.by} vs ${theirs.join(", ")}`;
    }
  }
  results.push({
    slug: file.replace(/\.md$/, ""),
    title,
    year: data.year,
    qid: qids[0] ?? null,
    /* More than one item answered: the title is ambiguous and a value picked
       here would be a coin flip. */
    ambiguous: qids.length > 1 ? qids : null,
    matched: rows[0]?.itemLabel?.value ?? null,
    mismatch,
    values: Object.fromEntries(Object.keys(shape.props).map((k) => [k, gather(k)])),
    have: Object.fromEntries(Object.keys(shape.props).map((k) => [k, data[k] ?? null])),
    error: err,
  });
  await new Promise((r) => setTimeout(r, 400)); // be a polite client
}

const pad = (s, n) => String(s ?? "").slice(0, n).padEnd(n);
const keys = Object.keys(shape.props);
console.log(`${pad("entrada", 30)} ${pad("QID", 11)} ${pad("etiqueta en Wikidata", 26)} ${keys.map((k) => pad(k, 22)).join(" ")}`);
for (const r of results) {
  console.log(
    `${pad(r.title, 30)} ${pad(r.qid ?? "SIN MATCH", 11)} ${pad(r.matched ?? "—", 26)} ` +
      keys.map((k) => pad(r.values[k].join(", ") || "—", 22)).join(" "),
  );
}
const hit = results.filter((r) => r.qid).length;
console.log(`\n${hit} de ${results.length} emparejadas`);
const suspicious = results.filter(
  (r) => r.matched && r.matched.toLowerCase() !== r.title.toLowerCase(),
);
const mismatched = results.filter((r) => r.mismatch);
if (mismatched.length) {
  console.log(`\nemparejamiento RECHAZADO — la autoría no coincide con la de la entrada:`);
  for (const r of mismatched) console.log(`  "${r.title}"  ->  ${r.mismatch}`);
}
const ambiguous = results.filter((r) => r.ambiguous);
if (ambiguous.length) {
  console.log(`\nambiguas — más de una obra responde al mismo título:`);
  for (const r of ambiguous) console.log(`  "${r.title}"  ->  ${r.ambiguous.join(", ")}`);
}
if (suspicious.length) {
  console.log(`\nrevisar a mano — la etiqueta no coincide con el título:`);
  for (const r of suspicious) console.log(`  "${r.title}"  ->  "${r.matched}" (${r.qid})`);
}
if (jsonOut) {
  await writeFile(jsonOut, JSON.stringify(results, null, 2));
  console.log(`\nescrito ${jsonOut}`);
}
