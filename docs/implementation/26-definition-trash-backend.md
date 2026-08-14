# Definition trash lifecycle — backend

## Outcome

Phase 3 now has a history-preserving backend lifecycle for suites and cases. “Delete” means move to trash; no endpoint permanently purges definitions or execution history.

## Persistence model

Migration `V021__definition_trash_lifecycle.sql` adds nullable `archived_at` and `archived_by` columns to `test_suites` and `test_cases`. Archive records the authenticated actor and time. Restore clears both fields.

The original unconditional name constraints are replaced with PostgreSQL partial unique indexes:

```sql
unique (project_id, lower(name)) where suite.status <> 'ARCHIVED'
unique (suite_id, lower(name)) where case.status <> 'ARCHIVED'
```

Consequences:

- active names remain case-insensitively unique;
- an archived name can be reused by a new active definition;
- restoring into a reused name is rejected before flush with a stable `409` code;
- the archived definition and every execution referencing it remain intact.

## Lifecycle rules

### Suites

- Archive preserves every child case and its current DRAFT/READY/ARCHIVED state.
- Archived suites are readable but reject update, child creation, and execution.
- Restore returns the suite to ACTIVE and exposes its unchanged children again.
- Restore can accept a replacement name when the original name has been reused.

### Cases

- Archive preserves steps and execution history.
- Archived cases are readable but reject ordinary update and execution.
- Restore always returns the case to DRAFT, even when it was READY before archive.
- The user must review and validate the restored definition before it can run again.
- `ARCHIVED` is no longer accepted by ordinary case create/update status fields; clients use the lifecycle endpoint.

## HTTP contract

```text
GET    /api/v1/projects/{projectId}/suites?lifecycle=ACTIVE|ARCHIVED|ALL
GET    /api/v1/projects/{projectId}/suites/{suiteId}
DELETE /api/v1/projects/{projectId}/suites/{suiteId}
POST   /api/v1/projects/{projectId}/suites/{suiteId}/restore

GET    /api/v1/projects/{projectId}/suites/{suiteId}/cases?lifecycle=ACTIVE|ARCHIVED|ALL
DELETE /api/v1/projects/{projectId}/suites/{suiteId}/cases/{caseId}
POST   /api/v1/projects/{projectId}/suites/{suiteId}/cases/{caseId}/restore
```

Archive requires a numeric `If-Match` version. Restore accepts:

```json
{ "version": 3, "name": "Optional conflict-free name" }
```

The archive and restore responses contain the updated definition, version, lifecycle status, `archivedAt`, and `archivedBy`. Existing `POST .../archive` for suites remains for one compatibility milestone.

Stable conflicts include:

- `stale_version`
- `suite_archived` / `case_archived`
- `suite_not_archived` / `case_not_archived`
- `suite_restore_name_conflict` / `case_restore_name_conflict`
- `invalid_lifecycle`

Missing `If-Match` and wrong-typed request values now use the shared structured `400` problem contract instead of reaching the unexpected-error handler.

## Authorization and ancestry

All members may read archived definitions. Lifecycle writes require the same definition-management roles as authoring: `PROJECT_MANAGER` or `TEST_MANAGER`, with platform administrators following the existing global bypass. Every case operation first validates the project-to-suite relationship, then the suite-to-case relationship.

## Verification evidence

- Focused lifecycle/security unit suite: 15 tests passed.
- Complete unit suite is run before publication.
- Normal Compose startup applied V021 successfully without resetting the existing volume; Flyway reported version `021` and Hibernate schema validation succeeded.
- PostgreSQL reported both partial unique indexes.
- Local `mvn verify` could not start Testcontainers because the Windows Java Docker client received an invalid engine response. This is an environment limitation, not a test assertion failure; the pushed CI backend job is required to run the isolated PostgreSQL tests before this slice is accepted.

## Next slice

The frontend slice will add suite identity/edit actions, accessible Move to trash dialogs, a project Trash page, conflict-aware restore dialogs, project restore, and read-only archived direct links.
