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
12. Fulfill two deterministic search pages in the browser, move from page 1 to page 2, and assert that the `page=1` URL, boundary button states, and server page requests stay aligned. This fixture proves the UI contract even when the permanent local catalog has fewer than twelve products.

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

### Duplicate-submit contract

The sixth test fills only disposable address and phone values, intercepts `/api/orders/checkout`, and holds the response open. It clicks `Đặt hàng` once, verifies the control is disabled and exposes `aria-busy="true"`, then dispatches a second click while the first request is still pending. The request log must contain exactly one entry with a UUID-shaped `Idempotency-Key`; the body must include COD and the selected cart-item IDs. The route returns a synthetic `503`, after which the UI shows the server message and re-enables the control. This proves the frontend lock and header contract without creating an order.

After adding the contract, `npm run typecheck`, `npm run lint`, and `npm test -- --run` all passed in `D:\Projects\testops-platform\frontend` on 2026-08-01 (`4` test files, `9` unit tests); all three static gates passed again after the final pagination-test stabilization. The ecommerce unit suite passed `3` suites and `10` tests, and the ecommerce production image rebuilt successfully with only pre-existing warnings. The opt-in browser suite now covers six tests, including outage/retry recovery, URL-driven pagination, and duplicate-submit protection, and passed in 17.3 seconds. Request-aware waits make the debounced search and held checkout assertions deterministic. These are browser contract checks; backend inventory locking and true concurrent idempotency remain native integration-test work.

The final static-gate rerun after the duplicate-submit test and doc update passed again: TypeScript build, ESLint, and Vitest all completed successfully (`4` files, `9` tests).

The ecommerce backend now adds native checkout coverage alongside this browser contract: `OrderRestControllerTest` verifies verified-customer UUID validation and unverified blocking, while `CheckoutIdempotencyCoordinatorTest` proves same-key work is serialized and different keys remain concurrent. `./mvnw.cmd verify` passed with 6 tests on 2026-08-01.

After the backend image rebuild, the six-test browser contract was rerun against `http://localhost:3001` and passed in 17.9 seconds. This confirms the new service constructor and coordinator do not regress the target-facing login, cart, search, outage-retry, pagination, or checkout-lock paths.

After the coordinator's reference-counted cleanup was rebuilt into the backend image, the same six tests passed again in 14.8 seconds on 2026-08-01.

The post-mapping Compose health check reported the backend, frontend, and PostgreSQL healthy on 2026-08-01, with PgAdmin running and no E2E volume reset. The final six-test browser contract was then rerun against that image and passed in 14.5 seconds. This is the release evidence for the JPA uniqueness mapping plus reference-counted checkout coordinator.

The next Phase 4 slice tightened order-status authorization: `/api/admin/orders/{id}/status` and the deprecated `/api/orders/{id}/status` compatibility route are admin-only, while `/api/seller/orders/{id}/status` remains the seller path with ownership validation. The focused native `OrderStatusAuthorizationTest` passed before the full backend verification rerun.

The complete ecommerce backend `./mvnw.cmd verify` rerun then passed on 2026-08-01 with 8 tests and zero failures, rebuilding the Spring Boot jar after the authorization change.

The ecommerce backend image was rebuilt from the verified source and the existing Compose database volume was reused; the container was recreated without a database reset.

The post-rebuild Compose check reported the backend, frontend, and PostgreSQL healthy, with PgAdmin running, on ports `8081`, `3001`, `5433`, and `5051`.

The six-test browser contract passed against the authorization-hardened image on 2026-08-01 in 17.1 seconds, covering authenticated checkout reachability, responsive layout, keyboard search, outage retry, pagination, and duplicate-submit locking.

The messaging follow-up adds shared REST/WebSocket payload validation: blank text is rejected, input is trimmed, and text over 2,000 characters is rejected before thread access. The focused native `MessageServiceValidationTest` passed on 2026-08-01.

The ecommerce frontend unit suite also passed after the reconnect-status UI change: 3 suites and 10 tests on 2026-08-01.

The ecommerce production frontend build passed after the messaging reconnect change. Existing lint and browser-data advisories remain non-blocking; no new compile error was introduced.

The full ecommerce backend verification then passed with 10 tests and zero failures after the messaging validation change, including both new blank/length regressions.

The backend Docker image was rebuilt from that verified source and the existing database volume was reused.

