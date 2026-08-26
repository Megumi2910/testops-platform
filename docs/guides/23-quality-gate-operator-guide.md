# Quality-gate operator guide

## What this setup does

The quality-gate overlay gives beginners a repeatable TestOps role matrix without putting passwords in source control. It also labels every application image with the Git revision that produced it, preventing browser observations from being attributed to newer source than the running containers.

`scripts/verify-doc-links.ps1` checks the root/index links and the new `docs/guides`, `docs/testing`, and `docs/workflows` quality-gate documents. Older walkthroughs predate the documentation-folder refactor and are outside this focused link gate until their historical relative links are migrated.

The overlay adds a TestOps-only Mailpit instance on `http://localhost:8027`. It does not replace the ecommerce isolated E2E Mailpit on `8025`, and it does not reset either normal database.

## Primary candidate gate

Run the aggregate gate from the repository root with an explicit project name
that is not the repository's default Compose project:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify.ps1 `
  -ProjectName testops-m10a-verify -NoBrowser
```

The gate installs the locked frontend dependencies, runs lint, typecheck, unit
tests, and the production build, runs the complete Maven verification, checks
every supported Compose configuration, audits the orchestration/revision/docs/
secret contracts, builds revision-labelled images, waits for health, verifies
the running OCI labels, and tears down only the named disposable project.
The provenance verifier reads structured `docker inspect` JSON so the same
label and health contract works under Windows PowerShell and newer PowerShell.

`-NoBrowser` adds a temporary Compose override with no published host ports.
It still proves image build, startup, health, and revision provenance. Omit the
switch only when the enabled E2E ports are available and the complete browser
matrix is intended. If tracked candidate source is dirty, the script delegates
to a validated temporary detached worktree at `git rev-parse HEAD`; local
formatting and documentation drafts therefore cannot silently enter an image
labelled as the committed candidate.

The aggregate script always attempts project-scoped teardown in `finally`.
When startup fails it emits bounded `ps` and service-log diagnostics for that
same project before cleanup. It never targets the developer's default Compose
project.

The E2E overlay intentionally sets `AUTH_REFRESH_LIMIT=1000` for its disposable
backend. The complete browser matrix creates many sessions from one localhost
address; the higher test-only budget prevents the suite from tripping its own
refresh limiter. Default and production profiles retain their normal limits.

PgAdmin rejects special-use domains such as `.invalid`, `.test`, and `localhost`
at startup. The tracked template therefore uses the non-secret placeholder
`admin@testops.example.com`; keep the address under a normal public suffix when
customizing `pgadmin4/.env`. A PgAdmin restart is a gate failure, and its bounded
logs are included in the startup diagnostics.

## First setup

```powershell
cd D:\Projects\testops-platform
.\scripts\setup-quality-gate.ps1
```

The script creates `backend/.secrets/qa-fixture-password` when missing. The file is ignored by Git. Do not copy its value into documentation, terminal screenshots, test reports, or chat messages.

It then:

1. resolves the TestOps and ecommerce Git revisions;
2. builds both frontend/backend image pairs with OCI revision labels;
3. starts TestOps with `docker-compose.qa.yml` and ecommerce with its normal Compose file. The QA overlay disables the normal first-user bootstrap because `local-qa` seeds the administrator and role fixtures itself;
4. waits for health;
5. fails if a running image label differs from its repository revision.

## Backend verification on Windows and Docker Desktop

Run the backend gate from the backend directory:

```powershell
cd D:\Projects\testops-platform\backend
.\mvnw.cmd -B -ntp verify
```

Docker Desktop must be running. The Maven wrapper now handles a normal (non-junction)
`MAVEN_USER_HOME` correctly, so it can download Maven into a local `.m2` directory
without the PowerShell `Cannot index into a null array` failure.

The integration tests use Testcontainers. Docker Desktop 4.79 and newer require
Docker API 1.40 or newer, while older Testcontainers clients defaulted to API 1.32.
The Failsafe configuration pins the client to API 1.40 through the
`testcontainers.docker.api.version` Maven property. It is intentionally configurable
for CI or an older Docker engine:

```powershell
.\mvnw.cmd -B -ntp -Dtestcontainers.docker.api.version=1.41 verify
```

Do not hard-code a Windows named pipe in the project. Testcontainers should use the
active Docker context (`docker context show`) and the Maven property only controls
the negotiated API version. If Docker is unavailable, start Docker Desktop and run
the command again; do not reset the normal database volume. Testcontainers creates
and removes disposable PostgreSQL containers for the integration tests.

Successful output ends with `BUILD SUCCESS` and reports 144 unit tests plus the
integration suite. A few connection-validation warnings can appear while a disposable
database is being stopped during test teardown; they are non-failing if Failsafe
reports zero failures and zero errors.

## Verify without rebuilding

```powershell
.\scripts\verify-running-revisions.ps1
docker compose -f docker-compose.yml -f docker-compose.qa.yml ps
```

Expected TestOps endpoints:

- UI: `http://localhost:3000`
- API/health through UI proxy: `http://localhost:3000/actuator/health`
- backend: `http://localhost:8080`
- QA Mailpit: `http://localhost:8027`

