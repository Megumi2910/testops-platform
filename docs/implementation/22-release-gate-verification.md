# Release-gate verification

This document records the commands and evidence used to verify the current
TestOps release candidate after the ecommerce catalog and step-replacement
fixes. It is intentionally explicit so a new contributor can reproduce the
same checks without guessing which Compose profile or port is in use.

## What was verified

| Area | Command/profile | Result |
| --- | --- | --- |
| Backend unit/package gate | `backend/.\mvnw -B verify -DskipITs` | PASS — 55 tests, package and Spring Boot repackage succeeded |
| Backend full gate | `backend/.\mvnw -B verify` | PARTIAL in this Windows shell — unit tests passed, Testcontainers integration tests could not discover a usable Docker API pipe |
| Frontend quality gate | `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` | PASS — lint/typecheck clean, 12 unit tests passed, production build succeeded |
| Enabled Playwright | `E2E_BASE_URL=http://127.0.0.1:3100`, `ECOMMERCE_BASE_URL=http://localhost:3001` | PASS — 18 passed, 1 intentionally skipped disabled-profile test |
| Disabled local-target Playwright | `E2E_DISABLED_BASE_URL=http://localhost:3101`, `MAILPIT_URL=http://127.0.0.1:8026` | PASS — 1 passed |
| Catalog preflight | `scripts/sync-ecommerce-catalog.ps1 -Mode dry-run` | PASS — 9 suites, 37 cases, no API calls |
| Catalog apply | `-Mode apply -BaseUrl http://localhost:8180` | PASS — 9 suites, 37 cases reconciled; variable values redacted in logs |
| Live READY acceptance | target check + thirteen suite/case queue requests | PASS — target `REACHABLE`/HTTP 200, all 32 READY cases passed, 263 steps, 30 screenshot-bearing definitions; secret-bearing artifacts suppressed by policy |

The full backend command’s only errors were `ApplicationContextIT` and
`MigrationUpgradeIT` failing before test execution because Testcontainers saw
Docker Desktop’s `docker_cli` named pipe as an empty API. This is an execution
environment limitation; the same integration tests are still required in CI.

## CI migration-version correction

The first CI runs after V017–V020 were added exposed a stale release assertion:
`ApplicationContextIT` and `MigrationUpgradeIT` still expected V016, the
guided-local-target migration, even though the release candidate now includes
V017 variable-snapshot hardening, V018 immutable case snapshots, V019 locator
metadata, and V020 browser-context settings. The tests now assert the current
zero-padded Flyway version `020` and describe the upgrade as the complete
release migration chain. This is a test-contract correction only; no production
schema or data was changed.

The post-fix local package/unit gate remains green (`55` tests with
`-DskipITs`). The integration assertion is intentionally verified by the CI
Testcontainers job because this Windows shell cannot expose a usable Docker API
to the Java client.

The live acceptance now covers six runnable suites/case groups: platform smoke
(1/1), catalog and search (10/10), authentication/customer routes (9/9),
orders/reviews (2/2), seller workflows (6/6), and resilience/accessibility (3/3). The
customer run includes dashboard, order history, profile, settings, empty
wishlist, and valid login. The resilience case uses a 390×844 context, fills
the storefront search placeholder, presses Enter, asserts `/search?q=shirt`,
and retains a screenshot. The guest cart route guard redirects `/cart` to
`/login`, exposes the login heading/email field, and retains a screenshot.
The invalid-login case receives the backend `401`, remains on `/login`, verifies
the exact `Invalid email or password` message, and retains a screenshot. The
contact-form case verifies the three core placeholders and enabled submit button
without sending a message. The logout case signs in with the seeded customer,
signs out from the account menu, confirms the public home state, and proves the
protected order route redirects to `/login`; its screenshot is taken only after
logout. The order-detail case clicks `Đơn hàng #MOCK-ORDER-001`, verifies both
products, COD payment, and `MOCK-TXN-001`, and passes all 14 steps. Its
screenshot step is intentionally suppressed because the run uses the secret
customer password.
The verified-review-visibility case opens `/product/1`, checks the seeded
purchased-review marker, exact review text, and edit affordance, and passes all
11 steps in execution `4a7b84aa-9d70-45c9-b859-aa1f20f4a4d2`; its screenshot is
likewise suppressed by the secret-safe evidence policy.
The completed-order cancellation guard then verifies `Hoàn thành` and zero
`Hủy đơn hàng` buttons in 11 passing steps
(`95bc969a-2168-4aa0-a479-1bfada26aaaf`); its screenshot is likewise suppressed
because the run uses the secret customer password.
The seller-dashboard case follows the seller-specific `/seller` redirect and
verifies the seeded store name, dashboard summary, recent-orders section, and
top-products section in 11 passing steps
(`743d26d3-c620-4fd8-987a-b6d9844aed79`); its screenshot is suppressed because
the seller password is secret-backed.
The seller-store-profile case then passed all 13 steps in execution
(`68308019-b7ef-424e-b4ee-11ab108e9f69`), verifying the read-only store, contact,
operating-hours, and policy sections; its screenshot is suppressed because the
seller password is secret-backed.
The seller-analytics case then passed all 15 steps in execution
(`21747642-8c8d-46a7-bf13-bc8ad8eaab8e`), verifying reporting, customer,
performance, search-trend, and operating-hours sections; its screenshot is
suppressed because the seller password is secret-backed. Artifact metadata is
returned by the execution detail endpoint; the unsupported `/artifacts` list URL
must not be used.
The seller-product-catalog case then passed all 13 steps in execution
(`33687640-7680-4400-b0e9-a0090ff61888`), verifying the seeded inventory summary
and all three product cards; its screenshot is suppressed because the seller
password is secret-backed.
The seller-order-management case then passed all 13 steps in execution
(`02125828-c2c5-44d6-9053-7c8b8e344184`), verifying the seeded completed order,
customer, total, and fixture note on `/seller/orders` without changing order
state; its screenshot is suppressed because the seller password is
secret-backed.
The seller-settings case first exposed an `INVALID_DEFINITION` (`Unsupported
ARIA role`) at step 9 in execution `6f431127-0433-486a-b5fe-1fd508a049d6`.
The four unsupported `TAB` role locators were replaced with exact visible text;
the corrected case passed all 14 steps in execution
`a2ea07d4-f539-4c04-9765-5a10a44ffae6`, with its screenshot suppressed because
the seller password is secret-backed.
The seller-settings-tabs case then passed all 16 steps in execution
`b78fa6c9-a95b-4c37-82a4-59887c51ef13`, covering notification and payment tabs;
its screenshot was suppressed because the seller password is secret-backed.
Dashboard exploration found and corrected the
ecommerce PostgreSQL `DISTINCT`/`ORDER BY` defect in commit `e738f2f`; the
focused service test and rebuilt `/api/orders/dashboard-statistics` endpoint
both passed. The order-history definition was made stable by using a rendered
substring locator for `MOCK-ORDER-001`, and the wishlist page title uses exact
text to avoid a strict-mode heading collision. A disposable TestOps backend
restart was required once to clear its in-memory auth limiter; no database
volume was removed.