The post-rebuild Compose check reported the backend, frontend, and PostgreSQL healthy, with PgAdmin running on the documented ports.

The final six-test browser contract passed against the messaging-hardened image on 2026-08-01 in 16.8 seconds. Existing customer-facing transport, responsive, search, pagination, and duplicate-submit checks remained green.

The initial WebSocket authorization test run caught an unnecessary shared Mockito stub in the no-token fixture. The test was corrected to keep strict stubbing meaningful; no production behavior was implicated.

The corrected WebSocket authorization suite passed on 2026-08-01, covering missing authentication, non-member subscription rejection, and member subscribe/send access.

The complete ecommerce backend verification gate passed after adding the WebSocket authorization suite: 13 tests ran with zero failures. The native test layer now covers checkout authorization/idempotency, order-status boundaries, message validation, and WebSocket authentication/thread membership. The existing Mockito/JDK dynamic-agent warning remains non-fatal.

The backend image was rebuilt from that verified source and restarted without resetting the existing PostgreSQL volume. The Compose health check reported `springboot_backend`, `react_frontend`, and `postgres_db` healthy, with PgAdmin running on ports `8081`, `3001`, `5433`, and `5051`.

The six-test Playwright ecommerce contract passed against the rebuilt healthy stack on 2026-08-01 in 16.8 seconds. Authenticated checkout reachability, mobile layout, keyboard search state, outage retry, pagination, and duplicate-submit locking remained green.

The next Phase 4 permission slice fixed an unverified-account cart bypass: `buy-now` and `clear cart` now share the verified-account guard used by the other cart mutations. The focused `CartRestControllerPermissionTest` passed on 2026-08-01 and confirms no cart service mutation occurs for an unverified customer.

The complete ecommerce backend verification gate passed after the cart permission fix: 15 tests ran with zero failures, including the two new unverified-cart regressions. The existing Mockito/JDK dynamic-agent warning remains non-fatal.

The backend image was rebuilt with the cart permission fix and the existing PostgreSQL volume was retained. After startup, the Compose health check reported the backend, frontend, and PostgreSQL healthy, with PgAdmin running on ports `8081`, `3001`, `5433`, and `5051`.

The six-test Playwright ecommerce contract passed against the cart-permission image on 2026-08-01 in 16.0 seconds. Authenticated checkout reachability, mobile layout, keyboard search state, outage retry, pagination, and duplicate-submit locking remained green.

The next messaging REST slice normalizes `targetRole` by trimming whitespace and ignoring case before resolving support threads. This fixes the frontend navigation payloads that use `admin` while the older controller compared only `ADMIN`. The focused `MessageRestControllerPermissionTest` passed on 2026-08-01.

The complete ecommerce backend verification gate passed after the messaging REST normalization: 16 tests ran with zero failures. The existing Mockito/JDK dynamic-agent warning remains non-fatal.

The backend image was rebuilt with the messaging role-normalization fix and the existing PostgreSQL volume was retained. After startup, the Compose health check reported the backend, frontend, and PostgreSQL healthy, with PgAdmin running on ports `8081`, `3001`, `5433`, and `5051`.

The six-test Playwright ecommerce contract passed against the messaging role-normalization image on 2026-08-01 in 15.9 seconds. Authenticated checkout reachability, mobile layout, keyboard search state, outage retry, pagination, and duplicate-submit locking remained green.

Phase 5 homepage reliability now starts category, featured, hot, and new-product requests concurrently with `Promise.allSettled`. Partial failures remain visible through an accessible retry alert, and unverified add-to-cart feedback uses the existing toast instead of a blocking browser alert. The frontend unit gate passed on 2026-08-01: 3 suites and 10 tests.

The ecommerce production frontend build passed after the homepage changes. Existing CRA lint, hook-dependency, WebSocket export, and browser-data advisories remain non-blocking.

The Docker frontend image was rebuilt from the same production build and the existing database volume was retained. After startup, Compose reported the frontend, backend, and PostgreSQL healthy, with PgAdmin running on the documented ports.

The six-test Playwright ecommerce contract passed against the rebuilt homepage image on 2026-08-01 in 17.3 seconds. Authenticated checkout reachability, mobile layout, keyboard search state, outage retry, pagination, and duplicate-submit locking remained green.

The Phase 5 accessibility slice replaced the clickable messaging thread `div` with a keyboard-operable button, added selected-state and accessible names to thread/tabs, labeled the mobile back control, and labeled homepage carousel controls. Frontend unit tests passed again on 2026-08-01: 3 suites and 10 tests.

