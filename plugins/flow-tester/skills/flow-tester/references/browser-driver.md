# Browser driver protocol

You drive a real Chromium browser through the approved flows via a small local **control server**.
The control server launches Chromium, streams a live view to the dashboard, and exposes an HTTP
`/act` endpoint. You issue one action at a time, read the result, judge it, and log bugs.

## 1. Start the control server (background)
```
node {baseDir}/scripts/browser/control-server.mjs \
  --dashboard http://localhost:4500 \
  --port 4600 \
  --headed            # show the window; omit for headless (live view still streams)
```
It writes screenshots to `flow-tester/session/shots/` and posts live frames + per-action thumbnails
to the dashboard.

## 2. Issue actions
`POST http://localhost:4600/act` with a JSON body. One action per call:

| action | body fields | does |
|--------|-------------|------|
| `goto` | `url` | navigate |
| `snapshot` | — | return the current accessibility tree + screenshot (no interaction) |
| `click` | `role`+`name`, or `text`, or `selector` (+ optional `nth`) | click an element |
| `fill` | (`selector` or `role`+`name`) + `value` | set a field's value |
| `type` | locator + `value` | type character-by-character (auto-advancing inputs, OTP boxes) |
| `select` | locator + `value` | choose a `<select>` option |
| `upload` | locator (a file input) + `file` spec, or `path` | attach a file (generated on demand — see below) |
| `genfile` | `file` spec | write a synthetic file to disk, returns its path (for drag/drop flows) |
| `press` | `key` (e.g. `Enter`) | keyboard press |
| `waitFor` | `selector`, `state` (`visible`/`hidden`), `timeoutMs`, or `ms` | wait for a condition / fixed delay |
| `back` / `reload` | — | history navigation |

Prefer **role + accessible name** or visible **text** over CSS selectors — it matches how a user
finds things and is far less brittle.

Example:
```
curl -s localhost:4600/act -H 'content-type: application/json' \
  -d '{"action":"click","role":"button","name":"Sign up"}'
```

### Generating & uploading files

When a flow needs a file upload, **fabricate one** — don't get stuck. The `file` spec describes what
to generate: `kind` is `pdf` | `png` | `txt` | `csv` | `json` (images always come out as PNG), with
optional `name` and `text`.

```
# upload a generated PDF into a file input
curl -s localhost:4600/act -H 'content-type: application/json' -d '{
  "action":"upload","selector":"#file-upload",
  "file":{"kind":"pdf","name":"invoice.pdf","text":"flow-tester test invoice"}
}'
```
- For a custom drop-zone / button that opens a native file chooser, add `"chooser": true` (the server
  clicks the located element and feeds the file to the chooser).
- To use a real file instead of a generated one, pass `"path": "/abs/path/file.pdf"`.
- `genfile` just writes the file to `session/uploads/` and returns `generatedPath` — use it when the UI
  takes files via drag-and-drop or a hidden input you must set another way.

## 3. Read the response
Each `/act` returns JSON:
```json
{
  "ok": true,
  "url": "http://localhost:3000/signup",
  "title": "Sign up",
  "screenshotPath": "/abs/path/flow-tester/session/shots/0007.png",
  "a11y": "<aria snapshot text>",
  "consoleErrors": ["TypeError: ..."],
  "networkErrors": [{ "url": "...", "status": 500, "method": "POST" }]
}
```
- Use `a11y` to locate elements for the **next** action reliably.
- **Read the `screenshotPath` image** to judge visual + content correctness (use the Read tool).
- `consoleErrors` / `networkErrors` are drained since the previous action — non-empty usually means
  a `console-network` bug.

## 4. Judge and log
For each step, compare what happened to the step's `expect` and the project description. On a
failure, classify per [bug-criteria.md](bug-criteria.md) and post it:
```
curl -s http://localhost:4500/event -H 'content-type: application/json' -d '{
  "type":"bug",
  "category":"content",
  "severity":"high",
  "flow":"auth-happy-path",
  "step":"enter wrong password",
  "title":"Wrong-password error is generic",
  "detail":"Submitted a valid email with a bad password; the form showed \"Something went wrong\" instead of an invalid-credentials message.",
  "screenshot":"/abs/path/.../0011.png",
  "confidence":"high"
}'
```
Also post `step` events (pass/fail) so the dashboard timeline stays current, and a `phase` event when
you move between flows.

## 5. Write policy (enforce)
- Non-production confirmed → normal writes (signup/login/post) allowed.
- **Always blocked:** payments, destructive deletes. If a flow requires one, log it as skipped and
  move on.
- Mode B against production → **ask the user before any write action.**

## 6. Resilience
- Wrap each step; if an action throws or times out, log it as a `functional` bug and continue.
- A broken step should not kill the run — recover, or skip to the next flow.
- When done, POST `{ "type":"done", "workstream":"browser" }` and stop the control server.
