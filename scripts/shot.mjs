#!/usr/bin/env node
/**
 * Screenshots a URL at a real viewport size.
 *
 * Chrome's `--window-size` cannot go below ~500px on macOS, so `--screenshot`
 * silently crops a wider page instead of laying it out narrow — which makes it
 * useless for checking mobile. This drives Chrome over CDP and overrides the
 * device metrics, which does lay the page out at the size you ask for.
 *
 * Usage:
 *   node scripts/shot.mjs <url> <out.png> [width] [height]
 *
 * Example:
 *   node scripts/shot.mjs http://localhost:4321/es/llm out.png 390 844
 */
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9333;

const [url, out, width = "390", height = "844"] = process.argv.slice(2);
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
    "--user-data-dir=/tmp/shelf-shot-profile",
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

  const { data } = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
  });
  await writeFile(out, Buffer.from(data, "base64"));
  console.log(`${out} — ${width}×${height}`);
  ws.close();
} finally {
  chrome.kill();
}
