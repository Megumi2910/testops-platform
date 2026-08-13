# Phase 5 project edit and duplicate-name evidence

## Environment

| Component | Value |
| --- | --- |
| Stack | Disposable `testops-e2e` Compose profile |
| Frontend | `http://localhost:3100` |
| Backend | `http://localhost:8180` |
| Target fixture | `http://localhost:3201` |
| Browser suite | `frontend/e2e/projects.spec.ts` |

## Acceptance matrix

| Case | Expected | Result |
| --- | --- | --- |
| PE-01 | A project manager can open Edit project, change the name, save, and return to the updated overview | PASS |
| PE-02 | The update sends the current project version and successful cache refresh keeps the new identity visible | PASS — unit test and browser assertion |
| PE-03 | Creating an active project with an existing name returns `409` and an inline “Project name is already in use” message | PASS |
| PE-04 | Archived projects do not expose an edit form | PASS — unit test; lifecycle browser coverage also proves archived controls are read-only |

## Evidence

Local frontend gates passed:

- `npm run lint`
- `npm run typecheck`
- `npm test -- --run` — 13 files, 42 tests
- `npm run build`

After rebuilding only the disposable E2E frontend image, `npm run e2e -- projects.spec.ts` passed both scenarios in 6.3 seconds. The first attempt was discarded because the Compose command was run from `frontend/` and therefore left the old image running; no result from that stale-image run is counted as application evidence.

The post-push GitHub Actions run **31687273461** passed all six jobs after its isolated crash job was rerun. The first crash-job attempt failed before tests because Maven Central temporarily rejected the Maven Wrapper download; the rerun rebuilt the disposable stack and passed. This is recorded as CI infrastructure retry evidence, not as an application defect.

## Regression interpretation

The project row now covers edit and active-name conflict behavior through both the React component and the browser/API path. Stale-version conflict UI is covered at the component contract level and remains a separate two-tab browser permutation alongside the existing case conflict journey.
