# Phase 5 — Final administrator conflict evidence

## Scope

This slice verifies the administrator UI's handling of the structured
`final_active_admin` conflict while preserving server-side last-admin safety.

| Check | Evidence |
| --- | --- |
| Paginated administrator list | `frontend/src/features/auth/AdminUsersPage.test.tsx` |
| List failure recovery | Existing retry test in the same suite |
| Final-admin error mapping | New mounted test with a `409` problem response |
| Backend invariant | `AdminUserService.ensureAnotherActiveAdmin` and service tests |
| Browser boundary | `phase5-administrator-crud.spec.ts` and `phase5-account-status.spec.ts` |

## Automated result

Focused command:

```text
npm test -- --run src/features/auth/AdminUsersPage.test.tsx
Test Files  1 passed
Tests       3 passed
```

The test loads an administrator row, attempts a demotion, returns the structured
`final_active_admin` conflict, and confirms the accessible alert tells the
operator to keep another active administrator.

## Manual acceptance checklist

1. Sign in as a platform administrator and open **Administration → Users**.
2. Attempt to demote or disable the only active administrator.
3. Confirm the request is rejected with `409 final_active_admin`.
4. Confirm the alert explains that another active administrator must remain.
5. Add or retain a second active administrator, then repeat the mutation.
6. Confirm pending controls prevent repeated submissions and the list refreshes
   after a successful change.

## Release interpretation

This closes the administrator conflict-message gap. It does not claim the full
Chrome DevTools administration matrix, Google/session permutations, or final
Milestone 10A release gate is complete.
