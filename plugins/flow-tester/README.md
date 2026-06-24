# flow-tester

Discovers a web app's user flows, drives a **real Chromium browser** through them while a **live local
dashboard** streams what it's doing, and reports bugs. On a local codebase it also runs a **read-only
security audit**. It **identifies issues — it never fixes them.**

## What it does

1. **Understand** — asks what the project is, then maps user flows (`signup → login → dashboard`)
   using hybrid discovery: static code analysis refined by live network capture.
2. **Confirm** — shows you the flow graph and waits for your approval/edits.
3. **Test** — opens Chromium and walks each flow step-by-step. After every action it captures the
   page's accessibility tree, a screenshot, and any console/network errors; Claude judges each screen
   (vision + a11y) against what's expected and logs bugs.
4. **Audit** (local source only) — a parallel read-only security pass (Semgrep + dependency scan +
   Claude reasoning via the Trail of Bits skills).
5. **Report** — a consolidated, identify-only report; everything also streams to the dashboard live.

## Modes

- **A — Local (white-box):** local source + running app → flow testing **and** security audit.
- **B — Standalone URL (black-box):** just a URL (may be production) → flow testing only, **no audit**.
  Against production, writes are ask-first; payments/deletes are always blocked.
- **C — Scheduled monitoring:** re-test a saved set of flows/pages every N minutes (e.g. all products
  every 20 min) with deterministic assertions; failures alert on the dashboard.

Plus: the agent **generates & uploads files** on demand (PDF/PNG/CSV/…), and emits **recommendations**
for "works but missing a safeguard" cases (e.g. wrong password → no error message).

## Components

```
skills/flow-tester/
├── SKILL.md                       # orchestration brain (modes, phases, safety rails)
├── references/
│   ├── flow-discovery.md          # how flows are mapped (hybrid)
│   ├── browser-driver.md          # the /act control-server protocol (+ upload/genfile)
│   ├── bug-criteria.md            # bug categories + severity + judging discipline
│   ├── recommendations.md         # proactive edge-case thinking; bug vs recommendation
│   └── security-audit.md          # tools + Trail of Bits skill playbooks (local only)
├── workflows/
│   ├── mode-a-local-audit.md
│   ├── mode-b-url-test.md
│   └── mode-c-monitor.md          # scheduled recurring monitoring
└── scripts/
    ├── dashboard/server.mjs       # zero-dep SSE live dashboard (port 4500)
    ├── dashboard/public/index.html
    ├── browser/control-server.mjs # Playwright control + live screencast (port 4600)
    ├── lib/genfile.mjs            # synthetic file generator (PDF/PNG/CSV/TXT/JSON)
    ├── monitor.mjs                # recurring deterministic monitor (Mode C)
    └── report.mjs                 # turns live dashboard state into a durable report.md
```

## Setup

```bash
cd skills/flow-tester/scripts
npm install              # installs playwright
npx playwright install chromium
```

## Run (manual / for development)

```bash
# 1) dashboard — open http://localhost:4500
node dashboard/server.mjs --port 4500

# 2) browser control server (drives Chromium, streams the live view)
node browser/control-server.mjs --dashboard http://localhost:4500 --port 4600 --headed

# 3) issue actions
curl -s localhost:4600/act -H 'content-type: application/json' \
  -d '{"action":"goto","url":"http://localhost:3000"}'
curl -s localhost:4600/act -H 'content-type: application/json' \
  -d '{"action":"click","role":"button","name":"Sign up"}'
```

Normally you don't run these by hand — the skill orchestrates them and drives the `/act` loop itself.

## Safety

- Security auditing runs **only on local source**, never against a URL.
- Production targets require explicit confirmation; writes there are ask-first.
- Payments and destructive deletes are never triggered automatically.
- The audit is strictly read-only — it never edits your code.
