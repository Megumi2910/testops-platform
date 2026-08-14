# Phase 3 — Account security and identity recovery

## Why this slice exists

The backend already invalidates refresh sessions when a password changes or
Google is unlinked. The previous account page did not reflect that contract:
it could report success while leaving a visually authenticated browser on a
server-invalid session, offered Google unlinking without confirmation, and
compressed password setup and session management into one inline control row.

This slice makes the account center a safe, discoverable boundary around those
existing APIs. The browser owns form state and pending feedback; the backend
remains authoritative for credential validation, token-version changes,
cooldowns, and session revocation.

## Current behavior

### Auth context refresh

`AuthContextValue` now exposes:

```text
reloadUser(): Promise<UserSummary>
```

`AuthProvider` implements it with `GET /api/v1/auth/me`, updates the shared
user state, and returns the refreshed summary. Account mutations that do not
invalidate the session, such as adding a password to a Google-only account,
can therefore update the shell without duplicating identity requests in a
presentation component.

### Password accounts

The Change password panel requires the current password, a twelve-character
minimum new password, and matching confirmation. The submit action is locked
while the request is pending. On success it calls the existing logout cleanup
and navigates to `/login?reason=password-changed`; this is intentional because
the backend revokes every refresh session and increments the token version.

### Google-only accounts

The Add a password login panel uses the existing two-call contract:

1. `POST /api/v1/auth/me/password/challenge` sends the verification code.
2. `POST /api/v1/auth/me/password/confirm` validates the code and password.

The UI moves from **Send setup code** to a labelled code/password form, keeps
the operation pending-safe, and calls `reloadUser()` after confirmation so the
new `PASSWORD` method appears immediately. The server remains responsible for
code validity and rate limits; the UI surfaces those responses without
inventing a second client-side authority.

### Google unlinking

Unlinking is a destructive login-method change. A focus-managed confirmation
dialog asks for the current password, calls the existing unlink endpoint, then
clears the session and navigates to `/login?reason=google-unlinked`. The
button is unavailable while the request is pending, and the dialog cannot be
dismissed mid-request.

### Sessions

The Active sessions panel uses the existing list and revoke endpoints. Dates
are formatted with `Intl.DateTimeFormat`; each row has its own pending state,
errors can be retried, and the empty state is explicit. Revoke all signs out
the current browser and navigates to `/login?reason=sessions-revoked` after the
server revokes every refresh session.

Deep links from the shell account menu (`/account#security`,
`/account#login-methods`, and `/account#sessions`) scroll to stable sections.
Each anchor uses `scroll-margin-top` so the fixed header does not hide the
heading.

## Design decisions

- **Shared identity refresh instead of local mutation:** the `/me` response
  includes effective permissions and login methods, so a server-backed refresh
  avoids stale authorization state after account mutations.
- **Sign out after revocation:** keeping the old access token in memory creates
  a misleading authenticated shell. Clearing it and returning to Sign in is
  safer than trying to refresh a token family the backend has deliberately
  revoked.
- **Confirmation for unlinking:** unlinking is irreversible until the user
  signs in again and re-links Google; the dialog makes that consequence
  explicit and requires the existing password proof.
- **No new endpoint or client cooldown:** the current password-challenge API
  returns only a message. Cooldown and abuse policy remain server-owned rather
  than being approximated in the browser.

## Failure and recovery paths

| Situation | UI result | Recovery |
| --- | --- | --- |
| Password mismatch | Inline alert, no request | Correct confirmation and resubmit |
| Invalid/expired password or OTP | Server message in alert | Correct credentials/code or request another code |
| Password/Google mutation succeeds | Local auth is cleared | Sign in again using the remaining method |
| Session list fails | Error plus **Try again** | Re-fetch the session list |
| Individual revoke fails | Row remains available and error is shown | Retry the same row |
| Revoke all fails | User stays on the account page | Retry without losing form state |

## Where to verify

- `frontend/src/features/auth/AuthContext.ts`
- `frontend/src/features/auth/AuthProvider.tsx`
- `frontend/src/features/auth/AccountPages.tsx`
- `frontend/src/features/auth/api.ts`
- `frontend/src/components/ui.tsx` (`ConfirmDialog`, `Button`, `Alert`)
- `frontend/src/styles.css`
- `frontend/src/features/auth/AccountPages.test.tsx`
