# Phase 5 authentication and session browser evidence

## Environment

| Item | Value |
| --- | --- |
| Frontend | isolated TestOps E2E image, `http://127.0.0.1:3100` |
| Backend | isolated Compose service, exposed at `8180` |
| Mailpit | `http://127.0.0.1:8025` |
| Database | isolated PostgreSQL Compose volume; not reset during the run |
| Browser | Playwright Chromium, one worker |
| Test file | `frontend/e2e/phase5-auth-session-matrix.spec.ts` |

## Executed scenarios

| Scenario | Expected contract | Result |
| --- | --- | --- |
| Invalid OTP then current OTP | Invalid code produces an accessible error; a fresh six-digit Mailpit code verifies the account | PASS |
| Protected deep link | `/projects` is preserved through login, unverified verification, and successful OTP | PASS |
| Multiple sessions | Two contexts produce two active families; individual revoke leaves one; revoke-all signs out | PASS |

The final focused run reported `3 passed (7.8s)`. Before the fix, the same run exposed a `500` for `GET /api/v1/users/me/sessions`; backend logs identified `NoResourceFoundException` because the controller mapping was not registered. After registration, the DELETE endpoint initially returned an empty `200`; changing it to `204` allowed the frontend's request helper to parse the response and refetch the session list.

The first pushed revision also exposed an integration-profile regression: an unconditional controller required the auth service when `AUTH_ENABLED=false`. The follow-up correction uses the shared `testops.auth.enabled=true` property condition. This keeps the endpoint available in the E2E stack without breaking the intentionally auth-disabled Spring context.

## Evidence and redaction

Playwright used semantic labels and roles. The test email addresses are run-prefixed and disposable. OTP values are read only in memory from Mailpit. Access tokens, refresh cookies, session IDs, and passwords are not written to screenshots, traces, console output, or committed files.

## Remaining coverage

This slice does not claim the entire authentication matrix is complete. Time-controlled OTP expiry, password recovery, Google OAuth with a real provider, locked/disabled browser journeys, administrator boundaries, execution evidence, dashboard role/range coverage, and the accessibility/performance gate remain separate Phase 5 rows.
