# Phase 5 — Administration user-list recovery and pagination

## Outcome

The platform administrator page now consumes the backend's paginated user contract instead of requesting an arbitrary 50-row slice. Search remains debounced through `useDeferredValue`, page changes are query-keyed, previous results stay visible during a page fetch, and a failed list request offers an explicit retry action.

This slice does not change authorization or the admin API. The existing `@PreAuthorize("hasAuthority('ROLE_ADMIN')")` controller remains authoritative; the frontend route guard and backend permission still protect the route and mutations.

## Contract alignment

`AdminUserController.list` already accepts:

```text
GET /api/v1/admin/users?page=0&size=25&query=<optional>
```

and returns the shared page shape:

```json
{
  "content": [],
  "page": 0,
  "size": 25,
  "totalElements": 0,
  "totalPages": 0
}
```

The previous page ignored all metadata and always requested `size=50`. That made large installations impossible to navigate and made a transient network failure a dead end. `AdminUsersPage` now includes `deferredQuery` and `page` in the React Query key, resets to page zero when the search text changes, and renders Previous/Next controls only when the server reports more than one page.

`keepPreviousData` prevents a page change from replacing the table with a blank loading state. The loading indicator still communicates an in-flight fetch, while the controls remain disabled until the new page is available.

## Failure and recovery behavior

- Initial list failure renders an alert and **Try again**; retry calls the same query without a full route reload.
- Search changes reset pagination so a new filter never opens on an invalid later page.
- Empty search results remain a normal empty state, not an error.
- Role/status mutations keep their existing per-user pending lock, success message, refetch, and final-active-administrator error behavior.
- A non-administrator still fails at the route guard before this component renders, while the backend denies direct API access independently.

## Source map

| Concern | Source |
| --- | --- |
| Paginated query, retry, and controls | `frontend/src/features/auth/AccountPages.tsx` (`AdminUsersPage`) |
| Admin API and page bounds | `backend/src/main/java/com/megumi/testops/auth/api/AdminUserController.java` and `.../service/AdminUserService.java` |
| Permission route guard | `frontend/src/features/projects/RouteGuards.tsx` and `frontend/src/app/router.tsx` |
| Regression coverage | `frontend/src/features/auth/AdminUsersPage.test.tsx` |

## Design trade-off

The UI uses server pagination rather than fetching every user and filtering in memory. That keeps response size bounded and preserves the backend's stable email ordering. It also avoids introducing a second client cache or global state store for a page that is only visible to administrators.

## Verification

The focused test proves page 1 → page 2 requests preserve `page=1&size=25`, expose the current page and total count, and render the next user list. A second test proves an initial fetch failure exposes **Try again** and succeeds on retry. Full frontend, backend, Compose, and CI gates remain required at the slice boundary.
