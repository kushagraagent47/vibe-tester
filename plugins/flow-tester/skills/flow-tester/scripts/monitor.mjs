// flow-tester scheduled monitor.
// Re-runs a saved set of checks against the browser control server every N minutes and posts
// pass/fail + alerts to the dashboard. Deterministic (no AI in the loop) — ideal for "test all
// products every 20 minutes". For AI/vision judgement on a schedule, drive the skill from Claude
// Code's /loop or schedule instead.
//
// Usage:
//   node monitor.mjs --spec flow-tester/session/monitor.json [--once] [--interval 20]
//
// monitor.json:
// {
//   "control": "http://localhost:4600",
//   "dashboard": "http://localhost:4500",
//   "intervalMin": 20,
//   "checks": [
//     { "name": "Product: Blue Shirt",
//       "steps": [ { "action": "goto", "url": "https://shop.example.com/p/blue-shirt" } ],
//       "assert": [ { "type": "status_ok" },
//                   { "type": "a11y_contains", "value": "Add to cart" },
//                   { "type": "no_console_errors" } ] }
//   ]
// }
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const flag = (n) => argv.includes(n);

const SPEC_PATH = resolve(opt("--spec", "flow-tester/session/monitor.json"));
const ONCE = flag("--once");
const INTERVAL_OVERRIDE = opt("--interval", null);

const spec = JSON.parse(await readFile(SPEC_PATH, "utf8"));
const CONTROL = spec.control || "http://localhost:4600";
const DASHBOARD = spec.dashboard || "http://localhost:4500";
const INTERVAL_MIN = Number(INTERVAL_OVERRIDE || spec.intervalMin || 20);

async function post(event) {
  try {
    await fetch(`${DASHBOARD}/event`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(event) });
  } catch { /* dashboard optional */ }
}
const log = (message) => post({ type: "log", message });

async function act(body) {
  const res = await fetch(`${CONTROL}/act`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return res.json();
}

function evaluate(assertions, last, failOn4xx) {
  const failures = [];
  for (const a of assertions || []) {
    const a11y = (last.a11y || "").toLowerCase();
    const net = last.networkErrors || [];
    switch (a.type) {
      case "status_ok": {
        const bad = net.filter((n) => n.status >= (failOn4xx ? 400 : 500));
        if (bad.length) failures.push(`HTTP ${bad.map((b) => b.status).join(",")} on ${bad.map((b) => b.url).join(", ").slice(0, 200)}`);
        break;
      }
      case "a11y_contains":
        if (!a11y.includes(String(a.value).toLowerCase())) failures.push(`missing text: "${a.value}"`);
        break;
      case "a11y_not_contains":
        if (a11y.includes(String(a.value).toLowerCase())) failures.push(`unexpected text present: "${a.value}"`);
        break;
      case "url_contains":
        if (!String(last.url || "").includes(a.value)) failures.push(`url did not contain "${a.value}" (was ${last.url})`);
        break;
      case "no_console_errors":
        if ((last.consoleErrors || []).length) failures.push(`console errors: ${(last.consoleErrors || []).slice(0, 2).join(" | ").slice(0, 200)}`);
        break;
      default:
        failures.push(`unknown assertion type: ${a.type}`);
    }
  }
  return failures;
}

async function runCheck(check) {
  let last = {};
  try {
    for (const step of check.steps || []) last = await act(step);
    if (last.ok === false && last.error) return { name: check.name, pass: false, failures: [`action error: ${last.error}`] };
  } catch (e) {
    return { name: check.name, pass: false, failures: [`run error: ${e.message}`] };
  }
  const failures = evaluate(check.assert, last, !!check.failOn4xx);
  return { name: check.name, pass: failures.length === 0, failures, screenshot: last.screenshotPath };
}

let cycle = 0;
async function runCycle() {
  cycle++;
  log(`monitor cycle #${cycle} — ${spec.checks.length} checks`);
  post({ type: "phase", phase: `monitoring (cycle #${cycle})` });
  let passed = 0, failed = 0;
  for (const check of spec.checks) {
    const r = await runCheck(check);
    await post({ type: "monitor", cycle, check: r.name, pass: r.pass, failures: r.failures });
    await post({ type: "step", flow: "monitor", step: `${r.name} (cycle #${cycle})`, verdict: r.pass ? "pass" : "fail" });
    if (r.pass) { passed++; }
    else {
      failed++;
      await post({
        type: "bug", category: "functional", severity: "high", flow: "monitor", step: r.name,
        title: `Monitor check failed: ${r.name}`,
        detail: r.failures.join("; "), screenshot: r.screenshot, confidence: "high",
      });
    }
  }
  await log(`monitor cycle #${cycle} done — ${passed} pass, ${failed} fail`);
}

console.log(`[flow-tester] monitor: ${spec.checks.length} checks, every ${INTERVAL_MIN} min (${ONCE ? "single run" : "looping"})`);
await runCycle();
if (!ONCE) {
  setInterval(runCycle, INTERVAL_MIN * 60 * 1000);
} else {
  process.exit(0);
}
