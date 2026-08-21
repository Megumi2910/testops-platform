# Phase 3 — Password-reset handoff and account recovery notices

## Scope

This slice closes the remaining frontend gap in the Milestone 10A account
center: a successful password reset now finishes at the sign-in screen, and
the sign-in screen explains why the user was redirected there.

No backend endpoint or request shape changed. The existing reset contract
remains:

1. `POST /api/v1/auth/password/reset/request` sends a generic six-digit code
   response and server-provided resend cooldown.
2. `POST /api/v1/auth/password/reset/confirm` consumes `{ email, otp, password }`
   and returns `204 No Content`.

## Implementation

`frontend/src/features/auth/AuthPages.tsx` now maps the safe `reason` query
parameter to a short success alert on `LoginPage`:

| Reason | User-visible handoff |
| --- | --- |
| `password-reset` | “Your password was updated. Sign in to continue.” |
| `password-changed` | “Sign in again with your new password.” |
| `google-unlinked` | Google was removed and all other sessions were signed out. |
| `sessions-revoked` | All refresh sessions were revoked. Sign in again to continue. |

After a successful reset, the page uses a replacement navigation to:

```text
/login?reason=password-reset&email=<encoded-email>
```

Only the email is retained so the user does not need to retype it. Passwords,
OTP values, access tokens, and server error details are never placed in the
URL. The alert uses the existing `Alert` component, which exposes an
`aria-live="polite"` status region.

## Why this approach

- The backend remains the source of truth for reset validation and generic
  account-enumeration-safe messaging.
- A single login destination makes the end of every session-revoking account
  mutation predictable.
- Query-driven notices survive a full navigation and are easy to deep-link in
  browser tests without storing sensitive state.
- The existing controlled email field receives the encoded email from the
  query string, while the password field always starts empty.

## Regression coverage

- `frontend/src/features/auth/AuthPages.test.tsx` verifies reset confirmation
  navigates to Sign in with the email preserved and that every account-recovery
  reason renders an accessible success notice.
- `frontend/e2e/auth-recovery.spec.ts` verifies registration, unverified
  recovery, resend idempotency, and the complete Mailpit password reset flow
  ending at the new sign-in handoff.

## Maintainer notes

Keep `safeReturnTo` for protected workspace redirects. Do not reuse the
`reason` query parameter for arbitrary server messages, and do not add secret
values to the URL or browser evidence. If a new account mutation revokes
sessions, add a fixed reason string, a user-facing recovery message, and a
unit/browser assertion before exposing it in the menu or Account page.