The ecommerce production frontend build passed after the accessibility changes. Existing CRA lint, hook-dependency, WebSocket export, and browser-data advisories remain non-blocking.

The Docker frontend image was rebuilt from the accessibility build and the existing database volume was retained. After startup, Compose reported the frontend, backend, and PostgreSQL healthy, with PgAdmin running on the documented ports.

The six-test Playwright ecommerce contract passed against the accessibility image on 2026-08-01 in 16.1 seconds. Authenticated checkout reachability, mobile layout, keyboard search state, outage retry, pagination, and duplicate-submit locking remained green.

Product review submission and editing now use the shared `Toast` component for login prompts, rating validation, success confirmations, and API failures instead of blocking browser alerts. Review star controls, the edit action, the close action, and feedback buttons now declare button semantics and accessible names, keeping review authoring keyboard-operable while preserving the existing API flow. The frontend unit gate passed on 2026-08-01: 3 suites and 10 tests; only the existing stale browser-data advisory remains.

The ecommerce production frontend build passed after the review notification changes. Existing CRA unused-import, hook-dependency, WebSocket export, and browser-data advisories remain non-blocking; the optimized bundle was generated successfully.

The frontend image was rebuilt with the review notification changes and the existing PostgreSQL volume was retained. The Compose rebuild completed successfully; the backend was healthy before the frontend was started, preserving the documented startup dependency.

After the rebuild, `docker compose ps` reported `react_frontend`, `springboot_backend`, and `postgres_db` healthy, with PgAdmin still available on the documented port `5051`.

The six-test Playwright ecommerce contract passed against the rebuilt review image on 2026-08-01 in 18.5 seconds. Authenticated checkout reachability, mobile layout, keyboard search state, outage retry, pagination, and duplicate-submit locking remained green.

Final ecommerce diff inspection passed with `git diff --check`; the TestOps workspace has no implementation changes from this slice.

The next Phase 5 slice routes unverified-user, cart-add, buy-now, and missing-shop feedback in `CategoryProductsPage`, `ProductDetailPage`, and `FlashSalePage` through the shared toast system. Error outcomes now use the red variant, success outcomes retain the green variant, and the product breadcrumb back control has an accessible name. The frontend unit gate passed on 2026-08-01: 3 suites and 10 tests; only the existing stale browser-data advisory remains.

The ecommerce production frontend build passed after the catalog/product toast changes. Existing CRA unused-import, hook-dependency, WebSocket export, and browser-data advisories remain non-blocking; the optimized bundle was generated successfully.

The frontend image was rebuilt with the catalog/product toast changes and the existing PostgreSQL volume was retained. The backend was rebuilt from the unchanged source and reached its healthy state before the frontend restarted.

After the rebuild, `docker compose ps` reported `react_frontend`, `springboot_backend`, and `postgres_db` healthy; PgAdmin remained available on port `5051`.

The SellerOrders ecommerce image was rebuilt successfully on 2026-08-08. Docker completed the React production build, retained PostgreSQL data, recreated the backend and frontend containers, and gated frontend startup on healthy database/backend services. Existing CRA lint and browser-data advisories remain non-blocking; no SellerOrders compile error occurred.

Post-rebuild `docker compose ps` confirmed `postgres_db`, `springboot_backend`, and `react_frontend` are healthy. The expected ecommerce ports remain `3001`, `8081`, `5433`, and `5051`.

The TestOps Playwright ecommerce contract passed against the rebuilt SellerOrders image on 2026-08-08: all 9 tests passed in 25.8 seconds. The contract continues to cover seeded checkout reachability, accessible cart removal, profile controls, wishlist empty state, mobile layout, URL-driven search/pagination, outage retry, and duplicate-submit locking; no dedicated stable seller fixture exists for SellerOrders.

Final TestOps documentation diff inspection passed with `git diff --check`; only the browser smoke guide and architecture map are changed. Existing untracked `.agents/` and `skills-lock.json` remain untouched.

The matching ecommerce SellerOrders implementation commit is `3568210`; this TestOps documentation is being committed separately to preserve repository ownership boundaries.

The SellerOrders browser verification and architecture updates were committed as `30fa29e`.

The TestOps SellerOrders release-note commit is `a5b5b38`; the documentation history is ready to publish.

The matching TestOps SellerOrders documentation commits through `11d6498` were pushed successfully to `codex/milestone-9-release-candidate`.

