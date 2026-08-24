#!/usr/bin/env node
/**
 * Attaches jackets to the books that have none, from Open Library.
 *
 * Open Library is the only keyless source that covers this shelf, and the search
 * for one is worth recording so nobody repeats it:
 *   - Wikipedia's `pageimages` skips non-free files, and every poster, jacket and
 *     box art on it is non-free. Asking en.wikipedia for Interstellar, Titanic,
 *     Barbie or Stardew Valley returns *no image at all*; asking for Breaking Bad
 *     returns its 970×579 wordmark. The route yields logos, never artwork — for
 *     films, series and games as much as for books.
 *   - The anonymous Google Books quota is a shared pool, and it is spent.
 *   - iTunes Search no longer answers `media=movie`, and `media=tvShow` returns
 *     episode stills of whatever show it feels like.
 * Which leaves films, series and games with no keyless source at all.
 *
 * Its scans top out around 500px tall, which is soft under the 300px detail
 * tile at 2x — so rather than take the first record that matches, this walks
 * *every* edition whose author agrees with the entry's own and keeps the largest
 * scan any of them has. That is the difference between a 128px thumbnail and a
 * 500px jacket for the same book.
 *
 * The accent and the frontmatter write are delegated to add-cover.mjs: one
 * implementation of "what colour is this cover" is enough.
 *
 * Usage: node scripts/fetch-book-covers.mjs [--apply] [--dir <tmp>]
 */
