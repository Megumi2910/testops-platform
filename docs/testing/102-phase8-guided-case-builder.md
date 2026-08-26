# Phase 8 guided case builder evidence

Run this focused browser check against the isolated local Compose project. It
uses the bootstrap administrator only to create disposable project, suite, and
case records; no credentials, cookies, tokens, or response bodies are emitted
by the test.

```powershell
$env:E2E_BASE_URL='http://localhost:3100'
$env:MAILPIT_URL='http://localhost:8025'
$env:OAUTH_PROVIDER_PUBLIC_HOST='localhost'
$env:E2E_ADMIN_EMAIL='qa.bootstrap-admin@testops.local'
$env:E2E_ADMIN_PASSWORD=(Get-Content -Raw backend/.secrets/bootstrap-admin-password).Trim()
$env:PW_WORKERS='1'
npm --prefix frontend run e2e -- e2e/case-builder.spec.ts --project=chromium
```

## Recorded result

The focused run passed 1/1 Chromium test in 10.9 seconds. It observed the
three authoring stages, the step lifecycle controls, DRAFT behavior, duplicate
name recovery, and READY behavior including Run availability.

This document records only the verified case-builder slice. It is not a P8
completion claim and is not a replacement for the eventual sanitized P8
browser-evidence manifest.

Where to verify: [`frontend/e2e/case-builder.spec.ts`](../../frontend/e2e/case-builder.spec.ts).

## Navigation safety follow-up

The rebuilt isolated stack also passed the five-path navigation safety test:

```powershell
npm --prefix frontend run e2e -- e2e/navigation-safety.spec.ts --project=chromium
```

The test creates separate cases for click, form, redirect, script, and popup
navigation. Each execution case ended in the sanitized
`BLOCKED_NAVIGATION` category with the message `Browser navigation left the
approved project target`; the popup path is covered by the browser-context
route interceptor rather than relying on a later page event.

This is still a focused P8 slice record. The complete P8 manifest and later
P9/P10 release gates remain separate acceptance work.