The next Phase 5 slice hardens customer order cancellation. `CancelOrderModal` now has dialog semantics, an associated reason field, Escape handling, focus trapping/restoration, and submit locking. Customer order list/detail cancellation feedback now uses the shared Toast component for success and API failures rather than browser-blocking alerts. Verification is pending.

The targeted ecommerce scan found no `alert(...)` calls in the order cancellation files, and `git diff --check` passed. Git emitted only its normal line-ending normalization warning for edited files.

The ecommerce frontend unit gate passed after the order-cancellation changes on 2026-08-01: 3 suites and 10 tests. The existing browser-data freshness advisory remains non-blocking.

The ecommerce production frontend build passed after the order-cancellation changes. Existing CRA unused-import, hook-dependency, WebSocket export, and browser-data advisories remain non-blocking; no new compile errors were introduced.

The ecommerce frontend image was rebuilt with the order-cancellation changes. Docker retained the existing PostgreSQL volume, recreated the application containers, and waited for a healthy backend before starting the frontend.

After the rebuild, `docker compose ps` reported `react_frontend`, `springboot_backend`, and `postgres_db` healthy. PgAdmin remained available on port `5051`; ecommerce frontend/backend remained on `3001`/`8081`.

The seven-test Playwright ecommerce contract passed against the rebuilt order-cancellation image on 2026-08-01 in 21.7 seconds. It covered seeded-cart checkout reachability, keyboard-safe cart removal, mobile layout, shareable search state, outage retry, URL-driven pagination, and duplicate-submit protection. A direct order-cancellation browser journey remains a future coverage gap.

The existing browser contract was inspected before finalizing this slice. Because the E2E fixture currently guarantees a cart but not a cancellable order, no flaky order-cancellation test was introduced; deterministic order fixtures should be added with the next E2E data slice. A supplementary `rg.exe` route search was blocked by a Windows process-access error, while the actual Playwright contract remained green.

The modal focus implementation was then tightened so its effect does not restart whenever submitting state changes. A ref-backed submitting guard blocks Escape during the request while preserving focus-trap stability.

The focused ecommerce frontend unit gate was rerun after the focus-effect refinement: 3 suites and 10 tests passed on 2026-08-01. The existing browser-data advisory remains non-blocking.

The ecommerce production frontend build was rerun after the focus-effect refinement and passed. The same pre-existing CRA advisories remain non-blocking.

The ecommerce frontend container was rebuilt again from the refined focus-trap implementation; Docker retained PostgreSQL data and waited for backend health before frontend startup.

Final Compose health verification reported `react_frontend`, `springboot_backend`, and `postgres_db` healthy. The documented ports remain frontend `3001`, backend `8081`, PostgreSQL `5433`, and PgAdmin `5051`.

The final seven-test Playwright ecommerce contract passed against the refined frontend image on 2026-08-01 in 21.0 seconds. The cart-dialog keyboard regression remained green alongside seeded-cart checkout, mobile layout, URL-driven search/pagination, outage retry, and duplicate-submit protection.

Final diff inspection passed with `git diff --check`. The TestOps working tree contains only the two related documentation files; existing unrelated untracked `.agents/` and `skills-lock.json` remain untouched.

The order-cancellation verification documentation was committed on branch `codex/milestone-9-release-candidate`; the branch is ready to publish alongside the ecommerce implementation commit.

The documentation branch was pushed successfully to the remote after the final browser and Compose verification.

The next Phase 5 slice hardens `CustomerProfile`: save and avatar feedback now use shared Toast notifications, profile controls have explicit labels, avatar upload is accessible, and password visibility buttons are keyboard reachable with stateful names. Verification is pending.

The targeted profile scan found no browser alert calls, and `git diff --check` passed; only the normal line-ending normalization warning was emitted.

The ecommerce frontend unit gate passed after the CustomerProfile changes on 2026-08-01: 3 suites and 10 tests. The existing browser-data advisory remains non-blocking.

The ecommerce production frontend build passed after the CustomerProfile changes. Existing CRA lint, hook-dependency, WebSocket export, and browser-data advisories remain non-blocking.

The ecommerce frontend image was rebuilt with the CustomerProfile changes; PostgreSQL data was retained and backend health gating completed before frontend startup.

