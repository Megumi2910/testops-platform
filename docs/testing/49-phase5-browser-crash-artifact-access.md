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
