# Project lifecycle version evidence

## Scope

Project archive and restore are definition-boundary mutations. They now use the project version as an optimistic lock so a stale tab cannot archive or restore a newer state without an explicit reload.

The HTTP contract is:

```text
POST /api/v1/projects/{projectId}/archive
If-Match: <project.version>

POST /api/v1/projects/{projectId}/restore
If-Match: <project.version>
```

The header is required. A missing header is a `400 request_binding_failed` problem with `errors[0].path = If-Match`. A stale value is a `409 stale_version` problem. Repeating an archive or restore request against the same state returns a structured `409` (`project_already_archived` or `project_not_archived`) and does not write an audit event.

## Implementation path

1. `ProjectLayout` reads the project once through `projectKeys.detail(projectId)`.
2. The archive and restore mutations send the currently loaded `project.version` in `If-Match`.
3. `ProjectController` binds the required header before entering the service.
4. `ProjectService.setArchived` checks the version, rejects invalid lifecycle transitions, changes the state, flushes the versioned project, and records the audit event only after both guards pass.
5. The response updates the project cache with the flushed version, so a restored version is used for the next mutation.

This keeps the browser controls convenient while making direct API calls obey the same concurrency boundary. Existing suite and case trash endpoints use the same header convention.

## Verification

Focused backend gate:

```powershell
Push-Location backend
./mvnw -B '-Dtest=ProjectServiceContractTest,AuthorizationHttpContractTest' test
Pop-Location
```

The gate covers successful archive, stale archive rejection, repeated archive/restore conflicts, and the missing-header HTTP response. The focused run passed 18 tests.

Frontend gate:

```powershell
Push-Location frontend
npm run lint
npm run typecheck
npm test -- --run
npm run build
Pop-Location
```

The frontend gate passed 32 tests, lint, type checking, and the production build. The rebuilt isolated Playwright stack also passed the archived-project boundary test: archive removed suite create/edit/trash/run controls, restore returned them, and all lifecycle requests completed successfully.

## Troubleshooting

- `400 request_binding_failed`: the caller did not send `If-Match`; reload the project and use the current version.
- `409 stale_version`: another tab changed the project; reload the project before retrying.
- `409 project_already_archived` or `project_not_archived`: the requested state is already current; refresh rather than retrying blindly.
- Archived projects intentionally keep read access and execution history, but definition creation, editing, trash, target checks, and runs remain unavailable until restore.
