# Authorization HTTP regression

## Purpose

This Phase 5 slice connects the project-role policy to the behavior an API client actually receives. It protects three high-risk boundaries:

- nested identifiers from another project must produce a non-disclosing `404`;
- a project must always retain at least one project manager;
- an execution may be cancelled only by its requester or a project manager.

Frontend visibility is not part of these decisions. The server evaluates them for every request, including requests assembled manually outside the TestOps UI.

## Project, suite, case, and execution ancestry

Nested resources are resolved from the outer scope inward:

```text
projectId
  -> suite where suite.project.id = projectId
     -> case where case.suite.id = suiteId

projectId
  -> execution where execution.project.id = projectId
```

If a suite, case, or execution exists elsewhere, the scoped repository query still returns empty. The API responds with `404` and a generic resource code such as `suite_not_found` or `execution_not_found`; it does not reveal the foreign owner or project.

`DefinitionSecurityTest` proves that case lookup stops after a foreign suite fails the project-scoped lookup. `ExecutionServiceTest` proves that foreign execution lookup stops before cancellation ownership or membership is evaluated. `AuthorizationHttpContractTest` and `ExecutionControllerTest` preserve those domain codes in the standard problem response.

## Final-project-manager invariant

`ProjectService` checks the current scoped membership and counts project managers before either demotion or removal. When the target is the final manager:

```text
PUT    /api/v1/projects/{projectId}/members/{userId}
DELETE /api/v1/projects/{projectId}/members/{userId}
```

both return:

```json
{
  "status": 409,
  "title": "Conflict",
  "code": "final_project_manager",
  "detail": "A project must always have a project manager"
}
```

The rejected path does not change the role, delete the membership, touch the project, or write an audit event. A foreign user identifier is queried together with the requested project ID and returns `404 member_not_found`.

## Cancellation ownership

The cancellation decision is deliberately narrower than execution-start permission:

| Caller | Own execution | Another user's execution |
| --- | :---: | :---: |
| Project manager | Allow | Allow |
| Test manager | Allow | Deny |
| Tester | Allow | Deny |
| Viewer | Deny | Deny |
| Non-member | Deny | Deny |

The requester path does not need the project-manager override lookup. A non-owner must have a current project membership whose role is `PROJECT_MANAGER`. Denials return `403 cancel_denied`. A foreign execution ID returns `404 execution_not_found` before ownership evaluation.

## Regression tests

The focused gate covers 22 tests across:

- `AuthorizationHttpContractTest` — nested `404` and final-manager `409` HTTP problem bodies;
- `ExecutionControllerTest` — cancellation `404`/`403` problem bodies and `202` queue contract;
- `DefinitionSecurityTest` — scoped suite/case ancestry and lifecycle guards;
- `ProjectMembershipSecurityTest` — final-manager demotion/removal and foreign-member lookup;
- `ExecutionServiceTest` — requester, manager, denied non-owner, and foreign-execution cancellation paths.

Run it with:

```powershell
cd D:\Projects\testops-platform\backend
.\mvnw.cmd "-Dtest=ExecutionControllerTest,ExecutionServiceTest,ProjectMembershipSecurityTest,AuthorizationHttpContractTest,DefinitionSecurityTest" test
```

Verified on 2026-08-11: 22 tests passed with no failure or error.

## Remaining coverage

This slice does not claim the complete role/browser gate. Remaining work includes:

- authenticated full-context HTTP tests using two persisted projects and all fixture roles;
- positive add/change/remove member journeys, duplicate membership, stale versions, and archived-project denial;
- Chrome DevTools evidence that controls and direct URLs behave correctly for each role;
- queue, retry, worker, target-escape, and artifact authorization variants.

Those cases remain tracked in the baseline and defect ledger rather than being hidden by the focused result.
