# Security audit (Mode A only — local source)

Read-only audit of the local codebase. **Never run against a URL. Never edit files. Identify only.**
Run this as a subagent, in parallel with browser testing, posting findings to the dashboard as you go.

## Tooling: tools + Claude reasoning

### 1. Automated scanners (run if available; install only with user consent)
- **Semgrep** — `semgrep --config auto --json` over the source. If not installed, suggest
  `pipx install semgrep` (or `brew install semgrep`) but don't install without an OK.
- **Dependency / supply-chain** — `npm audit --json`, `pip-audit`, `osv-scanner`, etc. per stack.
- **Secret scanning** — grep for hardcoded keys/tokens, or `gitleaks` if present.
Parse scanner output, deduplicate, and treat each as a candidate finding to verify (don't dump raw).

### 2. Claude reasoning via the Trail of Bits skills
If the [trailofbits/skills](https://github.com/trailofbits/skills) marketplace is installed, lean on
those playbooks for judgment — they teach *when/why*, not just rules:
- `insecure-defaults` — hardcoded credentials, weak defaults, debug mode on.
- `audit-context-building` — architectural read of trust boundaries before diving in.
- `static-analysis` / `semgrep-rule-creator` — running and interpreting CodeQL/Semgrep/SARIF.
- `supply-chain-risk-auditor` — dependency takeover / exploitation risk.
- `differential-review` / `sharp-edges` — risky change blast radius, footgun APIs.
- `variant-analysis`, `fp-check` (false-positive triage) to keep the report honest.

If they aren't installed, audit from first principles for the usual web classes below.

## What to look for (web app focus)
- **AuthN / AuthZ:** missing access checks, broken session handling, IDOR, JWT misuse.
- **Injection:** SQL/NoSQL, command, template, XSS (stored/reflected/DOM), SSRF.
- **Secrets & config:** keys/tokens in source or `.env` committed to the repo, permissive CORS,
  debug endpoints, verbose error leakage.
- **Input validation:** unvalidated input reaching queries, file paths, or shells.
- **Sensitive data:** PII logged, weak hashing, plaintext storage.
- **Dependencies:** known-vuln packages, abandoned/typosquatted deps.

## Reporting
For each finding, POST a `security` event to the dashboard:
```
curl -s http://localhost:4500/event -H 'content-type: application/json' -d '{
  "type":"security",
  "severity":"high",
  "category":"injection",
  "title":"Unsanitized user input in SQL query",
  "file":"src/api/users.ts",
  "line":42,
  "detail":"req.query.id is concatenated into a SQL string — SQL injection.",
  "confidence":"high"
}'
```
- Verify before reporting; mark uncertain ones `confidence: low` rather than asserting.
- No fixes in the report unless the user asks — describe the issue, location, and impact.
- When done, POST `{ "type":"done", "workstream":"security" }`.
