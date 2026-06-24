// flow-tester report generator.
// Pulls the live dashboard state (or a saved state file) and writes a durable Markdown report.
//
// Usage:
//   node report.mjs --dashboard http://localhost:4500 --out flow-tester/session/report.md
//   node report.mjs --state flow-tester/session/state.json --out report.md
import { writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const DASHBOARD = opt("--dashboard", "http://localhost:4500");
const STATE_FILE = opt("--state", null);
const OUT = resolve(opt("--out", "flow-tester/session/report.md"));

async function loadState() {
  if (STATE_FILE) return JSON.parse(await readFile(resolve(STATE_FILE), "utf8"));
  const res = await fetch(`${DASHBOARD}/state.json`);
  if (!res.ok) throw new Error(`dashboard returned ${res.status}`);
  return res.json();
}

const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const bySev = (a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9);
const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");

function countSev(items) {
  const c = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const i of items) if (c[i.severity] != null) c[i.severity]++;
  return c;
}

function section(title, items, renderer) {
  if (!items.length) return `## ${title}\n\n_None found._\n`;
  const c = countSev(items);
  let md = `## ${title} (${items.length})\n\n`;
  md += `> critical: ${c.critical} · high: ${c.high} · medium: ${c.medium} · low: ${c.low}\n\n`;
  md += items.slice().sort(bySev).map(renderer).join("\n");
  return md + "\n";
}

function renderBug(b) {
  let md = `### [${(b.severity || "?").toUpperCase()}] ${b.title || "Bug"}  \`${b.category || "bug"}\`\n`;
  if (b.flow || b.step) md += `- **Where:** ${esc(b.flow || "")}${b.step ? " › " + esc(b.step) : ""}\n`;
  if (b.detail) md += `- **Detail:** ${esc(b.detail)}\n`;
  if (b.screenshot) md += `- **Screenshot:** \`${b.screenshot}\`\n`;
  if (b.confidence) md += `- **Confidence:** ${b.confidence}\n`;
  return md;
}

function renderSec(s) {
  let md = `### [${(s.severity || "?").toUpperCase()}] ${s.title || "Finding"}  \`${s.category || "security"}\`\n`;
  if (s.file) md += `- **Location:** \`${s.file}${s.line ? ":" + s.line : ""}\`\n`;
  if (s.detail) md += `- **Detail:** ${esc(s.detail)}\n`;
  if (s.confidence) md += `- **Confidence:** ${s.confidence}\n`;
  return md;
}

const s = await loadState();
const bugs = s.bugs || [];
const security = s.security || [];
const steps = s.steps || [];
const passed = steps.filter((x) => (x.verdict || "").toLowerCase() === "pass").length;
const failed = steps.filter((x) => (x.verdict || "").toLowerCase() === "fail").length;

let md = `# flow-tester report\n\n`;
md += `- **Mode:** ${s.mode || "—"}\n`;
md += `- **Target:** ${s.target || "—"}\n`;
md += `- **Generated:** ${new Date().toISOString()}\n`;
md += `- **Steps:** ${steps.length} (${passed} pass, ${failed} fail)\n`;
md += `- **Bugs:** ${bugs.length} · **Security findings:** ${security.length}\n\n`;
md += `> Identify-only report — no fixes were applied.\n\n`;

if (s.flows?.length) {
  md += `## Flows tested\n\n`;
  for (const f of s.flows) {
    md += `**${f.title || f.id}**\n`;
    for (const st of f.steps || []) md += `  - ${st.action} — ${esc(st.target || "")}${st.expect ? ` → _${esc(st.expect)}_` : ""}\n`;
    md += `\n`;
  }
}

md += section("Bugs", bugs, renderBug) + "\n";
md += section("Security findings", security, renderSec);

await writeFile(OUT, md, "utf8");
console.log(`[flow-tester] report written to ${OUT} (${bugs.length} bugs, ${security.length} security findings)`);
