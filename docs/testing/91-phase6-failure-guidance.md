# Test evidence — execution failure guidance

## Automated coverage

`frontend/src/features/executions/ExecutionPages.test.tsx` verifies that:

1. A `TARGET_UNREACHABLE` execution shows target-specific guidance and the
   persisted category label.
2. A case with `ASSERTION_FAILURE` shows assertion-specific recovery, retains
   the failed step and step number, and does not replace the result with a
   generic worker message.
3. The existing execution list/detail retry, suite rerun, cancellation retry,
   and artifact retry paths remain green.
4. A repeated execution/case category is labelled once while the case still
   retains its category-specific recovery guidance.

The guidance map is pure and can be extended when the backend adds a new
category. Unknown categories intentionally use the safe generic fallback.

## Local results

| Gate | Result |
| --- | --- |
| Focused execution tests | PASS — 7 tests |
| Frontend lint | PASS |
| Frontend typecheck | PASS |
| Frontend unit suite | PASS — 21 files / 74 tests |
| Frontend production build | PASS |
| Diff whitespace check | PASS |

## CI regression and correction

The first pushed implementation run `31867772629` passed five required jobs
but the enabled E2E job failed in
`phase5-execution-matrix.spec.ts`. The new execution-level and case-level
alerts both rendered `Category: TARGET_UNREACHABLE`, so Playwright’s strict
`getByText(/TARGET_UNREACHABLE/)` locator correctly rejected the ambiguous
page. The failure was deterministic and unrelated to target reachability.

The correction keeps the case-specific explanation and recovery action but
suppresses the repeated case category label when it matches the execution
category. A mounted regression now asserts that the label is rendered once.
The replacement commit must pass the full six-job workflow before this slice
is considered CI-verified.

## Manual Chrome DevTools checklist

After rebuilding the QA stack, run one controlled failure for each category
and record the sanitized category, failed step, and recovery text:

- stop the ecommerce target for `TARGET_UNREACHABLE`;
- use a deliberately wrong expected value for `ASSERTION_FAILURE`;
- use a stable missing locator for `LOCATOR_FAILURE`;
- use a short timeout for `LOCATOR_TIMEOUT` or `WORKER_TIMEOUT`;
- submit a link or form that leaves the allowlisted origin for
  `BLOCKED_NAVIGATION`;
- use an invalid READY definition for `INVALID_DEFINITION`;
- use the worker/browser-crash fixture for `BROWSER_CRASH` and
  `WORKER_INFRASTRUCTURE`.

For every run, verify there is no token, cookie, secret variable, stack trace,
or unsanitized Playwright payload in the page, console, network log, screenshot,
or trace. The live matrix remains release evidence, not a substitute for the
mounted frontend tests above.
