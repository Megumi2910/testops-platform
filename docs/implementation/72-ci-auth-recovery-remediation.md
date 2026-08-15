# Phase 5 — CI administrator wording and password-recovery handoff

## Why this follow-up was needed

The first published administrator-conflict slice passed local tests, but the
enabled browser job exposed two release-quality issues:

1. The new administrator message was clear but did not retain the stable
   `final active administrator` wording used by the browser contract.
2. The password-reset E2E flow occasionally returned to a blank Sign in email
   field after the reset completed. The reset page owned the email state, so a
   route transition discarded it before the next interaction.

## Implementation

| Concern | Implementation | Reason |
| --- | --- | --- |
| Final-admin guidance | `adminMutationError` includes both the stable invariant phrase and the recovery action | Keeps browser and support wording stable without exposing server internals |
| Reset-to-login handoff | Password-reset links navigate to `/login?email=...` | Carries only the non-secret identity value across the route boundary |
| Login initialization | `LoginPage` initializes its email field from the query string | Makes recovery deterministic while leaving the password blank |
| Sensitive data | OTPs, passwords, tokens, and server details are not placed in the URL | Avoids leaking credentials into history, logs, or screenshots |

The query parameter is an email address already entered by the user. It is not
used as authentication and the backend still validates the password normally.
The password-reset success state continues to clear the reset form before the
user returns to Sign in.

## Source map

- `frontend/src/features/auth/AccountPages.tsx` — administrator error mapping.
- `frontend/src/features/auth/AuthPages.tsx` — login initialization and reset
  navigation.
- `frontend/src/features/auth/AdminUsersPage.test.tsx` — final-admin wording.
- `frontend/src/features/auth/AuthPages.test.tsx` — reset email handoff.
- `frontend/e2e/phase5-administrator-crud.spec.ts` — browser invariant contract.
- `frontend/e2e/auth-recovery.spec.ts` — Mailpit password-reset flow.

## Verification contract

- A `409 final_active_admin` response leaves the select unchanged and renders
  the stable invariant plus actionable recovery guidance.
- Returning from either password-reset stage opens Sign in with the email
  prefilled and the password empty.
- The reset flow remains generic for unknown accounts and continues to use
  server retry windows.
- The browser suite accepts the intentional `/login?email=...` handoff and
  must pass without a permanently failed test or a flaky first attempt.
