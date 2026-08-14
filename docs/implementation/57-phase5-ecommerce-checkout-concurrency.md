# Phase 5 ecommerce checkout concurrency implementation

This implementation closes the PostgreSQL final-unit inventory gate in the
Milestone 10 quality baseline. It complements, rather than replaces, the
selective-cart and idempotency contract in
`54-phase5-ecommerce-checkout-integrity.md`.

## Source changes

| Location | Responsibility | Decision |
| --- | --- | --- |
| `ecommerce-web/webcky/backend/.../ProductRepository.java` | Inventory lookup | Add a `PESSIMISTIC_WRITE` query so PostgreSQL serializes stock mutations across backend instances. |
| `ecommerce-web/webcky/backend/.../ProductServiceImpl.java` | Reservation/restoration | Detach an already-managed product, load the current locked row, then update stock and sold count in the caller's transaction. |
| `ecommerce-web/webcky/backend/.../OrderServiceImpl.java` | Checkout/cancellation ordering | Sort product IDs before acquiring locks to avoid multi-product deadlocks. |
| `ecommerce-web/webcky/backend/.../MockDataSeeder.java` | QA fixtures | Add `MOCK-CONCURRENCY-001` with one unit of approved stock. |
| `frontend/e2e/phase5-ecommerce-checkout-concurrency.spec.ts` | Browser regression | Use two authenticated browser contexts and simultaneous buy-now requests, then cancel the winner and verify restoration. |

## Why pessimistic locking

Optimistic `@Version` checking is useful for ordinary product edits, but a
checkout must make the stock decision while holding a database lock. A
process-local lock is insufficient when Compose is scaled or a second backend
container receives the request. Pessimistic locking also lets the second
request observe the committed stock value and return a user-facing `400`
instead of leaking an infrastructure-looking `500`.

The explicit detach is required because Hibernate's first-level cache can hold
the product loaded during price validation. Asking for a lock on that stale
identity does not necessarily rehydrate it; detaching it makes the subsequent
locked query authoritative.

## Regression behavior

The spec is opt-in and defaults to skipped. It requires the isolated E2E
profile and `ECOMMERCE_E2E_CHECKOUT=true`. It never targets the normal
development database. The test asserts:

- one successful order and one `4xx` stock rejection;
- no optimistic-lock `500` response;
- stock `0` while the order is pending;
- stock `1` after cancellation;
- cleanup in `finally` if an assertion fails after order creation.

## Verification record

- Ecommerce backend: `./mvnw.cmd -B test` — 22 tests passed.
- Isolated Compose: database, backend, frontend, and Mailpit healthy after a
  dedicated-volume reset.
- `phase5-ecommerce-checkout-concurrency.spec.ts` — 1 passed in 3.9 seconds.
- The first implementation run deliberately exposed the stale-instance
  regression; it was corrected before this evidence was recorded.
- GitHub Actions is currently unavailable because the account has consumed
  all 3,000 included minutes. The pushed TestOps run
  `31704931872` failed before any job step started (all six jobs report zero
  steps); this is an external verification limitation, not a local test
  failure.
