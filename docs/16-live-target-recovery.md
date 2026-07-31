# Recovering a blocked local target

This guide explains the failure shown on the **Ecommerce** project when the
`Homepage smoke` case failed before its first step:

> `TARGET_UNREACHABLE` — Navigation URL is outside the project target origin
> or resolves to a private address

The failure was not caused by the storefront’s HTML or by the `Danh mục sản
phẩm` assertion. The execution worker rejected `http://localhost:3001/` at
the navigation safety gate because local-target development was disabled in
the TestOps backend environment.

## The mental model

There are two different meanings of `localhost` in this setup:

| Where the request starts | `localhost:3001` means |
| --- | --- |
| Your browser | The ecommerce frontend published by Docker on your Windows host. |
| The TestOps backend container | Port 3001 inside the backend container, not your host. |

The browser must keep seeing `http://localhost:3001` so that cookies, origin
checks, and relative links behave like a normal local site. The managed
Chromium process therefore keeps that logical URL while Docker routes its
traffic through `host.docker.internal`, which resolves to the host machine.
The bridge is deliberately fail-closed: it only works when the feature flag is
enabled **and** the exact localhost origin is allowlisted.

## Correct local configuration

Edit the ignored file `backend/.env` (never commit it) and set the three
values together:

```dotenv
TARGET_ALLOWED_ORIGINS=http://localhost:3001
TARGET_LOCAL_DEV_ENABLED=true
TARGET_LOCAL_DEV_HOST_ALIAS=host.docker.internal
```

The value must be an origin, not a path. A trailing slash is normalized by the
policy, but the no-slash form is the canonical value to enter in the project
form. These examples make the important differences visible:

```text
Accepted but noncanonical: http://localhost:3001/
Wrong:  http://127.0.0.1:3001
Wrong:  http://localhost:3000
Right:  http://localhost:3001
```

Keeping the canonical form avoids confusion when comparing project and
platform values. `127.0.0.1`, LAN addresses, arbitrary private IPs, and
unlisted ports remain blocked by design.

## Recreate the backend

Environment variables are read when the container starts. Editing `.env`
without recreating the backend leaves the old value in the running JVM.

From `D:\Projects\testops-platform`:

```powershell
docker compose up -d --force-recreate backend
docker compose ps
docker compose logs --tail=80 backend
```

Wait for the backend status to become `healthy`. The host mapping is already
declared in `docker-compose.yml`:

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

This declaration is important on Linux and in CI; Docker Desktop supplies the
name automatically on Windows and macOS, while the explicit mapping keeps the
Compose behavior portable.

## Verify the bridge before opening TestOps

The following check starts inside the TestOps backend container, so it proves
the same network path the execution worker will use:

```powershell
docker exec testops-platform-backend-1 `
  sh -lc "wget -qSO -O /dev/null http://host.docker.internal:3001/ 2>&1 | head -20"
```

Expected result:

```text
HTTP/1.1 200 OK
```

Also confirm the storefront is visible from the host browser at
`http://localhost:3001`. A host-browser success alone is not enough; the
container-side check catches the most common Docker networking mistake.

## Refresh target health in the project

1. Sign in with a verified TestOps account that has execution permission for
   the project.
2. Open **Projects → Ecommerce → Overview**.
3. Confirm the target is exactly `http://localhost:3001`.
4. Select **Check connection**.
5. Wait for **Connection check completed** and confirm target health changes to
   **REACHABLE** with HTTP status `200`.

The check uses an isolated Playwright browser context. It follows the target
root only, aborts cross-origin requests, records only a sanitized status,
response code, timestamp, and reason, and never stores page content.

If the button is not present, the account lacks `EXECUTION_START`. A project
viewer can see the saved health result but cannot run a new probe.

## Re-run the existing READY case

The current Ecommerce suite contains the READY case **Homepage smoke**. Its
intended steps are:

| Position | Action | Definition |
| ---: | --- | --- |
| 1 | `NAVIGATE` | `/` |
| 2 | `ASSERT_VISIBLE` | locator type `TEXT`, value `Danh mục sản phẩm` |
| 3 | `TAKE_SCREENSHOT` | no locator required |

After the target is **REACHABLE**:

1. Open **Suites → asd → Homepage smoke**.
2. Confirm the case is still **READY** and the first step is `NAVIGATE`.
3. Select **Run case** (or queue the suite).
4. Follow the run from **Executions** until it reaches `PASSED` or a new
   classified failure.
5. Open the run detail and inspect each step. A successful run should show
   three completed steps, non-zero durations, and a screenshot artifact tied
   to step 3.

The old run remains in history as an infrastructure `ERROR`; it is not edited
or relabeled. The new run is the evidence that the environment recovery
worked.

## How to read a failure

| Symptom | Meaning | Recovery |
| --- | --- | --- |
| `local_target_disabled` or target health `BLOCKED` | The flag is false in the running backend, or the origin is not allowlisted. | Check all three environment values and recreate `backend`. |
| `target_not_allowed` | The project origin and allowlist do not match exactly. | Use `http://localhost:3001` in both places. |
| `TARGET_UNREACHABLE` with no HTTP status | The backend container cannot connect to the host target, or the target timed out. | Run the `docker exec … wget` probe, then inspect ecommerce container health and logs. |
| HTTP `4xx`/`5xx` from target check | The storefront or its proxy responded with an error. | Open `http://localhost:3001` in the browser and inspect the ecommerce logs; this is a target failure, not a TestOps navigation-policy failure. |
| `unsafe_target_url` at `NAVIGATE` | The step resolves outside the approved origin or points at a private/unlisted host. | Use `/` or another path on the same approved origin; do not use `127.0.0.1`, an IP, or a second port. |
| Assertion failure on `Danh mục sản phẩm` | The target loaded, but the storefront content changed or did not render. | Inspect the screenshot and console/resource evidence, then update the case locator only after confirming the UI change. |
| Screenshot missing | The step failed before the screenshot or evidence was suppressed by a genuine secret-variable use. | Fix the earlier step first; `TAKE_SCREENSHOT` stores a successful image and associates it with its step position. |

## What was verified during this recovery

On 31 July 2026 the running services were healthy, the backend environment
contained the local bridge flag and alias, and the backend container fetched
`http://host.docker.internal:3001/` with `HTTP/1.1 200 OK`. The original
execution record still correctly reports the historical `TARGET_UNREACHABLE`
failure; it is preserved for audit history. The final authenticated **Check
connection** and rerun must be performed from the project workspace because
those operations require the project member’s session.

## Safety boundaries

- Keep `TARGET_LOCAL_DEV_ENABLED=false` in production.
- Never add `127.0.0.1`, a private network range, or a broad wildcard to the
  target allowlist.
- Do not put SMTP credentials, JWT keys, access tokens, or storefront account
  passwords in this guide or in Git.
- Do not “fix” the old run by editing PostgreSQL. Target health and execution
  history are application-owned state; use the target-check and queue APIs.

## Where to verify the implementation

- Target policy: `backend/src/main/java/com/megumi/testops/project/service/ProjectTargetPolicy.java`
- Isolated target probe: `backend/src/main/java/com/megumi/testops/project/service/TargetProbe.java`
- Target-check API: `backend/src/main/java/com/megumi/testops/project/service/TargetCheckService.java`
- Navigation guard: `backend/src/main/java/com/megumi/testops/execution/runner/ExecutionTargetGuard.java`
- Compose host mapping: `docker-compose.yml`
- Existing smoke case definition: the Ecommerce project’s `Homepage smoke` case in the TestOps database/API
