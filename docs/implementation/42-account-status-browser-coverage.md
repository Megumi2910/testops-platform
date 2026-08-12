# Phase 5 locked and disabled account browser coverage

## Purpose

Authentication status is a server-side session boundary, not merely a value shown on the account page. An administrator may lock or disable an account after a user has registered, so the browser contract must prove that a new password session is rejected for both states and that the error remains actionable.

## Test design

`frontend/e2e/phase5-account-status.spec.ts` runs only when the isolated E2E Compose profile provides `E2E_ADMIN_EMAIL` and `E2E_ADMIN_PASSWORD`. It uses the same generated bootstrap administrator as the administrator CRUD journey and creates a fresh ordinary account through the real registration, Mailpit delivery, and OTP verification path. No user ID or password is seeded directly in the database.

The test then:

1. Opens the administrator user-management route.
2. Changes the generated account to `LOCKED`.
3. Uses a separate browser context with no administrator session to attempt password login and expects the account to remain on `/login` with the sanitized `This account is unavailable` problem.
4. Changes the same account to `DISABLED` and repeats the independent login attempt.
5. Restores the generated record to `ACTIVE` in `finally`, so a failed assertion cannot leave a reusable E2E volume in an unusable state.

This separates the authorization actor from the account under test. It also proves that the frontend renders the backend `account_unavailable` contract rather than treating a `403` as a transport error or accidentally granting a session.

## Why no locked session is reused

The goal of this regression is session creation. Existing refresh tokens are intentionally not used as proof of a status change because token invalidation and browser session revocation are separate contracts covered by the authentication/session matrix. A fresh context makes the result deterministic and prevents an already-issued administrator or user cookie from masking a login failure.

## Verification

```powershell
cd frontend
$env:E2E_BASE_URL = 'http://localhost:3100'
$env:MAILPIT_URL = 'http://127.0.0.1:8025'
$env:E2E_ADMIN_EMAIL = 'qa.bootstrap-admin@testops.local'
$env:E2E_ADMIN_PASSWORD = (Get-Content ..\backend\.secrets\bootstrap-admin-password -Raw).Trim()
npm run e2e -- phase5-account-status.spec.ts --reporter=line
```

The generated password is ignored and masked by CI. It must never be copied into a test, screenshot, trace, log, or committed file.

The focused run passed in 5.3 seconds after rebuilding the disposable stack. CI run `31611690370` passed backend, frontend, containers, local-disabled E2E, and the complete E2E suite for commit `80ff65e`.

## Boundaries

Google OAuth still requires a provider-backed fixture and remains outside this slice. Existing session listing, individual revoke, and revoke-all tests remain the authority for refresh-token lifecycle behavior. The broader administrator role matrix and Chrome DevTools accessibility/performance evidence are also separate gates.
