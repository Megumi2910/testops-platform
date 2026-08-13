# Phase 5 ecommerce Mailpit authentication contract

## Why this slice exists

Email verification and password recovery are side-effecting workflows: a browser can report a successful API response while the user never receives a usable link. The normal development stack must not depend on a real mailbox, and resetting its database would risk local work. This slice uses the existing disposable ecommerce E2E profile instead.

## Runtime boundary

`docker-compose.e2e.yml` creates a separate PostgreSQL volume (`ecommerce_e2e_pgdata`), an isolated Compose network, the ecommerce backend/frontend, and Mailpit. The browser opens `http://localhost:3101`; the backend sends SMTP to the Compose service `mailpit:1025`; the host exposes Mailpit's API/UI at `http://127.0.0.1:8025`. This keeps browser links on the configured frontend origin while allowing the test runner to inspect mail without a third-party provider.

The seeded accounts remain local-only. Passwords are passed through environment variables and are not embedded in the test source, reports, screenshots, or documentation.

## Browser contract

`frontend/e2e/ecommerce-auth-mailpit.spec.ts` is opt-in and serial because the same isolated mailbox and unverified fixture are intentionally shared:

1. Register a unique user and phone number.
2. Wait for a verification message addressed to that user.
3. Extract only the frontend verification URL, follow it, and assert the success state.
4. Sign in as the seeded unverified customer, follow the persistent recovery link, and assert the resend email.
5. Request resend again from the banner and assert the server cooldown message.
6. Request a password reset for the seeded verified customer, follow the Mailpit link, submit a new password, and assert completion.

The helper polls Mailpit's message list, then fetches one message detail. It checks the recipient, subject, link origin, and presence of a token; it never writes message bodies into an artifact.

## Commands

```powershell
cd D:\Projects\ecommerce-web\webcky
docker compose -f docker-compose.e2e.yml --profile e2e up -d --build

cd D:\Projects\testops-platform\frontend
$env:ECOMMERCE_E2E_BASE_URL='http://localhost:3101'
$env:MAILPIT_URL='http://127.0.0.1:8025'
$env:ECOMMERCE_E2E_CUSTOMER_PASSWORD='(local value)'
$env:ECOMMERCE_E2E_UNVERIFIED_PASSWORD='(local value)'
npm run e2e -- ecommerce-auth-mailpit.spec.ts
```

To reset only this disposable database, run `D:\Projects\ecommerce-web\webcky\scripts\reset-e2e.ps1 -Confirm:$false`. The script removes `ecommerce_e2e_pgdata`; it does not target the normal development volume.

## Failure interpretation

- No message: inspect the backend log and Mailpit health first; do not weaken the assertion to a UI-only success.
- Wrong link origin: the backend frontend-base-url configuration is wrong for the E2E profile.
- Cooldown missing: the resend endpoint or the persistent banner is bypassing the account rate limit.
- Reset link rejected: inspect token purpose/expiry migration and the reset endpoint response, not the mailbox.
- Port already allocated: stop only disposable TestOps/ecommerce E2E containers or use their documented alternate profile; never reset the normal database.

## Trade-off and remaining scope

Mailpit proves delivery and link usability, but it does not prove a real SMTP provider, mobile email-client rendering, or production DNS. Those remain outside this deterministic local gate. Ecommerce checkout concurrency, two-user messaging, seller/admin boundaries, and full accessibility/performance remain separate Phase 5 gates.
