# E2E browser-origin alignment

## Problem

The isolated Compose profile advertises `FRONTEND_ORIGIN=http://localhost:3100`.
The CI browser was instead opened at `http://127.0.0.1:3100`. Both addresses
reach the same loopback service, but they are different web origins. TestOps
therefore correctly rejected origin-protected refresh and logout requests with
`403 Request origin is not allowed`.

That mismatch made the password-reset browser journey timing-sensitive. The
login page could be rerendered while the test was filling its controlled form;
the email field was then empty when the submit button was clicked. Chromium
reported its native required-field validation, so no `/api/v1/auth/login`
request was sent and the test stayed on `/login`.

## Resolution

The browser-facing E2E origin is now consistently `http://localhost:3100`:

- `frontend/playwright.config.ts` uses `http://localhost:3100` as its default.
- `.github/workflows/ci.yml` passes `E2E_BASE_URL=http://localhost:3100`.
- The local-disabled profile passes `E2E_DISABLED_BASE_URL=http://localhost:3101`.
- The disabled-test fallback uses the same canonical hostname.

The backend remains fail-closed. `OriginGuard` still compares the request
origin with the configured frontend origin; the fix makes the test client use
the configured value rather than weakening that security boundary or trusting
both hostnames implicitly.

## Verification

Use the isolated stack and canonical URL when running locally:

```powershell
cd D:\Projects\testops-platform
docker compose -p testops-e2e -f docker-compose.yml -f docker-compose.e2e.yml up -d --build backend frontend

cd frontend
$env:E2E_BASE_URL='http://localhost:3100'
$env:MAILPIT_URL='http://127.0.0.1:8025'
npm run e2e -- auth-recovery.spec.ts --reporter=line
npm run e2e -- --reporter=line
```

The recovery-focused run must pass registration verification, unverified
recovery, reload idempotency, and password reset followed by sign-in. The full
run must not emit an origin-guard `403` for refresh/logout and must send a
real `/api/v1/auth/login` request in the final recovery step.

## Troubleshooting

If a browser run uses `127.0.0.1`, do not change `OriginGuard` or add a second
production origin as a shortcut. Set `E2E_BASE_URL` to the configured
`FRONTEND_ORIGIN` instead. If the canonical host is not reachable on the
machine, fix the port mapping or `/etc/hosts`/Docker startup, then rerun the
health checks. Never record cookies, bearer tokens, OTPs, or reset passwords in
committed evidence.
