# Phase 5 — ecommerce payment configuration and stale-stock recovery

This implementation slice adds a backend-owned QR payment configuration
contract and a pre-submit stale-cart check to the ecommerce dogfooding target.
It deliberately does not claim that a payment gateway or webhook processor is
implemented.

## Cross-repository flow

```text
OrderDetailPage
  └─ GET /api/payment/config
       └─ PaymentConfigController
            └─ PaymentProperties (environment-backed)

CheckoutPage
  └─ refresh cart before submit
       └─ checkoutValidation.js compares item identity, stock, and price
            ├─ stale-cart-summary + return to cart
            └─ otherwise POST checkout; backend recalculates and locks stock
```

The browser still uses same-origin `/api` transport. QR account configuration
is returned as a display DTO, while secrets and order totals remain server
owned.

## Source map and rationale

- `PaymentProperties`: typed Spring configuration with safe local defaults and
  environment overrides.
- `PaymentConfigDto`: stable API shape that prevents configuration-class
  leakage.
- `PaymentConfigController`: authenticated read-only endpoint for order-detail
  presentation.
- `orderApi.getPaymentConfig`: keeps transport in the existing API layer.
- `OrderDetailPage`: lazy fetches QR settings and handles disabled/missing/image
  failure states.
- `checkoutValidation.js`: pure comparison logic that is easy to unit test and
  does not mutate cart state.
- `CheckoutPage`: blocks stale submission and gives the user a direct recovery
  action; the backend remains the final authority.

## QA evidence

`frontend/e2e/phase5-ecommerce-payment-stale-stock.spec.ts` is opt-in so the
normal TestOps suite never places orders accidentally. It uses the permanent
`MOCK-CONCURRENCY-001` fixture, two isolated customer contexts, and cleanup of
QA-owned orders/cart rows. The final clean run passed both scenarios.

The exact commands and expected output are recorded in
`docs/testing/67-phase5-payment-stale-stock-evidence.md`. GitHub Actions run
`31705254097` was not a product failure: all jobs stopped before their first
step because the account had consumed its included Actions minutes.

## Remaining boundary

Payment status remains `PENDING` for local COD/QR orders. Provider capture,
webhook verification, review eligibility, and the complete ecommerce payment
matrix are still separate Phase 5 gates.
