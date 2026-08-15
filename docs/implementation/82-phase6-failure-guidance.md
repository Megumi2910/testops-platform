# Phase 6 — Execution failure guidance

## Problem

Execution records already persist a category for infrastructure failures and
case failures, but the run detail page previously rendered most infrastructure
errors as the same sentence: “confirm the target is reachable and the worker
is enabled”. That advice is wrong for assertion failures, locator failures,
blocked navigation, invalid definitions, and browser timeouts. It also made it
hard to tell whether a failure was a test defect or an environment defect.

## Implementation

`frontend/src/features/executions/executionGuidance.ts` is a small, pure
category-to-guidance map. It accepts the backend category string and returns a
safe title, explanation, and recommended recovery action. The map covers the
categories emitted by `PlaywrightCaseRunner` and the persisted execution
contract:

| Category | UI interpretation | Recovery emphasis |
| --- | --- | --- |
| `ASSERTION_FAILURE` | The page loaded, but expected state did not match | Check expected value and target data |
| `LOCATOR_FAILURE` | The requested element was not found | Prefer stable role, label, or test ID |
| `LOCATOR_TIMEOUT` | The element did not become available in time | Check loading state and timeout choice |
| `TARGET_UNREACHABLE` | The worker could not connect to the target | Start target, verify port and target check |
| `BLOCKED_NAVIGATION` | Browser left the approved project origin | Keep redirects and submissions same-origin |
| `WORKER_TIMEOUT` | Run exceeded its execution limit | Review slow steps or split the journey |
| `BROWSER_CRASH` | Browser closed before completion | Retry, then inspect worker resources |
| `WORKER_INFRASTRUCTURE` | Worker environment could not complete the run | Check worker health and retry |
| `INVALID_DEFINITION` | Queued definition is not executable | Fix validation, save READY, queue again |

Unknown or missing categories use a conservative fallback. The UI never
renders a raw exception or stack trace; the existing sanitized `errorMessage`
continues to be shown separately when the backend provides one.

`ExecutionDetailPage` now uses the same model at two levels:

1. The execution-level alert highlights an infrastructure category and its
   recovery action.
2. Each case result highlights its own category, failed position, step
   duration, and sanitized message.

The category is displayed as a stable diagnostic label so operators can use it
when opening a defect without copying sensitive request data.

## Why this boundary

The backend owns classification because it can distinguish Playwright,
navigation-policy, target-network, and worker failures. Keeping wording in a
frontend pure map avoids duplicating classification logic while making the
operator experience actionable. The fallback is intentionally non-specific:
it does not guess that an unknown error is a target outage.

## Verification

The execution page tests cover target-unreachable infrastructure guidance,
assertion case guidance, failed-step rendering, and the existing retry,
rerun, cancellation, and artifact flows.

```text
npm test -- --run src/features/executions/ExecutionPages.test.tsx  # 7 tests
npm run lint
npm run typecheck
npm test -- --run                                             # 21 files / 74 tests
npm run build
git diff --check
```

## Follow-up

The rebuilt-runtime Chrome DevTools matrix still needs to exercise each
category against real target and worker conditions. This source slice does not
claim that live browser evidence or the overall Milestone 10A release gate is
complete.
