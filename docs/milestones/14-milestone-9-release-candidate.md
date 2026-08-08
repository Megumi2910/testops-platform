# Milestone 9 release candidate

This milestone turns the combined identity, authorization, reporting, execution, and guided-testing work into a reproducible release candidate. It does not add a new product area. Its purpose is to make the existing product safer to build, test, review, and publish.

## What changed

### Repository contract

- npm and `frontend/package-lock.json` are the only frontend package-manager contract.
- `.pnpm-store/`, Playwright reports, test results, frontend build output, backend build output, runtime artifacts, and local environment files are ignored.
- `.agents/` and `skills-lock.json` are user tooling and are not part of the product release.
- The release branch is `codex/milestone-9-release-candidate`.

Never commit `.env` files, `.secrets/`, private keys, SMTP or OAuth credentials, access/refresh tokens, local databases, or screenshots containing personal data.

### Project onboarding API

Every authorized project response now contains:

```json
{
  "onboarding": {
    "suiteCount": 1,
    "caseCount": 3,
    "readyCaseCount": 2,
    "executionCount": 4
  }
}
```

The backend obtains all four values for a page of projects with one batched aggregate query. Archived suites, cases, and past executions remain in the historical counts. The frontend quick start reads this object directly; it no longer loads every suite and then requests its cases.

### Frontend workspace

The project frontend is separated into focused modules:

- project list and project creation;
- project layout and overview;
- suite and case lists;
- variables and members;
- guided new-case builder;
- saved-case editor;
- execution history and evidence.

The project layout loads the project once and provides the project, permissions, target health, onboarding counts, and absolute root path through React Router outlet context.

The guided builder now provides:

- stable client IDs, so validation stays with a step after reorder;
- `?stage=details`, `?stage=steps`, and `?stage=review` URLs;
- reload and internal-navigation warnings for unsaved changes;
- draft, READY, and Save & run outcomes;
- a recovery link when the case saves but queueing fails;
- the same backend-provided action definitions for new and existing cases.

## Verification for beginners

Run commands from the repository root unless a step says otherwise.

### 1. Install frontend dependencies

```powershell
Set-Location frontend
npm ci
Set-Location ..
```

`npm ci` uses the exact versions in `package-lock.json`. Do not run pnpm in this repository.

### 2. Verify the frontend

```powershell
Set-Location frontend
npm run lint
npm run typecheck
npm test
npm run build
Set-Location ..
```

Expected result:

- ESLint reports no errors;
- TypeScript reports no errors;
- all Vitest files pass;
- Vite creates lazy route chunks;
- the initial entry chunk is no more than 100 KB gzip;
- no individual route chunk exceeds 200 KB minified.

### 3. Verify the backend

Docker Desktop must be running because PostgreSQL integration tests use Testcontainers.

```powershell
Set-Location backend
.\mvnw.cmd -B verify
Set-Location ..
```

This checks Java compilation, unit tests, Flyway through V016, Hibernate query validation, PostgreSQL aggregate behavior, target-health persistence/reset, and Playwright launch.

If `docker info` succeeds but Testcontainers still reports HTTP 400 from
`npipe:////./pipe/docker_engine`, Docker Desktop's Windows socket proxy is not
providing a usable Testcontainers endpoint. The same tests still run in the
Linux GitHub Actions job. To verify a migration locally while diagnosing that
environment, start a disposable PostgreSQL container and provide
`TEST_DATABASE_URL`, `TEST_DATABASE_USERNAME`, and `TEST_DATABASE_PASSWORD` to
the focused migration test. Do not point these variables at a database that
contains data: the test expects an empty, disposable database.

### 4. Validate Compose

Create the ignored local environment files first if they do not exist:

```powershell
Copy-Item postgres_db/.env.example postgres_db/.env
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
Copy-Item pgadmin4/.env.example pgadmin4/.env
```

Then validate:

```powershell
docker compose -f docker-compose.yml config --quiet
docker compose -f docker-compose.yml -f docker-compose.e2e.yml config --quiet
docker compose -f docker-compose.yml -f docker-compose.e2e.yml -f docker-compose.e2e-local-disabled.yml config --quiet
```

### 5. Run enabled local-target acceptance

```powershell
docker compose -p testops-e2e -f docker-compose.yml -f docker-compose.e2e.yml up -d --build
$env:E2E_BASE_URL = "http://127.0.0.1:3100"
$env:MAILPIT_URL = "http://127.0.0.1:8025"
Set-Location frontend
npm run e2e
Set-Location ..
docker compose -p testops-e2e -f docker-compose.yml -f docker-compose.e2e.yml down -v
```

