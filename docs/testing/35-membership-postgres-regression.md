# Membership PostgreSQL regression

## Purpose

The unit and MockMvc authorization tests prove individual decisions. This integration slice proves the membership invariants against the real Spring transaction boundary, Hibernate optimistic version, Flyway schema, and PostgreSQL queries.

It runs only in the disposable database harness. It does not use or reset the normal development database.

## Scenario

`ApplicationContextIT.membershipTransitionsPreserveManagerVersionAndArchiveInvariants` creates:

- one active verified owner;
- one active verified second manager;
- one project with both users as `PROJECT_MANAGER`.

The test then executes this sequence through the real `ProjectService` bean:

1. Demote the second manager to `TEST_MANAGER`; this is valid because one manager remains.
2. Reload PostgreSQL state and confirm the manager count is exactly one.
3. Attempt to demote the owner; receive `409 final_project_manager` and retain the persisted role.
4. Attempt removal with version `-1`; receive `409 stale_version` and retain the membership.
5. Archive the project, then attempt removal; receive `409 project_archived` and retain the membership.

This order checks successful mutation before failure paths, ensuring the invariant observes current database state rather than a mock count.

## Why the database gate matters

- `countByProjectIdAndRole` must see the committed role transition.
- `ProjectEntity.version` must change through the actual optimistic-lock mapping.
- failed service calls must roll back without deleting membership rows.
- archived status must be read by a new transaction and block mutation.

## Run the gate

On Windows with Docker CLI access:

```powershell
cd D:\Projects\testops-platform
.\scripts\verify-dashboard-postgres.ps1
```

The script name is historical: it now runs the complete `ApplicationContextIT`, including schema, listing, onboarding, target health, lifecycle, dashboard, and membership regressions. It creates a randomly named PostgreSQL container on a Docker-selected loopback port and removes only that container in `finally`.

CI runs the same integration class through Testcontainers when `TEST_DATABASE_URL` is absent.

## Expected evidence

The clean gate must report:

- Flyway current version `21`;
- all backend unit/package tests passing;
- all 7 `ApplicationContextIT` tests passing;
- generated PostgreSQL test container absent after completion.

## Remaining work

This integration test covers state and transactions, not frontend visibility. Positive add/remove flows for non-manager members, duplicate membership, all persisted roles at the HTTP security-filter boundary, and Chrome DevTools member UI journeys remain in the Phase 5 matrix.
