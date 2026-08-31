# Phase 4 — Project and definition guard evidence

## Scope

This record covers the direct-link lifecycle boundary added to the case editor and the canonical documentation-link correction in the project overview.

| Item | Evidence |
| --- | --- |
| UI source | `frontend/src/features/projects/CasePage.tsx`, `ProjectWorkspace.tsx` |
| Regression test | `frontend/src/features/projects/CasePage.test.tsx` |
| Backend authority | `DefinitionService.activeSuite(...)` and nested `projectId/suiteId` repository lookups |
| Local command | `npm test -- --run src/features/projects/CasePage.test.tsx src/features/projects/ProjectWorkspace.test.ts src/features/projects/DefinitionTrashPage.test.tsx` |

## Automated result

The focused lifecycle group passed:

```text
Test Files  3 passed (3)
Tests       8 passed (8)
```

The new regression uses an active project, an archived parent suite, and a READY child case. It asserts:

- the archived-suite warning is visible;
- **Run case**, **Move to trash**, and **Save case and steps** are absent;
- the Name field is disabled;
- the static **Steps** section remains available for inspection.

## Live browser note

`frontend/e2e/definition-lifecycle.spec.ts` was run against the rebuilt QA frontend at `http://localhost:3300` with the ecommerce target configured as `http://localhost:3001`. The first two lifecycle journeys passed. The later two could not register their temporary users because the live QA backend returned the expected rate-limit response:

```text
429 Too many attempts; try again later
```

The failure occurred before project creation and did not exercise the changed workflow. Re-run the isolated E2E Compose profile with a fresh fixture database or a rate-limit-safe fixture identity before treating the full browser matrix as green.

## Manual acceptance checklist

1. Open an active case URL directly while its parent suite is in Trash.
2. Confirm the page is read-only and explains that the suite must be restored first.
3. Confirm the case steps and run history links remain visible.
4. Restore the suite from Trash, reopen the case, and confirm edit/run controls return according to project permissions and case status.
5. On a blocked localhost target, follow **Read the local-target setup guide** and verify that it resolves to the `main` branch documentation.

## Regression ownership

The frontend test protects the presentation boundary. Backend service and HTTP tests continue to protect authorization and ancestry, while the full Playwright lifecycle suite protects the end-to-end archive/restore contract. No test should reset the normal development PostgreSQL volume.
