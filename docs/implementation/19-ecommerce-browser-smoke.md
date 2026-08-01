# Ecommerce browser smoke contract

This document explains the opt-in browser journey that exercises the local ecommerce storefront from the TestOps repository. It is a deliberately small Phase 5 slice: it proves transport and authentication through the real browser without placing an order or changing seeded inventory.

## Why the test lives in TestOps

The ecommerce frontend is a Create React App bundle and does not currently own a Playwright dependency. TestOps already pins the Playwright runtime used by its acceptance tests (`frontend/package.json`, `@playwright/test`) and provides the CI reporter, trace, screenshot, and retry policy in `frontend/playwright.config.ts`. Keeping this target-facing spec beside that runtime avoids a second browser installation while preserving repository boundaries: the test only navigates to the configured ecommerce origin.

The spec is `frontend/e2e/ecommerce-smoke.spec.ts`. It is skipped by default so ordinary TestOps CI does not require an ecommerce container. Set `ECOMMERCE_BASE_URL` to opt in.

## Journey and assertions

1. Open `${ECOMMERCE_BASE_URL}/login` and fill the semantic `Email` and `Mật khẩu` fields.
2. Submit `Đăng nhập` with a verified fixture customer.
3. Confirm the application returns to the storefront root.
4. Open `/cart` and confirm `Giỏ hàng của tôi` plus seeded product content.
5. Select the cart's first (select-all) checkbox and activate `Mua hàng (...)`.
6. Confirm `/checkout`, `Thông tin thanh toán`, and `Phương thức thanh toán` are visible.
7. Collect console and network diagnostics. React route changes may abort obsolete requests; only non-aborted request failures fail the test.
8. Assert that no browser request uses the removed hard-coded `localhost:8080` backend address.
9. Run a second test at 390px wide and assert `document.documentElement.scrollWidth === 390`.
10. Open the mobile filter panel from the keyboard, select the seeded `Thời trang` category with arrow keys, and change sorting with the keyboard. The test asserts that both choices are reflected in the URL.
11. Abort the first product request, confirm the search surface exposes an alert with `Thử lại tải sản phẩm`, retry, and confirm results recover. The request failure is injected in the browser so the shared backend remains available to other developers.

The test intentionally stops at the checkout form. It does not enter an address, select a payment method, or click `Đặt hàng`, so repeated runs cannot create orders, consume stock, or alter the permanent mock fixtures.

## Running locally

Start the ecommerce development stack first:

```powershell
cd D:\Projects\ecommerce-web\webcky
docker compose up -d --build
```

Then run the opt-in suite:

```powershell
cd D:\Projects\testops-platform\frontend
$env:ECOMMERCE_BASE_URL = 'http://localhost:3001'
$env:ECOMMERCE_SMOKE_EMAIL = 'mock.customer@example.test'
$env:ECOMMERCE_SMOKE_PASSWORD = 'MockCustomer!123'
npm run e2e -- e2e/ecommerce-smoke.spec.ts
```

The credentials are local-only mock data from `D:\Projects\ecommerce-web\webcky\MOCK_DATA.md`. The environment variables are intentionally not written to a committed file. For the isolated E2E profile, use its seeded credentials and `http://localhost:3101` instead of the normal development port.

## Evidence and failure diagnosis

The Playwright config retains traces and screenshots on failure. A failed run is usually one of:

- **Login failure:** the backend is unhealthy, the fixture is missing, or the password does not match the active database.
- **Cart redirect:** the session was not created; inspect the login response and browser storage.
- **Checkout CTA missing:** the cart is empty, or the customer fixture has no cart items.
- **Network failure:** inspect the printed URL and error. A real request failure indicates a proxy/backend problem; an `ERR_ABORTED` request during navigation is expected cancellation.
- **Hard-coded backend URL:** search the captured request list and then inspect `frontend/src/services/api.js` and the Nginx `/api` proxy.
- **Overflow failure:** inspect the 390px screenshot and the component that introduces a fixed-width child.

The authenticated manual evidence from 2026-08-01 is `artifacts/ecommerce-authenticated-checkout-smoke.png`. It shows the mobile checkout form, COD/QR options, order summary, and the disabled-state-safe route reached without submitting an order.

After adding the contract, `npm run typecheck`, `npm run lint`, and `npm test -- --run` all passed in `D:\Projects\testops-platform\frontend` on 2026-08-01 (`4` test files, `9` unit tests); all three static gates were rerun successfully after the outage test change. The opt-in browser suite now covers four tests, including outage/retry recovery, and passed in 9.1 seconds. The ecommerce image was rebuilt before the browser run because the Compose frontend serves a static production bundle. The initial outage run exposed an overly narrow glob that did not match the `/search` path; the corrected `/api/products/**` matcher and canonical network-error assertion then passed. This is a test-harness fix, not a production outage.

## Scope boundary

This smoke contract proves the customer entry path and responsive transport. It is not a replacement for native ecommerce tests for Mailpit verification, two-user messaging, duplicate-submit races, inventory locking, or transactional checkout. Those scenarios need isolated fixtures and stronger orchestration and remain the next Phase 5/6 work items.
