#!/usr/bin/env node
/**
 * Books, from Open Library rather than Wikidata.
 *
 * Wikidata matched 8 of these 24 and carried no page count at all — the property
 * exists but is barely populated. Open Library is the catalogue built for this:
 * it has page counts, first publication years, and the author, which doubles as
 * the verification key since every book here already records its own.
 *
 * Prints a review table and writes nothing.
 * Usage: node scripts/lookup-books.mjs [--json out.json]
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const jsonOut = process.argv.includes("--json")
  ? process.argv[process.argv.indexOf("--json") + 1]
  : null;

const dir = "src/content/books";
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

const fold = (s) =>
  String(s).normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

const results = [];
for (const file of files) {
  const data = frontmatter(await readFile(join(dir, file), "utf8"));
  const url = "https://openlibrary.org/search.json?" + new URLSearchParams({
    title: data.title,
    ...(data.by ? { author: data.by } : {}),
    fields: "title,author_name,first_publish_year,number_of_pages_median,key",
    limit: "5",
  });
  let docs = [];
  let err = null;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "vitrine-metadata/1.0" } });
    docs = res.ok ? ((await res.json()).docs ?? []) : [];
  } catch (e) {
    err = e.message;
  }

  /* Trust a hit only when an author surname actually agrees: searching by author
     narrows it, but Open Library still returns near-misses. */
  const mine = fold(data.by ?? "").split(" ").filter((w) => w.length > 3);
  const good = docs.find((d) => {
    const theirs = fold((d.author_name ?? []).join(" ")).split(" ");
    return mine.length === 0 || mine.some((w) => theirs.includes(w));
  });

  /* Two failure modes the author check waves through:
       - a graded-reader "adaptation" credits the original author, so 1984 came
         back as a 72-page abridgement;
       - Open Library sometimes lists the publisher in author_name, which then
         matches nothing meaningful.
     Both produce a plausible-looking page count for the wrong book. */
  const suspect = good
    ? /\badaptation\b|\badaptaci/i.test(good.title ?? "") ||
      /editorial|publish/i.test((good.author_name ?? []).join(" ")) ||
      (good.number_of_pages_median && good.number_of_pages_median < 90)
    : false;

  results.push({
    slug: file.replace(/\.md$/, ""),
    title: data.title,
    matched: good?.title ?? null,
    suspect: suspect || null,
    key: good?.key ?? null,
    author: (good?.author_name ?? []).join(", ") || null,
    values: {
      pages: good?.number_of_pages_median && !suspect ? [String(good.number_of_pages_median)] : [],
      year: good?.first_publish_year ? [String(good.first_publish_year)] : [],
    },
    have: { pages: data.pages ?? null, year: data.year ?? null },
    mismatch: suspect ? "emparejamiento sospechoso (adaptación, editorial como autor, o muy pocas páginas)" : null,
    ambiguous: null,
    qid: good?.key ?? null,
    error: err,
  });
  await new Promise((r) => setTimeout(r, 350));
}

const pad = (s, n) => String(s ?? "").slice(0, n).padEnd(n);
console.log(`${pad("entrada", 34)} ${pad("Open Library", 32)} ${pad("autor", 22)} ${pad("pág.", 6)} año`);
for (const r of results) {
  console.log(
    `${pad(r.title, 34)} ${pad(r.matched ?? "SIN MATCH", 32)} ${pad(r.author ?? "—", 22)} ` +
      `${pad(r.values.pages[0] ?? "—", 6)} ${r.values.year[0] ?? "—"}` +
      (r.have.year && r.values.year[0] && r.have.year !== r.values.year[0] ? `  (tienes ${r.have.year})` : ""),
  );
}
const hit = results.filter((r) => r.matched).length;
const withPages = results.filter((r) => r.values.pages.length).length;
console.log(`\n${hit} de ${results.length} emparejados · ${withPages} con recuento de páginas`);
if (jsonOut) {
  await writeFile(jsonOut, JSON.stringify(results, null, 2));
  console.log(`escrito ${jsonOut}`);
}
