# Phase 5 — Member-list recovery and read-only boundary

## Outcome

The project Members page now has an explicit retry action when its list request
fails. A transient backend or network failure no longer leaves a project
manager with a dead-end message or forces a full route reload. The existing
permission boundary is unchanged: project managers see mutation controls,
while other project members may only see the read-only member list and cannot
manage roles or remove users.

## Why this approach

Membership is project-scoped state, so the page should recover the same query
in place instead of invalidating the whole workspace. `query.refetch()` keeps
the current route, project context, and pending mutation state intact. The
retry button is a semantic button with a stable accessible name and sits beside
the alert so keyboard users can recover without inspecting DevTools.

The backend remains authoritative. `ProjectService.members` still requires
project membership (or platform administration) before returning rows, and
all add/change/remove operations continue to require the project-manager role,
active project state, and the current project version.

## Source map

| Concern | Source |
| --- | --- |
| Member loading and retry UI | `frontend/src/features/projects/ProjectResourcePages.tsx` (`MembersPage`) |
| Project membership and mutation guards | `backend/src/main/java/com/megumi/testops/project/service/ProjectService.java` |
| Project-scoped access | `backend/src/main/java/com/megumi/testops/project/service/ProjectAccessService.java` |
| Read-only role rendering | `frontend/src/features/projects/MembersPage.test.tsx` |

## Behavioral contract

- A successful member-list request renders member rows and role badges.
- A failed request renders an alert and **Try again**.
- Retrying refetches the same project list without changing the URL.
- Project managers retain add, role-save, and remove controls.
- Test managers, testers, and viewers retain read-only rows with no mutation
  controls.
- Non-members remain blocked at the project boundary; this UI recovery does
  not weaken tenant isolation.

## Verification

The focused frontend group now covers manager mutations, final-manager
conflict messaging, read-only rendering, member-list retry recovery, variable
permissions, and platform route guards. Full frontend, backend, Compose, and
CI gates remain required before closing the slice.
