# Phase 5 secret-failure and artifact authorization evidence

## Scope

This slice extends execution safety beyond successful runs:

1. A secret-bearing case fails an assertion without persisting a screenshot, trace, or secret plaintext.
2. A non-member cannot reach artifact lookup or filesystem resolution.

## Evidence

| Journey | Expected contract | Result |
| --- | --- | --- |
| Secret variable + failing assertion | `ASSERTION_FAILURE`, zero persisted artifacts, sanitized execution response | Pending focused/CI run |
| Non-member artifact download | `403 project_access_denied` before execution/artifact lookup | PASS in `ExecutionServiceTest` after focused run |

The browser test uses only a disposable local target and generated values. It does not print the secret, access token, or raw storage.

## Commands

```text
frontend: npm run e2e -- phase5-evidence-safety.spec.ts
backend:  ./mvnw -q '-Dtest=ExecutionServiceTest,PlaywrightCaseRunnerTest,ExecutionRunServiceTest' test
```

The test intentionally records the first remote result as pending until CI has executed the new browser test. Documentation must be updated with the exact result after that gate completes.

## Release status

This addresses the secret-bearing failure portion of `QG-B05` and the non-member portion of `QG-B08`. Browser-crash behavior, full role-by-artifact download coverage, and Chrome DevTools accessibility/performance evidence remain open.