After the rebuild, `docker compose ps` reported `react_frontend`, `springboot_backend`, and `postgres_db` healthy. Ecommerce ports remain `3001`/`8081`, PostgreSQL `5433`, and PgAdmin `5051`.

The nine-test TestOps Playwright contract passed against the SellerSettings image on 2026-08-08 in 26.0 seconds. Seeded-cart checkout, cart-dialog keyboard behavior, profile controls, wishlist empty state, mobile layout, URL-driven search/pagination, outage retry, and duplicate-submit protection remained green. SellerSettings has no dedicated stable seller fixture in this contract, so its verification remains build- and source-review based.

Final ecommerce diff inspection passed with `git diff --check`; only `SellerSettings.jsx` and the reliability log are changed for this implementation slice.

The matching TestOps documentation diff was inspected before publication; only this browser smoke guide and the architecture map are intended changes. Existing untracked `.agents/` and `skills-lock.json` remain untouched.

The ecommerce SellerSettings implementation commit `72f9f85` was created successfully; the matching TestOps documentation commit is next.

The matching TestOps SellerSettings verification documentation was committed on `codex/milestone-9-release-candidate` as `bddd3c8`; the documentation branch is now published through `505838b`.

The ecommerce SellerSettings commits through `56879e7` were pushed successfully; the TestOps documentation branch was also pushed through `505838b`.

The next Phase 5 slice updates `SellerOrders`: order data mapping is centralized, status labels now normalize backend values consistently, status updates will use Toast feedback and request locking, and order actions, filters, modal controls, icons, and error states are being made keyboard- and screen-reader-friendly. Verification is pending.

SellerOrders now fetches through a reusable callback, maps backend status and delivery values once, refreshes through the same path after a status update, and exposes success/error Toast feedback while preserving the existing `updating` lock.

SellerOrders now also exposes loading-safe statistics, a labelled search and status filter, actionable retry feedback, normalized cancellation rendering, and hidden decorative icons. Fetch failures remain separate from status-update failures so an update error does not replace the order list underneath its modal.

SellerOrders detail and status dialogs now have semantic dialog metadata, Escape handling, overscroll containment, labelled close/status controls, live update errors, focus-visible buttons, and explicit Toast rendering for successful or failed status changes.

The targeted SellerOrders audit found no browser `alert(...)` calls, no stale `setError` path inside the status dialog, and `git diff --check` passed. Only normal line-ending normalization warnings were emitted.

The ecommerce frontend unit gate passed after the SellerOrders changes on 2026-08-08: 3 suites and 10 tests. The existing stale `baseline-browser-mapping` advisory remains non-blocking.

The ecommerce production frontend build passed after the SellerOrders changes. Existing CRA unused-import, hook-dependency, WebSocket export, and browser-data advisories remain non-blocking; the optimized bundle was generated successfully.

Final ecommerce diff inspection passed with `git diff --check`; only `SellerSettings.jsx` and the reliability log are changed for this implementation slice.

The nine-test ecommerce Playwright contract passed against the ShopPage image on 2026-08-01 in 26.1 seconds. Existing checkout, cart-dialog, profile, wishlist, mobile, search, outage-retry, pagination, and duplicate-submit coverage remained green.

Final diff inspection passed with `git diff --check`. The TestOps working tree contains only the ShopPage verification documentation; unrelated `.agents/` and `skills-lock.json` remain untouched.

The ShopPage verification documentation is ready to commit on `codex/milestone-9-release-candidate`.

The ShopPage documentation commit was created successfully and is ready to publish.

The TestOps ShopPage branch was pushed successfully after the nine-test browser verification; both repositories now contain this slice.

The eight-test ecommerce Playwright contract passed against the CustomerWishlist image on 2026-08-01 in 22.9 seconds. Existing checkout, cart-dialog, profile accessibility, mobile, search, outage-retry, pagination, and duplicate-submit coverage remained green.

The browser contract now includes a wishlist empty-state regression that verifies the empty message and the actionable “Khám phá sản phẩm” navigation. Verification is pending.

The first nine-test run found a strict-mode locator issue in the new test because the broad heading name matched both the page title and the empty-state heading. This is a test selector defect, not an application failure; the selector will be made exact.

The wishlist browser regression now uses an exact page-title locator, preserving semantic matching for the empty-state heading.

The corrected nine-test Playwright contract passed on 2026-08-01 in 20.3 seconds. Wishlist empty-state navigation and all previous ecommerce regressions are green.

