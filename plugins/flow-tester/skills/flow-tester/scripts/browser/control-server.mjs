// flow-tester browser control server.
// Launches Chromium (Playwright), streams a live view to the dashboard, and exposes a one-action-
// at-a-time HTTP control API the browser agent drives.
//
//   POST /act   { action, ... }  -> performs one action, returns url/title/a11y/screenshot/errors
//   GET  /health
//
// Usage:
//   node control-server.mjs --dashboard http://localhost:4500 --port 4600 [--headed] [--no-screencast]
import http from "node:http";
import { mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { genFile } from "../lib/genfile.mjs";

// ---- args ------------------------------------------------------------------
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name, def) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const PORT = Number(opt("--port", "4600"));
const DASHBOARD = opt("--dashboard", "http://localhost:4500");
const HEADLESS = !flag("--headed");
const SCREENCAST = !flag("--no-screencast");
const SESSION_DIR = resolve(opt("--session-dir", join(process.cwd(), "flow-tester", "session")));
const SHOTS_DIR = join(SESSION_DIR, "shots");
mkdirSync(SHOTS_DIR, { recursive: true });

// ---- dashboard event helper ------------------------------------------------
async function post(event) {
  try {
    await fetch(`${DASHBOARD}/event`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
    });
  } catch {
    /* dashboard optional — never let it break testing */
  }
}
const log = (message) => post({ type: "log", message });

// ---- browser state ---------------------------------------------------------
let browser, context, page, cdp;
let stepCounter = 0;
const consoleBuf = [];
const networkBuf = [];

function wireListeners(p) {
  p.on("console", (msg) => {
    if (msg.type() === "error") consoleBuf.push(msg.text().slice(0, 500));
  });
  p.on("pageerror", (err) => consoleBuf.push(`pageerror: ${String(err).slice(0, 500)}`));
  p.on("requestfailed", (req) => {
    const f = req.failure();
    networkBuf.push({ url: req.url(), method: req.method(), error: f ? f.errorText : "failed" });
  });
  p.on("response", (res) => {
    if (res.status() >= 400) {
      networkBuf.push({ url: res.url(), method: res.request().method(), status: res.status() });
    }
  });
}

let lastFrameAt = 0;
async function startScreencast() {
  if (!SCREENCAST) return;
  try {
    cdp = await context.newCDPSession(page);
    await cdp.send("Page.startScreencast", {
      format: "jpeg", quality: 55, maxWidth: 1280, maxHeight: 800, everyNthFrame: 1,
    });
    cdp.on("Page.screencastFrame", async ({ data, sessionId }) => {
      const now = Date.now();
      if (now - lastFrameAt > 120) { // throttle ~8 fps
        lastFrameAt = now;
        post({ type: "frame", data: `data:image/jpeg;base64,${data}`, caption: page.url() });
      }
      try { await cdp.send("Page.screencastFrameAck", { sessionId }); } catch { /* noop */ }
    });
  } catch (e) {
    log(`screencast unavailable: ${e.message}`);
  }
}

async function boot() {
  browser = await chromium.launch({ headless: HEADLESS });
  context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  page = await context.newPage();
  wireListeners(page);
  await startScreencast();
  log(`browser ready (headless=${HEADLESS}), screencast=${SCREENCAST}`);
}

// ---- element resolution ----------------------------------------------------
function locator(body) {
  if (body.selector) return page.locator(body.selector);
  if (body.role && body.name) return page.getByRole(body.role, { name: body.name, exact: !!body.exact });
  if (body.role) return page.getByRole(body.role);
  if (body.text) return page.getByText(body.text);
  if (body.label) return page.getByLabel(body.label);
  if (body.placeholder) return page.getByPlaceholder(body.placeholder);
  throw new Error("no locator: provide selector | role(+name) | text | label | placeholder");
}
const pick = (body, loc) => (typeof body.nth === "number" ? loc.nth(body.nth) : loc.first());

