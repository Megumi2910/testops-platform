# Phase 5 ecommerce Mailpit authentication evidence

## Acceptance result

| Scenario | Result | Evidence |
| --- | --- | --- |
| Unique registration sends a verification link | PASS | `ecommerce-auth-mailpit.spec.ts` creates a unique email/phone, finds the Mailpit message, and follows the same-origin link |
| Verification link activates the account | PASS | `/verify-email?token=...` renders `Xác thực thành công!` |
| Unverified account can sign in and recover | PASS | Persistent `Tài khoản của bạn chưa được xác thực` banner exposes `Xác thực ngay` |
| Resend reaches Mailpit | PASS | Request page status plus recipient-filtered Mailpit message |
| Resend cooldown is visible | PASS | Banner resend displays the server `Try again in … seconds` response |
| Password reset reaches Mailpit and completes | PASS | Reset link is followed and `Đặt lại mật khẩu thành công!` renders |

## Reproduction

The clean isolated run on 2026-08-13 used the E2E Compose stack on frontend `3101`, backend `8181`, PostgreSQL `5543`, and Mailpit `8025`/SMTP `1025`:

```text
ecommerce-auth-mailpit.spec.ts — 3 passed in 13.5s
```

The dedicated volume was reset before the final run with `scripts/reset-e2e.ps1`; the normal development PostgreSQL volume was not touched. During diagnosis, a detached stale Mailpit container was recreated so it joined `ecommerce_e2e_network`; this is why the backend initially reported `UnknownHostException: mailpit`. After recreation, all services were healthy.

## Security and evidence rules

- Credentials are environment variables only.
- Generated registration records are run-prefixed and isolated to the E2E database.
- The test validates recipient, subject, link origin, and token presence but does not commit message content.
- Playwright screenshots/traces remain in ignored `frontend/test-results/` output.

## Gate interpretation

This closes the deterministic delivery portion of `QG-B12`. It does not waive real-provider email testing, and it does not close ecommerce checkout, messaging, seller/admin, or Lighthouse accessibility gates.
