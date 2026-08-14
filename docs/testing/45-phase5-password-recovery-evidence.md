# Phase 5 password-recovery evidence

## Scope

This slice closes the password-recovery and time-dependent OTP portion of the
TestOps authentication matrix. It covers the schema contract, service rules,
frontend form states, public-route security, Mailpit delivery, and a complete
browser journey against rebuilt containers.

## Evidence

| Layer | Command or scenario | Result |
| --- | --- | --- |
| Backend service | `AuthServiceRecoveryTest` | 3 tests passed: expired OTP rejection, generic unknown-account request, successful reset with credential replacement and session revocation |
| Frontend | `AuthPages.test.tsx` focused run | 2 auth-page tests passed, including the reset request/confirmation contract |
| Static checks | `npm run lint`, `npm run typecheck`, `npm run build` | Passed during the rebuilt image build; rerun in the release gate before publishing |
| Schema/runtime | Isolated `testops-e2e` rebuild with V022 | Backend healthy; Flyway accepted `PASSWORD_RESET` challenge rows |
| Browser/Mailpit | `auth-recovery.spec.ts` | 4 passed: registration verification, unverified banner recovery, reload idempotency, and password reset/sign-in |

## Contract details

- `POST /api/v1/auth/password/reset/request` is public and returns `202` with
  an enumeration-safe message and server cooldown metadata.
- `POST /api/v1/auth/password/reset/confirm` is public, validates the OTP and
  password, and returns `204` on success.
- The `email_verification_challenges.purpose` constraint now allows
  `PASSWORD_RESET` in addition to existing purposes.
- Reset success records an audit event, rotates the local credential, bumps the
  token version, and revokes refresh sessions.
- Reset failure returns `verification_invalid` without revealing whether the
  email or challenge exists.

## Reproduction and regression procedure

Use a unique QA email for each run. Register it, read the newest six-digit OTP
from Mailpit, verify it, sign out, request a reset code, and submit the newest
reset OTP with a password of at least 12 characters. Sign in again with the
new password. The Playwright test performs these steps without recording
credentials or token values in committed evidence.

The previous runtime failure was a PostgreSQL check-constraint violation:
`email_verification_challenges_purpose_check` rejected `PASSWORD_RESET` even
though the service had implemented the purpose. Migration `V022` is the
regression fix; rebuilding the isolated stack and rerunning the browser suite
is required whenever the migration history changes.

## Remaining Phase 5 boundaries

This evidence does not claim the whole quality gate. Google OAuth, locked and
disabled browser fixtures, secret evidence suppression, browser-crash and
target-escape classification, administrator positive CRUD, and the complete
Chrome DevTools accessibility/performance matrix remain tracked separately.
