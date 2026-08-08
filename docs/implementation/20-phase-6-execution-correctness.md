# Phase 6 — Execution Correctness: Variable Snapshots and Evidence Safety

## Outcome

Queued runs now carry the variable state that existed when the run was created. A later edit to a project variable cannot silently change an already queued execution. Plain variables are copied into an execution-owned snapshot; secret variables remain encrypted at rest and are decrypted only inside the execution worker immediately before the browser runner starts.

This slice also removes the old `${...}` shortcut that treated every interpolation as secret-bearing. A non-secret variable keeps normal screenshots and traces. Evidence is suppressed only after a real secret variable is referenced, and a screenshot taken after secret use is suppressed as well because the page may now contain credential material.

## Runtime path

1. `ExecutionService.queue(...)` authenticates the requester, validates the READY cases, creates `ExecutionEntity`, and copies all current project variables into `execution_variable_snapshots`.
2. Plain snapshots store their value in `value`. Secret snapshots store ciphertext, nonce, and key version; the queue path never calls `ProjectVariableCrypto.decrypt(...)`.
3. `ExecutionClaimService` claims the immutable execution record. `ExecutionRunService.runCase(...)` reads only the execution snapshots, decrypting secret rows inside the worker process.
4. `PlaywrightCaseRunner` receives a resolved value map plus the set of secret keys. It interpolates values in input, expected value, locator value, and navigation URL fields.
5. The runner marks a step as secret-bearing when one of those fields references a configured secret key. It suppresses that step’s screenshot, suppresses later screenshots for the run, and deletes the trace after stopping it. Sanitized failure text never exposes credential-like values.

## Source anchors

| Responsibility | Implementation |
| --- | --- |
| Queue-time snapshot creation | `backend/src/main/java/com/megumi/testops/execution/service/ExecutionService.java` |
| Snapshot persistence | `backend/src/main/java/com/megumi/testops/execution/domain/ExecutionVariableSnapshotEntity.java` and `.../repository/ExecutionVariableSnapshotRepository.java` |
| Schema upgrade | `backend/src/main/resources/db/migration/V017__harden_execution_variable_snapshots.sql` |
| Worker-only resolution | `backend/src/main/java/com/megumi/testops/execution/service/ExecutionRunService.java` |
| AES-GCM decryption | `backend/src/main/java/com/megumi/testops/project/service/ProjectVariableCrypto.java` |
| Interpolation and evidence policy | `backend/src/main/java/com/megumi/testops/execution/runner/PlaywrightCaseRunner.java` |

## Why this boundary exists

The queue is a consistency boundary: a user expects “run this case” to mean the definition and variables visible at that moment, not whatever happens to be edited while a worker is waiting. Keeping snapshots with the execution also makes retry behavior reproducible and gives the run detail page an audit trail independent of mutable project settings.

Secret values are deliberately not decrypted in the HTTP request. The API can enqueue a run without handling plaintext credentials, and the worker is the only component that needs the value to interpolate a browser action. The trade-off is that the worker must have access to the project encryption key; if it does not, the run fails as infrastructure error instead of falling back to plaintext or returning the secret through an API.

## Failure behavior

- Missing or malformed secret snapshot data fails the worker path and is classified as an infrastructure error; the plaintext value is never substituted.
- A missing interpolation key raises a definition failure before the action is sent to Playwright.
- A secret-bearing assertion or locator suppresses evidence for the rest of that run, preventing a later screenshot from capturing a credential-filled page.
- Non-secret interpolation remains evidence-producing, so ordinary reusable values do not reduce debugging quality.
- Existing execution results keep their sanitized step message, failure position, duration, and artifact association.

## Verification

- Focused tests: `ExecutionServiceTest`, `ExecutionRunServiceTest`, and `PlaywrightCaseRunnerTest` pass.
- Unit/packaging gate: `backend/.\mvnw.cmd -q -DskipITs verify` passes.
- The full `verify` command was attempted. `ApplicationContextIT` and `MigrationUpgradeIT` could not start because Testcontainers reported no valid Docker server; this is an environment blocker, not a test assertion failure. Re-run `backend/.\mvnw.cmd -q verify` after Docker Desktop exposes a healthy engine.

## Immutable case-definition snapshot

The follow-up slice closes the second queue consistency gap. `ExecutionService.queue(...)` now copies each selected case’s ordered steps into `execution_step_snapshots` and records `retry_count_snapshot` on the case result. The worker converts those rows into `PlaywrightCaseRunner.StepDefinition` records; it no longer queries the mutable `test_steps` table when execution starts. Editing a case, changing a locator, reordering steps, or changing retry count after queueing therefore cannot alter the queued run.

The snapshot deliberately keeps the original case relationship for reporting while using the copied definition for execution. That preserves traceability (“which case was requested?”) without coupling execution behavior to live authoring state.

