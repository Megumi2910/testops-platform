# Phase 8 execution, evidence, dashboard, and navigation test record

The P8 browser record is intentionally sanitized. It contains no credentials,
cookies, tokens, request/response bodies, or target-generated artifacts.

## Recorded matrix

The canonical manifest contains 18 desktop (`1440x900`) records:

- three builder records;
- six execution records;
- three artifact records;
- one four-panel dashboard record;
- five navigation records.

The isolated Chromium run supplied the live builder, execution, evidence,
artifact-download, dashboard/admin, and five-path navigation observations. The
backend JUnit/Failsafe reports supplied the service-level queue, cancellation,
validation, retention, query-count, and navigation-guard assertions. The
generator joins only those passing reports and rejects missing or failed inputs.

## Expected negative observations

The four observed negative tuples are allowlisted by exact method, sanitized
route template, status, and problem code:

```text
PUT    /api/v1/projects/:projectId/suites/:suiteId/cases/:caseId                 400 validation_failed
POST   /api/v1/projects/:projectId/executions                                    429 execution_queue_full
POST   /api/v1/projects/:projectId/executions/:executionId/cancel                403 cancel_denied
GET    /api/v1/projects/:projectId/executions/:executionId/artifacts/screenshot  410 artifact_suppressed
```

No unexpected 500s, console exceptions, cross-tenant leaks, or cross-origin
requests were recorded. The anonymous public-shell refresh `401` is an
expected bootstrap response and is not counted as an application exception.

## Verification

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-browser-evidence-contract.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/generate-p8-browser-evidence.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/assert-browser-evidence.ps1 -Phase P8
```

The final result is 18 cases, 18 assertions, four expected negative tuples, and
zero unexpected failures. The P8 AC1–AC7 receipt set is under
`.agent/plans/testops-m10a-completion-20260823/receipts/P8/`.

Where to verify: [`P8.json`](../../artifacts/browser-evidence/P8.json) (ignored local evidence), [`assert-browser-evidence.ps1`](../../scripts/assert-browser-evidence.ps1), and [`navigation-safety.spec.ts`](../../frontend/e2e/navigation-safety.spec.ts).