This proves registration/OTP, project creation, browser target checking, suite/case creation, Save & run, step outcomes, screenshots, failure position, unreachable targets, and cross-origin rejection.

### 6. Run disabled local-target acceptance separately

```powershell
docker compose -p testops-e2e-disabled -f docker-compose.yml -f docker-compose.e2e.yml -f docker-compose.e2e-local-disabled.yml up -d --build
$env:E2E_DISABLED_BASE_URL = "http://127.0.0.1:3101"
$env:MAILPIT_URL = "http://127.0.0.1:8026"
Set-Location frontend
npm run e2e -- local-target-disabled.spec.ts
Set-Location ..
docker compose -p testops-e2e-disabled -f docker-compose.yml -f docker-compose.e2e.yml -f docker-compose.e2e-local-disabled.yml down -v
```

This stack sets `TARGET_LOCAL_DEV_ENABLED=false`. The localhost option must be visible but disabled with a safe reason.

## CI release gates

GitHub Actions runs five independent jobs:

1. frontend lint, typecheck, unit tests, and build;
2. backend compile, Chromium installation, unit tests, and PostgreSQL integration tests;
3. container build and health smoke;
4. enabled full-stack E2E;
5. disabled-local-mode E2E.

A release candidate is publishable only when all five jobs are green and the final diff contains no secrets, generated reports, local caches, mixed lockfiles, or unrelated `.agents` content.

## Verification recorded for this candidate

The following checks were run on 2026-07-29:

- frontend lint, typecheck, 9 Vitest tests, and production build passed;
- the initial entry was 99.94 KB gzip and route chunks stayed below the
  configured limits;
- 31 backend unit tests passed;
- the focused PostgreSQL upgrade test migrated V001-V014 and then V015-V016;
- all three Compose configurations validated and the enabled images built and
  reached healthy status;
- enabled Playwright acceptance passed 9 active scenarios with 1
  disabled-mode-only scenario skipped;
- the focused accessibility/local-target matrix passed 5 scenarios;
- disabled-local-mode Playwright acceptance passed independently.

The native Windows all-in-one Maven integration run remains environment-blocked
by the Docker Desktop/Testcontainers socket response described above. The
Compose acceptance stack exercises the built backend, PostgreSQL migrations,
managed Chromium, frontend, and mail service without that socket path.

### Supplemental verification on 2026-08-08

After the catalog priority, marker-reconciliation, step-replacement, and
search-locator fixes, the current release-candidate evidence is:

- backend `verify -DskipITs`: 55 unit tests passed and packaging succeeded;
- frontend lint, typecheck, 12 Vitest tests, and production build passed;
- enabled Playwright with the live ecommerce origin: 18 passed and 1
  intentionally skipped disabled-profile case;
- disabled-local-target Playwright: 1 passed independently;
- catalog dry-run: 9 suites and 38 cases with no API calls;
- authenticated catalog apply: 9 suites and 38 cases reconciled with
  redacted variables;
- live target check: `REACHABLE`/HTTP 200;
- all 34 current READY catalog cases: passed, 280 steps; thirty-two screenshot-bearing
  cases retained screenshot artifacts and traces.
- final Compose inspection: normal, enabled E2E, and disabled E2E services all
  reported `running`.

The full Maven `verify` command was also rerun. Its 55 unit tests passed, while
`ApplicationContextIT` and `MigrationUpgradeIT` remained blocked before test
execution by the local Docker Desktop/Testcontainers named-pipe response. See
the [release-gate verification guide](../implementation/22-release-gate-verification.md)
for exact reproduction commands and CI guidance.

The subsequent CI run also caught two stale assertions that still expected
V016. They now assert the current V020 release-candidate schema, covering the
complete migration chain through execution-context settings. The package/unit
gate remains green locally; the full integration assertion is left to the
Linux CI Testcontainers job.

