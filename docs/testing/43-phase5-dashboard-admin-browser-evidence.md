# Phase 5 dashboard and administrator browser evidence

## Scope

`frontend/e2e/phase5-dashboard-admin-matrix.spec.ts` covers the two remaining browser contracts that do not require privileged fixture credentials:

| Scenario | Evidence | Expected result |
| --- | --- | --- |
| Verified member completes a real local-target run and opens the dashboard | Run detail, dashboard headings, dashboard API responses | Reporting renders populated/empty cards without a network error; all three dashboard requests return HTTP 200. |
| Guest opens `/admin/users` | Login redirect and preserved `returnTo` | The guest is sent to the login form and the original protected destination is retained. |
| Verified member opens `/admin/users` | Redirect destination and absence of user-management heading | The platform-permission guard sends a non-administrator to `/dashboard`; no administrator content is rendered. |

The dashboard test creates only run-prefixed QA records through the UI, executes a real `NAVIGATE /` case against the isolated static target, and then reads the three scoped dashboard resources through the frontend. It does not mutate dashboard data directly or reset a database.

## Verification

Run against the isolated stack:

```powershell
$env:E2E_BASE_URL = 'http://127.0.0.1:3100'
$env:MAILPIT_URL = 'http://127.0.0.1:8025'
npm run e2e -- phase5-dashboard-admin-matrix.spec.ts --reporter=line
```

The guest and verified-member administrator checks validate both authentication and platform-permission routing. A full administrator CRUD matrix still requires a dedicated bootstrap-admin fixture and remains open in `QG-B10`.

The focused run passed on 2026-08-12: all 3 scenarios completed in 13.5 seconds against freshly rebuilt isolated frontend/backend images. The dashboard scenario observed at least three reporting responses, all HTTP 200, after the completed run.

## Remaining dashboard gate

This slice proves populated UI rendering and HTTP success responses. It does not replace PostgreSQL aggregate/query-count tests or the remaining Chrome DevTools range, date-boundary, mobile, and performance evidence.
