# Phase 5 ecommerce fixture evidence

## Scope

This slice closes the deterministic-data prerequisite for `QG-B06` (seller,
customer, and administrator boundaries) and `QG-B14` (two-user messaging).
It does not claim that the browser isolation or transactional concurrency
gates are complete.

## Expected matrix

| Contract | Fixture proof | Remaining regression layer |
| --- | --- | --- |
| Customer A/B | separate verified accounts, carts, and order ownership | native/API and two-browser authorization tests |
| Seller A/B | separate approved stores and seller-B state products | seller endpoint and UI permission matrix |
| Product states | rejected, out-of-stock, and discontinued rows | catalog visibility and admin lifecycle tests |
| Order cancellation | `MOCK-ORDER-CANCEL-001` is pending COD and belongs to Customer B | isolated PostgreSQL stock-restoration/concurrency test |
| Messaging | customer-A/seller-B and customer-B/seller-B threads are distinct | two-browser WebSocket/reconnect and REST fallback test |

## Local verification record

- Seeder source changed: `MockDataSeeder.java` and `MockDataProperties.java`.
- Configuration changed: `application.yml` adds four environment-backed values.
- Canonical usage guide: ecommerce `MOCK_DATA.md` and
  `docs/phase-5-ecommerce-fixture-matrix.md`.
- Remote GitHub Actions remains externally blocked by the account Actions
  minutes/spending limit; local Maven, Compose, and read-only SQL checks are
  required evidence until the account is unblocked.

## Safety rule

Do not reset the normal development volume to “refresh” fixtures. The seeder
is additive. Use `docker-compose.e2e.yml` and `scripts/reset-e2e.ps1` for any
destructive or repeatable browser scenario.
