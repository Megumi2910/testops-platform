# Phase 4 — Project and definition workflow guards

## Outcome

This slice closes two small but important workflow gaps in the TestOps first-release UI:

1. A bookmarked case URL now respects the lifecycle of its parent suite.
2. Local-target recovery guidance points to the canonical `main` documentation path instead of the retired release-candidate branch.

The change is intentionally narrow. The existing project, suite, case, Trash, restore, template, and optimistic-lock APIs remain the source of truth; no endpoint or migration was added.

## Why the parent suite must be loaded

The case endpoint is correctly nested under both `projectId` and `suiteId`, but a direct case page previously fetched only the case. That meant the UI could not tell whether the parent suite was archived. The backend rejects edits, archives, restores, and queue requests for an archived suite, but waiting for a rejected mutation is a poor permission boundary: users saw enabled controls, attempted an operation, and received an error.

`CasePage` now starts three independent queries together:

- the case definition;
- the parent suite lifecycle;
- backend-driven platform action metadata.

The queries remain independent rather than chained, so the page does not add a request waterfall. Once both definition responses are available, the editor derives:

```text
canEdit = DEFINITION_MANAGE ∧ active project ∧ active case ∧ active suite
canRun  = EXECUTION_START ∧ active project ∧ READY case ∧ active suite
```

An archived parent suite produces a dedicated warning and a static step list. Move-to-trash, save, run, and case-restore controls are withheld. The restore restriction matters because the backend requires an active suite before an archived child can be restored; the project Trash page already applies the same rule.

This is a presentation guard, not an authorization replacement. Every write still carries the project and suite identifiers to the backend, where `DefinitionService.activeSuite(...)` enforces the lifecycle invariant again.

## Canonical local-target guidance

Project overview recovery text now links to:

```text
https://github.com/Megumi2910/testops-platform/blob/main/docs/operations/12-local-target-testing-guide.md
```

The target policy remains fail-closed. The link only explains how to enable an exact `http://localhost:<port>` allowlist entry and the Docker host alias; it does not grant access or bypass `TARGET_LOCAL_DEV_ENABLED`.

## Source map

| Concern | Source |
| --- | --- |
| Parent-suite query and read-only derivation | `frontend/src/features/projects/CasePage.tsx` |
| Project target recovery link | `frontend/src/features/projects/ProjectWorkspace.tsx` |
| Nested lifecycle enforcement | `backend/src/main/java/com/megumi/testops/project/service/DefinitionService.java` |
| Direct-link regression | `frontend/src/features/projects/CasePage.test.tsx` |

## Failure and recovery behavior

- If the case, suite, or platform metadata query fails, the page keeps the existing recoverable “Unable to load this case” state.
- If the suite is archived, the user can navigate to Trash and restore the suite first; child definitions are not silently changed.
- If a case is itself archived under an active suite, the existing case restore dialog remains available and returns the case to `DRAFT`.
- If a write races with another editor, the existing `409 stale_version` comparison flow remains unchanged.

## Verification

The focused frontend suite passed after this change:

```text
3 test files, 8 tests passed
```

The new test renders a READY case through a direct URL while its suite is archived and proves that the page announces the archived-suite boundary, disables the form, omits run/trash/save controls, and renders static steps.

The live lifecycle browser run also established the current QA environment condition: the first two cases passed, while later registrations were rate-limited with a structured `429` (`Too many attempts; try again later`). That is fixture throttling, not evidence of a lifecycle regression; the full isolated E2E profile remains the authoritative repeatable gate.
