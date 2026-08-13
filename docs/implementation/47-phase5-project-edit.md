# Phase 5 project editing and name-conflict contract

## Why this slice exists

The project API already supported versioned updates and returned `409 project_name_taken` for an active-name conflict, but the workspace had no route from a project to that API. A manager could archive/restore a project yet could not correct its description, rename it, or change its target through the UI. That gap made the project row in the Phase 5 matrix incomplete and forced operators to use an undocumented HTTP call.

## Implementation

- `frontend/src/features/projects/ProjectWorkspace.tsx` now renders an **Edit project** link only when the effective project permissions include `PROJECT_UPDATE` and the project is `ACTIVE`.
- `frontend/src/app/router.tsx` registers the absolute nested route `/projects/:projectId/edit`, so the edit page cannot accidentally inherit a suite-relative path.
- `frontend/src/features/projects/ProjectPages.tsx` adds `EditProjectPage`:
  - Reuses the existing Zod project schema for name, description, and URL validation.
  - Submits the loaded project version as `projectVersion` to protect against stale tabs.
  - Updates the React Query detail cache and project list after a successful save, then returns to the project overview.
  - Treats archived projects and viewers as read-only, with an actionable return link.
  - Maps duplicate-name, stale-version, and archived-project responses to inline alerts instead of a generic failure.
  - Locks the submit button while the request is pending through the shared `Button` component.

The backend contract remains unchanged: `PUT /api/v1/projects/{id}` performs permission, archive-state, optimistic-version, allowlist, and active-name checks in `ProjectService`.

## Business rules

1. Only a project manager or platform administrator with `PROJECT_UPDATE` can edit.
2. Archived projects cannot be edited; restore them first.
3. A target remains subject to the backend allowlist; the browser cannot broaden execution policy.
4. The version from the loaded response is sent with the update. A concurrent change produces a stale-version conflict rather than overwriting another operator's edit.
5. Active project names remain case-insensitively unique. Archived names may be reused, while restoring or creating an active duplicate returns `409`.

## Verification

- `ProjectEditPage.test.tsx` covers versioned success navigation, duplicate-name mapping, and archived read-only behavior.
- `projects.spec.ts` creates a project, edits it through the rendered workspace, then proves that creating an active duplicate shows the structured conflict in the form.
- Frontend lint, typecheck, 42 unit tests, and production build pass locally.
- The focused project browser suite passes two scenarios in 6.3 seconds on the rebuilt disposable E2E stack.

## Scope boundary

This slice does not add project cloning. “Duplicate-name” in the Phase 5 matrix means the uniqueness/conflict behavior; cloning would require a separate product decision about whether suites, variables, members, and execution history are copied.