Final diff inspection passed with `git diff --check`. The TestOps working tree contains the wishlist browser regression and related docs; unrelated `.agents/` and `skills-lock.json` remain untouched.

The wishlist browser regression and documentation are ready to commit on `codex/milestone-9-release-candidate`.

The wishlist regression commit was created successfully and is ready to publish.

The TestOps wishlist branch was pushed successfully after the corrected nine-test browser verification; both repositories now contain this slice.

The next Phase 5 slice hardens `ShopPage`: restricted add-to-cart failures use Toast feedback, unavailable wishlist behavior is explicit, back navigation is labelled, and decorative shop icons are hidden from assistive technology. Verification is pending.

The targeted ShopPage scan found no browser alert calls, and `git diff --check` passed; only normal line-ending normalization warnings were emitted.

The ecommerce frontend unit gate passed after the ShopPage changes on 2026-08-01: 3 suites and 10 tests. The existing browser-data advisory remains non-blocking.

The ecommerce production frontend build passed after the ShopPage changes. Existing CRA unused-import and hook-dependency advisories remain non-blocking, including the pre-existing `fetchShopData` dependency warning.

The ecommerce frontend image was rebuilt with the ShopPage changes; PostgreSQL data was retained and backend health gating completed before frontend startup.

After the rebuild, `docker compose ps` reported `react_frontend`, `springboot_backend`, and `postgres_db` healthy. Ecommerce ports remain `3001`/`8081`, PostgreSQL `5433`, and PgAdmin `5051`.

The seven-test Playwright ecommerce contract passed against the CustomerProfile image on 2026-08-01 in 21.0 seconds. Seeded-cart checkout, cart-dialog keyboard behavior, mobile layout, URL-driven search/pagination, outage retry, and duplicate-submit protection remained green.

An initial profile-route lookup included a non-existent `App.jsx` path and returned a file-not-found error. No application code changed; the route lookup will be retried with the repository’s actual entry files.

The corrected source search confirmed `CustomerProfile` is wired from `frontend/src/App.js` and exposed by the customer layout; the earlier failure was only an incorrect path.

The ecommerce browser contract now includes a focused customer-profile regression that checks labelled profile fields and keyboard operation of the password visibility control. Verification is pending.

The expanded ecommerce Playwright contract passed on 2026-08-01: 8 tests in 20.8 seconds. The new CustomerProfile regression passed alongside the existing checkout, cart-dialog, mobile, search, outage-retry, pagination, and duplicate-submit coverage.

Final diff inspection passed with `git diff --check`. The TestOps working tree contains the focused browser regression and its two documentation updates; unrelated `.agents/` and `skills-lock.json` remain untouched.

The focused CustomerProfile browser regression and documentation are ready to commit on `codex/milestone-9-release-candidate`.

The CustomerProfile browser regression commit was created successfully; the branch is ready to publish.

The TestOps branch was pushed successfully after the eight-test browser verification; both repositories now contain the CustomerProfile slice.

The next Phase 5 slice updates `CustomerWishlist`: unverified-user add-to-cart failures use Toast feedback, empty-state navigation is actionable, view toggles expose pressed state and focus rings, and unavailable wishlist actions explain their status. Verification is pending.

The targeted wishlist scan found no browser alert calls, and `git diff --check` passed; only normal line-ending normalization warnings were emitted.

The ecommerce frontend unit gate passed after the CustomerWishlist changes on 2026-08-01: 3 suites and 10 tests. The existing browser-data advisory remains non-blocking.

The ecommerce production frontend build passed after the CustomerWishlist changes. Existing CRA advisories remain non-blocking and the optimized bundle was generated successfully.

The ecommerce frontend image was rebuilt with the CustomerWishlist changes; PostgreSQL data was retained and backend health gating completed before frontend startup.

After the rebuild, `docker compose ps` reported `react_frontend`, `springboot_backend`, and `postgres_db` healthy. Ecommerce ports remain `3001`/`8081`, PostgreSQL `5433`, and PgAdmin `5051`.

The final seven-test Playwright ecommerce contract passed against the refined frontend image on 2026-08-01 in 21.0 seconds. The cart-dialog keyboard regression remained green alongside seeded-cart checkout, mobile layout, URL-driven search/pagination, outage retry, and duplicate-submit protection.

The six-test Playwright ecommerce contract passed against the rebuilt cart-dialog image on 2026-08-01 in 17.6 seconds. Authenticated checkout reachability, mobile layout, keyboard search state, outage retry, pagination, and duplicate-submit locking remained green.

