#!/usr/bin/env node
/**
 * Applies a reviewed lookup-metadata.mjs result to the entries.
 *
 * Deliberately conservative, because a wrong fact on a public page is worse than
 * a blank one:
 *   - never overwrites a value the entry already has;
 *   - skips anything the lookup flagged ambiguous or left unmatched;
 *   - skips a field whose sources disagree (two episode counts is not a value,
 *     it is two works sharing a title).
 *
 * Usage: node scripts/apply-metadata.mjs <medium> <lookup.json> [--fields by,episodes] [--dry]
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const [medium, jsonPath, ...rest] = process.argv.slice(2);
if (!medium || !jsonPath) {
  console.error("uso: node scripts/apply-metadata.mjs <medium> <lookup.json> [--fields a,b] [--dry]");
  process.exit(1);
}
const dry = rest.includes("--dry");
const only = rest.includes("--fields")
  ? rest[rest.indexOf("--fields") + 1].split(",").map((s) => s.trim())
  : null;

/** Which fields are numbers, so they are written unquoted and parsed. */
const NUMERIC = new Set(["episodes", "runtime", "pages", "year", "seasons"]);

const rows = JSON.parse(await readFile(jsonPath, "utf8"));
const written = [];
const skipped = [];

for (const r of rows) {
  const reasons = [];
  if (!r.qid) reasons.push("sin emparejar");
  if (r.ambiguous) reasons.push(`ambigua (${r.ambiguous.join(", ")})`);
  if (r.mismatch) reasons.push(`autoría no coincide (${r.mismatch})`);

  const path = join("src/content", medium, `${r.slug}.md`);
  const text = await readFile(path, "utf8");
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const lines = m[1].split("\n");
  const present = new Set(
    lines.map((l) => l.slice(0, l.indexOf(":")).trim()).filter(Boolean),
  );

  const additions = [];
  for (const [field, values] of Object.entries(r.values)) {
    if (only && !only.includes(field)) continue;
    if (!values.length) continue;
    if (present.has(field)) continue; // never overwrite what is already there
    if (NUMERIC.has(field)) {
      /* Dates arrive as full ISO strings, and stripping non-digits from
         "2011-10-25T00:00:00Z" yields 20111025000000. Take the year. */
      const toNum = (v) => {
        const str = String(v);
        const iso = str.match(/^(\d{4})-\d{2}-\d{2}/);
        return parseInt(iso ? iso[1] : str.replace(/\D/g, ""), 10);
      };
      const nums = [...new Set(values.map(toNum).filter((n) => Number.isFinite(n) && n > 0 && n < 100000))];
      if (nums.length !== 1) {
        reasons.push(`${field} contradictorio (${values.join(", ")})`);
        continue;
      }
      additions.push([field, nums[0]]);
    } else {
      additions.push([field, values.join(", ")]);
    }
  }

  if (reasons.length) {
    skipped.push([r.title, reasons.join("; ")]);
    continue;
  }
  if (!additions.length) {
    skipped.push([r.title, "nada nuevo que añadir"]);
    continue;
  }

  /* Insert after `by` when present, else after `year`, else at the end of the
     frontmatter: keeps the block readable instead of appending at random. */
  const anchor = lines.findIndex((l) => /^(by|year):/.test(l));
  const rendered = additions.map(([k, v]) =>
    NUMERIC.has(k) ? `${k}: ${v}` : `${k}: ${JSON.stringify(v)}`,
  );
  const at = anchor >= 0 ? anchor + 1 : lines.length;
  lines.splice(at, 0, ...rendered);

  if (!dry) await writeFile(path, `---\n${lines.join("\n")}\n---\n${m[2]}`, "utf8");
  written.push([r.title, rendered.join(" · ")]);
}

console.log(`${dry ? "[simulación] " : ""}escritas ${written.length}`);
for (const [t, w] of written) console.log(`  ${t.padEnd(36)} ${w}`);
console.log(`\nomitidas ${skipped.length}`);
for (const [t, why] of skipped) console.log(`  ${t.padEnd(36)} ${why}`);