## Verification for the immutable-definition slice

- Focused execution tests pass, including queue-time step copying, retry snapshot use, worker execution from snapshot definitions, variable decryption, and evidence policy.
- `backend/.\\mvnw.cmd -q -DskipITs verify` passes.
- Compose rebuild passes: Flyway validated 18 migrations, applied V018, JPA discovered 20 repository interfaces, and the backend reported healthy.

## Next Phase 6 slice

## Browser-driven navigation safety

The runner now attaches a main-frame navigation monitor to every isolated page. After a click, form submission, redirect, or script navigation, the resulting URL is checked with the same `ExecutionTargetGuard` used by explicit `NAVIGATE` steps. New popups receive the same monitor; a popup that is outside the approved origin is closed and marks the run as blocked. `about:blank` is ignored during page creation so a normal popup lifecycle does not fail before it navigates.

Blocked navigation is classified as infrastructure category `BLOCKED_NAVIGATION`, and its failure text deliberately omits the untrusted URL. This keeps the run actionable without allowing query strings or redirect URLs to become an evidence or log leak. Same-origin redirects and the configured localhost bridge remain valid because they pass the existing origin and local-target policy.

Focused target-guard and runner tests pass after this change. The next Phase 6 slice is to add explicit browser-level regression coverage for click redirects, form submissions, popup escapes, and same-origin redirects.

## Failure classification

Runner failures now retain a stable category for the case result instead of leaving all non-infrastructure failures uncategorized:

| Category | Meaning | Run classification |
| --- | --- | --- |
| `ASSERTION_FAILURE` | Expected text, visibility, URL, or another assertion did not match | Test failure |
| `INVALID_DEFINITION` | Unsupported action, locator, role, or malformed wait value | Test failure |
| `LOCATOR_TIMEOUT` | Playwright waited for a locator beyond its step timeout | Test failure |
| `BLOCKED_NAVIGATION` | Main frame or popup escaped the approved origin | Infrastructure error |
| `TARGET_UNREACHABLE` | The target refused or could not establish the connection | Infrastructure error |
| `BROWSER_CRASH` | The browser/context/page closed unexpectedly | Infrastructure error |
| `WORKER_TIMEOUT` | The execution exceeded its global duration | Infrastructure error |
| `WORKER_INFRASTRUCTURE` | An uncategorized failure occurred outside the action definition | Infrastructure error |

The case result stores the category for both test and infrastructure failures. The execution-level infrastructure category is set only for infrastructure rows, so dashboards can distinguish a failing assertion from an unavailable worker without losing the detailed case diagnosis.

## Step language expansion

The execution snapshot now supports interaction and state assertions needed by ecommerce journeys:

- `PRESS` and `HOVER` provide keyboard and pointer interactions without embedding browser code in a case.
- `ASSERT_VALUE`, `ASSERT_CHECKED`, `ASSERT_ENABLED`, and `ASSERT_DISABLED` cover form and control state.
- `ASSERT_ATTRIBUTE` uses `inputValue` for the attribute name and `expectedValue` for the expected value.
- `ASSERT_COUNT` validates a non-negative integer and checks the number of matching elements.
- `ASSERT_URL_EQUALS` resolves a path through the project target guard before comparing the full URL.

These actions are declared once by `DefinitionService` and exposed through platform action descriptors. The guided frontend builder uses those descriptors to show only applicable fields and action-specific examples, keeping authoring and execution semantics aligned.

The worker also injects `RUN_ID`, `CASE_RESULT_ID`, and `RUN_TIMESTAMP` after reading the execution-owned variable snapshots. These values are generated from immutable queue records, are available to every interpolation field, and are intentionally classified as non-secret evidence-safe data. `PlaywrightCaseRunner` resolves locator, input, expected, and navigation values together before dispatch, preventing an assertion from accidentally using a stale or unresolved placeholder.

## Phase 7 — Exact text and repeated locator selection

The next step-language slice adds two authoring controls without weakening the existing target-safety boundary. `TEXT_EXACT` maps to Playwright's exact text option, while `locatorIndex` applies `Locator.nth(...)` after the semantic locator is resolved. Both fields are copied from `test_steps` into `execution_step_snapshots`, so a queued run keeps the same matching behavior even if the case is edited later.

The guided builder receives `TEXT_EXACT` from `/api/v1/platform/options` and exposes an optional “Matching element index” field for every locator action. The frontend validates whole numbers before submission; the backend repeats that validation and rejects an index without a complete locator. Use `TEXT` for ordinary user-facing matching, `TEXT_EXACT` when containing text is ambiguous, and an index only when the product intentionally renders repeated equivalent controls. Prefer a role, label, or test id when the target has a stable semantic identity.
