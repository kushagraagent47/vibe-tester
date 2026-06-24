---
name: flow-tester
description: >-
  Tests a web application by discovering its user flows, driving a real Chromium browser
  through them while streaming a live dashboard, and judging each screen with vision.
  Flags functional failures, incorrect content, visual/layout problems, and console/network
  errors. On a local codebase it also runs a read-only security audit. Use when the user
  asks to test an app, check whether a flow (login, signup, checkout) works, find bugs in a
  web app, or audit a local codebase. Identify-only — it reports issues, it does not fix them.
---

# flow-tester

Drive a real browser through an app's user flows, watch it on a live dashboard, and report
bugs. Optionally audit local source for security issues. **Never fixes anything — identify only.**

## When to use
- "Test my app / find bugs in my web app."
- "Does the login / signup / checkout flow work?" (against a URL or a local app)
- "Audit my codebase for security issues" (local source present).

## When NOT to use
- Unit/integration test authoring against code internals — this is black-box flow testing.
- Native mobile apps (Playwright drives web only).
- Security scanning of a site you only have a URL for — **security auditing requires local source.**

## The two modes (decide this first)

| Mode | Trigger | Flow discovery | Security audit |
|------|---------|----------------|----------------|
| **A — Local (white-box)** | User has the source code locally AND can run the app | Hybrid: static code analysis + live network capture | ✅ Yes — on source only |
| **B — Standalone URL (black-box)** | User gives only a URL (may be production) | Live only: navigate + observe, or user-described flows | ❌ Never |

Detect the mode from the request. If ambiguous, ask. **Security auditing only ever runs on local
source code — never against a live/production URL.**

---

## Phase 0 — Intake

Ask the user (skip anything already provided):
1. **What is this project?** One or two sentences on what it does and who uses it. This is the
   oracle for judging "correct" later.
2. **Target.** A base URL. For Mode A this is the locally running app (e.g. `http://localhost:3000`)
   plus the **start command** if it isn't running yet, and the **path to the source**.
3. **Credentials / test data.** Username + password (or signup details) for any protected flow.
4. **Environment confirmation.** Is the target non-production? Record the answer.
   - If the target host is or looks like production (public domain, not localhost/staging), force
     **Mode B**, disable the security audit, and set the write policy to **ask-first**.

Write the answers to `flow-tester/session/config.json` in the working dir.

## Phase 1 — Understand the app & discover flows

See **[references/flow-discovery.md](references/flow-discovery.md)** for the full method.

- **Mode A:** Detect the stack. Enumerate backend API endpoints (route definitions) and frontend
  routes/pages. Trace UI actions (buttons/links/forms) → handlers → API calls. Then start the app
  and do a quick live pass, capturing real network calls to confirm and fill gaps.
- **Mode B:** Open the URL in the browser, observe links/forms and network traffic, and/or use the
  flows the user described.

Produce a **flow graph**: an ordered list of flows, each a sequence of steps. Each step has an
`action` (what the user does), a `target` (described in plain language), and an `expect` (what
should happen — the per-step oracle). Save to `flow-tester/session/flows.json`.

## Phase 2 — Confirm flows with the user

Show the discovered flows (a compact numbered list or a mermaid diagram) and ask:
*"Is this the set of flows you want tested? Add, remove, or edit any."* Apply edits to
`flows.json`. **Do not start testing until the user approves.**

## Phase 3 — Launch dashboard, then run agents in parallel

1. **Start the dashboard** (background process):
   ```
   node {baseDir}/scripts/dashboard/server.mjs --port 4500
   ```
   Tell the user to open **http://localhost:4500**. The dashboard URL is the ingest endpoint for
   all events: `http://localhost:4500/event`.

2. **Run the two workstreams in parallel by spawning subagents** (you, the main agent, orchestrate):
   - **Security subagent — Mode A only.** Follow **[references/security-audit.md](references/security-audit.md)**.
     Read-only audit of the source; post each finding to the dashboard. Never edits files.
   - **Browser subagent.** Follow **[references/browser-driver.md](references/browser-driver.md)**.
     Starts the browser control server, drives each confirmed flow, judges screens, posts bugs.

   In Mode B there is only the browser workstream.

> A skill cannot spawn agents on its own — **you** spawn them via the Agent tool, passing each the
> relevant reference file and the session config. Give both the same dashboard URL so findings
> interleave live.

## Phase 4 — Browser testing loop (run by the browser subagent)

Full protocol in **[references/browser-driver.md](references/browser-driver.md)**. In short:

1. Start the control server (launches Chromium, streams a live view to the dashboard):
   ```
   node {baseDir}/scripts/browser/control-server.mjs --dashboard http://localhost:4500 --port 4600 --headed
   ```
2. For each step in each approved flow, POST an action to `http://localhost:4600/act`. The server
   returns the new URL/title, an **accessibility snapshot**, a saved **screenshot path**, and any
   **console/network errors** since the last action.
3. **Judge the result** against the step's `expect` and the project description, using both the
   accessibility snapshot and by **Reading the screenshot image**. Decide pass/fail.
4. Classify any failure per **[references/bug-criteria.md](references/bug-criteria.md)** and POST a
   `bug` event to the dashboard. Keep going — one failing step should not abort the whole run
   (recover or skip to the next flow).

**Write policy:** after the user confirms the env is non-production, normal writes (signup, login,
posting) are allowed, but **payments and destructive deletes are always blocked**. In Mode B against
production, **ask before any write**.

## Phase 5 — Report

When both workstreams finish, generate the durable report from the live dashboard state:
```
node {baseDir}/scripts/report.mjs --dashboard http://localhost:4500 --out flow-tester/session/report.md
```
This pulls every posted `bug`/`security`/`step`/`flow` event and writes a Markdown report grouped by
category + severity. Review it, add reproduction notes where useful, and summarize for the user. The
dashboard already shows everything live; the report is the durable artifact. **Propose no fixes unless
the user asks.**

---

## Safety rails (always)
- Security auditing runs **only on local source**, never against a URL.
- Never test a production target without explicit confirmation; default writes to ask-first there.
- **Never** trigger payments or destructive deletes automatically.
- Read-only on the codebase — the audit never edits files.
- Treat credentials as secrets: keep them in `session/config.json`, never echo them to the dashboard
  or logs.
