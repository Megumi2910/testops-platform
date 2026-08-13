# Phase 5 ecommerce role-isolation evidence

## Scope

This browser slice exercises the deterministic prerequisite for `QG-B06` and
part of `QG-B14`: separate customer/seller contexts, scoped lists, nested
resource ownership, and no shared thread visibility.

## Contract

| Scenario | Expected result |
| --- | --- |
| Customer A cart/order/thread lists | `200`, own records only |
| Customer B cart/order lists | `200`, Customer B records only |
| Customer B reads Customer A order | `4xx`, no foreign data |
| Customer B reads Customer A thread/messages | `404`, no foreign data |
| Seller A product list | `200`, no Seller B SKU |
| Seller B product list | `200`, Seller B SKU present, Seller A SKU absent |

## Interpretation

This is read-only browser evidence. It does not prove transactional checkout
locking, two-browser WebSocket delivery, admin mutations, or every endpoint.
Those remain separate Phase 5 gates and must use the isolated PostgreSQL/
Mailpit harness where state changes are required.

The Mailpit auth contract now resets a run-unique account instead of the
permanent Customer A fixture. That hygiene rule is required before this suite
is run; otherwise a previous password-reset test can make a valid isolation
failure look like a login failure.

## Local result

On 2026-08-13, a clean isolated E2E stack passed:

```text
ecommerce-auth-mailpit.spec.ts       3 passed
phase5-ecommerce-role-isolation.spec.ts 2 passed in 5.8s
ecommerce-smoke.spec.ts             13 passed in 22.9s
```

The stack used frontend `3101`, backend `8181`, PostgreSQL `5543`, and Mailpit
`8025`/`1025`. The normal development volume was not touched. GitHub Actions
run `31696968131` was rejected before any step started because the account
Actions minutes/spending limit is exhausted; local results are therefore the
available execution evidence.
