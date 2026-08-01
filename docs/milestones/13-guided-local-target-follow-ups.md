# Guided local-target testing: a beginner’s guide

This guide explains the three pieces that make local website testing safe and usable: browser-based target checks, structured platform metadata, and the editable case builder. It is written for someone who has not used Docker networking or Playwright before.

## The short version

TestOps runs inside a backend container. Your website on `http://localhost:3001` runs on the host computer. Those two meanings of “localhost” are different:

```text
Your browser                    Docker host                    Backend container
localhost:3001  ───────────────► storefront                     TestOps API
                                                                  │
                                                                  └─ host.docker.internal:3001
```

When local development mode is enabled, TestOps keeps the logical browser URL as `http://localhost:<port>` but maps the connection to `host.docker.internal:<port>`. This keeps same-origin cookies and URL assertions correct while allowing the container to reach the host website.

The safety rule is deliberately strict:

1. `TARGET_LOCAL_DEV_ENABLED` must be `true`.
2. The exact `http://localhost:<port>` origin must appear in `TARGET_ALLOWED_ORIGINS`.
3. The worker may not navigate to another origin, `127.0.0.1`, a private LAN address, or an unlisted port.

## Configure the local bridge

In `backend/.env` (or the environment section of Compose), use:

```dotenv
TARGET_ALLOWED_ORIGINS=http://localhost:3001
TARGET_LOCAL_DEV_ENABLED=true
TARGET_LOCAL_DEV_HOST_ALIAS=host.docker.internal
```

The default for the feature flag is `false`. Production should leave it disabled unless a deployment explicitly provides a safe host mapping and an allowlisted development target.

Recreate the backend after changing these values so Spring Boot rereads the environment:

```bash
docker compose up -d --build backend
```

On Linux or CI, the Compose service includes:

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

This makes the host alias resolve even when Docker does not provide it automatically.

## How a target check works

Target checking is not a plain server-side `curl`. The backend opens a new Playwright browser context, navigates to the target root, and closes that context immediately. The check records only:

- `REACHABLE`, `UNREACHABLE`, or `BLOCKED`;
- the HTTP status when a response exists;
- a sanitized reason code;
- the check timestamp.

It never stores HTML, page text, cookies, or screenshots.

The browser is launched once by the managed Chromium component. Each check and each execution gets a separate context, which prevents cookies, local storage, and service workers from leaking between tests.

Target check outcomes:

| Status | Meaning | What to do |
|---|---|---|
| `NOT_CHECKED` | No check has been run since creation or the target changed. | Open the project and choose **Check connection**. |
| `REACHABLE` | The root page returned a successful response. | Continue with a suite and case. |
| `UNREACHABLE` | The port, host alias, service, or HTTP response failed. | Confirm the website is running and that the port is reachable from Docker. |
| `BLOCKED` | The target is not safe or not configured. | Check the exact allowlist entry and local-development flag. |

## Create a project

1. Register and verify your TestOps account.
2. Open **Projects**.
3. Choose **New project**.
4. Enter a project name.
5. Select the exact target origin, such as `http://localhost:3001`.
6. Create the project.
7. On the project overview, choose **Check connection**.

The target selector is driven by `/api/v1/platform/options`. Each origin includes:

- `origin`: the value to store in the project;
- `type`: `EXTERNAL` or `LOCAL_DEVELOPMENT`;
- `usable`: whether the current configuration allows it;
- `blockedReason`: a safe explanation when it is disabled.

The old `targetAllowedOrigins` array remains in the response for compatibility, but new UI code should use `targetOrigins`.

## Create your first smoke case

From the project overview:

1. Open **Suites**.
2. Create a suite such as `Homepage`.
3. Choose **New case**.
4. Select **Homepage smoke**.
5. Complete the three stages:

   - **Details**: name, description, priority, and retry count;
   - **Steps**: edit actions, locators, values, and timeouts;
   - **Review**: confirm the ordered steps before saving.

The template is:

| Position | Action | Value |
|---:|---|---|
| 1 | `NAVIGATE` | `/` |
| 2 | `ASSERT_VISIBLE` | `TEXT` = `Danh mục sản phẩm` |
| 3 | `TAKE_SCREENSHOT` | current page |

The builder uses the action definitions returned by the backend. This means the UI knows which fields apply to each action instead of keeping a second, potentially stale list of rules.

Use the controls on each step to:

- add a step;
- duplicate a step;
- move it up or down;
- remove it;
- choose a semantic locator such as `ROLE`, `LABEL`, `TEXT`, or `PLACEHOLDER`.

For `ROLE`, choose a supported ARIA role such as `BUTTON`, `LINK`, `HEADING`, or `TEXTBOX`.

## Save modes

The builder has three explicit outcomes:

- **Save draft**: stores the case as `DRAFT`. It is useful while the definition is incomplete.
- **Save as READY**: validates the definition and stores a runnable case.
- **Save & run**: validates, stores the case as `READY`, queues it, and opens the new execution.

