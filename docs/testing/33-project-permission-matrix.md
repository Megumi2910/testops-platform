# Project permission regression matrix

## Purpose

TestOps exposes project permissions in every project response so the frontend can hide or disable controls. The backend must enforce the corresponding roles independently because UI visibility is not a security boundary.

This regression slice protects both contracts:

- `ProjectServiceContractTest` verifies exactly which permission strings each role receives;
- `ProjectAccessServiceTest` verifies that backend role guards allow and deny the matching operations.

## Project roles

| Capability | Project manager | Test manager | Tester | Viewer |
| --- | :---: | :---: | :---: | :---: |
| View project, definitions, executions, artifacts | Yes | Yes | Yes | Yes |
| Update or archive project | Yes | No | No | No |
| Manage members | Yes | No | No | No |
| View or manage variables | Yes | No | No | No |
| Create/edit/archive/restore suites and cases | Yes | Yes | No | No |
| Start target checks and executions | Yes | Yes | Yes | No |
| Cancel own executions | Yes | Yes | Yes | No |
| Cancel another user's execution | Yes | No | No | No |

A global platform administrator receives every `ProjectPermission` and may cross the membership boundary for administrative work. A user without a membership receives `project_access_denied` from project-role guards.

## Why variables are manager-only

Even non-secret variables can contain environment details, and secret variable APIs expose metadata such as key names and update timing. The current product contract therefore gives both `VARIABLE_VIEW` and `VARIABLE_MANAGE` only to project managers. Secret values remain masked for every API consumer.

If broader read access is desired later, it must be an explicit product/API change with evidence-redaction review. The frontend must not invent that change by showing the Variables route to other roles.

## Backend operation groups

The role guard uses small operation-specific sets:

```text
PROJECT_MANAGE    = PROJECT_MANAGER
DEFINITION_MANAGE = PROJECT_MANAGER | TEST_MANAGER
EXECUTION_START   = PROJECT_MANAGER | TEST_MANAGER | TESTER
```

| Operation | Enforcing source |
| --- | --- |
| Project update/archive, membership, variables | `ProjectService.java`, `ProjectVariableService.java` |
| Suite/case create, edit, trash, restore | `DefinitionService.java` |
| Target connection check | `TargetCheckService.java` |
| Suite/case queue | `ExecutionService.java` |
| Generic membership/role decision | `ProjectAccessService.java` |
| UI permission payload | `ProjectService.java#permissionSet` |

## Tests added

`ProjectServiceContractTest` parameterizes the four project roles and asserts the complete permission set. It separately proves that a global administrator receives every enum permission without needing a membership.

`ProjectAccessServiceTest` executes 12 role/operation combinations:

- project management: only project manager passes;
- definition management: project manager and test manager pass;
- execution start: project manager, test manager, and tester pass;
- viewer is denied from every managed operation.

It also proves a non-member receives `project_access_denied` and a JWT carrying the platform `ADMIN` role bypasses project membership for managed operations.

Run the focused gate:

```powershell
cd D:\Projects\testops-platform\backend
.\mvnw.cmd "-Dtest=ProjectServiceContractTest,ProjectAccessServiceTest" test
```

Verified result on 2026-08-11: 21 tests passed.

The complete backend unit/package gate passed 101 tests after this matrix was added.

## Frontend behavior

The project workspace consumes permission strings rather than inferring behavior from the role label:

- `DEFINITION_MANAGE` controls suite/case create, edit, trash, and restore;
- `EXECUTION_START` controls target checks and run actions;
- `VARIABLE_VIEW` controls Variables navigation;
- `MEMBER_MANAGE` controls Members navigation and mutations.

This keeps global administrators and future permission changes compatible without adding role-name conditionals throughout React components.

## Remaining Phase 5 coverage

The follow-up [authorization HTTP regression](34-authorization-http-regression.md) now covers service and problem-response behavior for nested identifier substitution, final-manager conflicts, and cancellation ownership. The combined work does not yet complete:

- authenticated full-context substitution using two persisted projects;
- positive add/change/remove member workflows, duplicate membership, stale versions, and archived-project denial;
- Chrome DevTools proof for every role's visible controls and direct URL behavior;
- secret artifact redaction in real browser evidence.

Those remain explicit follow-up rows in the quality-gate ledger; they are not implied complete by this unit-level matrix.

## Troubleshooting a mismatch

If a frontend control is visible but its request returns `403`, compare the permission emitted by `ProjectService.permissionSet` with the role set passed by the relevant backend service. Correct the inconsistent side only after confirming the intended business rule in this matrix.

Do not weaken backend enforcement to match a mistakenly visible button. UI checks improve usability; backend guards preserve authorization.
