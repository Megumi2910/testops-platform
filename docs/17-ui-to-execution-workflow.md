# UI-to-execution workflow

TestOps is a managed browser-testing platform. A person starts in a React
screen, but the useful result is not the screen itself: it is a durable,
permission-checked test definition and an execution record that can be
explained later. This document follows one request all the way through the
browser, HTTP API, service layer, PostgreSQL, Playwright worker, target site,
and evidence store.

The browser owns interaction state. Spring owns authorization, validation,
irreversible writes, queue ownership, and result classification. PostgreSQL
is the source of truth for identities, projects, definitions, execution
metadata, and evidence metadata; binary screenshots and traces live under the
configured artifact directory.

## 1. Runtime map

| Boundary | Current location | Responsibility |
| --- | --- | --- |
| Browser client | `frontend/src/main.tsx`, `frontend/src/app/router.tsx`, `frontend/src/components/` | Mount React, select a route, render accessible controls, and keep transient form/query state. |
| Frontend feature | `frontend/src/features/auth/`, `projects/`, `executions/`, `dashboard/`, `system-health/` | Own a user-facing capability, its API functions, queries, mutations, loading states, and tests. |
| Frontend transport | `frontend/src/lib/api.ts` | Same-origin `fetch`, in-memory access JWT, refresh-cookie rotation, one retry after `401`, and normalized `ApiError`. |
| Spring HTTP boundary | `backend/src/main/java/com/megumi/testops/*/api/` | Parse/validate request DTOs, obtain the authenticated JWT, and delegate to a service. Controllers do not implement domain policy. |
| Domain service | `auth/service`, `project/service`, `execution/service`, `dashboard/service` | Enforce business rules, transactions, permissions, snapshots, state transitions, and repository calls. |
| Persistence | `*/domain/`, `*/repository/`, `backend/src/main/resources/db/migration/` | JPA entities represent current state; repositories query it; Flyway owns schema changes. |
| Browser worker | `execution/runner/`, `execution/service/ExecutionWorker.java` | Claim queued work, launch one managed Chromium process, create isolated contexts, execute safe steps, and persist outcomes. |
| Evidence | `execution/runner/ArtifactWriter.java`, `artifacts/` volume, `execution_artifacts` table | Store screenshot/trace bytes outside PostgreSQL and searchable metadata inside it. |
| Target | External/ecommerce site, normally `http://localhost:3001` | The application under test. TestOps does not own its products, users, database, or deployment. |

## 2. Startup and request wiring

### 2.1 Compose startup

`docker-compose.yml` starts PostgreSQL first, then the backend, then the
frontend. The backend health check calls `/actuator/health`; the frontend waits
for the backend health condition. Flyway runs during Spring startup and JPA is
configured with `ddl-auto: validate`, so Java mappings are checked against
versioned SQL instead of silently changing the schema.

The browser reaches TestOps at `http://localhost:3000`; Docker maps that host
port to the frontend container. The frontend container proxies `/api/` to the
backend service. The execution worker is inside the backend container, so its
`localhost` is not the host browser. Local target mode keeps the logical URL
`http://localhost:3001` but maps it to `host.docker.internal` in Chromium.

### 2.2 React bootstrap

`frontend/src/main.tsx` performs four operations:

1. import global CSS;
2. create a React root;
3. wrap the tree in `AppProviders` from `frontend/src/app/providers.tsx`;
4. give `RouterProvider` the lazy route tree from `frontend/src/app/router.tsx`.

`AppProviders` composes TanStack Query’s `QueryClientProvider` and the
feature-level `AuthProvider`. This is intentionally small: data fetching is
shared, while domain state remains in the feature that owns it.

`AuthProvider` bootstraps by calling `/api/v1/auth/providers`. If authentication
is enabled, it then calls `/api/v1/auth/refresh`; the access JWT is kept in
module memory by `frontend/src/lib/api.ts`, while the refresh token is an
HttpOnly cookie. A reload therefore restores a session without placing a long-
lived token in `localStorage`.

### 2.3 Route selection

`frontend/src/app/router.tsx` uses `createBrowserRouter` and lazy imports. The
route is selected before a page module is loaded, which keeps the initial
bundle small. `ProtectedRoute` requires a user; `VerifiedRoute` additionally
requires `emailVerified` and redirects an unverified account to the recovery
verification page.

The project route is a layout route:

```text
/projects/:projectId                 ProjectLayout
  /                                   ProjectOverviewPage
  /suites                             SuitesPage
  /suites/:suiteId                    SuitePage
  /suites/:suiteId/cases/new          GuidedNewCasePage
  /suites/:suiteId/cases/:caseId     CasePage
  /variables                          VariablesPage
  /members                            MembersPage
  /executions                         ExecutionsPage
  /executions/:executionId            ExecutionDetailPage
```

