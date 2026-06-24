// flow-tester live dashboard server.
// Zero-dependency: Node http + Server-Sent Events.
//   - GET  /            -> dashboard UI
//   - GET  /events      -> SSE stream (live view frames, bugs, security findings, logs)
//   - POST /event       -> ingest an event (from the browser/security workstreams), broadcast it
//   - GET  /state.json  -> full event history + rollups (durable snapshot)
//
// Usage: node server.mjs --port 4500
import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const PORT = Number(argv[argv.indexOf("--port") + 1]) || 4500;

// ---- in-memory state -------------------------------------------------------
const MAX_HISTORY = 5000;
const state = {
  startedAt: new Date().toISOString(),
  mode: null,
  phase: null,
  target: null,
  flows: null,
  bugs: [],
  security: [],
  recommendations: [],
  monitor: [],
  steps: [],
  logs: [],
};
const history = []; // every non-frame event, replayed to new clients
const clients = new Set(); // SSE responses
let lastFrame = null; // most recent live-view frame (sent to new clients once)

function broadcast(event) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
    } catch {
      clients.delete(res);
    }
  }
}

function ingest(event) {
  if (!event || typeof event.type !== "string") return;
  event.ts = event.ts || new Date().toISOString();

  switch (event.type) {
    case "frame":
      lastFrame = event; // live screencast frame — not stored in history
      broadcast(event);
      return;
    case "mode":
      state.mode = event.mode ?? state.mode;
      break;
    case "phase":
      state.phase = event.phase ?? state.phase;
      break;
    case "target":
      state.target = event.target ?? state.target;
      break;
    case "flows":
      state.flows = event.flows ?? state.flows;
      break;
    case "bug":
      state.bugs.push(event);
      break;
    case "security":
      state.security.push(event);
      break;
    case "recommendation":
      state.recommendations.push(event);
      break;
    case "monitor":
      state.monitor.push(event);
      if (state.monitor.length > 500) state.monitor.shift();
      break;
    case "step":
      state.steps.push(event);
      break;
    case "log":
      state.logs.push(event);
      break;
    // shot / done / anything else: just record + broadcast
  }

  history.push(event);
  if (history.length > MAX_HISTORY) history.shift();
  broadcast(event);
}

// ---- http ------------------------------------------------------------------
function send(res, code, body, headers = {}) {
  res.writeHead(code, { "access-control-allow-origin": "*", ...headers });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === "OPTIONS") {
    return send(res, 204, "", {
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
    });
  }

  if (req.method === "GET" && url.pathname === "/") {
    try {
      const html = await readFile(join(__dirname, "public", "index.html"), "utf8");
      return send(res, 200, html, { "content-type": "text/html; charset=utf-8" });
    } catch {
      return send(res, 500, "dashboard UI missing");
    }
  }

  if (req.method === "GET" && url.pathname === "/state.json") {
    return send(res, 200, JSON.stringify(state, null, 2), {
      "content-type": "application/json",
    });
  }

  if (req.method === "GET" && url.pathname === "/events") {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "access-control-allow-origin": "*",
    });
    res.write(`retry: 2000\n\n`);
    // replay current state to the new client
    res.write(`data: ${JSON.stringify({ type: "snapshot", state })}\n\n`);
    for (const e of history) res.write(`data: ${JSON.stringify(e)}\n\n`);
    if (lastFrame) res.write(`data: ${JSON.stringify(lastFrame)}\n\n`);
    clients.add(res);
    const ping = setInterval(() => {
      try { res.write(`: ping\n\n`); } catch { /* noop */ }
    }, 15000);
    req.on("close", () => {
      clearInterval(ping);
      clients.delete(res);
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/event") {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 8e6) req.destroy(); // 8MB guard (frames are base64)
    });
    req.on("end", () => {
      try {
        ingest(JSON.parse(raw));
        send(res, 200, JSON.stringify({ ok: true }), {
          "content-type": "application/json",
        });
      } catch (err) {
        send(res, 400, JSON.stringify({ ok: false, error: String(err) }), {
          "content-type": "application/json",
        });
      }
    });
    return;
  }

  send(res, 404, "not found");
});

server.listen(PORT, () => {
  console.log(`[flow-tester] dashboard live at http://localhost:${PORT}`);
  console.log(`[flow-tester] POST events to http://localhost:${PORT}/event`);
});
