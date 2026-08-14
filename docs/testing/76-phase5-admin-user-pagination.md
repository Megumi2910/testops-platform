# Phase 5 — Administration user-list evidence

## Scope

This slice verifies the administrator user-list recovery and pagination behavior without weakening the platform-role guard.

| Check | Evidence |
| --- | --- |
| Frontend source | `frontend/src/features/auth/AccountPages.tsx` |
| Backend contract | `AdminUserController.list` and `AdminUserService.list` |
| Mounted tests | `frontend/src/features/auth/AdminUsersPage.test.tsx` |
| Authorization source | `frontend/src/app/router.tsx`, `RouteGuards.tsx`, and `@PreAuthorize` on the backend controller |

## Automated result

The focused Phase 5 group passed:

```text
Test Files  3 passed
Tests       8 passed
```

The new tests cover:

1. A two-page response, correct `page`/`size` query parameters, page status text, and next-page rendering.
2. A failed list request, visible retry control, and a successful second request.

Existing membership and permission-route tests also passed in the same command.

## Manual acceptance checklist

1. Sign in as a platform administrator and open **Admin → Users**.
2. Search by email or display name; confirm the page indicator returns to page 1.
3. On a dataset larger than 25 users, move to the next page and confirm the request contains `page=1&size=25`.
4. Disconnect the backend or block the request in DevTools; confirm **Unable to load users** and **Try again** appear.
5. Restore connectivity and choose **Try again**; confirm rows return without a full reload.
6. Verify role/status selects remain disabled only for the user currently being updated.
7. Open `/admin/users` as a guest, unverified user, or normal member and confirm the existing route guard redirects before the page loads.

## Release interpretation

This slice closes the administration list's pagination and recoverability gap. It does not claim that the full Phase 5 permission matrix, final-admin browser matrix, or Chrome DevTools accessibility/performance gate is complete; those remain release requirements.
