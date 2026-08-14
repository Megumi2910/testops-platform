# Phase 5 payment and stale-stock evidence

## Scope

This evidence record covers the QG-B13 sub-gates for backend-owned QR display
configuration and client-side stale-cart recovery. It does not waive payment
provider transitions or review scenarios.

## Commands and results

| Check | Result |
| --- | --- |
| Ecommerce backend `mvnw.cmd -B test` | PASS — 23 tests |
| `checkoutValidation.test.js` | PASS — 3 tests |
| Ecommerce frontend production build | PASS |
| Isolated ecommerce E2E Compose rebuild | PASS — healthy services |
| `phase5-ecommerce-payment-stale-stock.spec.ts` | PASS — 2/2 scenarios, 8.1s |

The browser contract verifies:

- an authenticated order-detail flow receives `qrEnabled`, bank code, account
  display name, and image base URL from `GET /api/payment/config`;
- a QR checkout persists `paymentMethod=QR` and the expected local
  `paymentStatus=PENDING` state; and
- Customer A sees an accessible stale-cart summary after Customer B consumes
  the final unit, with a direct “Mở giỏ hàng” recovery action.

## Safety and environment

The E2E commands use the named `ecommerce_e2e_pgdata` volume only. The normal
development database is not reset. Passwords are supplied through local
environment variables and are never written to the spec, screenshots, or this
record.

Playwright was used for the browser proof because the Chrome DevTools MCP quota
was unavailable in this session. The latest GitHub Actions run
`31705254097` is recorded as quota-blocked before execution; no additional
remote run was triggered.

## Interpretation

QG-B13 is still **PARTIAL**. The payment configuration and stale-stock UI
sub-gates are complete. Payment capture/webhooks, review eligibility and
ownership, and the broader checkout/payment accessibility matrix remain open.
