# Phase 6 — Execution rerun and cancellation recovery

## What changed

Execution details now expose a **Run current suite again** action when the
execution contains a suite snapshot and the current project is active with
`EXECUTION_START`. The action intentionally queues the current suite
definition through the normal suite endpoint; it does not replay the old
execution snapshot. This keeps the recovery path honest when a case has been
edited since the failed run.

The action is hidden for case-only executions, archived projects, and members
without execution permission. It is disabled while the request is pending and
navigates directly to the new execution detail after the backend returns its
`executionId`.

Cancellation and rerun failures are now rendered as inline, retryable alerts.
Known `ApiError` messages are shown through the existing sanitized API error
boundary; unknown failures receive a safe recovery message. Pending state
prevents duplicate cancellation or queue requests.

## Code path

- `frontend/src/features/executions/ExecutionPages.tsx`
  - reads the cached project detail to derive `EXECUTION_START` and active
    project state;
  - calls `projectsApi.queueSuite(projectId, execution.suiteId)`;
  - invalidates the execution list and navigates to the queued run;
  - renders retryable queue/cancel errors.
- `frontend/src/features/projects/api.ts`
  - remains the single API boundary and already returns `{ executionId,
    status }` for suite queueing.
- `frontend/src/features/executions/ExecutionPages.test.tsx`
  - covers permission-aware visibility and pending-submit protection.

## Why this approach

The execution record is immutable evidence. Re-running through the current
suite endpoint preserves that history and makes it explicit that the operator
is starting a new run. Reusing the project query cache avoids a second project
fetch in the normal nested workspace route while still allowing direct links to
resolve project permissions. The UI hides controls that cannot be used, while
the backend remains the final authorization boundary.

## Verification

```text
npm test -- --run src/features/executions/ExecutionPages.test.tsx
npm run lint
npm run typecheck
npm test -- --run
npm run build
```

The focused execution suite passes 5 tests. The complete frontend suite passes
21 files / 72 tests, with lint, typecheck, and production build passing. CI
run [31866759003](https://github.com/Megumi2910/testops-platform/actions/runs/31866759003)
passed backend, frontend, containers, enabled E2E, local-disabled E2E, and
browser-crash jobs for commit `7205b29`.

## Remaining release work

This slice does not close the broader Phase 6 or Milestone 10A release gate.
The rebuilt-runtime Chrome DevTools matrix, two-image deployment proof, full
execution failure-category matrix, and two consecutive remote CI runs remain
required.
