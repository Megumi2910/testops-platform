# Phase 5 real browser-crash evidence

## Environment

| Component | Value |
| --- | --- |
| Compose project | `testops-e2e` |
| Frontend | `http://localhost:3100` |
| Backend | `http://localhost:8180` |
| Target fixture | `http://localhost:3201` |
| Browser | Managed Chromium inside the backend container |
| Test | `frontend/e2e/zz-phase5-browser-crash.spec.ts` |

## Acceptance matrix

| Case | Action | Result |
| --- | --- | --- |
| CR-01 | Queue a READY case, wait for the managed Chromium process, terminate Chromium with `SIGTERM`, and inspect the run detail | PASS — `ERROR`, infrastructure category `BROWSER_CRASH` |
| CR-02 | Preserve the failing step and sanitized error after browser shutdown | PASS — step 2 is failed and the message is browser-closed without Playwright logs |
| CR-03 | Keep normal production behavior fail-closed | PASS — the kill command exists only in the dedicated Playwright/CI process; no application endpoint or production flag was added |

## Local result

On a freshly recreated `testops-e2e-backend-1`, the focused browser test passed in **10.7 seconds**. The run detail showed `ERROR`, `BROWSER_CRASH`, one failed case, and a failed `WAIT_VISIBLE` step. The public error did not contain `Call log:`, `stack=`, or `Browser logs:`.

Frontend lint, typecheck, and 39 unit tests passed. Backend unit/package verification passed 135 tests with Docker-dependent integration tests excluded in this shell. The dedicated CI job is the authoritative full-container verification because it runs on GitHub Actions with Docker available.

GitHub Actions run **31684261528** passed all six jobs: backend, frontend, Compose containers, local-target-disabled E2E, the complete E2E suite, and the isolated `e2e-browser-crash` job. The crash job rebuilt its own disposable Compose stack, terminated only the managed Chromium process, uploaded its Playwright report, and tore the stack down afterward. It is intentionally independently schedulable because GitHub's failed-job rerun action does not enqueue a skipped dependency; its isolated stack cannot affect the normal E2E environment.

## Release interpretation

This closes the real process-kill classification portion of `QG-B08`. It proves that a genuine managed-browser termination is reported as infrastructure failure rather than as a user assertion failure or an unhandled worker crash, both locally and in the six-job CI run above. It does not claim automatic browser recovery, Chrome DevTools deployment evidence, ecommerce coverage, or completion of the overall Phase 5 release gate.
