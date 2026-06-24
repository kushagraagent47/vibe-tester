# Demo video storyboard (40–60s)

The goal: someone watches this once and *gets it* — an AI clicks through a real app and finds a real
bug, live. No narration needed; the dashboard tells the story. Record at 1280×800, export a looping
GIF or MP4, drop it at the top of the README and use it as the Show HN / Product Hunt hero.

## What to record
Screen-record the **dashboard at http://localhost:4500** the whole time. Don't record your editor or
terminal — the dashboard is the product.

## Beat sheet

| Time | On screen | Why |
|------|-----------|-----|
| 0:00–0:04 | Dashboard empty, header reads `mode: B · target: saucedemo.com`. The left panel says "Waiting for the browser…" | Sets context in one glance |
| 0:04–0:12 | Left panel springs to life: the browser loads the login page, types the email, types the password (you can see the fields fill) | "It's a *real* browser, driving itself" |
| 0:12–0:18 | Click Login → the products page renders. A couple of **Steps** flip to green `pass` on the right | Momentum + the pass/fail idea |
| 0:18–0:30 | Browser goes back and submits a **wrong password**. The left panel shows the red error banner | Build to the payoff |
| 0:30–0:38 | A **bug card** slides into the Bugs tab: `[MEDIUM] Error banner clipped, overlaps the Login button`. Bug counter ticks up | The reveal — it caught something a human skims past |
| 0:38–0:48 | Click the **Recs** tab: `[HIGH] No feedback or lockout after repeated failed logins` and a double-submit rec | "It also tells you what's *missing*, not just what's broken" |
| 0:48–0:55 | Pull back to the full dashboard: live view + steps + bugs + recs all populated | The whole thing at a glance |

## How to stage it (so the recording is clean)

1. Start the dashboard:
   ```
   node dashboard/server.mjs --port 4500
   ```
2. Start the browser control server **headed** so the screencast is smooth:
   ```
   node browser/control-server.mjs --dashboard http://localhost:4500 --port 4600 --headed
   ```
3. Open `http://localhost:4500`, start your screen recorder, then drive the run (these are the exact
   calls — paste them one at a time so the pacing looks deliberate):
   ```
   curl localhost:4600/act -d '{"action":"goto","url":"https://www.saucedemo.com"}'
   curl localhost:4600/act -d '{"action":"fill","selector":"#user-name","value":"standard_user"}'
   curl localhost:4600/act -d '{"action":"fill","selector":"#password","value":"secret_sauce"}'
   curl localhost:4600/act -d '{"action":"click","role":"button","name":"Login"}'
   curl localhost:4500/event -d '{"type":"step","flow":"login","step":"reach products","verdict":"pass"}'
   curl localhost:4600/act -d '{"action":"goto","url":"https://www.saucedemo.com"}'
   curl localhost:4600/act -d '{"action":"fill","selector":"#user-name","value":"standard_user"}'
   curl localhost:4600/act -d '{"action":"fill","selector":"#password","value":"wrong-password"}'
   curl localhost:4600/act -d '{"action":"click","role":"button","name":"Login"}'
   curl localhost:4500/event -d '{"type":"bug","category":"visual","severity":"medium","flow":"login","step":"wrong password","title":"Error banner clipped, overlaps the Login button","detail":"The red error banner is too short for its text; the last line is cut off and overlaps the Login button."}'
   curl localhost:4500/event -d '{"type":"recommendation","category":"validation","severity":"high","flow":"login","step":"repeated failed logins","title":"No feedback or lockout after repeated failed logins","detail":"Many wrong attempts give the same generic error with no rate-limit signal."}'
   ```
   (omit the `-H content-type` for brevity above; add `-H 'content-type: application/json'` if your curl needs it)
4. Click the **Recs** tab on camera at ~0:38, hold the final wide shot, stop recording.

## Export tips
- Trim to ≤ 60s, loop it.
- GIF if you want it to autoplay inline on GitHub/HN; MP4 (smaller, sharper) for Product Hunt.
- Keep the file under ~8 MB so it loads fast in the README.
- First frame matters (it's the poster) — make it the populated dashboard, not the empty state.
