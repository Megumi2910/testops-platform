# Phase 7 — Ecommerce catalog synchronization

The ecommerce catalog is source-controlled at `catalog/ecommerce-testops.json`. It is deliberately synchronized through the TestOps HTTP API rather than through SQL or direct repository access.

## Why the manifest exists

The manifest gives every project, suite, and case a stable external key. The key is stored as a marker in the project/suite description or case tags, so a renamed display name does not create a duplicate on the next synchronization. Cases are first written as `DRAFT`; a manifest case marked `READY` is promoted only after the same API validation that the UI uses.

The first catalog contains the nine ecommerce domains from Milestone 10. The guest homepage, catalog, search-state, no-results, and verified-customer login cases are runnable immediately. Credentialed verification, transactional, Mailpit, two-user messaging, and destructive cases remain drafts until their native fixture/test harness is available; this prevents a catalog apply from publishing misleading READY checks.

## Dry run

From the TestOps repository:

```powershell
.\scripts\sync-ecommerce-catalog.ps1 -Mode dry-run
```

Dry run reads and validates the manifest, prints every planned API operation, and never needs a token. Use this before applying a reviewable change. Validation is fail-closed: action names, locator types (including `TEXT_EXACT`), required values, non-negative `locatorIndex`, contiguous positions, first-step context settings, viewport bounds, locale/timezone shapes, READY ordering, and timeout bounds are checked before the first API call.

## Apply

Create a short-lived TestOps bearer token in your local shell. Never put it in the manifest or commit it:

```powershell
$env:TESTOPS_TOKEN = '<local-token>'
$env:TESTOPS_E2E_CUSTOMER_EMAIL = 'customer@example.test'
$env:TESTOPS_E2E_CUSTOMER_PASSWORD = '<local-password>'
.\scripts\sync-ecommerce-catalog.ps1 -Mode apply
```

The script creates or updates the `Ecommerce` project at `http://localhost:3001`, its suites, variables, and cases. Secret values are read only from environment variables at apply time. If a referenced value is absent, that variable is skipped and no secret placeholder is written.

Apply logging is secret-safe: variable payloads are sent with their real values,
but the operation plan always prints `value: [REDACTED]` for both secret and
non-secret variables. This prevents a copied terminal transcript from becoming
an accidental credential leak.
The redaction check was exercised with sentinel email/password values and
confirmed that neither appeared in captured dry-run output.

Marker reconciliation uses literal string containment for the stable
`[testops-key:...]` and `sync:...` markers. It must not use wildcard matching:
PowerShell treats `[` as a character-class operator, which would reject a
previously synchronized project before any API write.

The manifest intentionally uses the product-facing `P0`, `P1`, and `P2`
priority labels. The TestOps definition API uses `CRITICAL`, `HIGH`, and
`MEDIUM`, so the synchronizer maps `P0 → CRITICAL`, `P1 → HIGH`, and
`P2 → MEDIUM` before creating or updating a case. The original P-level remains
in the case tags for catalog review, while the API receives only values it
accepts.

READY promotion is intentionally a second case update. Because that update
replaces the existing step list, the backend flushes the bulk step delete
before inserting the replacement positions. This prevents PostgreSQL's
`test_steps_case_position_unique` constraint from turning a valid DRAFT → READY
promotion into HTTP 500. The focused `DefinitionServiceTest` suite passed after
the transaction-ordering fix.

## Synchronization behavior

1. The project is matched by `[testops-key:ecommerce-platform]`, then by exact display name; an existing match is updated so its marker and target origin are repaired.
2. Suites are matched by `[testops-key:<suite-key>]`, then by exact name.
3. Cases are matched by `sync:<case-key>` in tags, then by exact name.
4. Existing entities are updated with their optimistic-concurrency version.
5. READY promotion is a second update so incomplete definitions cannot silently become runnable.
6. No entities are deleted or archived automatically. Removing a manifest entry is therefore reversible and safe; archive it explicitly in the UI when the team agrees.

The manifest can carry `viewportWidth`, `viewportHeight`, `locale`, and `timezoneId` on step 0. The synchronizer passes these fields through unchanged; the backend persists them in V020 and applies them while creating the isolated browser context. Keeping the preflight in PowerShell gives a catalog author a local, line-specific failure before a partial apply can create or update entities.

## What belongs in TestOps versus native ecommerce tests

TestOps is the reusable single-browser journey layer: navigation, locators, interaction, assertions, screenshots, and traces. Keep concurrency, database transactions, Mailpit interception, two-user WebSocket orchestration, and destructive checkout cleanup in the ecommerce repository's native tests. The manifest tags each case with role, state, priority, and runner so this boundary is visible during review.

## Troubleshooting

- `401`: set `TESTOPS_TOKEN` to a valid bearer token for a user with project-management and definition-management permissions.
- `target origin is not allowed`: add `http://localhost:3001` to TestOps `TARGET_ALLOWED_ORIGINS` and enable `TARGET_LOCAL_DEV_ENABLED=true` for the local bridge.
- `case cannot become READY`: inspect the API response; READY cases need at least one step beginning with `NAVIGATE`, and each action must satisfy its descriptor fields.
- `internal_error` mentioning `test_steps_case_position_unique`: rebuild the TestOps backend so the step-replacement flush fix is running, then rerun apply; do not manually edit the database.
- Duplicate project or suite: check that the marker is still present in its description. Restore the marker before running apply again.
- Secret variable skipped: set the environment variable named by `valueFromEnv`; the script intentionally refuses to invent a secret value.

The E2E Compose project intentionally keeps its named volume so a restart is fast and repeatable. Acceptance fixtures that create projects use a timestamped display name to remain repeatable across runs. If you need a completely empty E2E database, stop the isolated project and remove only its named volume:

```powershell
docker compose -p testops-e2e -f docker-compose.yml -f docker-compose.e2e.yml down
docker volume rm testops-e2e_postgres18_data
```

Do not run that command against the normal `testops-platform_postgres18_data` volume.

The current catalog has 9 suites and 12 cases. Its READY set includes the
non-destructive verified-customer login plus guest homepage/search checks. The
additional READY search
cases use `ASSERT_VALUE` with the unique `LABEL` locator for the page's
`Tìm kiếm sản phẩm` textbox,
`ASSERT_URL_EQUALS` for `/search?q=shirt`, and a role-based heading assertion
for `Không tìm thấy sản phẩm`. The live ecommerce Playwright contract passed
all 9 tests against `http://localhost:3001` on 2026-08-08, confirming the same
search and empty-state behavior before catalog synchronization. The valid-login
case references the permanent mock customer credentials and is READY without
putting either value in the manifest.

The surrounding enabled TestOps Playwright gate passed 18 tests with one
disabled-profile test skipped on 2026-08-08. The separate disabled-local-target
profile remains the required check for proving that the same localhost origin
is blocked when `TARGET_LOCAL_DEV_ENABLED=false`.

On 2026-08-08, an authenticated apply against the isolated E2E backend on
port 8180 completed successfully for all 9 suites and 12 cases. The run
exercised marker reconciliation, redacted variable updates, P0/P1 mapping,
and READY promotion after the step-replacement flush fix.

The follow-up dry run after the search locator correction again validated 9
suites and 12 cases, printed the `LABEL` locator, and made no API calls.

The corrected search-state case was reapplied and rerun in the isolated E2E
environment on 2026-08-08. It passed all four steps (`NAVIGATE`, `ASSERT_VALUE`,
`ASSERT_URL_EQUALS`, and `TAKE_SCREENSHOT`) and retained one screenshot
artifact.
