# Phase 8 execution, evidence, dashboard, and navigation implementation

Phase 8 closes the TestOps execution/reporting slice around the existing API
contracts. It does not add a new endpoint or claim scheduled artifact purge.

## Execution and evidence contract

`ExecutionService` remains authoritative for idempotent queueing, queue-capacity
conflicts, requester/manager cancellation, terminal reruns, and artifact access.
The verified negative problem tuples are:

| Case | Status | Problem code |
| --- | ---: | --- |
| invalid case input | 400 | `validation_failed` |
| execution capacity conflict | 429 | `execution_queue_full` |
| cancellation denied | 403 | `cancel_denied` |
| suppressed artifact download | 410 | `artifact_suppressed` |

The Failsafe configuration keeps `-DskipTests` scoped to Surefire. Named
integration tests therefore still run when the release command uses
`-DskipTests '-Dit.test=…'`.

Artifact retention continues to be a retryable service operation. The UI
renders ordered, duration-bearing snapshots, safe download names, suppressed
evidence, and purged evidence without representing a browser-triggered
scheduled purge.

## Dashboard query boundary

The dashboard requests exactly four independent panel resources:

- `summary`
- `trends`
- `recent-failures`
- `infrastructure-errors`

The browser matrix asserts four successful responses, while
`ExecutionQueryCountIT` verifies the bounded repository read contract.

## Navigation safety boundary

`PlaywrightCaseRunner` intercepts navigation at the browser-context routing
boundary. Disallowed click, form, redirect, script, and popup requests are
aborted before they can reach an outside origin; allowed requests resume. The
existing page/frame observers retain the sanitized `BLOCKED_NAVIGATION` result
for the execution detail.

## Verification

The implementation is covered by the P8 receipts and the sanitized evidence
generator:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/generate-p8-browser-evidence.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/assert-browser-evidence.ps1 -Phase P8
```

The generator refuses to write a manifest unless the current Playwright JSON,
backend JUnit/Failsafe reports, and AC1–AC6 plan receipts are all passing.

Where to verify: [`ExecutionService.java`](../../backend/src/main/java/com/megumi/testops/execution/service/ExecutionService.java), [`PlaywrightCaseRunner.java`](../../backend/src/main/java/com/megumi/testops/execution/runner/PlaywrightCaseRunner.java), and [`generate-p8-browser-evidence.ps1`](../../scripts/generate-p8-browser-evidence.ps1).
