# Phase 5 — Variable permission contract and direct-link recovery

## Outcome

Project variables now use the same permission names that the project response
advertises. Listing requires `VARIABLE_VIEW`; creating, rotating, and removing
a variable require `VARIABLE_MANAGE`. Platform administrators continue to
bypass project membership, while project roles are evaluated through the
single `ProjectService.permissionSet` policy instead of a second hard-coded
role list.

The frontend also handles a user who pastes a `/variables` URL without
`VARIABLE_VIEW`. It does not issue a request that is guaranteed to fail. The
page renders a clear denial message and a keyboard-operable link back to the
project overview. This keeps the navigation contract honest while the backend
remains the final authorization boundary.

## Why this approach

The project payload is already the capability contract used to render the
workspace navigation. Previously, `ProjectVariableService` independently
checked for the `PROJECT_MANAGER` role. That happened to match the current
role matrix, but it could drift if a future role receives or loses variable
visibility. `ProjectAccessService.requireProjectPermission` now reuses the
same permission set used to build `ProjectResponse.permissions`, so the API,
navigation, and direct routes have one source of truth.

Secret values remain write-only in responses. `ProjectVariableService.response`
returns `null` for a secret value; `VariablesPage` displays a fixed mask and
never attempts to decrypt or re-fetch the plaintext.

## Source map

| Concern | Source |
| --- | --- |
| Permission-level backend guard | `backend/src/main/java/com/megumi/testops/project/service/ProjectAccessService.java` |
| Effective role policy | `backend/src/main/java/com/megumi/testops/project/service/ProjectService.java` |
| Variable list/mutation guards and masking | `backend/src/main/java/com/megumi/testops/project/service/ProjectVariableService.java` |
| Direct-link denial and request gating | `frontend/src/features/projects/ProjectResourcePages.tsx` (`VariablesPage`) |
| Backend regression coverage | `backend/src/test/java/com/megumi/testops/project/service/ProjectAccessServiceTest.java`, `ProjectVariableServiceTest.java` |
| Frontend regression coverage | `frontend/src/features/projects/VariablesPage.test.tsx` |

## Behavioral contract

- Project managers and administrators can view and manage variables.
- Test managers, testers, viewers, guests, and non-members cannot view the
  variable resource.
- A direct unauthorized URL shows a `403`-style recovery state and does not
  send `GET /variables`.
- Secret metadata is visible only to authorized project members and the value
  is always masked; plaintext never appears in the API response or UI.
- Archived projects remain read-only because the existing active-project guard
  still runs after the permission check for mutations.

## Verification

The focused backend suite covers the role matrix for `VARIABLE_VIEW` and
`VARIABLE_MANAGE`, plus secret masking. The focused frontend suite covers a
viewer direct-link denial without a network request and the masked secret
rendering. Full frontend, backend, Compose, and CI gates remain required at
the slice boundary.
