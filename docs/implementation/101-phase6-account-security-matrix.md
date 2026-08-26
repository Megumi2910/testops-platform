# Phase 6 account-security matrix

## Current implementation

The revision-B account-security slice makes password and Google account
mutations terminate safely across all sessions while keeping provider failures
on a generic callback page. Password change, provider unlink, and session
revocation navigate to their deterministic sign-in notice before clearing the
auth context. The login page preserves that notice during the brief cleanup
window, so a protected-route guard cannot replace it with a `returnTo` redirect.
Logout still clears the in-memory access token and is best-effort because the
mutation has already revoked the refresh cookie; an expected invalid-session
response cannot replace the success redirect. Google link intent is
consumed before provider validation and cleared on authentication failure, so a
failed link cannot be reused by a later sign-in.

The OAuth callback now refreshes the access token and calls the authentication
context's `reloadUser()` before navigating to the workspace. This keeps the
login-method summary (including `GOOGLE`) authoritative immediately after a
deterministic provider sign-in instead of relying on a stale bootstrap state.
The provider also guards against an in-flight bootstrap refresh erasing that
newly hydrated user when the initial no-session request settles afterward.

The disposable OAuth provider accepts only `legacy` or a strict
`<google-only|link|mismatch>.<nonce>` profile key. Derived subject, email, and
display name values come from the key; arbitrary cookie email values are never
accepted. Codes and access tokens are bound to that validated profile key.

The LoginPage carries a non-secret `retained-swap-revision-b` marker and a
short build identity. That marker is intentionally in the lazy auth route so a
real A-to-B retained-tab swap can prove that the B chunk loaded after the
single recovery reload.

## Browser contract

`frontend/e2e/account-security.spec.ts` covers wrong and successful password
changes, old-password rejection, refresh-session revocation, Google-only
password setup, server cooldown, invalid and valid OTPs, provider mismatch and
link success, blank/wrong/last-method unlink boundaries, and successful unlink
revocation followed by password-only relogin. It writes only a sanitized
ignored sidecar after every required case passes. The sidecar contains case
IDs, assertion counts, status, and allowlisted problem tuples; it excludes
emails, names, cookies, tokens, OTPs, headers, and response bodies.

The browser flow uses an exact accessible `New password` role locator where
the form also exposes `Confirm new password`, avoiding a strict-mode collision
between the two controls while preserving the user-facing labels. For
negative mutations initiated through page forms, it asserts the visible UI
response and status, then records the same request through the isolated
Playwright API context. This keeps the allowlisted problem tuple readable even
after the page's own fetch handler has consumed the response body; it does not
add credentials or raw bodies to the sidecar. The recovery notice is asserted
through its semantic success status role. For mutations that intentionally
return `401`, the disposable bearer is captured before the UI action so the
page's refresh/retry path cannot invalidate the diagnostic probe. The bearer
probe uses copied storage state, then carries the rotated refresh cookie back
to the browser context so its in-memory access token remains paired with the
current server-side refresh family.

The browser flow uses an exact accessible `New password` role locator where
the form also exposes `Confirm new password`, avoiding a strict-mode collision
between the two controls while preserving the user-facing labels.

The source and focused test gates are complete. Live Compose, Playwright MCP,
Chrome DevTools MCP, and canonical P6 evidence remain open until the exact
revision-B image is exercised.

The passing security sidecar is merged with the 18 shell records and retained
swap by `scripts/merge-p6-browser-evidence.ps1`; no account credentials,
cookies, OTPs, or raw response bodies are copied into the canonical manifest.
