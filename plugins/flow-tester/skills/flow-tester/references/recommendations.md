# Recommendations & proactive edge-case thinking

Beyond confirming the happy path, **actively think about how each flow could break or fall short**,
exercise those edge cases, and emit a **recommendation** when the app's behavior is missing, weak, or
risky — even if nothing is strictly "broken".

## Bug vs. recommendation

- **Bug** — something is observably wrong against an expectation (a step fails, wrong content, broken
  layout, console/network error). Post as `bug`.
- **Recommendation** — the app *works* but is missing a safeguard, a message, or handling for an edge
  case you think a real user will hit. Post as `recommendation`.

The canonical example: enter a valid email + a **wrong password** and the form goes silent — no error,
no toast, no message. The login didn't crash, so it isn't a functional bug, but the missing feedback
is a real problem → **recommendation** (high).

## Proactively generate edge cases

For every flow, before declaring it done, consider and (where safe) test these:

| Area | Edge cases to think about |
|------|---------------------------|
| **Auth** | wrong password, unknown email, empty fields, expired/invalid OTP, wrong OTP length, locked account, leading/trailing spaces in email |
| **Forms** | empty required fields, max-length overflow, invalid email/phone format, special chars / emoji / RTL text, pasting vs typing |
| **Submission** | double-submit (duplicate orders/records), slow network, submit then immediately navigate away |
| **Uploads** | wrong file type, very large file, empty file, zero-byte, missing file |
| **Lists / shops** | empty state (no products), out-of-stock item, very long product names, price = 0, broken product image |
| **Navigation** | direct-link to a protected page while logged out, back button after an action, refresh mid-flow |
| **Feedback** | is there a clear message for every failure? a loading state for every async action? |

Use the `type` action and the generated `upload` files (see [browser-driver.md](browser-driver.md)) to
actually exercise these where it's safe to do so. Respect the write policy — never trigger payments or
destructive deletes to "test" an edge case.

## How to post a recommendation
```
curl -s http://localhost:4500/event -H 'content-type: application/json' -d '{
  "type":"recommendation",
  "category":"validation",          // validation | edge-case | resilience | ux | accessibility | security-hygiene
  "severity":"high",                 // high | medium | low
  "flow":"login",
  "step":"wrong password",
  "title":"No error message shown on invalid password",
  "detail":"Valid email + wrong password leaves the form silent. Recommend a specific invalid-credentials message and an aria-live region.",
  "confidence":"high"
}'
```

## Discipline
- A recommendation is advice, not a fix — describe the gap and what good behavior looks like. Don't
  write the code unless the user asks.
- Prefer concrete, testable suggestions ("disable the Pay button after first click") over vague ones
  ("improve UX").
- If you tested an edge case and it actually broke, that's a `bug`, not a recommendation.
- Note which edge cases you could **not** safely test (e.g. payment double-submit) so coverage gaps
  aren't mistaken for passes.
