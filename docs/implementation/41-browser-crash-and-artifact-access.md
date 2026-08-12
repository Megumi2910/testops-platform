# Phase 5 browser-crash classification and artifact access

## Why this slice exists

Execution failures have two different audiences: a failed assertion is a test result, while a closed Chromium process is an infrastructure failure that may be retried or escalated. Artifact downloads have the same security boundary as execution details: a project member may retrieve evidence, but a non-member must be rejected before the execution or filesystem path is looked up.

## Browser-crash classification

`PlaywrightCaseRunner.category` now delegates browser detection to a bounded cause-chain walk. It recognizes the direct Playwright exception emitted when a page, context, or browser closes, wrapped exceptions, and messages that identify a browser process failure. The walk is capped at twelve causes so a malformed exception chain cannot consume worker time. The resulting `BROWSER_CRASH` category is treated as infrastructure by `infrastructureFailure`, preserving the existing retry and failure-classification contract without exposing a Playwright stack trace.

The distinction is intentional:

- `ASSERTION_FAILURE` means the target rendered but did not meet the case expectation.
- `LOCATOR_TIMEOUT` means the browser remained healthy but a locator did not resolve in time.
- `TARGET_UNREACHABLE` means the approved target could not be contacted.
- `BROWSER_CRASH` means Playwright or Chromium terminated unexpectedly.

The runner still sanitizes the stored message before persistence. The browser category is therefore safe to display in execution history and useful for recovery guidance.

## Artifact download contract

`ExecutionService.artifactDownload` authenticates the caller, loads the project, and checks global-administrator or project-membership access before reading the execution, artifact row, or relative filesystem path. The focused browser journey then proves the complete HTTP behavior for the normal member path:

- screenshots return `200`, `image/png`, a non-empty body, and `Content-Disposition: inline`;
- traces return `200`, `application/zip`, a non-empty body, and `Content-Disposition: attachment`;
- an independently registered non-member receives `403` for the same artifact identifier.

The test uses generated QA accounts and a local static target. It reads only response status, headers, and byte length; it never records credentials, bearer tokens, or file contents.

## Verification commands

```powershell
cd backend
./mvnw -q '-Dtest=PlaywrightCaseRunnerTest' test

cd ..\frontend
npm run lint
npm run typecheck
npm run test -- --run
npm run e2e -- phase5-artifact-download.spec.ts --reporter=line
```

The focused checks passed locally. CI run `31605913214` also passed backend, frontend, Compose, local-target-disabled, and the complete E2E job for commit `8fedf7506704bfff889c5f53e827396524596990`.

## Boundaries

This slice does not claim real Chromium process-kill reproduction (which is intentionally nondeterministic in a shared browser) or the Chrome DevTools accessibility/performance gate. Those remain separate release evidence rows. The unit test covers direct and wrapped Playwright shutdown exceptions, while the browser test covers member/non-member artifact authorization and both evidence file types.