Expected ecommerce endpoints:

- UI and same-origin API: `http://localhost:3001`
- backend: `http://localhost:8081`

## Retained revision A/B deployment gate

After revision A (the retained-deployment foundation) and its adjacent revision
B (the `AuthPages` diagnostic marker) are committed, run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-retained-swap.ps1 `
  -ProjectName testops-m10a-gate
```

The command uses clean detached worktrees and a disposable project with a
random loopback frontend port. It verifies full-SHA ancestry, source delta,
image labels, shell/asset/static-404 headers, proxy exclusions, one old-chunk
`404`, one document reload, the A recovery marker, the B diagnostic marker,
and post-reload stability. Raw coordination/report data stays in ignored
locations. Only a successful live run emits the query-backed `pipeline-run`
manifest and merges the sanitized swap block into
`artifacts/browser-evidence/P6.json`.

Use `-DryRun` only to inspect revision selection and orchestration. Dry run is
not release evidence and intentionally emits no `EVIDENCE_JSON` line.

## Validate sanitized browser evidence

Browser runs produce a small JSON summary for the release gate; they must not
turn Playwright traces, DevTools payloads, cookies, credentials, one-time codes,
or request/response bodies into committed evidence. Store the summary at
`artifacts/browser-evidence/P6.json` through `P9.json` (ignored) or at
`docs/testing/browser-evidence/P6.json` through `P9.json` (tracked), then run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts/assert-browser-evidence.ps1 -Phase P6
```

Use `-ManifestPath` only when an orchestration run writes another tracked or
ignored repository path. Untracked, non-ignored summaries fail closed. The
validator also rejects files outside the repository, reparse points, oversized
JSON, unknown schema fields, raw sensitive-field names, bearer/JWT-shaped
values, and origin paths containing query or fragment data.

Schema version `1` records an exact full `source_sha`, UTC capture time,
`sanitized: true`, and both `playwright-mcp` and `chrome-devtools-mcp` run IDs.
Every required case/viewport row must be `passed`, have at least one assertion,
and have zero failed assertions; the root assertion count must equal the row
sum. P6 covers the guest/unverified/verified/administrator shell at 1440×900,
768×1024, and 320×800, plus the retained swap and account-security boundaries.
P7 and P8 use their authorization/resource and builder/execution matrices at
1440×900. P9 repeats its accessibility, keyboard, form/error, dialog, route,
and performance summaries at all three viewports. The exact stable case IDs are
the source-controlled contract in `scripts/assert-browser-evidence.ps1`.

Expected HTTP failures are safe only when the allowlist and observation use the
same case ID, method, origin-relative path template, 4xx status, and problem
code. Every allowlisted tuple must be observed, and every observed negative must
be allowlisted. Unexpected failures/500s, console errors, uncaught exceptions,
page errors, detected secrets, cross-tenant leaks, and cross-origin leaks must
all be zero.

P6 additionally requires adjacent, repository-known revisions A and B. Its OCI
labels and shell/static response-header summaries must equal the corresponding
full revision, proxied responses must remain unstamped, and the summary retains
only sanitized initial/final asset paths. The retained A tab must keep its
recovery marker, the final page must expose the B marker, and the run must record
exactly one document reload and one allowlisted old-chunk JavaScript 404 with no
loop. These are validation rules for captured evidence, not a substitute for
running the two-image browser swap. Exercise the fail-closed schema itself with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts/test-browser-evidence-contract.ps1
```

