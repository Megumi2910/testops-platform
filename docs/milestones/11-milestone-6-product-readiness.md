# Milestone 6 — Product readiness and reporting

Milestone 6 closes the first-use reliability gaps exposed by the authenticated local workflow and makes the platform usable for non-admin project owners.

## Delivered scope

- Registration persistence uses a JPA shared identifier (`@MapsId`) and the managed user returned by persistence. Unexpected failures return a generic problem response with a correlation ID while the server logs a sanitized diagnostic.
- Active, verified members can create projects. Platform summaries expose stable capabilities (`PROJECT_CREATE`, `USER_ADMINISTER`, `OPERATIONS_VIEW`) and target readiness metadata.
- Execution records retain browser, target, suite, and case snapshots; failures retain the failing step and infrastructure category. Artifact metadata records retention purges without deleting execution history.
- Dashboard endpoints provide summary rates, trends, recent failures, and infrastructure categories over an accessible UTC date window.
- Authenticated users can list and revoke refresh-token session families. Artifact retention is disabled by default and can be enabled with `ARTIFACT_RETENTION_DAYS`.

## Rate definitions

Functional pass rate is `PASSED / (PASSED + FAILED)`. Infrastructure error rate is `ERROR / (PASSED + FAILED + ERROR)`. Cancelled cases are excluded from both rates.

## Operational controls

Retention deletes binary files only, marks metadata with `purged_at` and `purge_reason`, and returns `410 Gone` for purged downloads. Keep `ARTIFACT_RETENTION_DAYS=0` to disable deletion.

## Verification

Run backend verification with `./mvnw -B verify` and frontend checks with `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`. Apply Flyway migrations against a clean PostgreSQL database before enabling `ddl-auto=validate`.
