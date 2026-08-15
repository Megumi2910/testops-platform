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
npm test -- --run                                               PASS (21 files / 66 tests)
npm run build                                                    PASS
```

Remote GitHub Actions run [`31861395936`](https://github.com/Megumi2910/testops-platform/actions/runs/31861395936)
passed all six required jobs for commit `fe3bf34`: frontend, backend,
containers, enabled E2E, local-disabled E2E, and browser-crash E2E. The run
also verifies the new test file in the frontend suite and rebuilds the isolated
Compose profiles. This is CI evidence for the slice, not a replacement for the
remaining live Chrome DevTools accessibility/performance gate.

## Regression ownership

- Frontend component test: `frontend/src/features/executions/ExecutionPages.test.tsx`
- Implementation: `frontend/src/features/executions/ExecutionPages.tsx`
- Browser follow-up: Phase 7 must still verify keyboard focus, mobile layout,
  screenshot dialog behavior, and trace-download authorization in a rebuilt
  environment.
