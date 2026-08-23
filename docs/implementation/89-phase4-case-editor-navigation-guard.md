# Phase 4 — Existing case editor navigation guard

## Scope

This slice closes a Phase 4 lifecycle gap in the existing case editor. The
guided new-case page already warned before abandoning unsaved work, but an
existing case could be edited and then abandoned through the project links or
the browser refresh button without a warning.

No API, database, execution, or permission contract changed.

## Implementation

`frontend/src/features/projects/CasePage.tsx` now treats both form values and
step definitions as editable state:

- `react-hook-form` tracks case metadata such as name, status, priority, and
  retry count.
- The ordered steps are serialized into a stable JSON signature. This catches
  locator, input, timeout, context, reorder, duplicate, and remove changes,
  including edits that do not touch the metadata form.
- `useBlocker` intercepts internal route changes while the case is dirty and
  presents the shared accessible `ConfirmDialog`.
- A `beforeunload` listener covers browser refresh, tab close, and hard
  navigation. It is attached only while a managed, loaded case has changes.
- Intentional transitions after a successful run or move-to-trash operation
  set a short-lived navigation allowance so those workflows do not prompt
  after the user has explicitly submitted the action.
- Read-only, archived, and archived-parent-suite views never become dirty and
  therefore do not show an unnecessary warning.

The saved-step signature normalizes positions before comparison, so a reorder
is detected while client-only editor IDs are ignored.

## Why this approach

The guard belongs in the case page rather than the shared project shell because
only the editor knows whether a definition has unsaved changes. Reusing the
existing `ConfirmDialog` keeps keyboard focus handling, Escape, and focus
restoration consistent with the guided builder and Trash flows. A browser
`beforeunload` prompt cannot render custom text, so it is limited to the
platform-native safety prompt while internal navigation receives the clearer
application dialog.

## Maintainer notes

Any new editable case field must be included in the React Hook Form state or
the step signature. Any intentional navigation started by a successful case
mutation must set `allowNavigation.current` immediately before navigating.
Do not use the guard to bypass server optimistic-lock checks; the guard only
protects unsaved client state.
