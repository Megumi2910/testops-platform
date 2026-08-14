# Phase 5 browser-crash and artifact-access evidence

## Scope

This slice closes the deterministic portions of the remaining execution evidence row:

1. direct and wrapped Playwright shutdown exceptions are classified as `BROWSER_CRASH` infrastructure failures;
2. a member can download both screenshot and trace evidence;
3. a non-member is denied before artifact lookup and file resolution.

## Evidence

| Journey | Expected contract | Result |
| --- | --- | --- |
| Direct `PlaywrightException` with a closed browser message | `BROWSER_CRASH` | PASS in `PlaywrightCaseRunnerTest` |
| Wrapper exception whose cause is a closed-browser Playwright exception | `BROWSER_CRASH` | PASS in `PlaywrightCaseRunnerTest` |
| Project member downloads screenshot | `200`, non-empty PNG, inline disposition | PASS in `phase5-artifact-download.spec.ts` |
| Project member downloads trace | `200`, non-empty ZIP, attachment disposition | PASS in `phase5-artifact-download.spec.ts` |
| Non-member requests the same screenshot | `403 project_access_denied` and no file body | PASS in `phase5-artifact-download.spec.ts` and `ExecutionServiceTest` |

## Reproduction commands

```powershell
cd backend
./mvnw -q '-Dtest=PlaywrightCaseRunnerTest,ExecutionServiceTest' test

cd ..\frontend
npm run e2e -- phase5-artifact-download.spec.ts --reporter=line
```

The browser test registers two generated accounts, creates a project, suite, and screenshot-producing READY case, runs it, downloads both artifacts as the project member, and repeats the screenshot request as a separate non-member. It uses no direct database writes.

## Remote gate

CI run `31605913214` passed all five jobs for commit `8fedf7506704bfff889c5f53e827396524596990`: backend, frontend, containers, `e2e-local-disabled`, and the complete E2E suite. The full run includes the focused artifact test.

## Remaining release evidence

The nondeterministic act of killing a real shared Chromium process is not used as a browser acceptance test. The unit contract protects its resulting exception shape; the remaining Phase 5 gates are Google/locked/disabled auth variants, administrator CRUD, dashboard DevTools range/query evidence, ecommerce coverage, and the complete accessibility/performance pass.

## Administrator browser gate

The isolated E2E profile now enables a disposable bootstrap administrator. `phase5-administrator-crud.spec.ts` uses the generated `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD` environment values, creates a separate user through the normal registration and Mailpit verification flow, and verifies:

- the administrator route and user list are reachable;
- role changes `MEMBER → ADMIN → MEMBER` are persisted;
- status changes `ACTIVE → LOCKED → ACTIVE` are persisted;
- attempting to lock the final active administrator returns an inline structured error and keeps the account active.

The secret is masked in CI and is never part of committed browser evidence. Run it with:

```powershell
cd frontend
$env:E2E_ADMIN_EMAIL = 'qa.bootstrap-admin@testops.local'
$env:E2E_ADMIN_PASSWORD = (Get-Content ..\backend\.secrets\bootstrap-admin-password -Raw).Trim()
npm run e2e -- phase5-administrator-crud.spec.ts --reporter=line
```

The first local attempt returned a static-resource `404` because the admin controller was conditionally omitted by `@ConditionalOnBean(AuthService.class)`. Replacing that condition with `@ConditionalOnProperty(testops.auth.enabled=true)` makes the mapping deterministic without exposing it when authentication is disabled. After rebuilding the disposable backend/frontend, the focused test passed in 4.2 seconds. CI run `31609560806` passed the complete backend, frontend, container, local-disabled, and E2E gates for commit `53258e1`.
