#!/usr/bin/env node
/**
 * Turns the Notion export into content entries, one Markdown file per thing.
 *
 * Idempotent: it wipes the four collection directories and regenerates them, so
 * re-running never leaves orphans from a previous shape. That also means it will
 * destroy hand-written reviews — once you start writing in these files, this
 * script has done its job and should not be run again.
 *
 * Usage: node scripts/import-notion.mjs
 */
import { readFile, writeFile, rm, mkdir, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const contentDir = join(root, "src/content");

/** Notion's six states collapse to four: see content.config.ts, departure 1. */
const STATUS = {
  "Hecho": "done",
  "De nuevo": "done",
  "En curso": "active",
  "Pendiente": "pending",
  "Sin empezar": "pending",
  "Dejada": "dropped",
};

/** "Por decidir" is the absence of a tier, not a value of it. */
const tierOf = (nota) => (nota && nota !== "Por decidir" ? nota : null);

const slugify = (title) =>
  title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const yaml = (key, value) => {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    return `${key}: [${value.map((v) => JSON.stringify(v)).join(", ")}]`;
  }
  if (typeof value === "number" || typeof value === "boolean") return `${key}: ${value}`;
  return `${key}: ${JSON.stringify(value)}`;
};

const entry = (fields) => {
  const lines = Object.entries(fields)
    .map(([k, v]) => yaml(k, v))
    .filter(Boolean);
  return `---\n${lines.join("\n")}\n---\n`;
};

const data = JSON.parse(await readFile(join(root, "scripts/notion-export.json"), "utf8"));

const build = {
  films: ([title, by, year, estado, nota]) => ({
    title,
    year,
    by,
    status: STATUS[estado],
    tier: tierOf(nota),
  }),
  series: ([title, seasons, year, estado, nota]) => ({
    title,
    year,
    status: STATUS[estado],
    tier: tierOf(nota),
    seasons,
  }),
  books: ([title, by, year, estado, nota, genero, physical]) => ({
    title,
    year,
    by,
    status: STATUS[estado],
    tier: tierOf(nota),
    genre: genero,
    physical,
  }),
  games: ([title, by, year, estado, nota, platforms]) => ({
    title,
    year,
    by,
    status: STATUS[estado],
    tier: tierOf(nota),
    platforms,
  }),
};

let written = 0;
const collisions = [];

for (const medium of ["films", "series", "books", "games"]) {
  const dir = join(contentDir, medium);
  /* Keep colocated cover images; only the Markdown is regenerated. */
  const existing = await readdir(dir).catch(() => []);
  await Promise.all(
    existing.filter((f) => f.endsWith(".md")).map((f) => rm(join(dir, f))),
  );
  await mkdir(dir, { recursive: true });

  const seen = new Set();
  for (const row of data[medium]) {
    const fields = build[medium](row);
    let slug = slugify(fields.title);
    if (seen.has(slug)) {
      collisions.push(`${medium}/${slug}`);
      slug = `${slug}-2`;
    }
    seen.add(slug);
    await writeFile(join(dir, `${slug}.md`), entry(fields), "utf8");
    written++;
  }
  console.log(`${medium.padEnd(7)} ${data[medium].length} entradas`);
}

console.log(`\n${written} ficheros escritos`);
if (collisions.length) console.log(`colisiones de slug resueltas: ${collisions.join(", ")}`);
