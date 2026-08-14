# Phase 2 security boundaries

## Outcome

This slice closes the first set of authorization and lifecycle blockers identified by the Milestone 10 browser baseline. The server now treats nested identifiers, project variables, execution cancellation, archived suites, and the active-administrator invariant as explicit security boundaries. The frontend also guards the administrator route rather than relying on a hidden navigation link.

## Nested project ancestry

Nested URLs are not authorization proof. For a route shaped like:

```text
/projects/{projectId}/suites/{suiteId}/cases/{caseId}
```

the service validates each relationship in order:

1. Load the requested project and authorize the caller against it.
2. Resolve the suite with both `suiteId` and `projectId`.
3. Resolve the case with both `caseId` and the already validated `suiteId`.

If any link is mismatched, the request returns `404` and does not continue to the next repository. This prevents a member of one project from substituting identifiers belonging to another project and learning whether the foreign case exists.

## Archived definitions

Archived content remains readable for historical context, but it is not mutable or executable:

- suite update returns `409 suite_archived`;
- case creation under an archived suite returns `409 suite_archived`;
- archived case update returns `409 case_archived`;
- suite and case queue operations return `409 suite_archived` when the parent suite is archived;
- project-level `project_archived` checks remain in place.

The later trash-and-restore phase will add explicit lifecycle endpoints. These guards protect direct API calls immediately and remain valid after the UI is added.

## Variable visibility

`VARIABLE_VIEW` is advertised only to project managers and platform administrators in the current permission matrix. The list endpoint now enforces that same boundary through `ProjectAccessService.requireProjectRole`. Merely being a project member is no longer sufficient.

Secret variable values remain `null` in every API response, including responses to callers who may manage them. Decryption is still reserved for the execution worker.

## Execution cancellation

Cancellation is allowed only when the caller is:

- the user who requested the execution; or
- a `PROJECT_MANAGER` member of that execution's project.

A platform-wide administrator does not implicitly gain cancellation authority for a project where they are not the requester or a project manager. The execution itself is first resolved by `projectId`, preserving tenant isolation.

## Last active administrator

Counting all administrators was insufficient because locked or disabled administrators cannot operate the platform. Demotion or deactivation now protects the last **active** administrator.

`UserRepository.findByPlatformRoleForUpdate` locks administrator rows in a deterministic order inside the write transaction. The service then requires another `ACTIVE` administrator before removing the target's active-administrator capability. This serializes competing demotion/deactivation requests and prevents both from passing a stale count.

## Frontend administrator guard

`PlatformPermissionRoute` checks authentication, email verification, and the required platform permission before rendering a protected child route. `/admin/users` requires `USER_ADMINISTER`; a verified user without it is redirected to the dashboard. Hiding the Admin navigation link remains useful presentation behavior, but the route guard is the actual frontend boundary and the backend remains authoritative.

## Regression coverage

- `DefinitionSecurityTest`: mismatched project/suite ancestry and archived-suite mutation.
- `ProjectVariableServiceTest`: permission enforcement and secret masking.
- `ExecutionServiceTest`: archived-suite queue rejection and cancellation ownership.
- `AdminUserServiceTest`: last-active-admin rejection and safe deactivation with a remaining administrator.
- `RouteGuards.test.tsx`: denied member and authorized administrator route behavior.

Chrome DevTools then navigated an authenticated QA project manager directly to `/admin/users` on the rebuilt worktree. The guard redirected to `/dashboard`; the administration UI never rendered, the console contained no warnings or errors, and all five authentication/dashboard requests returned `200`.

These tests supplement, rather than replace, the two-project PostgreSQL and browser substitution matrix planned for Phase 5.