`ProjectLayout` loads the project once, then exposes `project`, `root`,
permissions, target health, and onboarding counts through React Router outlet
context. Child links are absolute paths built from `root`; this prevents the
old `/suites/suites/...` navigation defect.

## 3. Account workflow

### 3.1 Register

**UI:** `features/auth/AuthPages.tsx` → `RegisterPage`
**Request:** `POST /api/v1/auth/register`
**Controller:** `auth/api/AuthController.register`
**Service:** `auth/service/AuthService.register`
**Tables:** `users`, local credentials, `email_verification_challenges`, audit events

The form submits display name, email, and password. The service normalizes the
email, applies the registration rate limit, rejects duplicates, creates an
active but unverified user, hashes the password with BCrypt, creates a hashed
OTP challenge, and sends the code through `EmailDeliveryService`. The raw OTP
is never persisted.

The endpoint returns `202 Accepted`, not a session. The UI moves to
`/verify-email?email=...` and waits for the code. If delivery fails, the
challenge records a failed delivery attempt and the request surfaces an
actionable error rather than pretending registration succeeded.

### 3.2 Verify

**UI:** `VerifyEmailPage`
**Request:** `POST /api/v1/auth/email/verify`
**Service:** `AuthService.verifyEmail`

The service loads the newest unconsumed registration challenge, checks expiry
and the peppered OTP hash, increments failed attempts on invalid input, and
invalidates a challenge after the attempt limit. A valid code consumes the
challenge, marks the user verified, increments `token_version`, revokes old
refresh sessions, writes an audit event, and issues an access JWT plus a
rotating refresh cookie.

### 3.3 Login and the unverified-account path

**UI:** `LoginPage`, `AppShell` verification banner
**Request:** `POST /api/v1/auth/login`
**Service:** `AuthService.login`

Login deliberately accepts an active unverified account so that the person can
recover verification after leaving the OTP screen. The frontend stores the
returned user summary, `AppShell` renders a permanent `role="status"` banner,
and the **Verify now** link goes to `/verify-email?email=...&recover=1`.
`VerifyEmailPage` can resend a fresh code on that recovery path. The account
does not enter `VerifiedRoute`, so projects, dashboard, and admin writes remain
locked until verification succeeds.

### 3.4 Refresh and logout

`api.ts` attaches the in-memory bearer token to API calls. A `401` triggers one
deduplicated refresh request; concurrent failures share `refreshPromise` rather
than sending a refresh storm. The backend rotates the refresh token and emits
a new access JWT. Logout revokes the refresh cookie server-side, clears the
cookie, and clears the in-memory token in `AuthProvider`.

## 4. Project onboarding workflow

### 4.1 List and create

**UI:** `features/projects/ProjectPages.tsx`
**Requests:** `GET /api/v1/projects`, `GET /api/v1/platform/options`, `POST /api/v1/projects`
**Services:** `ProjectService`, `PlatformOptionsController`

The list query is paginated and search-aware. A verified active account with
`PROJECT_CREATE` can open `/projects/new`. Platform options provide the target
allowlist and structured origin metadata; the form never invents its own origin
list.

`ProjectService.create` checks that the allowlist is configured, verifies the
platform permission, normalizes the name, rejects duplicate names, validates
the exact target origin with `ProjectTargetPolicy`, creates the project, adds
the creator as `PROJECT_MANAGER`, and records `PROJECT_CREATED`.

### 4.2 Target check

**UI:** `ProjectOverviewPage` → **Check connection**
**Request:** `POST /api/v1/projects/{projectId}/target-check`
**Service:** `TargetCheckService` → `TargetProbe`

The project member must have `EXECUTION_START`. `ProjectTargetPolicy` accepts
only HTTP(S) origins without credentials, paths, query strings, or fragments.
`localhost` additionally requires `TARGET_LOCAL_DEV_ENABLED=true` and an exact
allowlist entry. Literal loopback, link-local, site-local, multicast, and
unlisted private addresses are rejected.

`TargetProbe` creates a fresh Playwright `BrowserContext`, routes navigation
requests through a same-origin guard, opens only the target root, and returns
sanitized reachability, status code, and reason. It never stores page content.
The project records `NOT_CHECKED`, `REACHABLE`, `UNREACHABLE`, or `BLOCKED` in
the V016 columns. A target change resets the health result so stale success is
not presented as current.

### 4.3 Project permissions

