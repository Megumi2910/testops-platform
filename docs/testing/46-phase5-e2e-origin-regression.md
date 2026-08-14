# Phase 5 E2E origin regression evidence

## Defect

CI run `31597195094` failed all three retries of
`auth-recovery.spec.ts` in the final sign-in assertion. The trace showed
`403 Request origin is not allowed` for refresh/logout and a final screenshot
with an empty email field. Chromium rejected the form locally before any
`/api/v1/auth/login` request was made.

## Root cause

The E2E stack configured `FRONTEND_ORIGIN=http://localhost:3100`, while the CI
Playwright base URL was `http://127.0.0.1:3100`. Loopback routing was valid, but
the origins were not equal. Authenticated refresh and logout are intentionally
protected by the origin guard, so this was a test-environment contract defect,
not permission to broaden the production allowlist.

## Regression fix

The Playwright default and both CI profiles now use the corresponding
`localhost` origin. The backend origin guard remains unchanged. A focused local
run against rebuilt containers passed all four recovery scenarios. The complete
local suite then passed 24 scenarios with 10 intentionally skipped ecommerce
scenarios when no ecommerce environment was supplied (1.9 minutes, one worker).

## Reproduction checklist

1. Rebuild the isolated `testops-e2e` backend and frontend.
2. Confirm the backend environment contains `FRONTEND_ORIGIN=http://localhost:3100`.
3. Run Playwright with `E2E_BASE_URL=http://localhost:3100`.
4. Inspect browser network events for `POST /api/v1/auth/refresh` and
   `POST /api/v1/auth/logout`; both should be accepted or safely handled by
   their normal auth contract, without an origin mismatch.
5. Complete password reset and assert that the final `POST /api/v1/auth/login`
   returns `200` and the browser reaches the workspace.

## Evidence policy

Raw Playwright reports and traces remain under the ignored `qa-artifacts/`
directory. Committed evidence contains only sanitized URLs, statuses, and
behavioral conclusions; it does not contain cookies, JWTs, OTPs, or passwords.
