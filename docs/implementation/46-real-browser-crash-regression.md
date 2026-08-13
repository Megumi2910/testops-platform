# Real Chromium crash regression for Phase 5

## Purpose

The execution worker already classified wrapped Playwright shutdown exceptions as `BROWSER_CRASH`, but that behavior was previously proven only with a unit test. Phase 5 now has a real-process browser regression that exercises the complete path: queue a READY case, let the managed Chromium process start, terminate that process inside the disposable backend container, and observe the persisted execution result through the UI.

This test is intentionally isolated from the normal E2E suite. A browser process is shared by the managed worker, so killing it would make subsequent cases in the same container invalid. The dedicated CI job starts a fresh Compose stack, runs one crash case, uploads its Playwright report, and destroys only that disposable stack.

## What changed

- `frontend/e2e/zz-phase5-browser-crash.spec.ts` creates a QA-owned project, suite, and READY case with `NAVIGATE` followed by a long-running `WAIT_VISIBLE` action.
- The test waits for a Chromium process in the backend container, sends `SIGTERM` only to Chromium processes, then waits for the execution detail page to reach `ERROR`.
- Assertions cover `BROWSER_CRASH`, the browser-closed failure message, the failed step, and the absence of `Call log:`, `stack=`, and `Browser logs:` leakage.
- `.github/workflows/ci.yml` adds a separate `e2e-browser-crash` job after the normal E2E job. It captures the backend container ID from Compose and verifies all services are healthy before the test starts.
- `PlaywrightCaseRunner` now treats failure screenshot capture as best-effort. If the browser has already died, screenshot failure cannot replace the original crash outcome or failed-step data.
- `sanitizeMessage` removes Playwright's appended browser-launch logs in addition to stack and call-log sections.

The kill operation is not available through a product API and is never enabled by application configuration. It is performed by the CI test process against the ephemeral container only. Production and normal development deployments cannot trigger this path through HTTP.

## Run locally

Start a fresh disposable stack:

```powershell
docker compose -p testops-e2e -f docker-compose.yml -f docker-compose.e2e.yml up -d --build --force-recreate
```

Then run the opt-in spec from `frontend`:

```powershell
$env:E2E_BROWSER_CRASH = 'true'
$env:E2E_BACKEND_CONTAINER = 'testops-e2e-backend-1'
$env:MAILPIT_URL = 'http://127.0.0.1:8025'
npm run e2e -- zz-phase5-browser-crash.spec.ts
```

Use a fresh backend container for every attempt. After Chromium is terminated, `ManagedChromium` intentionally does not silently relaunch a shared browser inside the same worker process. Recreate only the disposable backend before retrying:

```powershell
docker compose -p testops-e2e -f docker-compose.yml -f docker-compose.e2e.yml up -d --force-recreate backend
```

## Failure interpretation

| Observation | Meaning |
| --- | --- |
| `ERROR` + `BROWSER_CRASH` | Expected infrastructure classification; retry the run after restoring the worker/browser |
| `FAILED` + `ASSERTION_FAILURE` | The browser was not terminated during the long-running step, or the case reached its normal assertion outcome |
| No Chromium process found | The backend was reused after an earlier crash; recreate the disposable backend |
| `Browser logs:` or `stack=` visible | Sanitization regression; stop the release gate and add a backend unit test before publishing |

The browser is deliberately not auto-restarted in this slice. A future worker-recovery design may add explicit process reinitialization, but it must not hide an infrastructure failure or accidentally share state between test runs.
