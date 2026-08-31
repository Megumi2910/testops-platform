# Phase 5 — Membership stale-version recovery evidence

## Scope

This slice verifies that a concurrent membership change produces a recoverable
conflict and that the UI refreshes current project/member data without issuing
duplicate list requests.

| Check | Evidence |
| --- | --- |
| Versioned role mutation | `frontend/src/features/projects/MembersPage.test.tsx` |
| Stale-version conflict message | Mounted test with `ApiError(409, code=stale_version)` |
| Exact member/project refresh | `MembersPage` mutation error recovery |
| Duplicate-refetch prevention | The stale test asserts one post-failure member refetch |
| Backend authority | `ProjectService` version check and membership tests |

## Automated result

Focused command:

```text
npm test -- --run src/features/projects/MembersPage.test.tsx
Test Files  1 passed
Tests       5 passed
```

The stale-version test rejects a role update with the server conflict code,
confirms the actionable message, and verifies that the member query is called
exactly once more for recovery.

## Manual acceptance checklist

1. Open an active project as two project managers in separate tabs.
2. Change a member role in tab A, then submit an older role change in tab B.
3. Confirm the page reports that the project changed and keeps the Members route.
4. Confirm the member rows and project metadata refresh before another attempt.
5. Inspect the Network panel and confirm the recovery does not duplicate the
   member-list request.
6. Confirm final-manager and unauthorized changes retain their existing
   server-derived messages.

## Release interpretation

This closes the frontend stale-version recovery and duplicate-refetch gap. It
does not claim the complete two-project browser matrix, final-administrator
matrix, or Chrome DevTools accessibility/performance gate is complete.
