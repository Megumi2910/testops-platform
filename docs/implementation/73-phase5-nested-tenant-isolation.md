# Phase 5 — Nested tenant-isolation regression coverage

## Why this slice exists

TestOps accepts identifiers at several levels: project → suite → case. A
caller can therefore replace a suite or case UUID in an otherwise valid URL.
The security contract is that every nested lookup must include its parent
scope. A foreign identifier must look absent (`404`) rather than being loaded,
mutated, queued, or used to reveal whether a record exists.

This slice closes the remaining Phase 5 coverage gap. Source verification
showed that the implementation already uses project-scoped suite lookups and
suite-scoped case lookups in `DefinitionService`, while `ExecutionService`
checks the project/suite pair before loading a case. The change is therefore
regression coverage and browser proof, not a speculative production rewrite.

## Runtime contract verified

| Operation | Scope check | Expected result for a foreign UUID |
| --- | --- | --- |
| Read a suite | `findByIdAndProjectId(suiteId, projectId)` | `404 suite_not_found` |
| Read a case | project-scoped suite, then `findByIdAndSuiteId(caseId, suiteId)` | `404 suite_not_found` or `404 case_not_found` |
| Update/archive/restore a case | active project and suite before case lookup | `404` with no write or step replacement |
| Queue a case | active project/suite before case lookup | `404 case_not_found` before queue capacity or persistence |
| Read an execution/artifact | `findByProjectIdAndId(executionId, projectId)` | `404 execution_not_found` before ownership/artifact lookup |

The non-disclosing response is deliberate: callers should not be able to
distinguish “this UUID belongs to another tenant” from “this UUID does not
exist.”

## Code and test changes

### Backend service tests

`backend/src/test/java/com/megumi/testops/project/service/DefinitionSecurityTest.java`
now proves that:

- a case from another suite cannot be read through a local suite URL;
- a case update fails before `save` or `deleteByTestCaseId` is called.

`backend/src/test/java/com/megumi/testops/ExecutionServiceTest.java` now proves
that queueing a case from another suite returns `404 case_not_found` before
the queue guard, execution row, or snapshots are touched.

These tests assert both the public error code/status and the absence of side
effects. That matters because a generic repository call can appear safe in a
read test while still allowing a mutation or queue path to write first.

### Browser matrix

`frontend/e2e/phase5-role-matrix.spec.ts` now creates two verified users, two
projects, and READY cases in separate suites. The primary member attempts to
open the foreign case under the primary project/suite URL and must receive an
HTTP `404` plus the existing “Unable to load this case” recovery state. The
same user then opens the legitimate case to prove the rejection did not poison
the workspace session or cache.

The test uses the real guided builder template, so it exercises the same path
new users use to produce executable cases rather than seeding an impossible
definition directly through SQL.

## Verification

- Frontend typecheck: passed.
- Frontend unit suite: 20 files / 62 tests passed.
- Frontend production build: passed.
- Frontend lint: passed after removing an unused foreign-suite variable in the
  new test.
- CI run `31859393419` passed all six required jobs, including backend Maven
  verification and the full enabled Playwright suite.
- Historical note: the focused Maven command was initially blocked locally by
  the repository's `mvnw.cmd` PowerShell bootstrap (`Cannot index into a null
  array`) before Maven started. The wrapper now handles normal cache folders,
  and the Failsafe Docker API compatibility property lets Testcontainers use
  Docker Desktop 4.79+. The current full `mvnw.cmd -B -ntp verify` gate passes
  with 144 unit tests and 10 integration tests.

## Design trade-off

No new authorization abstraction was introduced. The existing repository
method names encode the required parent scope and are already used by runtime
services. Adding a second helper would increase the number of places a future
resource could bypass the established lookup. The tests instead make the
contract executable at every current mutation and queue boundary.

## Follow-up

The remaining Phase 5 release work is live Chrome DevTools evidence for the
full role matrix and the target/execution/evidence reporting gate. If a future
nested endpoint is added, it must receive the same parent-scoped lookup and a
non-disclosing substitution test before it is considered complete.
