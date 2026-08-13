# Phase 5 ecommerce semantic catalog evidence

## Scope

This evidence records the catalog accessibility sub-slice implemented on 2026-08-13. It covers public category navigation and product-detail navigation without signing in or mutating fixtures.

## Expected contract

| Journey | Expected evidence |
| --- | --- |
| Open `/categories` | The seeded `Thời trang` destination is a named link: `Mở danh mục Thời trang`. |
| Activate the category link | The browser reaches `/category/:id` and renders the category heading and result count. |
| Search for `Áo thun` | The seeded product destination is a named link: `Xem sản phẩm Áo thun basic cotton`. |
| Activate the product link | The browser reaches `/product/:id` and renders the product heading. |
| Keyboard focus | Links and the homepage category button expose native focus behavior and visible focus rings. |

## Automated proof

`frontend/e2e/ecommerce-smoke.spec.ts` uses role-based locators for both destinations. The complete opt-in ecommerce contract passed 11/11 scenarios against the healthy permanent fixture stack before this semantic locator tightening; rerun the same command after rebuilding the ecommerce frontend image to verify the updated markup:

```powershell
cd D:\Projects\testops-platform\frontend
$env:ECOMMERCE_BASE_URL='http://localhost:3001'
$env:ECOMMERCE_SMOKE_EMAIL='mock.customer@example.test'
$env:ECOMMERCE_SMOKE_PASSWORD='MockCustomer!123'
npm run e2e -- ecommerce-smoke.spec.ts
```

## Interpretation

This is a catalog sub-gate, not the ecommerce release gate. A pass proves semantic navigation and the existing category/search/detail journeys. It does not prove header accessibility, payment, email, messaging, authorization, performance, or Lighthouse >=95.
