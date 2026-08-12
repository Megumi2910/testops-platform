# Membership positive lifecycle regression

This slice closes the positive half of the project-member quality gate. Earlier security and PostgreSQL checks proved that unsafe transitions stop without side effects; this document records the complementary successful paths and the role boundary that protects them.

## Contract under test

Project-member writes are project-manager operations. Every write resolves the project from the route, requires an active project, accepts the current project version when supplied, and records an audit event after a successful mutation.

| Operation | Successful behavior | Guarded behavior |
| --- | --- | --- |
| Add member | Normalizes email and role, persists one membership, assigns the acting manager, and audits `MEMBER_ADDED`. | Unknown user is `404`; duplicate membership is `409 member_exists`; invalid role is `400`; archived project is `409 project_archived`. |
| Change role | Updates a member role and audits `MEMBER_ROLE_CHANGED`. | Foreign/missing member is `404`; stale project version is `409`; demoting the final manager is `409 final_project_manager`. |
| Remove member | Deletes a non-manager membership and audits `MEMBER_REMOVED`. | Foreign/missing member is `404`; stale project version is `409`; removing the final manager is `409 final_project_manager`. |
| Any write | A project manager or global administrator may proceed. | Test manager, tester, viewer, and non-member requests are rejected by `project_role_required` or `project_access_denied`. |

## Automated evidence

`backend/src/test/java/com/megumi/testops/project/service/ProjectMembershipSecurityTest.java` covers:

- normalized successful add with response identity, role, and assigning actor;
- duplicate detection before repository persistence or audit creation;
- successful non-manager role change followed by removal;
- archived-project rejection for add, change, and remove;
- a non-manager mutation denial that never reaches user lookup or persistence;
- the existing final-manager and foreign-member protections.

`ProjectAccessServiceTest` remains the source of truth for the complete project-role operation matrix, including project-manager-only membership management and administrator bypass. `ApplicationContextIT` proves the corresponding optimistic-version and manager-count behavior against PostgreSQL.

`backend/src/test/java/com/megumi/testops/project/api/AuthorizationHttpContractTest.java` now proves the public controller contract too: add returns `201` with the member identity, duplicate add returns structured `409 member_exists`, role change returns `200` with the updated role/version, and removal returns `204`. The existing final-manager tests continue to prove structured conflict responses at the same boundary.

Run the focused gate from `backend/`:

```powershell
./mvnw -q '-Dtest=AuthorizationHttpContractTest,ProjectMembershipSecurityTest,ProjectAccessServiceTest' test
```

The full backend gate must still be run before publishing the slice:

```powershell
./mvnw -q verify
```

## Remaining quality-gate work

The positive service contract is now covered, but the browser matrix still needs repeatable PM, test-manager, tester, non-member, and administrator journeys against the rebuilt image. The next lifecycle slice should add suite/case archive and restore UI/API behavior and then rerun this membership matrix through Chrome DevTools and Playwright.
