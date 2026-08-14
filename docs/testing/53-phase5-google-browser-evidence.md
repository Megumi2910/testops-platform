# Phase 5 Google OAuth browser evidence

## Environment

| Component | Value |
| --- | --- |
| Compose project | `testops-e2e` |
| Frontend | `http://localhost:3100` |
| Backend | `http://localhost:8180` |
| Deterministic provider | `http://localhost:9090` |
| Provider profile | `QA Google User` / `qa.google@testops.local` |
| Provider scopes | `profile,email` |
| Evidence policy | No passwords, cookies, authorization headers, codes, tokens, or secrets |

## Matrix

| Case | Scenario | Result |
| --- | --- | --- |
| G-01 | Login page advertises Google, authorization redirects through the public provider URL, callback creates the fixed verified identity, and a page refresh keeps the session | PASS |
| G-02 | Synthetic callback error renders `Google sign-in could not be completed.` without provider details, token-like text, stack text, or exception text | PASS |

## Reproduction

```powershell
docker compose -p testops-e2e -f docker-compose.yml -f docker-compose.e2e.yml up -d --build --force-recreate oauth-provider backend frontend
Set-Location frontend
npm exec playwright test e2e/phase5-google-boundary.spec.ts --config=e2e/playwright.config.ts --workers=1
```

Observed focused result: **2 passed** in approximately 2.4 seconds after rebuilding the provider and backend images. The earlier failure was diagnosed from the provider request path: the backend exchanged the code but did not request user-info because the fixture was configured with `openid` while returning no signed ID token. Making scopes configurable and using `profile,email` in E2E resolved the protocol mismatch without changing production defaults. GitHub Actions run `31681331701` then passed all five repository gates: backend, frontend, containers, local-target-disabled E2E, and full E2E.

## Security and release interpretation

- The local provider is reachable only in the disposable E2E Compose profile.
- The provider uses fixed test data and does not contain real credentials.
- The callback assertion proves error sanitization, not Google account trustworthiness.
- This closes the deterministic Google OAuth sub-gate (`QG-B02`) for repeatable browser automation.
- It does **not** close real Google-provider validation, Chrome DevTools authentication evidence, or the overall Phase 5 release gate.

Chrome DevTools could not be used for this slice because the MCP tool reported a usage limit. The limitation is recorded rather than hidden; Playwright output and container health were the available evidence sources.
