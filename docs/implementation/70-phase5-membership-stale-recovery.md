# Phase 5 — Membership stale-version recovery and query hygiene

## Outcome

Member add, role-change, and removal mutations now recover the project and
member queries when the backend returns `409 stale_version`. The page keeps the
operator on the Members route, refreshes the authoritative project version and
member rows, and leaves the existing conflict message visible so the next
attempt uses current data.

The same refresh path now invalidates exact React Query keys. The member query
is not invalidated once directly and again through the broader project key, so
a mutation or stale-version recovery does not issue duplicate member-list
requests.

## Why this approach

Project versions protect membership changes from overwriting another manager's
update. A stale response is therefore recoverable, not a generic failure: the
operator needs current project metadata before retrying. Refreshing both exact
queries preserves the route and avoids a full page reload while keeping the
backend authoritative.

React Query keys are hierarchical. Invalidating `['projects', projectId]`
also invalidates `['projects', projectId, 'members']`; combining that with a
direct member invalidation previously caused repeated requests. `exact: true`
keeps the project and member refreshes independent and bounded.

## Source map

| Concern | Source |
| --- | --- |
| Stale recovery and exact invalidation | `frontend/src/features/projects/ProjectResourcePages.tsx` (`MembersPage`) |
| Versioned membership API contract | `frontend/src/features/projects/api.ts` |
| Mounted stale-version regression | `frontend/src/features/projects/MembersPage.test.tsx` |
| Server-side version and role guard | `backend/src/main/java/com/megumi/testops/project/service/ProjectService.java` |

## Behavioral contract

- Successful membership mutations refresh the exact member and project queries.
- `stale_version` failures refresh those queries before the operator retries.
- The conflict message remains actionable and does not hide the failure.
- A stale recovery performs one member-list refetch, not duplicate requests.
- Final-project-manager and permission failures retain their existing messages.
- Viewer rows remain read-only and tenant isolation remains enforced server-side.

## Verification

The focused Members page suite covers manager mutations, final-manager
conflicts, viewer rendering, failed-list retry, and stale-version recovery.
Full frontend, backend, Compose, and CI gates remain required for the slice.
