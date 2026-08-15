# Phase 6 execution retry-recovery evidence

## Scope

This regression slice proves that execution history remains usable through
transient API and artifact failures. It does not change worker execution,
artifact authorization, retention, or secret-redaction policy.

## Automated coverage

| Scenario | Expected contract | Local result |
| --- | --- | --- |
| Execution list request fails | Error is actionable and **Try again** refetches the list in place | PASS |
| Execution detail request fails | Error is actionable and **Try again** refetches the same execution | PASS |
| Screenshot blob request fails | Generic artifact error appears; no server detail is exposed | PASS |
| Screenshot retry succeeds | The same artifact is requested and the image preview is accessible | PASS |

The tests use a React Query client with retries disabled so the first rejected
request is deterministic. The artifact test stubs object URLs and asserts the
exact project/execution/artifact path without recording binary data.

## Commands

```text
cd frontend
npm test -- --run src/features/executions/ExecutionPages.test.tsx   PASS (3 tests)
npm run lint                                                     PASS
npm run typecheck                                                PASS
```

The full frontend suite, production build, remote CI run, and any browser
matrix evidence are recorded in the Milestone 10A completion ledger when this
slice is published.

## Regression ownership

- Frontend component test: `frontend/src/features/executions/ExecutionPages.test.tsx`
- Implementation: `frontend/src/features/executions/ExecutionPages.tsx`
- Browser follow-up: Phase 7 must still verify keyboard focus, mobile layout,
  screenshot dialog behavior, and trace-download authorization in a rebuilt
  environment.

