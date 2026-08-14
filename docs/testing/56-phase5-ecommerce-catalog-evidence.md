# Phase 5 ecommerce catalog browser evidence

## Environment

| Component | Value |
| --- | --- |
| Storefront | `http://localhost:3001` |
| Backend transport | Same-origin `/api` through the ecommerce Nginx proxy |
| Fixture source | `D:\Projects\ecommerce-web\webcky\MOCK_DATA.md` |
| Test contract | `frontend/e2e/ecommerce-smoke.spec.ts` |

## Acceptance matrix

| Case | Expected | Result |
| --- | --- | --- |
| CAT-01 | Categories page renders the seeded `Thời trang` category and opens its category route | PASS |
| CAT-02 | The seeded `Áo thun basic cotton` result opens `/product/:id` and renders the detail heading | PASS |
| CAT-03 | An unknown search term renders the stable `Không tìm thấy sản phẩm` empty state and recovery guidance | PASS |
| CAT-04 | Search query, category, sort, pagination, and retry behavior remain covered by the existing contract | PASS |

## Verification

The complete opt-in ecommerce contract passed **11/11** scenarios in **26.8 seconds** against the healthy local Compose stack. It now covers authenticated cart/checkout entry, keyboard-safe cart removal, profile controls, wishlist empty state, mobile overflow, URL-driven filters/sort, category navigation, product detail navigation, no-result search, outage retry, deterministic pagination, and duplicate-checkout locking.

The suite remains non-destructive: it does not submit a real order. The checkout duplicate-submit case intercepts the request and returns a synthetic `503`, while the permanent mock cart and order fixtures remain unchanged.

## Release interpretation

This closes the repeatable public catalog/search portion of `QG-B11`. It does not claim ecommerce email, checkout concurrency, two-user messaging, seller/admin isolation, or the separate accessibility/performance remediation gate. Those require native ecommerce fixtures or additional application work.
