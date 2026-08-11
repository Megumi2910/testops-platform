# Dashboard PostgreSQL regression gate

## Purpose

This gate proves the dashboard reporting contract on the same database engine used by TestOps. It complements fast `DashboardServiceTest` mocks with migrated-schema, real-SQL evidence.

The gate is isolated. It creates an auto-removed PostgreSQL container on a Docker-assigned loopback port, migrates its empty schema through V021, runs the backend unit suite and `ApplicationContextIT`, and stops only the generated container. It never connects to or resets the normal development database.

## Run it

From the TestOps repository root on Windows:

```powershell
.\scripts\verify-dashboard-postgres.ps1
```

Requirements:

- Docker Desktop is running;
- Java 21 is available to the Maven wrapper;
- no database credentials are required from the operator.

The fixed `testops_it` username/password exists only inside the disposable loopback container. It is not an application or fixture secret.

## Why the test harness accepts an external database

`ApplicationContextIT` normally starts its own Testcontainers PostgreSQL instance, which is how GitHub Actions runs it. Some Windows shells cannot open Docker Desktop's Testcontainers named pipe even though Docker CLI commands work.

When all three variables below are present, `ApplicationContextIT` uses that explicitly supplied database instead of starting another container:

```text
TEST_DATABASE_URL
TEST_DATABASE_USERNAME
TEST_DATABASE_PASSWORD
```

The verification script owns these values and points them only at the disposable container. Partial configuration is not supported: without `TEST_DATABASE_URL`, the test returns to managed Testcontainers behavior.

## Fixture design

The dashboard integration fixture creates:

- one reporting member and one outsider;
- one visible project with member access;
- one hidden project owned by the outsider;
- one execution exactly at the inclusive `from` boundary;
- 55 visible infrastructure-error executions inside the window;
- one hidden-project error inside the window;
- one visible-project error exactly at the exclusive `to` boundary.

Expected results:

| Read | Expected proof |
| --- | --- |
| Summary | 56 visible executions, 1 passed case, 55 errors; hidden and end-boundary rows excluded |
| Trends | One UTC day bucket with all 55 visible errors |
| Recent failures | Exactly 50 rows, all belonging to the visible project |
| Infrastructure categories | `TARGET_UNREACHABLE = 55`, proving the category total is not truncated to 50 |

## Business rules protected

- A non-administrator sees only projects where they have a membership row.
- A project filter never expands the caller's tenant scope.
- Date ranges are half-open: `from` is inclusive and `to` is exclusive.
- Reporting days are UTC days.
- Diagnostic cards are bounded independently from full-window aggregates.
- Historical case names and identifiers come from result snapshots/relationships without loading a live entity graph per row.

## Failure interpretation

### Docker cannot start

Start Docker Desktop and rerun the script. The script asks Docker for a free loopback port, so it does not require port 5432 or another fixed host port.

### Flyway fails

Treat this as a schema compatibility failure. Run the migration upgrade test and inspect the newest migration before changing the dashboard SQL.

### The recent count is not 50

Confirm `DashboardService.RECENT_FAILURE_LIMIT` and the repository's `setMaxResults` still agree. Do not solve this by truncating category results.

### The category count is 50 instead of 55

The category endpoint has regressed to using the recent-failure preview. It must call the independent grouped query across the complete filter window.

### Cleanup after interruption

The container uses Docker `--rm`, and the script's `finally` block stops the exact generated name. If the PowerShell process is terminated forcefully, list containers whose name begins with `testops-dashboard-it-`, verify the target, and stop that exact disposable container. Do not remove TestOps development containers or volumes.

## Verified result

On 2026-08-11 the script passed 82 unit/package tests and 6 `ApplicationContextIT` tests against a clean PostgreSQL 18.4 schema migrated through V021. The generated container was removed after the run.