import { readdir, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";

const run = promisify(execFile);
const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const tmp = argv.includes("--dir") ? argv[argv.indexOf("--dir") + 1] : ".cache/book-covers";

const UA = "vitrine-covers/1.0 (personal media tracker; one-off cover backfill)";
const MIN_WIDTH = 300; // below this the tile is mush, and a blank card beats mush
/* A jacket is portrait, roughly 1.4–1.6. Open Library also serves square art for
   audiobook and box-set records: taking the largest scan without this bound
   handed "Deep Work" a 500×500 audio cover of a different book entirely. */
const MIN_RATIO = 1.25;
const MAX_RATIO = 1.9;
const overrides = JSON.parse(await readFile("scripts/title-overrides.json", "utf8"));
/* Hand-picked artwork, for the cases where the search returns the right record
   and the wrong scan. `null` means leave the tile a title card on purpose. */
const picks = JSON.parse(await readFile("scripts/cover-overrides.json", "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const fold = (s) =>
  String(s).normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

const frontmatter = (text) => {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  const out = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"|"$/g, "");
  }
  return out;
};

/** Every edition whose author agrees with ours, newest-looking first. */
const editions = async (title, author) => {
  const params = new URLSearchParams({
    q: title, limit: "20", fields: "title,author_name,cover_i,edition_count",
  });
  const res = await fetch("https://openlibrary.org/search.json?" + params, {
    headers: { "User-Agent": UA },
  });
  if (!res.ok) return [];
  const docs = ((await res.json()).docs ?? []).filter((d) => d.cover_i);
  if (!author) return docs;
  const mine = fold(author).split(" ").filter((w) => w.length > 3);
  if (!mine.length) return docs;
  /* An author we know and no record agreeing means the search found a study
     guide or a different book with the same name — not our jacket. */
  return docs.filter((d) =>
    (d.author_name ?? []).some((a) => {
      const words = fold(a).split(" ");
      return mine.some((w) => words.includes(w));
    }));
};

/* Author agreement alone is not enough: an author's *other* books, and the
   omnibus editions they appear in, all pass it. "Deep Work" came back as
   "Crucial Conversations" that way. The edition's own title has to be this book:
   one contains the other once both are folded, which absorbs subtitles in either
   direction ("Endurance" vs "Endurance: A Year in Space"). */
const sameWork = (editionTitle, ...ours) => {
  const a = fold(editionTitle);
  if (!a) return false;
  return ours.filter(Boolean).some((t) => {
    const b = fold(t);
    return b.length > 3 && (a.includes(b) || b.includes(a));
  });
};

const measure = async (coverId) => {
  const url = `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  const meta = await sharp(buf).metadata().catch(() => null);
  if (!meta?.width) return null;
  return { buf, width: meta.width, height: meta.height, coverId };
};

await mkdir(tmp, { recursive: true });
const dir = "src/content/books";
const files = (await readdir(dir)).filter((f) => f.endsWith(".md")).sort();

const done = [];
const skipped = [];

for (const file of files) {
  const slug = file.replace(/\.md$/, "");
  const data = frontmatter(await readFile(join(dir, file), "utf8"));
  if (data.cover) continue;
  const title = overrides[`books/${slug}`] ?? data.title;

  const key = `books/${slug}`;
  if (key in picks) {
    if (picks[key] === null) {
      skipped.push({ slug, reason: "dropped by hand: the scan on offer is not this book's jacket" });
      console.log(`— ${slug.padEnd(46)} dropped by hand`);
      continue;
    }
    const shot = await measure(picks[key]);
    await sleep(150);
    if (!shot) {
      skipped.push({ slug, reason: `the chosen cover (${picks[key]}) no longer answers` });
      console.log(`✗ ${slug.padEnd(46)} chosen cover ${picks[key]} does not answer`);
      continue;
    }
    const staged = join(tmp, `${slug}.jpg`);
    await writeFile(staged, shot.buf);
    console.log(`✓ ${slug.padEnd(46)} ${shot.width}×${shot.height}  chosen by hand (${picks[key]})`);
    if (apply) {
      const { stdout } = await run("node", ["scripts/add-cover.mjs", "books", slug, staged]);
      console.log(`   → ${stdout.match(/accent\s+(\S+)/)?.[1] ?? "?"}`);
    }
    done.push({ slug, width: shot.width, height: shot.height });
    continue;
  }

  const docs = await editions(title, data.by);
  await sleep(200);

  /* Walk the editions this book actually has and keep the biggest jacket among
     them. Capped, because a popular title has dozens of editions and the
     twelfth is never the one that finally has a 1000px scan. */
  const candidates = docs.filter((d) => sameWork(d.title, title, data.title));
  let best = null;
  let rejected = 0;
  const seen = new Set();
  for (const doc of candidates.slice(0, 12)) {
    if (seen.has(doc.cover_i)) continue;
    seen.add(doc.cover_i);
    const shot = await measure(doc.cover_i);
    await sleep(150);
    if (!shot) continue;
    const ratio = shot.height / shot.width;
    if (ratio < MIN_RATIO || ratio > MAX_RATIO) { rejected++; continue; }
    if (!best || shot.width * shot.height > best.width * best.height) {
      best = { ...shot, title: doc.title, author: (doc.author_name ?? [])[0] };
    }
    if (best.width >= 600) break; // good enough; stop paying for requests
  }

  if (!best || best.width < MIN_WIDTH) {
    const why = best
      ? `${best.width}×${best.height}, under ${MIN_WIDTH}px`
      : rejected
        ? `${rejected} scan(s) with audiobook proportions, no jacket among them`
        : candidates.length
          ? "no usable scan"
          : `${docs.length} edition(s) by the author, none of this title`;
    skipped.push({ slug, reason: why });
    console.log(`— ${slug.padEnd(46)} ${why}`);
    continue;
  }

  const staged = join(tmp, `${slug}.jpg`);
  await writeFile(staged, best.buf);
  console.log(`✓ ${slug.padEnd(46)} ${best.width}×${best.height}  ${seen.size}/${candidates.length} ed.  ← ${best.title?.slice(0, 40)}`);

  if (apply) {
    const { stdout } = await run("node", ["scripts/add-cover.mjs", "books", slug, staged]);
    const accent = stdout.match(/accent\s+(\S+)/)?.[1] ?? "?";
    console.log(`   → ${accent}`);
  }
  done.push({ slug, width: best.width, height: best.height });
}

if (!apply) await rm(tmp, { recursive: true, force: true });

console.log(`\n${done.length} ${apply ? "jackets attached" : "jackets found"}, ${skipped.length} without one`);
for (const s of skipped) console.log(`   ${s.slug}: ${s.reason}`);
