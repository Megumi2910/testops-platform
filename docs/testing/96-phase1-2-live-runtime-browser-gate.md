# Phase 1/2 — Rebuilt-runtime browser evidence

## Test matrix

| Area | Evidence | Result |
| --- | --- | --- |
| Current image revision | Frontend/backend labels match `8d85c03` | PASS |
| Stale-lazy-chunk recovery | Playwright retained-tab simulation | PASS |
| Invalid OTP recovery | Register → invalid code → valid code | PASS |
| Protected return URL | Unverified login returns to `/projects` after verification | PASS |
| Session management | Two sessions, individual revoke, revoke-all | PASS |
| Deterministic Google | Provider sign-in and refresh | PASS |
| OAuth failure safety | Callback shows sanitized provider error | PASS |
| Account menu | Accessible menu, permitted items, Escape focus restoration | PASS |
| Mobile drawer | Modal navigation, close action, focus containment path | PASS |
| Account security route | Providers, refresh, session list all `200` | PASS |
| Mobile accessibility | Lighthouse accessibility `100` | PASS |
| Mobile best practices | Lighthouse best-practices `100` | PASS |
| Mobile layout | `scrollWidth = innerWidth = 320` | PASS |
| Authenticated console | No error/warning messages on account route | PASS |

## Reproduction commands

Build and start the disposable stack from the repository root:

```powershell
$env:VCS_REF = (git rev-parse HEAD)
docker compose -p testops-live-gate -f docker-compose.yml -f docker-compose.e2e.yml build
docker compose -p testops-live-gate -f docker-compose.yml -f docker-compose.e2e.yml up -d
```

Run the focused browser group from `frontend/`:

```powershell
$env:E2E_BASE_URL = 'http://localhost:3100'
$env:MAILPIT_URL = 'http://127.0.0.1:8025'
npm run e2e -- phase2-stale-bundle.spec.ts phase5-auth-session-matrix.spec.ts phase5-google-boundary.spec.ts
```

The observed result was `6 passed (14.3s)`. Clean up only the disposable
project when finished:

```powershell
docker compose -p testops-live-gate -f docker-compose.yml -f docker-compose.e2e.yml down -v
```

Do not substitute the normal Compose project name in the cleanup command.

## Release boundary

This evidence closes the rebuilt-runtime shell/account smoke gate and confirms
that QG-010 recovery is reachable in the current image. It does not claim a
real two-image deployment swap, real Google credentials, or the complete
Milestone 10A Chrome DevTools matrix. Those remain explicit release-gate work.
