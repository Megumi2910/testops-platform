# Phase 4 — Existing case editor navigation guard test evidence

## Result

**PASS for this implementation slice.** Existing case edits now prompt before
internal navigation, and the direct archived-parent-suite read-only behavior
continues to pass.

## Regression coverage

`frontend/src/features/projects/CasePage.test.tsx` now uses a data-router test
fixture and covers:

1. A case whose parent suite is archived remains read-only.
2. Editing the case name and following the Runs link opens `Leave without
   saving?` while the router remains on the case URL.

The test exercises the same `useBlocker` path used by the production router,
rather than mocking navigation.

## Verification

| Gate | Result |
| --- | --- |
| CasePage focused unit tests | 2 tests passed |
| Frontend lint | PASS |
| Frontend typecheck | PASS |

The full frontend suite, production build, rebuilt-runtime browser matrix, and
remote CI are the publication gates for the complete Phase 4 series. This
slice does not claim that the entire Milestone 10A lifecycle matrix is closed.
