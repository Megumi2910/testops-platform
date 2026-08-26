# Phase 8 guided case builder

The case builder is the authoring boundary between reusable test templates and
executable cases. This slice verifies the browser workflow that operators use
to choose a template, author steps, review the definition, and persist either a
draft or a runnable case.

## Verified workflow

The Chromium acceptance spec covers:

- Details → Steps → Review stage navigation.
- Search-template and homepage-template initialization.
- Step action rendering, duplication, reordering, and removal.
- Draft persistence with Run unavailable.
- Duplicate-name recovery through the copy suggestion, followed by READY
  persistence and Run availability.

The duplicate-name branch is intentional: a second case with the same name is
not silently overwritten. The operator must accept the suggested copy before a
READY case can be saved.

## Verification

```powershell
$env:E2E_BASE_URL='http://localhost:3100'
$env:MAILPIT_URL='http://localhost:8025'
$env:OAUTH_PROVIDER_PUBLIC_HOST='localhost'
$env:E2E_ADMIN_EMAIL='qa.bootstrap-admin@testops.local'
$env:E2E_ADMIN_PASSWORD=(Get-Content -Raw backend/.secrets/bootstrap-admin-password).Trim()
$env:PW_WORKERS='1'
npm --prefix frontend run e2e -- e2e/case-builder.spec.ts --project=chromium
```

The focused run passed one Chromium test in 10.9 seconds. The status
assertions target the rendered case badge rather than hidden select options,
which keeps the proof tied to the visible state presented to the operator.

This is the current P8 case-builder proof slice; the remaining P8 execution,
retention, query-budget, navigation-safety, and canonical evidence gates are
still pending.

Where to verify: [`frontend/e2e/case-builder.spec.ts`](../../frontend/e2e/case-builder.spec.ts).

## Navigation safety follow-up

The disposable target fixture now exercises five browser escape paths:
ordinary links, external form submission, redirect links, script-driven
`location.assign`, and `target="_blank"` popups. `PlaywrightCaseRunner` guards
these at the browser-context routing boundary before the first disallowed
navigation request is sent, while page request/frame observers retain the
sanitized `BLOCKED_NAVIGATION` diagnostic.

The rebuilt isolated runtime passed the focused Chromium matrix with all five
cases classified as `BLOCKED_NAVIGATION` and no sink requests reaching the
outside origin:

```powershell
npm --prefix frontend run e2e -- e2e/navigation-safety.spec.ts --project=chromium
```

The context-level route is important for popups because their first request
can arrive before a `Page` callback has a usable frame. The source-level
regression remains covered by `PlaywrightNavigationSafetyIT`.
