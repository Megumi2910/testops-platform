# Phase 5 ecommerce fixture matrix

The ecommerce development seeder now supplies the identities and stateful
records required by TestOps dogfooding instead of forcing browser tests to
reuse one customer's data. `MockDataProperties` exposes the second customer
and seller credentials as environment-backed values, while
`MockDataSeeder` remains profile-scoped to `dev` and additive/idempotent.

## Why this slice matters

The quality baseline previously listed seller/admin isolation and two-user
messaging as blocked because only one customer, one seller, and one thread
existed. A second identity pair is necessary to prove that a cart, order,
review, product, and message thread cannot be read or mutated by another
account. Stateful products and a pending order also make admin/seller and
cancellation paths reproducible.

## Data and safety decisions

- New records use stable `mock.*` emails, `MOCK-*` SKUs, and stable order
  numbers, so restarts do not create duplicates.
- Passwords have local defaults but are overrideable with `MOCK_*` variables;
  no password is returned by an API or stored in committed test evidence.
- Existing rows are preserved. The seeder only normalizes the seller store
  approval, local fixture image paths, and explicit out-of-stock state for its
  own records.
- The E2E stack remains the only place for destructive/reset/concurrency
  checks; the normal development volume is not reset.

## Verification

From `D:\Projects\ecommerce-web\webcky`:

```powershell
.\backend\mvnw.cmd -B test
docker compose config --quiet
docker compose up -d --build backend
docker exec postgres_db psql -U postgres -d ecommerce-dev -c "SELECT email, role FROM users WHERE email LIKE 'mock.%@example.test' ORDER BY email;"
```

The expected output includes Customer A/B, the unverified customer, and Seller
A/B. The catalog query includes approved, rejected, out-of-stock, and
discontinued rows. The fixture is intentionally not a substitute for the
native two-browser messaging and PostgreSQL concurrency suites; it makes those
later tests deterministic and safe to author.