The next Phase 5 slice updates `SellerProducts`: product deletion remains explicitly confirmed, while validation, success, and API failures use the shared accessible Toast. Seller product action controls, form labels, image actions, and the modal now expose semantic names, focus-visible states, dimensions, and dialog metadata. Verification is pending.

The targeted seller-products scan found no browser `alert(...)` calls and `git diff --check` passed; only normal line-ending normalization warnings were emitted.

The ecommerce frontend unit gate passed after the SellerProducts changes on 2026-08-01: 3 suites and 10 tests. The existing stale `baseline-browser-mapping` advisory remains non-blocking.

The ecommerce production frontend build passed after the SellerProducts changes. Existing CRA unused-import, hook-dependency, WebSocket export, and browser-data advisories remain non-blocking; the optimized bundle was generated successfully.

The ecommerce frontend image was rebuilt with the SellerProducts changes; PostgreSQL data was retained and backend health gating completed before frontend startup.

After the rebuild, `docker compose ps` reported `react_frontend`, `springboot_backend`, and `postgres_db` healthy; PgAdmin remained available on port `5051`. Ecommerce ports remain `3001`/`8081`, PostgreSQL `5433`, and PgAdmin `5051`.

The nine-test TestOps Playwright contract passed against the rebuilt SellerProducts image on 2026-08-01 in 26.6 seconds. Seeded-cart checkout, cart-dialog keyboard behavior, profile controls, wishlist empty state, mobile layout, URL-driven search/pagination, outage retry, and duplicate-submit protection remained green. No dedicated seller fixture exists in this contract yet, so SellerProducts remains covered by build verification and the targeted source/a11y review.

Final ecommerce diff inspection passed with `git diff --check`; only `SellerProducts.jsx` and the reliability log are changed for this implementation slice.

The TestOps documentation diff was inspected before publication; only this browser smoke guide and the architecture map are intended changes. Existing untracked `.agents/` and `skills-lock.json` remain untouched.

The SellerProducts verification notes are ready to stage in the matching TestOps documentation commit.

The ecommerce SellerProducts implementation commit `9dd44cf` was created successfully; the matching TestOps documentation commit is next.

The matching TestOps SellerProducts verification documentation was committed on `codex/milestone-9-release-candidate` as `f4cb99b`; the documentation branch is now published through `475e298`.

The ecommerce SellerProducts commits through `13bf46e` were pushed successfully; the TestOps documentation branch was also pushed through `475e298`.

The next Phase 5 slice updates `SellerStore`: save success and failure use the shared Toast, save controls lock while pending, statistics expose a loading state, unfinished logo upload is labelled as unavailable, and store/contact/policy fields receive semantic labels, autocomplete hints, focus-visible states, and accessible icon treatment. Verification is pending.

The targeted SellerStore scan found no browser `alert(...)` calls and `git diff --check` passed; only normal line-ending normalization warnings were emitted.

The ecommerce frontend unit gate passed after the SellerStore changes on 2026-08-08: 3 suites and 10 tests. The existing stale `baseline-browser-mapping` advisory remains non-blocking.

The ecommerce production frontend build passed after the SellerStore changes. Existing CRA unused-import, hook-dependency, WebSocket export, and browser-data advisories remain non-blocking; the optimized bundle was generated successfully.

The first Docker rebuild attempt for SellerStore exceeded the 120-second command timeout before returning a completion result; container health is being checked separately before treating this as a failure.

Compose recovery completed with `docker compose up -d frontend`: the existing PostgreSQL container and volume were retained, the backend was recreated and reached healthy status, and the frontend started successfully.

After recovery, `docker compose ps` reported `react_frontend`, `springboot_backend`, and `postgres_db` healthy. Ecommerce ports remain `3001`/`8081`, PostgreSQL `5433`, and PgAdmin `5051`.

The nine-test TestOps Playwright contract passed against the recovered SellerStore image on 2026-08-08 in 27.6 seconds. Seeded-cart checkout, cart-dialog keyboard behavior, profile controls, wishlist empty state, mobile layout, URL-driven search/pagination, outage retry, and duplicate-submit protection remained green. SellerStore itself has no dedicated stable seller fixture in this contract, so it remains covered by build verification and targeted source/a11y review.

Final ecommerce diff inspection passed with `git diff --check`; only `SellerStore.jsx` and the reliability log are changed for this implementation slice.

