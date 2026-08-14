# Definition Trash UI and operator workflow

## Outcome

Phase 3 now exposes the history-preserving suite and case lifecycle in the TestOps web application. Users do not permanently delete test definitions. They move them to **Trash**, inspect archived content read-only, and restore it when needed.

The frontend consumes the V021 lifecycle API described in [the backend lifecycle guide](26-definition-trash-backend.md). Project archive/restore uses the existing project endpoints.

## Where the feature is implemented

| Concern | Source |
| --- | --- |
| Lifecycle API types and requests | `frontend/src/features/projects/api.ts` |
| Suite identity, editing, archive, direct restore | `frontend/src/features/projects/SuitePages.tsx` |
| Case archive, read-only rendering, direct restore | `frontend/src/features/projects/CasePage.tsx` |
| Project Trash aggregation and restore | `frontend/src/features/projects/DefinitionTrashPage.tsx` |
| Rename-on-conflict restore dialog | `frontend/src/features/projects/DefinitionLifecycle.tsx` |
| Project restore and Trash navigation | `frontend/src/features/projects/ProjectWorkspace.tsx` |
| Accessible modal focus behavior | `frontend/src/components/ui.tsx` |
| Route registration | `frontend/src/app/router.tsx` |

## Suite workflow

1. Open a project and choose **Suites**.
2. Open a suite. Its name and description are now visible above its cases.
3. A user with `DEFINITION_MANAGE` may edit the suite or choose **Move to trash**.
4. The confirmation dialog explains that children and execution history remain, while editing and execution stop.
5. After confirmation, TestOps sends `DELETE .../suites/{suiteId}` with the current version in `If-Match`, then navigates to Trash.
6. Opening the archived suite directly shows a warning banner, cases, and run history links without run, edit, or create actions.
7. Restoring preserves every child case state.

## Case workflow

1. Open a case and choose **Move to trash**.
2. TestOps sends the versioned case archive request and navigates to Trash.
3. An archived direct link shows static step summaries instead of disabled interactive editors.
4. Restore returns the case to `DRAFT`; it must be reviewed and made READY before it can run.
5. `ARCHIVED` is no longer an option in the ordinary status selector.

## Restore conflicts

Archived names may be reused. If the original name now belongs to an active definition, the backend returns a stable `409` conflict. The same restore dialog remains open, explains the conflict, and accepts a replacement name. The retry uses the archived definition's current version and the supplied name.

This approach avoids hidden renaming and preserves optimistic-lock protection.

## Project Trash behavior

The project sub-navigation includes **Trash** for members with `DEFINITION_VIEW`. The page has loading, error, empty, permission, conflict, and success states. It lists:

- archived suites in the project;
- individually archived cases with their parent suite;
- archive time when available;
- direct read-only links;
- restore controls only for authorized users in an active project.

A case inside an archived suite cannot be restored independently because its parent is read-only. Restore the suite first.

## Project restoration

Archived projects remain visible in the project list. Their project header replaces Archive with **Restore project** for users with `PROJECT_ARCHIVE`. Restoration activates only the project; suite and case lifecycle states remain unchanged.

## Accessibility and responsive behavior

Confirmation dialogs now:

- expose `dialog`, `aria-modal`, labelled title, and described consequences;
- focus the first control on open;
- trap Tab and Shift+Tab;
- close with Escape when not busy;
- restore focus to the invoking control;
- prevent backdrop dismissal while a request is pending.

Chrome DevTools confirmed the project lifecycle at desktop and a `320×800` mobile viewport with no horizontal overflow.

## Verification evidence

- Frontend lint: pass.
- Frontend typecheck: pass.
- Frontend unit tests: 24 passed across 8 files, including manager/viewer Trash rendering and restore-conflict behavior.
- Frontend production build: pass.
- Chrome DevTools: suite archive → archived direct read-only view → restore passed.
- Chrome DevTools: case archive → Trash → restore-to-DRAFT passed.
- All lifecycle fetch/delete/restore requests returned `200`; no console exceptions or network `500` responses occurred.
- The QA-owned suite and case were restored after testing, leaving the normal fixture usable.

## Known follow-up

Chrome still reports existing form metadata issues in the full case step editor. The new restore-name field includes an explicit id, name, label, and `autocomplete="off"`; the wider case-builder accessibility work remains tracked as `QG-005` for Phase 4/5.
