# Flow discovery (hybrid)

Goal: produce `flow-tester/session/flows.json` — an ordered set of user flows, each a list of steps
with an `action`, a plain-language `target`, and an `expect` (the per-step oracle).

## Mode A — local source (static, then live)

### 1. Detect the stack
- Frontend: look for `package.json` (React/Next/Vue/Svelte/Angular), or server-rendered templates
  (Django `templates/`, Rails `app/views/`, Laravel `resources/views/`, `.erb/.blade/.jinja`).
- Backend / routes: framework routers — Next `app/`/`pages/api`, Express/Fastify route files,
  Django `urls.py`, Rails `config/routes.rb`, Laravel `routes/`, FastAPI/Flask decorators, Spring
  `@RequestMapping`, etc.

### 2. Enumerate endpoints and pages
- List every **API endpoint** (method + path + the handler file).
- List every **frontend route/page** the user can reach.

### 3. Trace UI → API
For each page, find the interactive elements (buttons, links, forms) and follow their handlers to
the API calls they trigger. This links a *user action* to a *network call*, which is what makes a
"flow" rather than a list of pages.

### 4. Live confirmation pass
Start the app (use the user's start command), open the base URL in the browser control server, and
click through the obvious entry points while capturing **real network calls**. Use this to confirm
the static graph and catch anything dynamic that static analysis missed.

## Mode B — URL only (live)
No source access. Open the URL, read the rendered accessibility tree, follow visible links/forms,
and observe network traffic. Prefer flows the user explicitly named ("check login"). Do not guess
at hidden/admin flows.

## flows.json shape
```json
{
  "flows": [
    {
      "id": "auth-happy-path",
      "title": "Sign up then log in then reach dashboard",
      "steps": [
        { "action": "goto",  "target": "the home page",                 "expect": "landing page renders, no console errors" },
        { "action": "click", "target": "the Sign up button in the nav",  "expect": "signup form appears" },
        { "action": "fill",  "target": "email + password fields",        "expect": "fields accept input" },
        { "action": "click", "target": "the Create account button",      "expect": "redirected to dashboard, welcome message shown" }
      ]
    }
  ]
}
```

Keep `expect` concrete — it is the standard the browser agent judges each screen against. Include at
least one **negative path** per auth flow (e.g. wrong password → the error message must be correct
and specific), since incorrect error messages are a primary thing we report.