// ---- perform one action ----------------------------------------------------
async function perform(body) {
  const a = body.action;
  const timeout = body.timeoutMs || 15000;
  switch (a) {
    case "goto":
      await page.goto(body.url, { waitUntil: "domcontentloaded", timeout }); break;
    case "click":
      await pick(body, locator(body)).click({ timeout }); break;
    case "fill":
      await pick(body, locator(body)).fill(String(body.value ?? ""), { timeout }); break;
    case "type":
      await pick(body, locator(body)).pressSequentially(String(body.value ?? ""), { timeout }); break;
    case "press":
      await page.keyboard.press(body.key); break;
    case "select":
      await pick(body, locator(body)).selectOption(body.value); break;
    case "upload": {
      // Generate a synthetic file (or use body.path) and attach it to a file input.
      const f = body.path
        ? body.path
        : (() => { const g = genFile(body.file || { kind: "pdf" }); return { name: g.name, mimeType: g.mimeType, buffer: g.buffer }; })();
      if (body.chooser) {
        // for custom drop-zones / buttons that open a native file chooser
        const [chooser] = await Promise.all([
          page.waitForEvent("filechooser", { timeout }),
          pick(body, locator(body)).click({ timeout }),
        ]);
        await chooser.setFiles(f);
      } else {
        await pick(body, locator(body)).setInputFiles(f);
      }
      break;
    }
    case "genfile": {
      // Write a synthetic file to disk and return its path (for drag/drop or manual flows).
      const g = genFile(body.file || { kind: "pdf" });
      const p = join(SESSION_DIR, "uploads", g.name);
      mkdirSync(join(SESSION_DIR, "uploads"), { recursive: true });
      await writeFile(p, g.buffer);
      body.__generatedPath = p; // surfaced in the response below
      break;
    }
    case "waitFor":
      if (body.selector) await page.locator(body.selector).waitFor({ state: body.state || "visible", timeout });
      else await page.waitForTimeout(Math.min(timeout, body.ms || 1000));
      break;
    case "back": await page.goBack({ waitUntil: "domcontentloaded" }); break;
    case "reload": await page.reload({ waitUntil: "domcontentloaded" }); break;
    case "snapshot": break; // read-only
    default: throw new Error(`unknown action: ${a}`);
  }
}

async function capture(stepLabel) {
  await page.waitForTimeout(350); // brief settle
  const id = String(++stepCounter).padStart(4, "0");
  const shotPath = join(SHOTS_DIR, `${id}.png`);
  let a11y = "";
  try { await page.screenshot({ path: shotPath, fullPage: false }); } catch { /* noop */ }
  try { a11y = await page.locator("body").ariaSnapshot({ timeout: 4000 }); } catch { a11y = "(aria snapshot unavailable)"; }

  // thumbnail to the dashboard timeline
  try {
    const jpeg = await page.screenshot({ type: "jpeg", quality: 55 });
    post({ type: "shot", id, data: `data:image/jpeg;base64,${jpeg.toString("base64")}`, caption: stepLabel || page.url(), url: page.url() });
  } catch { /* noop */ }

  const consoleErrors = consoleBuf.splice(0);
  const networkErrors = networkBuf.splice(0);
  return { id, screenshotPath: shotPath, a11y, consoleErrors, networkErrors, url: page.url(), title: await page.title().catch(() => "") };
}

// ---- http control api ------------------------------------------------------
function readBody(req) {
  return new Promise((res, rej) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => { try { res(raw ? JSON.parse(raw) : {}); } catch (e) { rej(e); } });
    req.on("error", rej);
  });
}
function send(res, code, obj) {
  res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*" });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true, url: page?.url() });
  if (req.method !== "POST" || req.url !== "/act") return send(res, 404, { ok: false, error: "POST /act" });

  let body;
  try { body = await readBody(req); } catch (e) { return send(res, 400, { ok: false, error: `bad json: ${e.message}` }); }
  const label = `${body.action} ${body.name || body.text || body.selector || body.url || ""}`.trim();

  try {
    await perform(body);
    const cap = await capture(label);
    log(`✓ ${label}`);
    return send(res, 200, { ok: true, action: body.action, generatedPath: body.__generatedPath, ...cap });
  } catch (e) {
    // still try to capture state on failure so the agent can judge what went wrong
    let cap = {};
    try { cap = await capture(label); } catch { /* noop */ }
    log(`✗ ${label} — ${e.message}`);
    return send(res, 200, { ok: false, action: body.action, error: String(e.message || e), ...cap });
  }
});

// ---- lifecycle -------------------------------------------------------------
async function shutdown() {
  try { await browser?.close(); } catch { /* noop */ }
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

boot()
  .then(() => server.listen(PORT, () => {
    console.log(`[flow-tester] control server on http://localhost:${PORT}  (POST /act)`);
    console.log(`[flow-tester] screenshots -> ${SHOTS_DIR}`);
  }))
  .catch((e) => { console.error("failed to launch browser:", e); process.exit(1); });