A READY case must:

- contain at least one step;
- begin with `NAVIGATE`;
- provide every field required by the selected action;
- use a valid timeout and locator role.

If saving succeeds but queueing fails, the builder keeps the saved case link visible. You can open that case and retry without losing the definition.

## Read an execution

Queueing returns HTTP `202 Accepted` with an execution ID. The UI navigates directly to the run detail page while the worker processes it.

The detail page separates:

- execution status (`QUEUED`, `RUNNING`, `PASSED`, `FAILED`, or `ERROR`);
- target and browser snapshots;
- the failing step position;
- per-step status and duration;
- sanitized failure text;
- infrastructure categories such as network, DNS policy, worker timeout, and browser startup;
- screenshots and Playwright traces.

An assertion failure is a product result. A blocked target or browser crash is an infrastructure result. Treating them separately keeps a target outage from looking like a storefront regression.

## Troubleshooting

### The target is `BLOCKED`

Check all three values:

```dotenv
TARGET_ALLOWED_ORIGINS=http://localhost:3001
TARGET_LOCAL_DEV_ENABLED=true
TARGET_LOCAL_DEV_HOST_ALIAS=host.docker.internal
```

The port must match exactly. `http://localhost:3001/` normalizes to the same origin, but `http://localhost:3002` does not. `127.0.0.1` is intentionally rejected.

### The target is `UNREACHABLE`

Confirm the storefront is running on the host:

```bash
curl -I http://localhost:3001
```

Then confirm the backend container can resolve the host alias. Recreate the backend after changing Compose or environment values:

```bash
docker compose up -d --build backend
docker compose logs -f backend
```

### The case cannot become READY

The first step must be `NAVIGATE`, and every action must have the fields shown by the builder. For example, `FILL` needs a locator and input value; `ASSERT_TEXT_CONTAINS` needs a locator and expected value.

### A run fails at navigation

Relative paths such as `/checkout` stay on the project origin. Absolute URLs to another origin are rejected. This is expected: a test may not escape its project target through a step.

### A locator fails

Prefer semantic locators in this order:

1. `ROLE` for buttons, links, headings, and controls;
2. `LABEL` for form fields;
3. `PLACEHOLDER` when the placeholder is stable;
4. `TEXT` for visible, stable text;
5. `TEST_ID` when the target site provides test IDs;
6. `CSS` or `XPATH` only when semantic locators are not possible.

### The screenshot is missing

Screenshots are suppressed for secret-bearing cases. For ordinary cases, a successful `TAKE_SCREENSHOT` step is persisted with its step position and appears in the execution detail page. A failed run may also include a final failure screenshot when the case is not secret-bearing.

## Negative checks included in the repository

The Playwright suite covers:

- an allowlisted but offline localhost port;
- a suite with no READY cases;
- a failing assertion with a highlighted failed step;
- cross-origin navigation rejection;
- local origins shown as disabled when the local bridge is off.

The enabled local-target stack is defined in `docker-compose.e2e.yml`. The disabled-mode stack uses `docker-compose.e2e-local-disabled.yml` and separate host ports so both modes can be tested without changing a running environment.

Run the enabled acceptance stack:

```bash
docker compose -p testops-e2e -f docker-compose.yml -f docker-compose.e2e.yml up -d --build
set E2E_BASE_URL=http://127.0.0.1:3100
set MAILPIT_URL=http://127.0.0.1:8025
frontend\node_modules\.bin\playwright.cmd test
```

Run the local-disabled check separately:

```bash
docker compose -p testops-e2e-disabled -f docker-compose.yml -f docker-compose.e2e.yml -f docker-compose.e2e-local-disabled.yml up -d --build
set E2E_DISABLED_BASE_URL=http://127.0.0.1:3101
set MAILPIT_URL=http://127.0.0.1:8026
frontend\node_modules\.bin\playwright.cmd test local-target-disabled.spec.ts
```

The exact ports may be changed if another local service already uses them. Keep the frontend, backend, Mailpit, and target-site ports internally consistent when you do so.

## Where the implementation lives

| Concern | Source |
|---|---|
| Managed Chromium and host mapping | `backend/src/main/java/com/megumi/testops/execution/runner/ManagedChromium.java` |
| Browser target check | `backend/src/main/java/com/megumi/testops/project/service/TargetProbe.java` |
| Origin policy | `backend/src/main/java/com/megumi/testops/project/service/ProjectTargetPolicy.java` |
| Origin/action metadata | `backend/src/main/java/com/megumi/testops/shared/api/PlatformOptionsController.java` |
| Editable builder | `frontend/src/features/projects/GuidedCasePage.tsx` |
| E2E fixture and scenarios | `frontend/e2e/` |
| Database target-health fields | `backend/src/main/resources/db/migration/V016__guided_local_target_testing.sql` |

The source code is the final authority if this guide and the UI disagree. When changing an action, origin rule, or environment variable, update the backend validation, frontend metadata consumer, E2E scenario, and this guide together.
