# Phase 5 — Variable permissions and masking evidence

## Scope

This slice verifies that the variable API, project permission payload, and
direct frontend route agree on the same authorization contract.

| Check | Evidence |
| --- | --- |
| Permission policy | `ProjectService.permissionSet` and `ProjectAccessService.requireProjectPermission` |
| Variable API guards | `ProjectVariableService` list/create/update/delete |
| Secret response safety | `ProjectVariableServiceTest` and `VariablesPage.test.tsx` |
| Direct-link recovery | `VariablesPage.test.tsx` |

## Automated result

Focused backend command:

```text
ProjectAccessServiceTest       19 tests passed
ProjectVariableServiceTest      1 test passed
```

Focused frontend command:

```text
Test Files  3 passed
Tests       8 passed
```

The frontend command includes the existing member and platform-route guard
tests so the new direct-link behavior is checked beside the neighboring
permission surfaces.

## Manual acceptance checklist

1. Sign in as a project manager and confirm **Variables** is visible and the
   list loads.
2. Sign in as a test manager, tester, or viewer and open the project directly;
   confirm the Variables navigation item is absent.
3. Paste `/projects/{id}/variables` as a non-manager; confirm the page explains
   that variables are restricted, offers **Back to project overview**, and
   does not issue a variable-list request.
4. Create a secret variable as an authorized manager; confirm the response and
   rendered list contain only the fixed mask, never the plaintext.
5. Try the create, update, and delete endpoints with a role lacking
   `VARIABLE_MANAGE`; confirm the structured `403 project_permission_required`
   response.
6. Archive the project and confirm the existing mutation guard reports the
   project as read-only.

## Release interpretation

This closes the variable permission-contract slice. It does not claim that the
complete Phase 5 tenant-isolation, final-administrator, artifact-download, or
Chrome DevTools accessibility/performance matrix is complete.
