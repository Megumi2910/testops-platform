# OTP resend cooldown and idempotency

## Outcome

Email-verification resend is now controlled by the backend instead of by button timing alone. A valid unverified account receives at most one new challenge and one email during the configured resend delay, including when requests arrive concurrently. The verification page renders the server-provided retry window and disables its resend action until that window elapses.

The public endpoint remains account-enumeration safe: unknown, verified, cooling-down, and eligible email addresses all receive the same generic `202 Accepted` message and response shape. Whether an email was sent is intentionally absent.

## End-to-end request path

```text
VerifyEmailPage
  -> AuthContext / authApi
  -> POST /api/v1/auth/email/resend or /api/v1/auth/me/email/resend
  -> AuthController
  -> AuthService transaction
  -> pessimistic user-row lock
  -> active challenge + hourly-limit decision
  -> optional challenge invalidation and one email delivery
  -> ResendVerificationResponse
  -> accessible disabled countdown
```

## Public response

```json
{
  "message": "If the account can be verified, a code has been sent",
  "nextResendAt": "2026-08-11T06:20:10Z",
  "retryAfterSeconds": 60
}
```

`nextResendAt` is an ISO-8601 UTC instant. `retryAfterSeconds` is the display-friendly duration calculated from the same server clock. Public requests always receive a fresh configured-delay window, so response timing does not reveal whether the address belongs to an account. Authenticated recovery may receive the exact remaining window of its active challenge.

## Source ownership

| Concern | Source |
| --- | --- |
| HTTP response DTO and generic message | `backend/src/main/java/com/megumi/testops/auth/api/ResendVerificationResponse.java`, `AuthController.java` |
| Serialization, cooldown, hourly cap, challenge invalidation | `backend/src/main/java/com/megumi/testops/auth/service/AuthService.java` |
| Database row locks | `backend/src/main/java/com/megumi/testops/auth/repository/UserRepository.java` |
| Typed frontend contract | `frontend/src/features/auth/api.ts`, `AuthContext.ts`, `AuthProvider.tsx` |
| Countdown and pending UI | `frontend/src/features/auth/AuthPages.tsx` |
| Regression tests | `AuthServiceResendVerificationTest.java`, `AuthPages.test.tsx` |

## Why the user row is locked

Checking `resend_available_at` and inserting a replacement challenge must be one serialized decision. Without a lock, two requests can both read the old challenge as eligible, invalidate it, and send different codes. Locking the stable parent user row is simpler and safer than locking an optional challenge row: the lock exists even when no challenge exists yet, and it covers public and authenticated resend paths consistently.

The transaction order is:

1. Normalize the email or resolve the authenticated user ID.
2. Acquire a pessimistic write lock on that user row.
3. Return idempotently when the account is verified or the latest challenge is still cooling down.
4. Enforce the per-user hourly send cap.
5. Invalidate and flush the previous challenge when one exists.
6. Persist and deliver exactly one new challenge.
7. Audit a resend only when a new message was actually requested.

The existing IP limiter still protects both endpoints before account lookup. The authenticated endpoint may report its hourly cap because identity is already established. The public endpoint suppresses that account-specific distinction.

## Frontend behavior

- The resend button keeps its normal pending protection while the request is in flight.
- A successful `202` stores `retryAfterSeconds`, announces the generic message through `role=status`, and disables the button.
- The visible label counts down once per second: `Resend available in 60s`.
- Automatic resend from the permanent unverified-account recovery link consumes the same response and cooldown.
- The backend remains authoritative. Calling the endpoint outside the UI during the delay is still idempotent.

## Live verification

The stack was rebuilt and then started with `docker-compose.qa.yml`, which routes development email to Mailpit rather than an external SMTP service.

Chrome DevTools verified:

1. An unknown address returned `POST 202` with the generic message and a 60-second server window.
2. The page rendered a disabled `Resend available in 60s` button and a polite status message.
3. A QA-owned unverified registration produced one Mailpit message.
4. Two simultaneous resend requests during the initial cooldown both returned `202` and the same 60-second retry window.
5. Mailpit still contained exactly one message, proving neither resend created a duplicate.
6. No resend request returned `500`.

The unauthenticated application bootstrap now receives `204 No Content` when no
refresh cookie exists. This is an intentional no-session result rather than a
failed refresh and remains unrelated to resend behavior.

## Automated verification

- Backend package gate passed all 78 tests. Four focused resend tests cover unknown-account nondisclosure, authenticated cooldown idempotency, one eligible delivery, and public nondisclosure during an email-delivery outage.
- Frontend mounted coverage verifies that the server retry window disables and relabels the resend button.
- Frontend lint, typecheck, all 29 tests across 10 files, and the production build pass.
- The rebuilt backend and frontend are healthy under the QA overlay.

The full local Maven `verify` reached the integration phase after all 78 product tests passed, then encountered the already-documented Windows Docker Desktop/Testcontainers named-pipe limitation in `ApplicationContextIT` and `MigrationUpgradeIT`. The supported local `-DskipITs package` gate passed; GitHub CI remains the authoritative container-backed integration gate for this slice.

### CI contract correction

The first published CI run passed backend, frontend, container health, and local-disabled E2E, but the enabled E2E job still expected the former UI-only phrase `fresh verification code`. The browser had received the correct generic status and `202`; the assertion was stale.

The corrected recovery tests now verify behavior instead of copy:

- the generic enumeration-safe status is visible;
- the server countdown button is disabled;
- Mailpit contains exactly one registration message after automatic recovery resend;
- a reload uses a bounded observation window for any authenticated resend response and still leaves the count at one; no resend request is also valid because the UI may suppress the repeat.

This explicitly proves that React remount/reload cannot create duplicate mail, whether the client suppresses the repeat or the backend accepts it idempotently.

## Operator guidance

For local email evidence, always start the QA overlay:

```powershell
docker compose -f docker-compose.yml -f docker-compose.qa.yml up -d --build backend frontend mailpit
```

Open Mailpit at `http://localhost:8027`. Do not point QA registration at a personal mailbox, and never copy OTP values into committed screenshots or documents.
