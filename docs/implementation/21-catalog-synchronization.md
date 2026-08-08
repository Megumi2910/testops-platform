# Phase 7 — Ecommerce catalog synchronization

The ecommerce catalog is source-controlled at `catalog/ecommerce-testops.json`. It is deliberately synchronized through the TestOps HTTP API rather than through SQL or direct repository access.

## Why the manifest exists

The manifest gives every project, suite, and case a stable external key. The key is stored as a marker in the project/suite description or case tags, so a renamed display name does not create a duplicate on the next synchronization. Cases are first written as `DRAFT`; a manifest case marked `READY` is promoted only after the same API validation that the UI uses.

The first catalog contains the nine ecommerce domains from Milestone 10. The
current manifest has 24 cases: eighteen safe single-browser cases are `READY`
(homepage, catalog entry, shareable search, no-results search, product detail,
category browse, category directory, flash sale, about, contact, help,
verified-customer login, customer dashboard, order history, profile, settings,
and empty wishlist, plus mobile keyboard search). Credentialed verification,
transactional, Mailpit, two-user messaging, and destructive cases remain drafts
until their native fixture/test harness is available; this prevents a catalog
apply from publishing misleading READY checks.

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
The apply loop discards each variable endpoint response as well, preventing
PowerShell from rendering a returned non-secret email (or any future variable
fields) after the redacted request log.
The redaction check was exercised with sentinel email/password values and
confirmed that neither appeared in a full-stream captured apply transcript.

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
- `Project name is already in use` after a fresh disposable login: project
  listing is owner-scoped. Reuse the owner that created the existing E2E
  project, or reset only `testops-e2e_postgres18_data` and apply again. Do not
  remove the normal development volume.
- Secret variable skipped: set the environment variable named by `valueFromEnv`; the script intentionally refuses to invent a secret value.

The E2E Compose project intentionally keeps its named volume so a restart is fast and repeatable. Acceptance fixtures that create projects use a timestamped display name to remain repeatable across runs. If you need a completely empty E2E database, stop the isolated project and remove only its named volume:

```powershell
docker compose -p testops-e2e -f docker-compose.yml -f docker-compose.e2e.yml down
docker volume rm testops-e2e_postgres18_data
```

Do not run that command against the normal `testops-platform_postgres18_data` volume.

The current catalog has 9 suites and 24 cases. Its 18-case READY set
includes the non-destructive verified-customer login, guest homepage/catalog
checks, shareable/no-results search checks, a product-detail journey for
`/product/1`, a category-browse journey for `/category/1`, a category-directory
journey for `/categories`, a flash-sale journey for `/flash-sale`, public
about/contact/help journeys, six authenticated customer journeys, and the
mobile keyboard search journey. Search uses
`ASSERT_VALUE` with the unique `LABEL` locator for the page's
`Tìm kiếm sản phẩm` textbox, `ASSERT_URL_EQUALS` for `/search?q=shirt`, and a
role-based heading assertion for `Không tìm thấy sản phẩm`. Product and
category assertions use exact text plus stable locator indexes; the valid-login
case uses the semantic `ROLE=HEADING` locator for `Danh mục sản phẩm` because
the same phrase also appears in the footer. The flash-sale case uses
`TEXT_EXACT` because partial role matching would match both `FLASH SALE` and
`Sản phẩm Flash Sale`. The live ecommerce Playwright
contract passed all 9 tests against `http://localhost:3001` on 2026-08-08.
The valid-login case references permanent mock customer credentials without
putting either value in the manifest.

The surrounding enabled TestOps Playwright gate passed 18 tests with one
disabled-profile test skipped on 2026-08-08. The separate disabled-local-target
profile remains the required check for proving that the same localhost origin
is blocked when `TARGET_LOCAL_DEV_ENABLED=false`.

On 2026-08-08, an authenticated apply against the isolated E2E backend on
port 8180 completed successfully for all 9 suites and 24 cases. The run
exercised marker reconciliation, redacted variable updates, P0/P1 mapping,
and READY promotion after the step-replacement flush fix.

The follow-up dry run after the search and guest-catalog locator corrections
again validated 9 suites and 24 cases, printed the `LABEL`, exact-text, and semantic role
locators, and made no API calls.

The corrected search-state case was reapplied and rerun in the isolated E2E
environment on 2026-08-08. It passed all four steps (`NAVIGATE`, `ASSERT_VALUE`,
`ASSERT_URL_EQUALS`, and `TAKE_SCREENSHOT`) and retained one screenshot
artifact.

The complete READY catalog was then queued again after a clean backend restart.
Target checking returned `REACHABLE` with HTTP 200; all 18 READY cases passed,
with 102 total steps. Sixteen screenshot-bearing cases each retained a
`SCREENSHOT` artifact, while the valid-login case passed six steps without
capturing credential evidence. Repeated disposable-stack logins can hit the
auth rate limiter; recreating only the E2E backend is safe when diagnosing that
condition.

The authenticated slice also served as a dogfooding check on the target itself.
The customer dashboard initially failed because PostgreSQL rejects a
`SELECT DISTINCT shipping_address` projection that orders by `order_date` when
that order column is not selected. Ecommerce commit `e738f2f` changed the
service boundary to fetch a bounded recent-order list and de-duplicate
addresses in Java; `OrderServiceImplTest` passed and the rebuilt endpoint
returned HTTP 200. The order-history case initially used exact `#MOCK-ORDER-001`
text and timed out in managed Chromium; changing both the wait and assertion to
the rendered `TEXT` substring made the case deterministic. The empty wishlist
case uses `TEXT_EXACT` for the page title because the page also contains the
similar empty-state heading. The final suite results were 1/1, 10/10, 6/6,
and 1/1 for platform smoke, catalog/search, authenticated customer, and
resilience/accessibility coverage. The mobile case uses the first-step
390×844 viewport context, a `PLACEHOLDER` fill, `PRESS=Enter`, and an exact
`/search?q=shirt` URL assertion; its screenshot artifact was retained.

If the disposable auth limiter returns HTTP 429 during apply or polling,
restart only `testops-e2e-backend-1`, wait for its health check, then obtain one
token and reuse it for the entire operation. This preserves the isolated
PostgreSQL volume and never touches the normal development database.
