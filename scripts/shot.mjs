#!/usr/bin/env node
/**
 * Screenshots a URL at a real viewport size.
 *
 * Chrome's `--window-size` cannot go below ~500px on macOS, so `--screenshot`
 * silently crops a wider page instead of laying it out narrow — which makes it
 * useless for checking mobile. This drives Chrome over CDP and overrides the
 * device metrics, which does lay the page out at the size you ask for.
 *
 * `--clip <selector>` captures just that element. Use it on anything tall:
 * captureBeyondViewport ignores the height you pass and grabs the *whole* page,
 * so a 1440px-wide shelf came out 2880×14000 at 2x and never finished encoding.
 *
 * Usage:
 *   node scripts/shot.mjs <url> <out.png> [width] [height] [--clip <selector>]
 *
 * Example:
 *   node scripts/shot.mjs http://localhost:4321/es/llm out.png 390 844
 */
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9333;

const argv = process.argv.slice(2);
const clipAt = argv.indexOf("--clip");
const clip = clipAt >= 0 ? argv[clipAt + 1] : null;
const [url, out, width = "390", height = "844"] = clipAt >= 0 ? argv.slice(0, clipAt) : argv;
if (!url || !out) {
  console.error("usage: node scripts/shot.mjs <url> <out.png> [width] [height]");
  process.exit(1);
}

const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    `--remote-debugging-port=${PORT}`,
    "--user-data-dir=/tmp/vitrine-shot-profile",
    "about:blank",
  ],
  { stdio: "ignore" },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, {
        method: "PUT",
      });
      if (res.ok) return res.json();
    } catch {
      // Chrome is not listening yet.
    }
    await sleep(150);
  }
  throw new Error("Chrome did not expose a debugging target");
}

try {
  const { webSocketDebuggerUrl } = await target();
  const ws = new WebSocket(webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener("open", res, { once: true });
    ws.addEventListener("error", rej, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  const events = new Map();
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result);
      pending.delete(msg.id);
    } else if (msg.method && events.has(msg.method)) {
      events.get(msg.method)();
      events.delete(msg.method);
    }
  });

  const send = (method, params = {}) =>
    new Promise((res) => {
      const id = nextId++;
      pending.set(id, res);
      ws.send(JSON.stringify({ id, method, params }));
    });
  const once = (method) => new Promise((res) => events.set(method, res));

  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: Number(width),
    height: Number(height),
    deviceScaleFactor: 2,
    mobile: true,
  });

  const loaded = once("Page.loadEventFired");
  await send("Page.navigate", { url });
  await loaded;
  // Web fonts and the island's first frame.
  await sleep(1200);

  let box = null;
  if (clip) {
    await send("Runtime.enable");
    /* Scroll first and settle, then read the rect: asking for coordinates in the
       same evaluate that scrolls returns the pre-settle layout, and lazy images
       inside the region have not painted yet either. */
    await send("Runtime.evaluate", {
      expression: `document.querySelector(${JSON.stringify(clip)}).scrollIntoView({block:"start"})`,
    });
    await sleep(900);
    const { result } = await send("Runtime.evaluate", {
      /* Page coordinates, not viewport ones: captureScreenshot's clip is measured
         from the document origin, so a viewport rect after a scroll lands the
         capture hundreds of pixels above the element. */
      expression: `(() => { const r = document.querySelector(${JSON.stringify(clip)}).getBoundingClientRect();
        return JSON.stringify({ x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height }); })()`,
    });
    const r = JSON.parse(result.value);
    box = { x: r.x, y: r.y, width: r.width, height: Math.min(r.height, Number(height)), scale: 1 };
  }

  const { data } = await send("Page.captureScreenshot", {
    format: "png",
    ...(box ? { clip: box } : { captureBeyondViewport: true }),
  });
  await writeFile(out, Buffer.from(data, "base64"));
  console.log(`${out} — ${clip ? `${clip} ${Math.round(box.width)}×${Math.round(box.height)}` : `${width}×${height}`}`);
  ws.close();
} finally {
  chrome.kill();
}
