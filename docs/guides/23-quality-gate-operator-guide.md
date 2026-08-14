# Quality-gate operator guide

## What this setup does

The quality-gate overlay gives beginners a repeatable TestOps role matrix without putting passwords in source control. It also labels every application image with the Git revision that produced it, preventing browser observations from being attributed to newer source than the running containers.

`scripts/verify-doc-links.ps1` checks the root/index links and the new `docs/guides`, `docs/testing`, and `docs/workflows` quality-gate documents. Older walkthroughs predate the documentation-folder refactor and are outside this focused link gate until their historical relative links are migrated.

The overlay adds a TestOps-only Mailpit instance on `http://localhost:8027`. It does not replace the ecommerce isolated E2E Mailpit on `8025`, and it does not reset either normal database.

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
docker compose -f docker-compose.yml -f docker-compose.qa.yml down
```

This stops the TestOps QA overlay but preserves named database and artifact volumes. Ecommerce can remain running for target testing.
