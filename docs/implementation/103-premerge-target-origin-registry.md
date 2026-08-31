# Pre-merge target-origin registry

## Outcome

Target origins are no longer limited to a backend restart and an environment-file edit. Verified platform administrators manage a persistent registry from **Administration → Target origins**. Project managers can select an enabled target; they cannot create an arbitrary browser-testing destination.

## Server contract

Migration `V024` creates `target_origins` with its canonical origin, enabled state, creator, timestamps, and optimistic version. The effective target allowlist is the union of enabled administrator rows and the existing read-only `TARGET_ALLOWED_ORIGINS` bootstrap source.

`GET /api/v1/admin/target-origins` exposes both sources. `POST /api/v1/admin/target-origins` registers `{ "origin": "https://staging.example.com" }`; `PATCH /api/v1/admin/target-origins/{id}` applies `{ "enabled": false, "version": 2 }`. Environment rows have no mutable identifier/version and cannot be changed through the API.

The normalizer lowercases scheme/host and removes trailing slashes and default HTTP(S) ports. It rejects credentials, non-origin paths, queries, fragments, unsafe literal/private IP addresses, duplicates, and localhost when the local bridge is disabled. Target checks and every execution navigation ask the registry again, so disabling a row takes effect without deleting projects or restarting the service.

Updating a project keeps an unchanged disabled origin only for unrelated metadata edits. A changed origin must be enabled; a disabled origin blocks target checks and execution navigation.

## User experience

Create and Edit Project now share the same native selector. Administrators see **Add target origin** next to it; successful registration refreshes the options and selects the new canonical value. Members receive concise administrator guidance. Empty project forms identify the missing name or target origin rather than displaying the generic `Invalid input` text, and React Hook Form focuses the first invalid native control.

## Verification

The focused frontend project/admin suite and TypeScript check pass. The backend unit suite passes with 199 tests, including target normalization, immutable environment source, canonical duplicate rejection, and immediate disabled-origin behavior. The container-backed `MigrationUpgradeIT` passes from `V014` and `V022` through `V024` and asserts the registry columns.