The authenticated customer expansion is now part of the release evidence. The
platform-smoke, catalog/search, customer, orders/reviews, seller workflows,
and resilience/accessibility suites passed 1/1, 10/10, 10/10, 2/2, 7/7, and 4/4
respectively. Customer coverage includes
dashboard, order history, profile, settings, empty wishlist, and valid login.
The resilience case also verifies mobile keyboard search at 390×844 and the
shareable `/search?q=shirt` URL. The guest cart route guard also confirms an
unauthenticated `/cart` request redirects to `/login` with a usable login form.
Invalid credentials remain on `/login` and expose the structured
`Invalid email or password` message. Contact-form accessibility coverage verifies
the three core placeholders and enabled submit control without sending a message.
The logout-session case signs in, signs out from the account menu, confirms the
public home state, and verifies the protected order route redirects to `/login`;
its screenshot is taken only after the session is cleared. The seeded order-detail
case passed fourteen steps after clicking `Đơn hàng #MOCK-ORDER-001`, verifying
both products, COD payment, and `MOCK-TXN-001`; its screenshot was suppressed by
the secret-safe evidence policy. The verified-review-visibility case opened
`/product/1`, confirmed the seeded purchased-review marker, exact review text,
and edit affordance, and passed all 11 steps in execution
`4a7b84aa-9d70-45c9-b859-aa1f20f4a4d2`; its screenshot was likewise suppressed
because the run used the secret customer password. The completed-order
cancellation guard also passed 11 steps, verifying `Hoàn thành` and zero
`Hủy đơn hàng` controls in execution
`95bc969a-2168-4aa0-a479-1bfada26aaaf`; its screenshot was suppressed by the
same secret-safe evidence policy. The seller-dashboard case passed 11 steps,
followed the seller-specific `/seller` redirect, and verified the seeded store
and dashboard sections in execution
`743d26d3-c620-4fd8-987a-b6d9844aed79`; its screenshot was suppressed because
the seller password is secret-backed.
The seller-store-profile case passed 13 steps, verified the read-only store,
contact, operating-hours, and policy sections in execution
`68308019-b7ef-424e-b4ee-11ab108e9f69`, and suppressed its screenshot because the
seller password is secret-backed.
The seller-product-catalog case passed 13 steps, verified the seeded inventory
summary and three product cards in execution
`33687640-7680-4400-b0e9-a0090ff61888`, and suppressed its screenshot because the
seller password is secret-backed.
The seller-analytics case passed 15 steps, verified the reporting, customer,
performance, search-trend, and operating-hours sections in execution
`21747642-8c8d-46a7-bf13-bc8ad8eaab8e`, and suppressed its screenshot because the
seller password is secret-backed.
The seller-order-management case passed 13 steps, verified the seeded completed
order on `/seller/orders`, and suppressed its screenshot because the seller
password is secret-backed. Its execution is
`02125828-c2c5-44d6-9053-7c8b8e344184`.
The seller-settings case first failed with `INVALID_DEFINITION` because the
backend does not support the `TAB` ARIA role; exact text locators corrected the
definition. It then passed all 14 steps in execution
`a2ea07d4-f539-4c04-9765-5a10a44ffae6`, with secret-safe screenshot suppression.
The seller-settings-tabs case then passed all 16 steps in execution
`b78fa6c9-a95b-4c37-82a4-59887c51ef13`, switching between notification and
payment tabs and verifying seeded controls without saving changes. Its
screenshot was suppressed because the seller password is secret-backed.
The guest admin-route guard then passed all 5 steps in execution
`dfa5e7be-b46f-4ee0-ade4-674cb868d697`, confirming `/admin` redirects to the
usable login form; its screenshot was retained because no credential is used.
The unverified-account recovery case passed all 12 steps in execution
`f5ff9cc1-de0a-41a6-ab72-dcf1b6039bf6`, confirming the delayed verification
banner, **Xác thực ngay**, and `/verify-email/request`; its screenshot was
suppressed because the password is secret-backed.
Dashboard exploration discovered a
real ecommerce PostgreSQL query defect; commit `e738f2f` replaced the invalid
`DISTINCT` address projection with a bounded recent-order lookup, and its
focused service test plus the rebuilt dashboard endpoint passed. The order
history case was corrected to use a substring locator for the rendered order
number, and the wishlist case was corrected to exact page-title text. A
disposable backend restart cleared the E2E auth limiter during verification;
the E2E volume and normal development database were preserved.

## Publication boundary

Local commits may be prepared as:

1. `feat(platform): complete identity reporting and guided testing`
2. `feat(web): finalize the TestOps workspace experience`
3. `test(release): add full-stack release gates`
4. `docs(release): reconcile the release candidate`

Pushing the branch, opening a pull request, and merging still require explicit authorization. The release candidate must not be represented as fully verified if Docker-dependent gates were not run.
