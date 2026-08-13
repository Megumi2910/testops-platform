# Phase 5 ecommerce permission matrix

## Problem found

The first live role probe exposed a contract defect rather than a missing route. Spring method security correctly rejected a seller calling the administrator-only legacy `/api/orders/all` route, but `AuthorizationDeniedException` fell through `RestExceptionHandler.handleGenericException` and became HTTP `500`. The response implied a server outage for an expected authorization decision and made browser recovery ambiguous.

The same issue could affect every `@PreAuthorize`-protected ecommerce endpoint. In addition, seller updates and deletes for another seller's product threw a generic `IllegalArgumentException`, exposing a `400` response and a resource-specific message.

## Implementation

`backend/src/main/java/com/second_project/ecommerce/exception/RestExceptionHandler.java` now handles Spring Security's `AccessDeniedException` explicitly and returns a sanitized `403` with `Access denied`. Because `AuthorizationDeniedException` extends `AccessDeniedException`, both annotation-based and expression-based method-security failures use the same response. Missing required headers, including the checkout `Idempotency-Key`, return a client-facing `400` instead of an unexpected `500`.

`SellerProductController` now raises `ResourceNotFoundException` when a seller addresses a product owned by another seller. The existing `404` handler deliberately avoids confirming whether the foreign product exists. The ownership check still happens before the update/delete service call, so an unauthorized request cannot mutate data.

## Browser contract

`frontend/e2e/phase5-ecommerce-permission-matrix.spec.ts` is opt-in (`ECOMMERCE_E2E_ROLES=true`) and uses the isolated fixture stack:

- guest cart access is denied;
- an unverified account may sign in and see a zero cart count, but cart access and checkout are denied;
- verified customers cannot call seller or administrator surfaces;
- sellers can read their own seller products/orders but cannot call administrator surfaces or edit another seller's product;
- the E2E administrator can read product, user, order, statistics, and category administration surfaces.

The test uses complete DTO payloads for the foreign-product mutation so request validation cannot hide the ownership authorization check. It never mutates a fixture record successfully.

## Verification

- Focused ecommerce backend: `RestExceptionHandlerTest`, `MessageWebSocketControllerTest`, and `WebSocketAuthInterceptorTest` — 6 tests passed.
- Isolated backend image rebuilt without resetting the E2E PostgreSQL volume.
- Permission matrix: 3 scenarios passed in 8.4 seconds.
- Combined regression: Mailpit authentication, checkout, messaging, role isolation, and this permission matrix passed 10 scenarios in 30.9 seconds.

The wider Phase 5 gate still needs seller/admin write workflows, review ownership, order cancellation edge cases, and accessibility/performance closure. GitHub Actions remains unavailable because the account has consumed its included minutes; local isolated evidence is required until the quota resets.
