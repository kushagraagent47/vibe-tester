# Workflow — Mode B: standalone URL black-box test

Use when the user gives only a URL (no source). **No security audit ever runs in this mode.**

1. **Intake** (SKILL Phase 0): the URL, what the app is, which flow(s) to check, and credentials if
   a protected flow is involved. Detect whether the URL is production.
2. **If production:** set the write policy to **ask-first** — confirm before any signup/post/write.
   Payments and deletes stay blocked regardless.
3. **Install deps once** (ask first): in `scripts/`, `npm install` && `npx playwright install chromium`.
4. **Discover flows live** ([flow-discovery.md](../references/flow-discovery.md) Mode B): open the URL,
   read the accessibility tree, follow visible links/forms, observe network traffic. Prefer the
   flow(s) the user explicitly named. Write `flows.json`.
5. **Confirm** the flows with the user.
6. **Start the dashboard** (`server.mjs --port 4500`), post `mode`/`target`/`flows`, point the user to it.
7. **Run the browser workstream only** ([browser-driver.md](../references/browser-driver.md)): drive
   each flow, judge each screen, post `bug`/`step` events. No second agent, no security scan.
8. **Report**: write `session/report.md`, summarize. Identify-only.
