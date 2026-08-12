# Phase 5 execution lifecycle and evidence browser evidence

## Scope

`frontend/e2e/phase5-execution-matrix.spec.ts` covers the user-visible execution contracts that were previously represented only by service tests:

| Scenario | Evidence | Expected result |
| --- | --- | --- |
| Queue a two-case suite, cancel while the first case is still running | Execution detail page, cancel action, case-result list | The run ends as `CANCELLED`; the remaining case is recorded with `Cancellation requested`. |
| Run a case against an allowlisted but offline target with retry count `1` | Execution detail page, attempt count, infrastructure alert | The run ends as `ERROR`, shows `2 attempt(s)`, and preserves `TARGET_UNREACHABLE`. |

The cancellation case deliberately uses a bounded missing-text `ASSERT_VISIBLE` step with a ten-second timeout. This keeps the fixture valid under current READY-case rules while giving the worker time to claim the run. Cancellation is cooperative: the worker finishes the active step, then marks pending cases cancelled before finalizing the execution.

The retry case uses the exact E2E allowlist entry `http://localhost:3299`. It proves that retry count applies to infrastructure failures, not assertion failures, and that retrying does not replace the sanitized failure category.

Runner failure messages are sanitized before persistence. Structured Playwright messages are reduced to their concise message text; stack traces and call logs are removed, whitespace is normalized, and token-like values are redacted. The run keeps a useful category such as `net::ERR_CONNECTION_REFUSED` without exposing browser internals in the UI or evidence.

## Verification

Run against the isolated stack:

```powershell
$env:E2E_BASE_URL = 'http://127.0.0.1:3100'
$env:MAILPIT_URL = 'http://127.0.0.1:8025'
npm run e2e -- phase5-execution-matrix.spec.ts --reporter=line
```

The test creates run-prefixed QA records and does not reset the normal development database. Playwright traces and screenshots remain in ignored test-result directories; no credentials, OTPs, cookies, or target content are committed.

The focused run passed on 2026-08-12: both scenarios completed in 16.4 seconds. After rebuilding the isolated backend with the sanitizer change, the retry scenario passed again in 10.8 seconds and asserted that the concise `net::ERR_CONNECTION_REFUSED` message is visible while `Call log:` and `stack=` are absent. The backend `PlaywrightCaseRunnerTest` suite passed all 8 tests, including both structured and marker-less Playwright message shapes.

The frontend lint, typecheck, and 33-test Vitest suite passed. Backend `./mvnw.cmd -B verify -DskipITs` passed all 126 unit/contract tests. A full local `./mvnw.cmd -B verify` attempt reached the Docker-dependent integration tests but Testcontainers could not discover the Docker Desktop engine from the Maven process; the same isolated Compose services were healthy and the integration gate remains a CI/environment verification item.

## Remaining execution gate

This slice does not claim the full execution matrix is complete. Worker-disabled behavior, queue-capacity exhaustion, secret evidence suppression, target-escape navigation, browser crashes, and dashboard range/query evidence remain separate Phase 5 rows.
