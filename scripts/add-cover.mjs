#!/usr/bin/env node
/**
 * Attaches a cover to an entry: normalises the image, derives the accent colour
 * from it, and writes both into the entry's frontmatter.
 *
 * Usage: node scripts/add-cover.mjs <medium> <slug> <image> [--accent #rrggbb]
 *   node scripts/add-cover.mjs games hollow-knight ~/Downloads/hk.png
 */
import { readFile, writeFile, access, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const forcedAccent = argv.includes("--accent") ? argv[argv.indexOf("--accent") + 1] : null;
const [medium, slug, imagePath] = argv;

if (forcedAccent && !/^#[0-9a-fA-F]{6}$/.test(forcedAccent)) {
  console.error(`--accent expects #rrggbb, not ${forcedAccent}`);
  process.exit(1);
}

if (!medium || !slug || !imagePath) {
  console.error("usage: node scripts/add-cover.mjs <medium> <slug> <image>");
  process.exit(1);
}

const entry = join(root, "src/content", medium, `${slug}.md`);
await access(entry).catch(() => {
  console.error(`no such entry: ${entry}`);
  process.exit(1);
});

/**
 * 900px is the ceiling worth storing: the largest the cover is ever displayed is
 * 300 CSS px on the detail page, so 900 covers a 3x screen with room to spare.
 * Astro re-encodes to AVIF/WebP at build time, so the source only decides repo
 * size — hence JPEG, which turns an 800 KB PNG into ~100 KB with no visible
 * loss at poster size. Never upscales.
 */
const MAX_WIDTH = 900;
const out = join(root, "src/content", medium, `${slug}.jpg`);

const input = sharp(resolve(imagePath.replace(/^~/, process.env.HOME ?? "~")));
const meta = await input.metadata();

if (meta.width < 480) {
  console.warn(
    `⚠ ${meta.width}px wide: under 480 it goes soft in the featured row`,
  );
}

/* JPEG has no alpha, and sharp's default when it drops one is black. A box-art
   render arrives as a PNG cut out against nothing, so that default would give
   Arceus a black surround next to the white one every other Nintendo packshot
   has. White is the ground the boxes are photographed on; say so rather than
   inherit a colour nobody chose. */
await input
  .clone()
  .resize({ width: Math.min(meta.width, MAX_WIDTH), withoutEnlargement: true })
  .flatten({ background: "#ffffff" })
  .jpeg({ quality: 88, mozjpeg: true })
  .toFile(out);

const written = await sharp(out).metadata();

/**
 * The accent is a *mark* colour — it draws the detail page wash, the hover glow
 * and the fallback tint.
 *
 * `stats().dominant` is the wrong tool for it: on a poster it returns the most
 * common colour, which is the dark background (#080808 for Hollow Knight). Worse,
 * saturating a grey invents a hue out of nothing — it turned that near-black into
 * red on a blue cover.
 *
 * So: sample the image small, throw away everything too dark, too pale or too
 * grey to carry a hue, and pick the hue bucket with the most chromatic weight.
 * That finds the cyan a viewer would name if you asked them the cover's colour.
 */
/*
 * The extraction below is right about the *field* colour and wrong when the
 * field is dark and a minority of the cover is bright: El universo elegante is
 * black with a teal-and-orange nebula, and it answered with a muddy brown,
 * because the orange filaments are numerous but sit at lightness 0.26 while the
 * teal core sits at 0.53. Weighting for vividness instead fixes that one cover
 * and breaks two others — it starts chasing small bright details, taking the
 * green strip on Mujeres de ciencia over its maroon field, and the red of
 * SCOTT KELLY over Endurance's blue. Two regressions for one fix is not a
 * trade, so the algorithm stays and --accent exists for the exceptions. Pass a
 * colour that is *in* the cover; the point of the field is to match the artwork,
 * not to decorate.
 */
const accent = forcedAccent ?? (await extractAccent(out));

async function extractAccent(file) {
  const { data, info } = await sharp(file)
    .resize(64, 96, { fit: "cover" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const BUCKETS = 24; // 15° each: fine enough to separate cyan from blue.
  const weight = new Float64Array(BUCKETS);
  const members = Array.from({ length: BUCKETS }, () => []);

  for (let i = 0; i < data.length; i += info.channels) {
    const [h, s, l] = rgbToHsl(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255);
    /* Near-black, near-white and near-grey pixels have no hue worth trusting. */
    if (s < 0.22 || l < 0.12 || l > 0.9) continue;
    const b = Math.min(BUCKETS - 1, Math.floor(h * BUCKETS));
    /* Weight by chroma and by how far the pixel is from the extremes, so a few
       vivid mid-tones beat a large wash of almost-black colour. */
    weight[b] += s * (1 - Math.abs(l - 0.5) * 1.2);
    members[b].push([h, s, l]);
  }

  let best = -1;
  for (let b = 0; b < BUCKETS; b++) if (weight[b] > (weight[best] ?? -1)) best = b;

  /* A genuinely monochrome cover gets no accent, and falls back to the medium's
     colour. Inventing one would be worse than not having one. */
  if (best < 0 || members[best].length === 0) return null;

  const group = members[best];
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

  const h = mean(group.map((g) => g[0]));
  const s = Math.max(median(group.map((g) => g[1])), 0.45);
  const l = Math.min(Math.max(median(group.map((g) => g[2])), 0.42), 0.6);

  const [r, g, b] = hslToRgb(h, s, l);
  return (
    "#" +
    [r, g, b].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("")
  );
}

/* Frontmatter edit: replace the two managed keys, keep everything else and the
   body untouched. */
const source = await readFile(entry, "utf8");
const match = source.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
if (!match) {
  console.error("unrecognised frontmatter");
  process.exit(1);
}
const [, fm, body] = match;
const kept = fm.split("\n").filter((l) => !/^(cover|accent):/.test(l));
kept.push(`cover: ./${slug}.jpg`);
if (accent) kept.push(`accent: "${accent}"`);
await writeFile(entry, `---\n${kept.join("\n")}\n---\n${body}`, "utf8");

/* sharp reports `size` only for buffer inputs, so ask the filesystem. */
const kb = async (f) => `${Math.round((await stat(f)).size / 1024)} KB`;
console.log(`${medium}/${slug}`);
console.log(`  image   ${meta.width}×${meta.height} ${meta.format} → ${written.width}×${written.height} jpg`);
console.log(`  weight  ${await kb(resolve(imagePath))} → ${await kb(out)}`);
console.log(`  accent  ${accent ?? "(no readable hue: falls back to the medium's)"}${forcedAccent ? " (by hand)" : ""}`);

/* Hue/saturation/lightness conversions. Declarations, so hoisting lets the work
   above call them before they appear here. */
function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function hslToRgb(h, s, l) {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t) => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [hue(h + 1 / 3), hue(h), hue(h - 1 / 3)];
}
