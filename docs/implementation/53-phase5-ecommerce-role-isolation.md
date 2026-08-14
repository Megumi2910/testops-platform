# Phase 5 ecommerce role-isolation browser contract

`frontend/e2e/phase5-ecommerce-role-isolation.spec.ts` uses two independent
Playwright browser contexts so each login has its own cookies and session. It
is opt-in with `ECOMMERCE_E2E_BASE_URL` and defaults to the stable local
fixture credentials; every password can be overridden by an environment
variable.

## Customer contract

Customer A loads `/api/cart`, `/api/orders`, and `/api/messages/threads`, then
the test records only opaque row identifiers. Customer B signs in in a second
context and verifies that its cart and order list contain Customer B's own
fixture (`MOCK-ORDER-CANCEL-001`) but not Customer A's completed order. Direct
reads of Customer A's order and thread from Customer B must be rejected (the
current API contract is `4xx`, with thread detail/messages returning `404`).

The test does not update or delete records. It intentionally checks both list
scoping and nested-resource ownership because a list-only check can pass while
an identifier-substitution vulnerability remains.

## Seller contract

Seller A and Seller B sign in in separate contexts. `/api/seller/products`
must return only the authenticated seller's inventory: Seller A cannot see
`MOCK-SELLER-B-001`, while Seller B can see it and cannot see Seller A's
`MOCK-TSHIRT-001`. Product-state records remain available for later admin and
seller lifecycle checks.

## Running it

```powershell
cd D:\Projects\testops-platform\frontend
$env:ECOMMERCE_E2E_BASE_URL='http://localhost:3101'
$env:ECOMMERCE_E2E_CUSTOMER_PASSWORD='(local value)'
$env:ECOMMERCE_E2E_CUSTOMER_B_PASSWORD='(local value)'
$env:ECOMMERCE_E2E_SELLER_PASSWORD='(local value)'
$env:ECOMMERCE_E2E_SELLER_B_PASSWORD='(local value)'
npm run e2e -- phase5-ecommerce-role-isolation.spec.ts --workers=1
```

Use the isolated E2E stack and the fixture guide in
`D:\Projects\ecommerce-web\webcky\MOCK_DATA.md`. Do not reset the normal
development database.

The clean-stack run on 2026-08-13 passed both scenarios in 5.8 seconds. The
existing storefront smoke also passed all 13 scenarios after this contract
was added. GitHub Actions run `31698236912` had no started steps because the
account Actions quota was exhausted, so it is recorded as an external CI
blocker rather than a product result.
