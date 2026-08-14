# Phase 5 — Member-list recovery evidence

## Scope

This slice verifies the Members page’s loading failure recovery without
changing the project role or tenant-isolation contract.

| Check | Evidence |
| --- | --- |
| Manager mutation controls | `frontend/src/features/projects/MembersPage.test.tsx` |
| Final project-manager conflict | Existing mounted member test and backend membership tests |
| Read-only role rendering | Existing viewer mounted member test |
| Failed list recovery | New retry test in `MembersPage.test.tsx` |
| Backend project scope | `ProjectService.members` and `ProjectAccessService.membership` |

## Automated result

Focused command:

```text
Test Files  3 passed
Tests       9 passed
```

The retry test makes the first member request fail, confirms the accessible
alert and **Try again** button, clicks the recovery action, and verifies the
second request renders the member row.

## Manual acceptance checklist

1. Open an active project as a project manager and navigate to **Members**.
2. Block the members request in Chrome DevTools; confirm the error alert and
   **Try again** button are visible.
3. Restore the request and activate **Try again**; confirm the rows return
   without leaving the project.
4. Open the same project as a viewer; confirm the list is read-only and the
   add, save-role, and remove controls are absent.
5. Open a project URL as a non-member; confirm the project-level denial still
   occurs before any member list is exposed.

## Release interpretation

This closes the Members page recovery gap. It does not claim the complete
Phase 5 two-project browser matrix, final-administrator matrix, or Chrome
DevTools accessibility/performance gate is complete.
