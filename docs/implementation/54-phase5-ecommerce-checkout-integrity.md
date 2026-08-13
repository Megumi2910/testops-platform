# Phase 5 ecommerce checkout integrity contract

The checkout slice combines a native backend regression test with an opt-in
browser contract. The browser test is intentionally stateful and runs only
against the isolated ecommerce Compose profile.

## Source behavior under test

`OrderRestController.checkout` requires a verified customer and a UUID
`Idempotency-Key` before delegating to `OrderService`. The service validates
that selected IDs belong to the authenticated customer's cart, resolves price
and stock from the current `Product` rows, creates order items only for the
selected entries, removes only those cart rows, and records the idempotency
key on the order. Cancellation restores each order item's stock only while
the order is still `PENDING` or `PROCESSING`.

The test is important because the UI displays a subtotal and total for user
feedback, but those values are not an authority for order persistence. It also
checks the replay contract that protects a double click, browser retry, or
network retry from creating duplicate orders.

## Test layers

| Layer | Contract | Evidence |
| --- | --- | --- |
| Service unit | Server pricing, selected-row cleanup, one-time cancellation restore | `OrderServiceImplCheckoutTest` |
| Controller unit | UUID key and verified-customer guard | `OrderRestControllerTest` |
| Coordinator unit | Same-user/key requests serialize | `CheckoutIdempotencyCoordinatorTest` |
| Browser/E2E | Real login, checkout, replay, cart cleanup, cancel, repeated cancel | `phase5-ecommerce-checkout.spec.ts` |

## Safe execution

The browser contract defaults to skipped. Set `ECOMMERCE_E2E_BASE_URL` and
`ECOMMERCE_E2E_CHECKOUT=true` only after recreating the disposable E2E stack.
The test consumes Customer B's seeded cart and therefore must not run against
the normal development database or a shared staging account.

## Current interpretation

Local evidence is **PASS for the selective-checkout/idempotency sub-gate**:
the backend suite passed 19 tests and the browser scenario passed after a clean
E2E reset. The complete Phase 5 checkout gate remains open for PostgreSQL
concurrency, payment-state, stale-stock, and broader role/permission cases.