The matching TestOps documentation diff was inspected before publication; only this browser smoke guide and the architecture map are intended changes. Existing untracked `.agents/` and `skills-lock.json` remain untouched.

The ecommerce SellerStore implementation commit `19d3efd` was created successfully; the matching TestOps documentation commit is next.

The matching TestOps SellerStore verification documentation was committed on `codex/milestone-9-release-candidate` as `c52675b`; the documentation branch is now published through `cc760fc`.

The ecommerce SellerStore commits through `de756b5` were pushed successfully; the TestOps documentation branch was also pushed through `cc760fc`.

The next Phase 5 slice updates `SellerSettings`: browser alerts are removed, notification and payment settings now have explicit save actions with honest session-only messaging, shop saves retain inline success/error feedback, loading text uses accessible ellipses, and tabs, checkboxes, form fields, icons, and status messages expose semantic labels, roles, focus states, and live announcements. Verification is pending.

The SellerSettings review also corrected tab-to-panel ARIA relationships: each tab has a stable ID and only the active tab references the mounted panel.

The ecommerce frontend unit gate passed after the SellerSettings changes on 2026-08-08: 3 suites and 10 tests. The existing stale `baseline-browser-mapping` advisory remains non-blocking.

The ecommerce production frontend build passed after the SellerSettings changes. Existing CRA unused-import, hook-dependency, WebSocket export, and browser-data advisories remain non-blocking; the optimized bundle was generated successfully.

The ecommerce frontend image was rebuilt with the SellerSettings changes; PostgreSQL data was retained and backend health gating completed before frontend startup.

After the rebuild, `docker compose ps` reported `react_frontend`, `springboot_backend`, and `postgres_db` healthy. Ecommerce ports remain `3001`/`8081`, PostgreSQL `5433`, and PgAdmin `5051`.

Final TestOps repository status is clean aside from the preserved untracked `.agents/` and `skills-lock.json`; the latest SellerStore documentation commit is `6206bc5`.

Final ecommerce diff inspection passed with `git diff --check`; the TestOps workspace has only the corresponding documentation updates.

The Playwright ecommerce contract now includes a direct cart-confirmation regression: it verifies the dialog opens without deleting the seeded item, focuses the cancel action, cycles to the destructive action with Tab, closes on Escape, and restores focus after Escape and Cancel. The expanded contract passed on 2026-08-01: 7 tests in 18.5 seconds.

The final TestOps diff passed `git diff --check`; this change adds one focused ecommerce browser regression and its documentation only. Existing untracked `.agents/` and `skills-lock.json` files remain untouched.

The final TestOps diff passed `git diff --check`; this change adds one focused ecommerce browser regression and its documentation only. Existing untracked `.agents/` and `skills-lock.json` files remain untouched.

The six-test Playwright ecommerce contract passed against the rebuilt catalog/product image on 2026-08-01 in 16.8 seconds. Authenticated checkout reachability, mobile layout, keyboard search state, outage retry, pagination, and duplicate-submit locking remained green.

Final ecommerce diff inspection passed with `git diff --check`; the TestOps workspace has only the corresponding documentation updates.

The next Phase 5 slice replaces the cart’s native `window.confirm` removal prompt with a focus-managed, keyboard-operable dialog. It keeps the destructive action explicit, traps Tab focus while open, closes on Escape, restores focus to the triggering delete control, and uses the existing `Button` styles. The frontend unit gate passed on 2026-08-01: 3 suites and 10 tests; only the existing stale browser-data advisory remains.

The ecommerce production frontend build passed after the cart dialog changes. Existing CRA unused-import, hook-dependency, WebSocket export, and browser-data advisories remain non-blocking; the optimized bundle was generated successfully.

The frontend image was rebuilt with the accessible cart dialog and the existing PostgreSQL volume was retained. The backend image remained unchanged and reached a healthy state before the frontend restarted.

After the rebuild, `docker compose ps` reported `react_frontend`, `springboot_backend`, and `postgres_db` healthy; PgAdmin remained available on port `5051`.

## Scope boundary

This smoke contract proves the customer entry path, responsive transport, and the frontend half of duplicate-submit protection. It is not a replacement for native ecommerce tests for Mailpit verification, two-user messaging, inventory locking, or transactional checkout replay/concurrency. Those scenarios need isolated fixtures and stronger orchestration and remain the next Phase 5/6 work items.
