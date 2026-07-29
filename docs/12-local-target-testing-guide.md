# Local target testing guide

Milestone 7 lets a TestOps worker running in Docker test a development website running on the host machine. The browser keeps the logical URL (`http://localhost:<port>`), while Chromium resolves that host to Docker's `host.docker.internal` gateway.

## Configure the bridge

Add these values to `backend/.env` (never production):

```dotenv
TARGET_ALLOWED_ORIGINS=http://localhost:3001
TARGET_LOCAL_DEV_ENABLED=true
TARGET_LOCAL_DEV_HOST_ALIAS=host.docker.internal
```

Recreate the backend after changing environment values:

```bash
docker compose up -d --force-recreate backend
```

The feature is fail-closed: localhost is rejected unless both the feature flag is enabled and the exact origin (including port) is allowlisted. `127.0.0.1`, private/LAN addresses, and cross-origin navigation remain blocked. Compose adds `host.docker.internal:host-gateway` for Linux and CI.

Check the transport from the container when troubleshooting:

```bash
docker exec testops-platform-backend-1 wget --spider http://host.docker.internal:3001/
```

The target site must return a response on the host port. TestOps stores only health status, response status, time, and a sanitized reason; it never stores page content.

## First successful run

1. Open `http://localhost:3000`, register, and verify the email OTP.
2. Open **Projects → New project** and choose the exact `http://localhost:3001` origin.
3. Open the project and select **Check connection**. Continue only when health is `REACHABLE`.
4. Open **Suites**, create a suite, and choose **New case**.
5. Select **Homepage smoke**. It creates `NAVIGATE /`, `ASSERT_VISIBLE` with locator `TEXT = Danh mục sản phẩm`, and `TAKE_SCREENSHOT`.
6. Review the steps and choose **Save as READY**. READY cases must have at least one step and start with `NAVIGATE`.
7. Queue the case or suite. TestOps returns a run id and opens the run detail page.
8. Inspect each step's status, duration, failure message, and any screenshot or Playwright trace. Screenshot steps are linked to their step position.

## Authoring guidance

Use semantic locators (`ROLE`, `LABEL`, `TEXT`, `PLACEHOLDER`, or `TEST_ID`) before CSS/XPath. The action selector shows only the fields that matter for the selected action. Use **Duplicate**, reorder, and remove controls to refine a case. Save drafts while a scenario is incomplete; only READY cases can be queued.

## Troubleshooting

| Symptom | Check | Recovery |
|---|---|---|
| Target is `UNREACHABLE` | Host process, port, and the container `wget` command | Start the site, use the host port, and recreate `backend` |
| Target is `BLOCKED` | Exact allowlist entry and `TARGET_LOCAL_DEV_ENABLED` | Add `http://localhost:<port>` exactly and enable only for local development |
| No READY cases | Case status or missing first navigation | Open the case, add steps, start with `NAVIGATE`, then save READY |
| Locator failure | Role/name, text, placeholder, and page language | Prefer a stable semantic locator; run again after checking the target manually |
| Worker disabled | `EXECUTION_WORKER_ENABLED` and backend health | Enable the worker and restart the backend |
| Missing artifact | Secret interpolation or purged retention data | Remove secret-bearing screenshot inputs and check artifact retention/storage |

Production should keep `TARGET_LOCAL_DEV_ENABLED=false` and must not allow localhost origins.