## Phase 9 browser-quality and performance gate

Run the accessibility matrix against the isolated TestOps E2E profile after
the candidate services are healthy:

```powershell
npm --prefix frontend run e2e -- e2e/accessibility-matrix.spec.ts --project=chromium
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-performance.ps1 `
  -ProjectName testops-m10a-gate
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/assert-browser-evidence.ps1 -Phase P9
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-defect-ledger.ps1
```

The matrix has 18 case-viewports across `1440×900`, `768×1024`, and
`320×800`. It covers keyboard/focus, forms and errors, dialogs, clipping,
navigation, and automated accessibility. The performance contract combines
the twelve sanitized Chromium route records with two Chrome DevTools MCP
readiness captures. It fails closed unless every record meets accessibility
≥95, LCP ≤2500 ms, and CLS ≤0.1 and the source revision equals `HEAD`.

## Phase 10 candidate publication gate

After committing the exact candidate and pushing the branch, keep the existing
PR draft and run the final validators:

```powershell
$sha = git rev-parse HEAD
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-release-runtimes.ps1 -ExpectedRevision $sha
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-consecutive-ci.ps1 -Count 2 -ExpectedRevision $sha
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-pr-state.ps1 -Number 3 -ExpectedRevision $sha
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-plan-ready.ps1 -PlanId testops-m10a-completion-20260823
```

The runtime validator uses only the isolated `testops-m10a-final-normal` and
`testops-m10a-final-qa` Compose projects. The CI validator requires successful
`frontend`, `backend`, `containers`, `e2e`, `e2e-local-disabled`, and
`e2e-browser-crash` jobs in two completed runs of the same SHA. The PR remains
open and draft; no merge or deployment is part of this gate. The aggregate
Playwright matrix excludes the retained revision-A/B test; run the dedicated
retained-swap command above for that two-image boundary.

## QA ownership rules

- Use the two `[QA]` TestOps projects and prefix generated names with `[QA-RUN-<date>]`.
- Do not archive, rename, or remove non-QA records.
- Do not delete volumes during browser QA.
- Use only the dedicated ecommerce E2E volume for reset, migration, and concurrency suites.
- Raw Chrome/Playwright evidence belongs in ignored `qa-artifacts/` or `.playwright-mcp/`.

## Reading a failure

1. Record the application revision and role.
2. Capture the browser request method/status and correlation ID; omit authorization/cookie values.
3. Search backend logs by correlation ID.
4. Add a defect to `docs/testing/24-defect-ledger.md` with expected/actual behavior and a regression layer.
5. Update `docs/testing/23-quality-gate-baseline.md` from BLOCKED/PARTIAL to PASS or FAIL only when evidence exists.

## Safe shutdown

```powershell
.\scripts\teardown-quality-gate.ps1 `
  -ProjectName testops-quality-gate `
  -ComposeFiles @('docker-compose.yml', 'docker-compose.qa.yml')
```

This stops only the named TestOps QA project and preserves its named database
and artifact volumes. Add `-RemoveVolumes` only for an explicitly disposable
gate project. Ecommerce can remain running for target testing.
