# Phase 6 account-security matrix evidence

## Current result

**SOURCE PASS; LIVE SECURITY BROWSER RESULT OPEN.** Focused frontend tests,
backend OAuth handler tests, deterministic provider tests, typechecking, and
linting pass. The account-security browser suite is discoverable and writes a
sidecar only after its full flow succeeds; no live result is claimed here.

## Required cases

| Case ID | Boundary |
| --- | --- |
| `password-change-wrong-current` | wrong current password returns the structured field error |
| `password-change-success-relogin` | new password works, old password and prior refresh session do not |
| `password-setup-google-only` | Google-only account starts without an unlink action |
| `password-setup-cooldown` | resend is disabled and Mailpit count does not increase during cooldown |
| `password-setup-invalid-code` | invalid OTP is rejected without adding a password |
| `password-setup-success` | valid OTP adds password and relogin succeeds |
| `provider-link-success` | mismatch is generic, then the derived link profile succeeds |
| `provider-unlink-blank-password` | client validation sends no mutation; direct blank request is rejected |
| `provider-unlink-wrong-password` | wrong current password is rejected with a field error |
| `provider-unlink-last-method` | Google-only account cannot remove its final login method |
| `provider-unlink-success-revocation` | unlink signs out all sessions and removes Google-only relogin |
| `oauth-password-account-recovery` | existing password account receives only the safe sign-in-and-link recovery action |
| `oauth-safe-failure-recovery` | unavailable, unverified, and provider failures show bounded recovery without provider detail |

All rows use `1440×900`. Negative API tuples are recorded by method, path,
status, and structured problem code, with no request or response data. The
sidecar is an input to the canonical P6 merger, not formal acceptance by
itself; the final gate still requires the retained A/B run, both browser tools,
and the strict sanitized evidence validator.

Mutation success redirects run before local logout cleanup and remain
authoritative even when the follow-up request sees the already-revoked refresh
session. The login notice stays visible while the auth context clears, so a
protected-route guard cannot replace it with a `returnTo` redirect; cleanup is
best-effort by design.

The deterministic Google callback is also checked after navigation: the
context reload completes before the account page is opened, and the login
methods panel exposes `GOOGLE` for a Google-only account. The browser
assertion targets the labeled login-method row (rather than its `Connected:`
`<strong>` label alone), so the evidence reflects the rendered value.
The OAuth callback check also covers the in-flight bootstrap race: the
hydrated user remains available while the initial refresh request finishes.
The AuthProvider unit contract also verifies that a completed login prevents
the delayed bootstrap from starting a competing refresh rotation.

Negative setup-code replay uses the same `{ otp, password }` payload as the
page form; this keeps the direct API tuple equivalent to the intercepted UI
request instead of turning a verification failure into a request-validation
failure.

The negative contract comparison is order-independent: UI/API actions are
executed in user-flow order, while the strict evidence validator matches the
same exact tuples as a set and rejects duplicates or omissions.

The final P6 validator expects this security sidecar to contribute 11 desktop
records and eight exact negative tuples to the combined shell/retained-swap
manifest.

Successful Google linking is asserted in two steps: the callback returns to
the workspace root (after the callback has hydrated the auth context), then
the test uses the account menu to open `/account#login-methods` without a full
page reload
and verifies both provider labels. This reflects the backend callback contract
without treating the generic callback landing route as an account-page error.

Page-form negative mutations are status-asserted in the UI and tuple-asserted
again through the same context's API request, avoiding response-body races
after the frontend fetch handler has consumed the error payload.

Bearer probes use copied Playwright storage state and synchronize the rotated
refresh cookie back to the browser context. This preserves the page's
in-memory access-token/cookie pairing while still proving the direct negative
API tuple. A single retry with a fresh cookie snapshot covers the concurrent
bootstrap-rotation hand-off; a second 401 remains a real failure.
The immediate wrong-current-password tuple uses the successful UI login
response's bearer rather than initiating a second, single-use refresh while
the initial AuthProvider bootstrap settles. Later contexts retain the
copied-cookie probe and a bounded two-second retry window, so bearer capture
follows token-version changes caused by provider linking without hiding a
genuinely revoked session. The sign-in helper still allows a bounded
post-login settle window rather than waiting on long-lived background probes.

The Google-only invalid-setup tuple likewise retains the bearer captured from
the probe context before the setup-code UI flow. It verifies the same negative
API contract without rotating a refresh family that another browser context may
already have advanced.

The secondary session used for unlink validation is established only after a
successful Google link. Linking intentionally invalidates older refresh
families; creating the session after that mutation keeps the direct unlink
negative tuples authenticated, while the successful unlink still proves that
the new secondary session is revoked.
