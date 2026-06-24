# Workflow — Mode A: local white-box test + security audit

Use when the user has the source code locally and can run the app.

1. **Intake** (SKILL Phase 0). Confirm: source path, base URL, start command, test credentials,
   and that the target is **non-production**. Write `flow-tester/session/config.json`.
2. **Install deps once** (ask first): in `scripts/`, `npm install` then `npx playwright install chromium`.
3. **Discover flows** (SKILL Phase 1, [flow-discovery.md](../references/flow-discovery.md)): static
   analysis of routes/endpoints + UI→API tracing, then a live confirmation pass. Write `flows.json`.
4. **Confirm** the flow graph with the user (Phase 2). Apply edits.
5. **Start the dashboard:** `node {baseDir}/scripts/dashboard/server.mjs --port 4500`. Point the user
   to http://localhost:4500. Post `mode`, `target`, and `flows` events so the dashboard is populated.
6. **Spawn two subagents in parallel:**
   - *security* → [security-audit.md](../references/security-audit.md), read-only, posts `security` events.
   - *browser* → [browser-driver.md](../references/browser-driver.md), drives flows, posts `bug`/`step` events.
7. **Report** (Phase 5): write `session/report.md`, summarize. No fixes unless asked.