`ProjectAccessService` turns the JWT subject into a user, resolves membership,
and rejects missing membership before a service performs a write. Global
admins bypass project-role checks. The response also contains a permission
set, which the frontend uses to hide or disable controls, but the backend
always enforces the rule again.

| Project role | Typical capabilities |
| --- | --- |
| `PROJECT_MANAGER` | Update/archive project, manage members/variables/definitions, check target, queue/cancel runs. |
| `TEST_MANAGER` | Manage suites/cases, check target, queue runs, cancel own runs. |
| `TESTER` | View definitions and queue/cancel own runs. |
| `VIEWER` | View project, definitions, executions, and artifacts. |
| Global `ADMIN` | All project permissions, plus platform user administration. |

## 5. Definition workflow

### 5.1 Suite creation

**UI:** `SuitesPage`
**Request:** `POST /api/v1/projects/{projectId}/suites`
**Service:** `DefinitionService.createSuite`
**Tables:** `test_suites`

The form uses `react-hook-form` plus a Zod schema for immediate length and
required-field feedback. The service trims the name, checks the project role,
rejects archived projects and duplicate names, then saves the suite.

### 5.2 Case builder stages

**UI:** `GuidedNewCasePage`, `GuidedStepEditor`
**Requests:** `GET /api/v1/platform/options`, `POST /api/v1/projects/{projectId}/suites/{suiteId}/cases`
**Service:** `DefinitionService.createCase`

The builder keeps three URL-addressable stages:

1. **Details** — choose `Homepage smoke`, `Search journey`, or `Blank case`; edit name, description, priority, tags, retry count, and data isolation.
2. **Steps** — edit action-specific fields from backend `stepActions` metadata; add, duplicate, reorder, and remove steps.
3. **Review** — see a compact summary and choose **Save draft**, **Save as READY**, or **Save & run**.

`caseBuilder.ts` gives each unsaved row a `clientId`. The client ID keeps the
correct validation message attached when rows move; it is not sent to the
backend. `serializeSteps` rewrites positions contiguously before the request.

The client validates the same high-risk rules as the service for fast
feedback, but the backend remains authoritative:

- a case can contain at most 100 steps;
- positions must be unique and contiguous starting at zero;
- supported actions and locator types come from `DefinitionService` metadata;
- locator actions require locator type and value;
- `NAVIGATE` requires an input URL/path;
- text/URL assertions require an expected value;
- a READY case must have at least one step and begin with `NAVIGATE`;
- legacy unqualified `WAIT` is rejected for READY cases.

### 5.3 Save & run semantics

The builder first creates the case with status `READY`, then queues that saved
case. If creation succeeds but queueing fails, the UI preserves the created
case ID and offers a recovery link instead of reporting that all work was
lost. Successful queueing navigates directly to the `202 Accepted` execution
resource.

## 6. Queue-to-worker workflow

### 6.1 Queue request

**UI:** `SuitePage` or case page
**Request:** `POST /api/v1/projects/{projectId}/suites/{suiteId}/executions` or
`POST /api/v1/projects/{projectId}/suites/{suiteId}/cases/{caseId}/executions`
**Service:** `ExecutionService.queueSuite` / `queueCase`
**Response:** `202 { executionId, status }` plus `Location`

The frontend generates a UUID `Idempotency-Key`. The service resolves the
project and suite, requires a runnable project role, rejects archived projects,
and for a case rejects any status other than `READY`. Suite queueing selects
only READY cases; an empty selection returns `no_ready_cases`.

The queue guard row is locked and incremented before creating an execution.
The database unique key `(project_id, idempotency_key)` makes a replay return
the existing execution instead of creating a duplicate. The execution row and
case-result rows are created in one transaction.

### 6.2 Worker claim and execution snapshots

`ExecutionWorker` claims queued work through `ExecutionClaimService`. The
execution stores the target origin, browser, suite name, and case-name
snapshots needed to explain what was requested. The worker does not trust the
browser page or UI state to classify a result.

Important current boundary: the target/suite/case-name metadata is snapshotted,
but `PlaywrightCaseRunner` currently loads the live `test_steps` rows when the
worker starts. Editing a case after queueing can therefore affect the step
definitions used by that run. Full immutable step-definition snapshots are a
planned hardening item; do not describe the current implementation as fully
immutable until a migration and runner input snapshot exist.

The bounded queue prevents unlimited browser launches. Heartbeats and stale
execution handling protect against a worker that exits mid-run. Cancellation
sets `cancel_requested_at`; the worker checks it between cases and finishes the
case/run as `CANCELLED`.

### 6.3 Managed Chromium and local targets

`ManagedChromium` creates one headless Chromium process and a new isolated
context per operation. When local development mode is enabled it adds:

