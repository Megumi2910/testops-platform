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

## Next Phase 6 slice

Case definitions still resolve live `TestStepEntity` rows when a worker starts. The next slice should snapshot ordered step definitions at queue time, then execute that immutable representation so editing a case after queueing cannot change the queued run.