## Reproduce the gates

Start the enabled E2E profile first:

```powershell
cd D:\Projects\testops-platform
docker compose -p testops-e2e -f docker-compose.yml -f docker-compose.e2e.yml up -d --build
```

Run the backend package/unit gate:

```powershell
cd backend
.\mvnw -B verify -DskipITs
```

Run the frontend gate:

```powershell
cd ..\frontend
npm run lint
npm run typecheck
npm run test
npm run build
```

Run enabled Playwright coverage, including the live ecommerce contract:

```powershell
$env:E2E_BASE_URL = 'http://127.0.0.1:3100'
$env:ECOMMERCE_BASE_URL = 'http://localhost:3001'
$env:PW_WORKERS = '1'
npm run e2e
```

Run the disabled-local-target assertion in its own isolated profile:

```powershell
cd ..
docker compose -p testops-e2e-disabled -f docker-compose.yml -f docker-compose.e2e.yml -f docker-compose.e2e-local-disabled.yml up -d --build
cd frontend
$env:E2E_DISABLED_BASE_URL = 'http://localhost:3101'
$env:MAILPIT_URL = 'http://127.0.0.1:8026'
npx playwright test e2e/local-target-disabled.spec.ts
```

The enabled profile uses frontend `3100`, backend `8180`, Mailpit `8025`, and
target fixture `3201`. The disabled profile uses frontend `3101`, backend
`8181`, Mailpit `8026`, and target fixture `3202`. Their PostgreSQL volumes are
different because the Compose project names differ.

## Catalog acceptance flow

1. Set the E2E customer values only in the current PowerShell process.
2. Obtain a short-lived admin token from the E2E backend.
3. Run the catalog dry run, then apply against port `8180`.
4. Open the Ecommerce project in the UI and click **Check connection**.
5. Queue each READY case individually or queue its suite.
6. Confirm the run reaches `PASSED`, inspect each step duration/status, and
   open each screenshot artifact. Credentialed cases may suppress sensitive
   evidence by design; the current valid-login case remains secret-safe and
   intentionally has no screenshot.

Do not use the normal backend port `8080` when applying to the E2E profile. Do
not paste token or password values into the manifest, documentation, or a
terminal transcript.

## Troubleshooting the full backend gate

The Docker CLI can be healthy while Testcontainers is unable to use its named
pipe. Confirm the active context:

```powershell
docker context show
docker version
```

The repository’s Docker Desktop context is `desktop-linux` with
`npipe:////./pipe/dockerDesktopLinuxEngine`. The local Maven run attempted both
the default and that active endpoint but still received an empty Docker API
response labelled `docker_cli`. When that happens, keep the `-DskipITs` result
as the local code gate and run the full Testcontainers gate on CI or a host
where the Docker Java client can access the engine directly. Do not disable
the integration tests in the repository or change production Docker settings
to work around a local pipe problem.

## Evidence interpretation

- `REACHABLE` means the worker could open the exact allowlisted target and got
  an HTTP response; it does not grant access to another origin.
- A `PASSED` case has ordered step outcomes and sanitized durations. A
  screenshot artifact confirms that evidence capture survived the run.
- `TARGET_UNREACHABLE`, `BLOCKED`, and assertion/locator failures are distinct
  categories. Fix target configuration for infrastructure categories; fix the
  case definition or application behavior for assertion categories.
- The catalog synchronizer is idempotent by literal stable markers. A second
  apply updates existing entities and does not create a second project.

The documentation manifest check also passed with 22 registered documents and
no missing paths after this guide was added.

The final Compose health inspection also reported all services running in the
normal, enabled E2E, and disabled E2E projects.
