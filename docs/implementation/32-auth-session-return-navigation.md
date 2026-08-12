# Phase 5 auth, session, and return-navigation implementation

## Why this slice exists

The first Phase 5 browser pass found two user-visible failures in the authentication boundary:

1. A user who opened a protected deep link, signed in, and became authenticated could be sent to `/` by the login page before the route guard had a chance to send an unverified user to the verification page.
2. The account page displayed no active sessions because the session controller was conditionally omitted from the Spring application context. The endpoint therefore fell through to static-resource handling and returned a generic `500`.

The same pass also exposed a contract mismatch: session deletion returned an empty `200` response, while the shared frontend request helper correctly expects empty successful responses to be `204`. The UI consequently never refetched the list after a revoke action.

## Source responsibilities

| Concern | Source | Responsibility |
| --- | --- | --- |
| Safe destination parsing | `frontend/src/features/auth/returnTo.ts` | Accept only same-origin relative paths; reject absolute URLs, protocol-relative paths, and backslashes. |
| Anonymous redirect | `frontend/src/features/projects/RouteGuards.tsx` | Preserve the current pathname, query, and hash in `returnTo` when sending an anonymous user to login. |
| Unverified redirect | `frontend/src/features/projects/RouteGuards.tsx` | Preserve the destination while adding the account email and recovery resend marker. |
| Login completion | `frontend/src/features/auth/AuthPages.tsx` | Navigate to the sanitized `returnTo` after login; already-authenticated visits use the same destination instead of unconditionally choosing `/`. |
| OTP completion | `frontend/src/features/auth/AuthPages.tsx` | Verify the code, then return to the preserved destination. |
| Session list/revoke | `backend/src/main/java/com/megumi/testops/auth/api/SessionController.java` | Expose authenticated session families and revoke only an owned family. |
| Token/session persistence | `backend/src/main/java/com/megumi/testops/auth/service/RefreshTokenService.java` | Persist independent refresh-token families and revoke one family or all families. |
| Account presentation | `frontend/src/features/auth/AccountPages.tsx` | Render loading, error, empty, individual revoke, and revoke-all states. |

## Return-path design

`locationReturnTo` deliberately serializes only the browser location, not an origin. A guard creates a URL such as:

```text
/login?returnTo=%2Fprojects
```

`safeReturnTo` accepts `/projects?sort=name#recent` but rejects `https://example.test`, `//example.test`, and paths containing a backslash. This prevents an authentication redirect from becoming an open redirect. The browser router remains responsible for the final route guard: an unverified account is redirected from `/projects` to `/verify-email`, and a successful OTP sends the user back to `/projects`.

The authenticated branch of `LoginPage` uses the same sanitizer. This matters when the auth context becomes ready during the login render: it avoids a race between the context update and the submit handler's navigation.

## Session endpoint contract

`SessionController` is registered unconditionally because `AuthRuntimeConfiguration` always supplies its `RefreshTokenService` bean when the auth feature is enabled. A conditional controller was evaluated before that bean was visible and silently removed the mapping.

The endpoint contract is:

```text
GET    /api/v1/users/me/sessions       200 Session[]
DELETE /api/v1/users/me/sessions/{id}  204
POST   /api/v1/auth/sessions/revoke-all 204
```

The list query includes only active, unexpired refresh tokens for the authenticated subject. Individual deletion first checks ownership and returns `404 session_not_found` for a foreign or inactive family. The service then revokes the complete family, so all rotated tokens in that browser session are invalidated. Revoke-all increments the user's token version and revokes every family, which invalidates existing access tokens as well as refresh cookies.

The explicit `204` response is important: the shared `apiFetch` helper treats `204` as a successful empty result. A `200` with no JSON body is not equivalent because the helper would attempt to parse it and skip the React Query refetch.

## Verification

The focused browser matrix is `frontend/e2e/phase5-auth-session-matrix.spec.ts`:

- invalid OTP is rejected, then the current Mailpit code completes verification;
- a protected `/projects` deep link survives registration, anonymous redirect, unverified login, and OTP verification;
- two browser contexts create two refresh-token families, one family is revoked, the list shrinks to one, and revoke-all signs the user out.

The slice passed backend verification (124 tests), frontend lint, typecheck, unit tests (33), the production image rebuild, and all three Playwright scenarios against the isolated Compose stack.

## Safe operational notes

- The tests create run-prefixed accounts and do not reset the normal database volume.
- Mailpit is used only to read the latest OTP; credentials and tokens never enter committed evidence.
- Rebuild the isolated stack after source changes so browser tests do not exercise stale static bundles or backend images.
