# Password recovery and OTP expiry

## Why this slice exists

The authentication quality gate already covered registration verification and
enumeration-safe resend behavior, but a verified user still had no supported
way to recover a forgotten password. The recovery path must be public enough
to start without a session, while revealing neither whether an email exists nor
whether it is verified. It must also reuse the same one-time-code protections
as registration: expiry, attempt limits, resend cooldown, and invalidation of
older challenges.

## Runtime flow

1. The browser opens `/password-reset` from the login page.
2. `POST /api/v1/auth/password/reset/request` accepts an email and returns
   `202 Accepted` with a generic message for every account state. A verified,
   active account receives a Mailpit/SMTP message; unknown, unverified, and
   disabled accounts receive no message.
3. The server locks the user row, checks the per-IP and per-account limits,
   invalidates an older active `PASSWORD_RESET` challenge, and stores a fresh
   OTP hash. The plaintext code exists only while constructing the email.
4. The browser submits the email, six-digit code, and a 12–128 character new
   password to `POST /api/v1/auth/password/reset/confirm`.
5. The service requires a verified, active user and an active, unexpired
   challenge. A bad code increments the attempt counter and eventually
   invalidates the challenge. A valid code is consumed, the existing local
   credential is replaced (or created), the token version is incremented, and
   every refresh-token family is revoked.
6. The UI clears the reset form and links back to sign-in. Existing sessions
   cannot continue using the old password or refresh tokens.

## Code map

| Responsibility | Source | Reasoning |
| --- | --- | --- |
| Request validation | `backend/src/main/java/com/megumi/testops/auth/api/PasswordResetRequest.java` and `PasswordResetConfirmRequest.java` | Bean validation keeps malformed email, OTP, and password requests out of the service. |
| Public HTTP contract | `backend/src/main/java/com/megumi/testops/auth/api/AuthController.java` | Both endpoints are intentionally public; the service owns enumeration-safe behavior. |
| Business rules | `backend/src/main/java/com/megumi/testops/auth/service/AuthService.java` | User locking, challenge lifecycle, hashing, credential rotation, audit, and session revocation must be one transaction. |
| Delivery | `backend/src/main/java/com/megumi/testops/auth/service/EmailDeliveryService.java` | Verification and reset messages share delivery configuration but retain distinct subjects and copy. |
| Public route security | `backend/src/main/java/com/megumi/testops/auth/config/SecurityConfiguration.java` | Only the two reset routes are added to the existing permit-all authentication boundary. |
| Browser UI | `frontend/src/features/auth/AuthPages.tsx` and `frontend/src/features/auth/api.ts` | The two-stage form exposes server cooldown state and keeps errors in the existing auth-card pattern. |
| Route | `frontend/src/app/router.tsx` | `/password-reset` is reachable from login without an access token. |
| Schema | `backend/src/main/resources/db/migration/V022__password_reset_challenge_purpose.sql` | The unified challenge table originally allowed only `REGISTRATION` and `ADD_PASSWORD`; the check constraint must explicitly admit `PASSWORD_RESET`. |

## Security decisions

### Generic request responses

The request endpoint always returns the same accepted response shape. This
prevents account enumeration through status, message, or timing differences.
The server still rate-limits IPs and account challenges, so generic behavior
does not remove abuse protection.

### Hashed, single-use codes

Only the OTP hash is persisted. A challenge is accepted only while its expiry,
consumed, invalidated, and failed-attempt rules all pass. A successful reset
consumes the challenge before changing the credential.

### Session invalidation

Password rotation increments the user token version and revokes all refresh
tokens. This is deliberate: a password reset is a recovery event, so prior
browser sessions must not remain trusted.

### Migration instead of schema auto-update

`V022` drops and recreates the named PostgreSQL check constraint. It is
idempotent at the SQL statement level and works for both a clean database and
an existing V021 database. No development volume reset is required.

## Failure behavior

- Invalid or expired OTP: `400 verification_invalid`; failed-attempt state is
  persisted and the UI keeps the code form available for retry.
- Unknown, unverified, or disabled account on request: `202` generic response;
  no email is sent.
- IP/account cooldown: `202` with the server-owned `retryAfterSeconds` value;
  the UI disables the request button until the countdown expires.
- Mail delivery failure: the existing service-unavailable problem contract is
  returned and the challenge is marked as a failed delivery attempt.
- Stale sessions after success: refresh requests fail because the token
  version and refresh-token families are no longer valid.

## Verification commands

Focused backend service tests:

```powershell
cd D:\Projects\testops-platform\backend
.\mvnw.cmd -B '-Dtest=AuthServiceRecoveryTest' test
```

Focused frontend tests and static checks:

```powershell
cd D:\Projects\testops-platform\frontend
npm test -- --run src/features/auth/AuthPages.test.tsx
npm run lint
npm run typecheck
npm run build
```

Real-container recovery flow (Mailpit plus Playwright):

```powershell
cd D:\Projects\testops-platform
docker compose -p testops-e2e -f docker-compose.yml -f docker-compose.e2e.yml up -d --build backend frontend

cd frontend
$env:E2E_BASE_URL='http://localhost:3100'
$env:MAILPIT_URL='http://127.0.0.1:8025'
npm run e2e -- auth-recovery.spec.ts --reporter=line
```

The verified run passed four scenarios: registration verification,
unverified recovery, no duplicate resend after reload, and verified password
reset followed by sign-in with the new password. The complete suite also passed
24 scenarios with 10 intentionally skipped ecommerce scenarios when run with
`E2E_BASE_URL=http://localhost:3100`.

## Limitations and next work

Google identity recovery, locked/disabled browser fixtures, and the complete
Chrome DevTools accessibility/performance gate remain separate Phase 5 work.
The reset flow intentionally does not expose an email-existence hint or a
password-recovery link for an unverified account; that user must complete the
existing verification flow first.
