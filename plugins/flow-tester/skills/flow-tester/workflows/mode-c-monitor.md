# Workflow — Mode C: scheduled monitoring

Use when the user wants flows re-tested **on a recurring schedule** — e.g. "check all my products
every 20 minutes." This is **deterministic** monitoring (no AI judgement per cycle), which makes it
cheap and fast to run continuously.

## When to use
- "Test all the products every 20/30 minutes."
- "Keep checking that login + checkout still work."
- Uptime/regression watching for a known set of pages or flows.

## Steps

1. **Discover the targets once.** Enumerate the URLs/flows to watch (e.g. crawl the shop's product
   listing to collect every product URL). Confirm the list with the user.
2. **Turn each target into a check** with deterministic assertions — no vision needed:
   - `status_ok` — no 5xx (set `"failOn4xx": true` on the check to also fail on 4xx)
   - `a11y_contains` / `a11y_not_contains` — expected text present/absent (e.g. "Add to cart", not "Out of stock")
   - `url_contains` — landed on the right page
   - `no_console_errors`
3. **Write `flow-tester/session/monitor.json`:**
   ```json
   {
     "control": "http://localhost:4600",
     "dashboard": "http://localhost:4500",
     "intervalMin": 20,
     "checks": [
       { "name": "Product: Blue Shirt",
         "steps": [{ "action": "goto", "url": "https://shop.example.com/p/blue-shirt" }],
         "assert": [ { "type": "status_ok" }, { "type": "a11y_contains", "value": "Add to cart" } ] }
     ]
   }
   ```
4. **Start the dashboard and the browser control server** (as in the other modes).
5. **Run the monitor:**
   ```
   node {baseDir}/scripts/monitor.mjs --spec flow-tester/session/monitor.json
   ```
   It runs every cycle, posts a `monitor` result + `step` per check, and raises a `bug` (high) on any
   failure. Use `--once` for a single pass, or `--interval N` to override the cadence.

## Two ways to schedule
- **Deterministic (recommended for "every 20 min"):** leave `monitor.mjs` running — it loops on its
  own interval. Cheap, no AI cost per cycle.
- **AI/vision judgement on a schedule:** if each cycle needs Claude to *look* at pages and reason
  (not just assert text), drive the full skill from Claude Code's `/loop` or `schedule` (cron)
  instead of `monitor.mjs`, so a fresh agent re-runs the flows each interval.

## Notes
- Monitoring is **read navigation only** by default — don't script writes/payments into a loop that
  runs unattended every few minutes.
- Failures appear on the dashboard live (Bugs + Steps tabs) and in `report.md`.
