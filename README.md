# 🧪 vibe-tester — `flow-tester`

> A Claude Code skill that **understands your web app's user flows, drives a real Chromium browser through them, watches itself on a live dashboard, and reports bugs** — functional, content, visual, and console/network. On a local codebase it also runs a **read-only security audit**. It **identifies issues; it never fixes them.**

Packaged as a [Claude Code](https://docs.claude.com/en/docs/claude-code) plugin marketplace, in the structure popularized by [trailofbits/skills](https://github.com/trailofbits/skills).

---

## ✨ What it does

1. **Understands the app** — asks what the project is, then maps user flows (`signup → login → dashboard`) using **hybrid discovery**: static code analysis refined by live network capture.
2. **Confirms with you** — shows the discovered flow graph and waits for your approval/edits before touching anything.
3. **Tests in a real browser** — opens Chromium and walks each flow step-by-step. After every action it captures the **accessibility tree**, a **screenshot**, and any **console/network errors**; Claude judges each screen (vision + a11y) against what's expected and logs bugs.
4. **Thinks about edge cases** — proactively generates negative/edge flows (wrong password, empty fields, double-submit, out-of-stock…) and, when the app *works* but is missing a safeguard or message, emits a **recommendation** instead of a bug.
5. **Audits security** *(local source only)* — a parallel, read-only pass using Semgrep + dependency scanning + Claude reasoning (leaning on the Trail of Bits skills when installed).
6. **Reports** — a consolidated, identify-only `report.md` (bugs, recommendations, security findings), with everything also streaming to a **live local dashboard** as it happens.

### Also built in

- **📎 Generates & uploads files.** When a flow needs an upload, the AI fabricates a valid file on the fly (PDF, PNG, CSV, TXT, JSON) and attaches it — no fixtures needed.
- **⏰ Scheduled monitoring.** Re-test a saved set of flows/pages every N minutes (e.g. *"check all products every 20 minutes"*) with deterministic assertions; failures raise alerts on the dashboard. For AI-vision judgement on a schedule, drive it from Claude Code's `/loop` or `schedule`.
- **💡 Recommendations.** A distinct output stream for "works, but should be better" findings — the classic being *wrong password → no error message at all.*

## 🎬 Live dashboard

While a run is in progress, open **http://localhost:4500** to watch:

```
┌───────────────────────────────────────────────────────────────┐
│  flow·tester    mode: B   target: yourapp.com   bugs: 1  sec: 0 │
├──────────────────────────────────┬────────────────────────────┤
│                                  │  [Bugs] [Security] [Flows]  │
│        LIVE BROWSER VIEW         │  [Steps] [Logs]             │
│     (CDP screencast + shots)     │                             │
│                                  │  ▸ login › wrong password   │
│                                  │    [MEDIUM] error banner…   │
└──────────────────────────────────┴────────────────────────────┘
```

- **Left:** the live browser, streamed via Chrome DevTools Protocol screencast.
- **Right tabs:** Flows, per-step pass/fail, Bugs, Security findings, and a live log — all populated from history so you can review after the run too.

## 🧭 Two modes

| Mode | Input | What runs | Security audit |
|------|-------|-----------|----------------|
| **A — Local (white-box)** | Local source + a running app | Hybrid flow discovery + browser testing + security audit | ✅ on source only |
| **B — Standalone URL (black-box)** | Just a URL (may be production) | Browser flow testing only | ❌ never |
| **C — Scheduled monitoring** | A saved set of pages/flows | Re-tests them every N minutes (e.g. all products every 20 min) | ❌ never |

Security scanning **only ever runs on local source code** — never against a live URL. In Mode B against a production target, writes (signup/post) are **ask-first**; payments and destructive deletes are **always blocked**.

---

## 🚀 Install

```bash
/plugin marketplace add kushagraagent47/vibe-tester
/plugin                 # open the menu → enable "flow-tester"
```

Or for local development, point the marketplace at your clone:

```bash
/plugin marketplace add /path/to/ai-tester
```

Install the runtime dependencies once (Playwright + Chromium):

```bash
cd plugins/flow-tester/skills/flow-tester/scripts
npm install             # also runs `playwright install chromium`
```

## 💬 Usage

Just ask Claude in natural language. Examples:

**Mode B — black-box, a URL:**
> "Test the login flow on https://www.saucedemo.com — creds standard_user / secret_sauce"

> "Check if signup → onboarding works on https://staging.myapp.com"

**Mode A — white-box, local code:**
> "Test my app — the code is in `./`, it runs at http://localhost:3000 (start with `npm run dev`), test creds test@me.com / pass123. Also audit the code for security issues."

The skill then: **intake → discover flows → show you the flow graph for approval → start the dashboard → drive the browser (and run the security audit in Mode A) → write `report.md`.**

## 🔍 Worked examples (real runs)

- **saucedemo.com (Mode B):** 4-step login flow. Passed the happy path, and **vision caught a real visual bug** the accessibility tree couldn't see — the invalid-credentials error banner is clipped and overlaps the Login button.
- **An email-OTP production app (Mode B):** discovered that the marketing site's "Log in" routes to a separate app subdomain, drove the passwordless **email → 6-digit OTP → dashboard** flow, and confirmed 5/5 steps passed with a clean authenticated dashboard.

---

## 🏗️ How it works

The skill is **instructions + scripts**. Claude is the orchestrator: it reads `SKILL.md`, spawns the workstreams, and drives a one-action-at-a-time control loop.

```
Claude (orchestrator, per SKILL.md)
   │
   ├─ spawns ─▶ security subagent      (Mode A only, read-only) ─┐
   │                                                             ├─▶ POST events
   └─ spawns ─▶ browser subagent ──▶ control-server.mjs ─────────┘        │
                     ▲                  │  (Playwright + Chromium)         ▼
                     │   /act loop      │  - screencast frames      dashboard/server.mjs
        judge screen │   (one action)   ▼  - screenshots  ──────────▶  http://localhost:4500
        vs `expect`  └──── screenshot + a11y + console/network errors      (live SSE UI)
```

For every step the browser agent: issues an action → reads the returned screenshot + accessibility tree + error buffers → **judges it against the step's `expect` and your project description** → classifies any failure (`functional` / `content` / `visual` / `console-network`) → posts it to the dashboard. A failing step never aborts the run.

## 🧱 Project structure

```
vibe-tester/
├── .claude-plugin/marketplace.json     # makes this repo an installable marketplace
└── plugins/flow-tester/
    ├── .claude-plugin/plugin.json
    ├── README.md
    └── skills/flow-tester/
        ├── SKILL.md                     # orchestration brain — modes, 5 phases, safety rails
        ├── references/
        │   ├── flow-discovery.md        # hybrid (static + live) flow mapping
        │   ├── browser-driver.md        # the /act control protocol (+ upload/genfile)
        │   ├── bug-criteria.md          # bug categories, severity, judging discipline
        │   ├── recommendations.md       # proactive edge-case thinking; bug vs recommendation
        │   └── security-audit.md        # Semgrep + deps + Trail of Bits playbooks (local only)
        ├── workflows/
        │   ├── mode-a-local-audit.md
        │   ├── mode-b-url-test.md
        │   └── mode-c-monitor.md        # scheduled recurring monitoring
        └── scripts/
            ├── dashboard/server.mjs     # zero-dependency SSE live dashboard (port 4500)
            ├── dashboard/public/index.html
            ├── browser/control-server.mjs   # Playwright control + live screencast (port 4600)
            ├── lib/genfile.mjs          # synthetic file generator (PDF/PNG/CSV/TXT/JSON)
            ├── monitor.mjs              # recurring deterministic monitor (Mode C)
            └── report.mjs               # turns live dashboard state into a durable report.md
```

## 🛠️ Running the engine manually (development)

You normally don't — Claude drives this — but to poke at it directly:

```bash
cd plugins/flow-tester/skills/flow-tester/scripts

# 1) dashboard → open http://localhost:4500
node dashboard/server.mjs --port 4500

# 2) browser control server (drives Chromium, streams the live view)
node browser/control-server.mjs --dashboard http://localhost:4500 --port 4600 --headed

# 3) issue actions
curl localhost:4600/act -H 'content-type: application/json' -d '{"action":"goto","url":"https://www.saucedemo.com"}'
curl localhost:4600/act -H 'content-type: application/json' -d '{"action":"fill","selector":"#user-name","value":"standard_user"}'
curl localhost:4600/act -H 'content-type: application/json' -d '{"action":"click","role":"button","name":"Login"}'

# 4) generate the report from live state
node report.mjs --dashboard http://localhost:4500 --out report.md
```

### Control-server actions

`POST /act` — one action per call. Prefer **role + accessible name** or visible **text** over CSS selectors.

| action | fields | does |
|--------|--------|------|
| `goto` | `url` | navigate |
| `click` | `role`+`name` \| `text` \| `selector` (+ `nth`) | click |
| `fill` | (`selector` \| `role`+`name` \| `placeholder`) + `value` | type into a field |
| `type` | locator + `value` | per-character typing (auto-advancing inputs, OTP) |
| `press` | `key` | keyboard press |
| `select` | locator + `value` | choose a `<select>` option |
| `upload` | file input + `file` spec (or `path`) | generate a file (PDF/PNG/CSV/…) and attach it |
| `genfile` | `file` spec | write a synthetic file to disk, return its path |
| `waitFor` | `selector`+`state` \| `ms` | wait for a condition |
| `back` / `reload` / `snapshot` | — | history / re-capture without interacting |

Each call returns `{ ok, url, title, screenshotPath, a11y, consoleErrors, networkErrors }`.

## 🔒 Safety rails

- Security auditing runs **only on local source**, never against a URL.
- Production targets require explicit confirmation; writes there are **ask-first**.
- **Payments and destructive deletes are never triggered automatically.**
- The audit is strictly **read-only** — it never edits your code.
- Credentials are treated as secrets — kept in the session config, never echoed to the dashboard or logs.

## 📋 Requirements

- Node.js ≥ 20
- Claude Code (to use it as a skill) — the engine scripts also run standalone
- Internet access for the target app + Chromium download on first install

## 📄 License

[CC BY-SA 4.0](LICENSE). Structure inspired by [trailofbits/skills](https://github.com/trailofbits/skills); the security-audit guidance leans on the Trail of Bits skills where installed.
