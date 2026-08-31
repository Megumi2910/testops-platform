# Phase 2 — Stale-bundle recovery test evidence

## Scope

This regression slice proves that a Vite chunk failure is recoverable without
an infinite reload loop and that the published frontend carries a correlatable
revision.

| Case | Expected result | Result |
| --- | --- | --- |
| Dynamic-import error classification | Vite chunk/module failures trigger recovery; API errors do not | PASS |
| First failure for a route | Session marker is written and the browser reload callback runs once | PASS |
| Repeated failure for the same revision and route | No second automatic reload | PASS |
| Different route in the same tab | It receives an independent recovery key | PASS |
| Retained-tab browser simulation | The second unavailable chunk failure renders the branded recovery page | PASS (automated E2E) |
| Build metadata | Docker `VCS_REF` becomes `VITE_APP_REVISION` and remains an OCI revision label | PASS (source/build gate) |
| SPA shell caching | `/index.html` is no-store; hashed assets remain immutable | PASS (Nginx configuration inspection) |

## Commands

From `frontend/`:

```powershell
npm run lint
npm run typecheck
npm test -- --run
npm run build
```

The current local result is lint PASS, typecheck PASS, 16 test files / 50
tests PASS, and Vite production build PASS. After rebuilding the isolated
`testops-quality-gate` frontend from the current source, the targeted retained-
tab E2E also passed against `http://localhost:3000`.

The browser regression runs with the normal E2E command:

```powershell
npm run e2e -- phase2-stale-bundle.spec.ts
```

It starts from `/`, records the scripts already loaded by the retained tab,
then navigates to `/password-reset` while aborting only newly requested script
chunks. The first failure invokes the automatic reload; the second failure is
allowed to reach `RouteErrorPage`. No credentials, tokens, or page content are
captured by this test.

## Release interpretation

This slice closes the automatic reload and branded recovery behavior in QG-010.
The full deployment exercise that builds revision A, keeps a real browser tab
open, deploys revision B, and navigates that tab remains an operational follow-
up. The existing Chrome DevTools matrix must still be run against a rebuilt QA
image before Milestone 10A can be marked complete.