```text
--host-resolver-rules=MAP localhost host.docker.internal
```

`ExecutionTargetGuard.resolve` resolves relative paths against the project
origin, requires same-origin navigation, rejects credentials and unsafe
private hosts, and permits localhost only through the explicit target policy.
This protects against a test step navigating from a safe target to a database,
metadata service, or another private port.

### 6.4 Step execution

`PlaywrightCaseRunner` loads the ordered `test_steps`, creates a context/page,
sets the default timeout and maximum run deadline, and executes each action.
Each successful or failed step produces a `StepOutcome` with position, action,
status, duration, and a sanitized message. A failure stops the case and records
the failing position.

Variables are interpolated in input values using `${KEY}`. Only non-secret
variables enter the runner map. A case that contains an interpolated value is
treated as secret-bearing by the current implementation, which suppresses
screenshots/traces to avoid accidental leakage.

### 6.5 Result and artifact persistence

`ExecutionRunService` translates runner results into `PASSED`, `FAILED`, or
`ERROR`:

- `FAILED` means a product assertion or locator behavior failed;
- `ERROR` means infrastructure, policy, browser, timeout, or target conditions
  prevented a trustworthy product verdict;
- `CANCELLED` means an explicit cancellation was observed.

`TestStepResultEntity` stores per-step status and duration. `ArtifactWriter`
writes screenshots and traces below the configured root, verifies the resolved
path cannot escape that root, computes SHA-256 metadata, and associates
screenshots with their step position. PostgreSQL stores metadata, not large
binary blobs.

## 7. Reading a run

**UI:** `ExecutionsPage` → `ExecutionDetailPage`
**Requests:** `GET /api/v1/projects/{projectId}/executions`, then detail and
artifact endpoints

The history endpoint returns lightweight summaries. While a run is queued or
running, the detail page polls every two seconds; terminal states stop polling.
The detail page presents:

1. aggregate passed/failed/error/cancelled counts;
2. infrastructure category and recovery guidance;
3. each case’s status, attempt count, failure step, and message;
4. every step’s status, duration, and sanitized error;
5. inline screenshot previews and trace downloads.

The old failed execution is intentionally retained. A corrected environment
creates a new execution so the audit trail shows both the outage and the
recovery.

## 8. Reporting workflow

`DashboardPage` requests summary, recent failures, and infrastructure
categories for the last 30 UTC days. `DashboardService` filters executions to
projects the user can access, counts case outcomes, separates functional pass
rate from infrastructure error rate, and groups recent failures by category.
Cancelled cases do not inflate the functional denominator.

## 9. Failure-path playbook

| Failure | First owner | What to inspect |
| --- | --- | --- |
| Login shows `Network Error` | Frontend transport/runtime | Browser `/api` request, frontend proxy, backend health, `ApiError` response. |
| Account can log in but cannot open projects | Auth + route guard | `emailVerified`, `VerifiedRoute`, verification banner, OTP delivery. |
| Target health `BLOCKED` | Target policy/config | Exact allowlist, local flag, backend recreation, host bridge. |
| Target check HTTP error | Target site/proxy | Ecommerce container health, target logs, root response code. |
| `no_ready_cases` | Case authoring | Case status, first step `NAVIGATE`, suite membership. |
| `unsafe_target_url` | Execution policy | Relative URL resolution, same-origin port, private-address rejection. |
| `locator_required`/`expected_value_required` | Builder + DefinitionService | Backend action descriptor and serialized step fields. |
| Queue returns `execution_queue_full` | Worker operations | Active count, worker enabled flag, stale execution recovery. |
| `ERROR` with `TARGET_UNREACHABLE` | Worker/target boundary | Target check, host alias, browser resolver rule, container reachability. |
| Screenshot absent | Runner/evidence | Earlier step status, secret-bearing suppression, artifact volume, retention. |

## 10. Trace any feature from UI to code

When debugging a feature, follow this order rather than searching randomly:

1. Find the route in `frontend/src/app/router.tsx`.
2. Find the page and its query/mutation in the matching `frontend/src/features/*` folder.
3. Find the request path in that feature’s `api.ts`.
4. Find the controller mapping in `backend/src/main/java/.../api`.
5. Find the service method called by the controller.
6. Find the entity/repository and Flyway migration that own the data.
7. If the feature is a run, continue to `execution/service`, `execution/runner`, and `ArtifactWriter`.
8. Find the nearest unit, MockMvc, integration, or Playwright test and reproduce the smallest failure path.

The companion [Feature implementation handbook](18-feature-implementation-handbook.md)
explains the syntax and design decisions used at each layer.
