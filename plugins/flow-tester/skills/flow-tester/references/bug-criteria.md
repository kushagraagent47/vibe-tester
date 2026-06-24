# Bug criteria & classification

Judge every step against its `expect` and the project description. When something is wrong, post a
`bug` event with one of these categories. Be specific and include the screenshot path + repro steps.

## Categories

### `functional` — the flow breaks
The step cannot complete or completes wrongly: button does nothing, navigation fails, 500 page,
infinite spinner, redirect to the wrong place, form won't submit. Highest priority.

### `content` — incorrect information shown
The page loads but says the wrong thing. The canonical case: enter a wrong email/password and the
error message is missing, generic when it should be specific, or actively misleading. Also: wrong
success copy, broken validation (accepts clearly invalid input, or rejects valid input), wrong
labels, placeholder text left in production.

### `visual` — layout / rendering
Judged from the screenshot: overlapping or cut-off elements, broken/missing images, unstyled
(FOUC) content, text overflowing containers, controls off-screen or unclickable, severe contrast
issues. Only flag if a real user would notice; ignore pixel nitpicks.

### `console-network` — runtime errors during the step
Captured from the browser: uncaught JS exceptions, failed API calls (4xx/5xx) that the user didn't
expect, CORS failures, mixed-content warnings, resources that 404. A clean-looking page with a
500 in the network log is still a bug.

## Severity
- **critical** — blocks the core flow for all users (login broken, checkout 500s).
- **high** — flow works but is clearly wrong (data not saved, misleading error on a security path).
- **medium** — degraded but usable (validation gap, recoverable error).
- **low** — cosmetic / minor copy.

## Bug vs. recommendation
A **bug** is something observably wrong against an expectation. If the app *works* but is missing a
safeguard or message — e.g. a wrong password produces **no error at all** — that's a **recommendation**,
not a bug. Post those as `recommendation` events and proactively hunt for edge cases per
**[recommendations.md](recommendations.md)**.

## Judging discipline
- The `expect` field + the project description are the oracle. If you can't tell whether something
  is wrong, say so in the bug as `confidence: low` rather than inventing a verdict or staying silent.
- One screenshot can carry several bugs — log each separately.
- Don't report the same issue on every page; note "occurs site-wide" once.
- You are identifying, not fixing. Describe the bug and how to reproduce it; do not propose code
  changes unless the user asks.
