# Phase 5 ecommerce permission evidence

## Matrix result

| Scenario | Assertions | Result |
| --- | --- | --- |
| Guest and unverified | Guest `/api/cart` denied; unverified cart and checkout denied; unverified cart count remains safe; protected customer route redirects to login | PASS |
| Customer and seller boundaries | Customer denied seller/admin endpoints; seller can read own seller products/orders; seller denied admin endpoints; foreign seller product edit returns non-disclosing `404` | PASS |
| Administrator read surfaces | Admin can read admin products, users, orders, dashboard/analytics statistics, and all categories | PASS |

Command:

```powershell
$env:ECOMMERCE_E2E_BASE_URL='http://localhost:3101'
$env:ECOMMERCE_E2E_ROLES='true'
$env:ECOMMERCE_E2E_CUSTOMER_PASSWORD='MockCustomer!123'
$env:ECOMMERCE_E2E_UNVERIFIED_PASSWORD='MockUnverified!123'
$env:ECOMMERCE_E2E_SELLER_PASSWORD='MockSeller!123'
$env:ECOMMERCE_E2E_ADMIN_PASSWORD='E2eAdmin!123'
npm run e2e -- phase5-ecommerce-permission-matrix.spec.ts --workers=1
```

The rebuilt isolated stack passed all 3 scenarios in 8.4 seconds. The test is read-heavy and only attempts a foreign seller update; that mutation is rejected before persistence.

The combined isolated regression passed 10 scenarios in 30.9 seconds: three Mailpit authentication flows, selective checkout, two-user WebSocket messaging, three permission scenarios, and two tenant-isolation scenarios.

## Response-contract evidence

The role probe originally observed HTTP `500` for a seller calling `/api/orders/all`. Backend logs showed `AuthorizationDeniedException` being consumed by the generic exception handler after method security had correctly denied the call. After the fix, the same request returns `403` and a sanitized `Access denied` message. Missing checkout headers now return `400`.

## Remaining coverage

The matrix does not yet prove successful seller product creation/edit, seller order transition ownership, admin writes, review eligibility/duplicate prevention, or every active endpoint. Those remain separate Phase 5 slices. No credential or token is included in committed evidence.
