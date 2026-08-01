# Feature implementation handbook

This handbook explains how the current TestOps code is written, not only what
the screens do. It is intended for a developer who is learning TypeScript,
React, Spring Boot, JPA, Flyway, and Playwright by tracing real features.

The central design rule is **thin HTTP/UI edges, explicit domain services**:
components collect input and render state; controllers translate HTTP; service
methods enforce business rules; repositories persist; the runner performs
browser side effects only after the definition and target have been validated.

## 1. Java and Spring syntax used here

### 1.1 Records for immutable API shapes

`ProjectDtos` uses Java records for request/response contracts:

```java
public record ProjectRequest(
    @NotBlank @Size(max = 120) String name,
    @Size(max = 2000) String description,
    @NotBlank @Size(max = 2048) String targetOrigin,
    Long projectVersion) { }
```

Records make the transport shape explicit, generate accessors such as
`request.name()`, and prevent controllers from accidentally exposing a JPA
entity. Jakarta validation runs before the controller method is entered.

### 1.2 Constructor injection and focused controllers

Controllers receive services through constructors:

```java
public ProjectController(ProjectService service, TargetCheckService targetChecks) {
    this.service = service;
    this.targetChecks = targetChecks;
}
```

Spring creates the graph once. The controller only supplies the authenticated
JWT, path variables, and request DTO to the correct service. Business rules do
not hide in annotations or in React event handlers.

### 1.3 Services and transactions

`@Service` marks a domain operation; `@Transactional` defines its database
boundary. For example, project creation validates the target, saves the
project, creates the owner membership, and writes an audit event in one unit.
If a later write fails, the transaction rolls back instead of leaving an
ownerless project.

Read paths use `@Transactional(readOnly = true)` to communicate intent and
avoid accidental writes. Queueing and result updates use ordinary transactions
because they modify counters, states, and relationships.

### 1.4 Enums and state machines

`ExecutionStatus` and database `CHECK` constraints model legal states. The
worker can move a run from `QUEUED` to `RUNNING`, then to one terminal state;
the UI treats `PASSED`, `FAILED`, `ERROR`, and `CANCELLED` as terminal.

State strings in API responses are deliberately stable. The frontend maps them
to badges, but the backend remains authoritative for transitions.

### 1.5 Repository queries

Repositories express storage queries with Spring Data method names or JPQL.
For example, `findBySuiteIdAndStatusNotOrderByNameAsc` encodes the invariant
that archived cases are excluded from active authoring lists and names are
sorted consistently. When a query joins a project member, use the entity’s
actual attributes; Hibernate validates JPQL at startup, so a stale path such as
`m.name` fails the application before it can serve requests.

### 1.6 Domain exceptions and problem responses

Services throw `ApiException`/`AuthException` with an HTTP status, stable code,
human message, and optional field errors. The shared exception handler converts
that into a problem response. The frontend preserves the code and correlation
ID through `ApiError`, which allows a form error to differ from a network
failure.

## 2. TypeScript and React syntax used here

### 2.1 Functional components and typed props

Pages are functions returning JSX. Props are typed inline or with a named type:

```tsx
function ProjectCard({ project }: { project: Project }) {
  return <Link to={`/projects/${project.id}`}>{project.name}</Link>
}
```

The component renders a projection of server state. It does not fetch a second
copy of the project or decide whether the current user is an admin.

### 2.2 Context for session state

`AuthProvider` uses `useState`, `useEffect`, `useCallback`, and `useMemo` to
bootstrap and expose a stable `AuthContext` value. Context is appropriate here
because every route needs the current user; project data stays in TanStack
Query because it is cacheable server state.

### 2.3 TanStack Query for server state

Queries declare a key and a function:

```tsx
const query = useQuery({
  queryKey: projectKeys.suites(projectId),
  queryFn: () => projectsApi.suites(projectId),
})
```

Mutations invalidate affected keys after success. Loading, error, empty, and
success branches are rendered explicitly; a blank screen is not treated as a
valid state.

### 2.4 Forms, schemas, and mutation locking

`react-hook-form` owns field registration and dirty state. Zod schemas provide
client feedback, while the backend repeats validation. `Button busy={...}` and
`disabled={mutation.isPending}` prevent duplicate writes. The case builder also
uses `useBlocker` and `beforeunload` to protect unsaved definitions.

### 2.5 URL-addressable state

The builder stage is stored in `?stage=details|steps|review`; project search
and pagination use query parameters. This makes reloads and shared links
predictable and avoids hidden component state controlling navigation.

## 3. Feature-by-feature implementation

### 3.1 Identity and email verification

**Frontend:** `features/auth/AuthPages.tsx`, `AuthProvider.tsx`, `api.ts`
**Backend:** `auth/api/AuthController.java`, `auth/service/AuthService.java`,
`JwtTokenService`, `RefreshTokenService`, `EmailDeliveryService`
**Persistence:** migrations V001–V006, local credentials, challenges, refresh tokens

The registration service stores a BCrypt hash and a peppered OTP hash, not raw
credentials. Verification consumes one active challenge and increments the
user’s token version, which invalidates pre-verification refresh state. Login
still issues a session for an unverified user so the recovery banner remains
reachable; `VerifiedRoute` is the product restriction point.

**Why this approach:** email verification is an account state, not a second
authentication system. Keeping one `UserEntity` lets password and Google login
share roles, sessions, and audit history.

**Tradeoff:** SMTP is an external dependency. The E2E Compose profile uses
Mailpit so tests can inspect messages without a real mailbox.

### 3.2 Project and permission model

**Frontend:** `features/projects/ProjectPages.tsx`, `ProjectWorkspace.tsx`,
`ProjectWorkspaceContext.ts`
**Backend:** `project/api/ProjectController.java`, `ProjectService.java`,
`ProjectAccessService.java`, `ProjectPermission.java`
**Persistence:** `projects`, `project_members`, `project_audit_events`

The backend resolves the JWT subject to a user, loads project membership, then
checks either global `ADMIN` or an allowed project role. The response includes a
derived permission set so the UI can avoid offering impossible actions. This is
progressive disclosure, not security; every mutation calls the service check
again.

**Why this approach:** roles are easy to understand in the UI while permissions
are granular enough to hide a target check, definition edit, member change, or
execution queue independently.

**Concurrency:** `version` fields are accepted on update requests. A stale
version returns `stale_version`, prompting the UI to reload instead of silently
overwriting another person’s change.

### 3.3 Target policy and Docker host bridge

**Frontend:** platform options and project overview controls
**Backend:** `PlatformProperties.Target`, `ProjectTargetPolicy`, `TargetProbe`,
`TargetCheckService`, `ExecutionTargetGuard`, `ManagedChromium`
**Persistence:** V016 target health columns on `projects`

`ProjectTargetPolicy` normalizes origins and rejects paths, credentials,
queries, fragments, literal private addresses, and unallowlisted values.
Localhost is an explicit development exception controlled by two conditions:
the flag and exact allowlist entry. `ManagedChromium` maps logical localhost to
the configured Docker host alias; `ExecutionTargetGuard` applies the same-origin
rule to every explicit navigation.

**Why this approach:** the browser URL remains stable for cookies and relative
links, while container traffic can reach the host. A broad private-network
allowlist or replacing localhost with an internal hostname would weaken both
security and test fidelity.

### 3.4 Suites and executable cases

**Frontend:** `SuitePages.tsx`, `GuidedCasePage.tsx`, `caseBuilder.ts`, `CasePage.tsx`
**Backend:** `DefinitionController.java`, `DefinitionService.java`
**Persistence:** V009–V010, `test_suites`, `test_cases`, `test_steps`

The action catalog is backend-owned. The frontend renders fields based on
`ActionDefinition` requirements instead of keeping a second hand-written list.
`serializeSteps` turns editor rows into contiguous positions. The service then
canonicalizes aliases (`SELECT` → `SELECT_OPTION`, `ASSERT_TEXT` →
`ASSERT_TEXT_CONTAINS`) and validates locator/input/expected requirements.

READY is intentionally stronger than DRAFT: it must have steps and start with
`NAVIGATE`. This makes a queued case independently runnable and gives the
worker a known starting origin.

### 3.5 Queue, worker, and idempotency

**Frontend:** `projectsApi.queueSuite/queueCase`, `SuitePage`,
`ExecutionDetailPage`
**Backend:** `ExecutionController`, `ExecutionService`,
`ExecutionClaimService`, `ExecutionWorker`, `ExecutionRunService`
**Persistence:** V011–V012, execution queue guard, executions, case/step results

Queue endpoints return immediately with `202 Accepted`. A UUID
`Idempotency-Key` is unique per project; replaying it returns the original
execution. The guard row limits active queue capacity before the execution row
is created. The worker claims work asynchronously and updates heartbeat and
progress counters.

**Why this approach:** browser work is slow and failure-prone. Holding an HTTP
request open would make retries ambiguous and would couple browser lifetime to
the user’s tab. A durable queue record makes the run inspectable and retryable.
The current record snapshots target origin, browser, suite name, and case name;
step rows are still read live by the runner, so immutable step-definition
snapshots remain a known follow-up rather than a current guarantee.

### 3.6 Step interpreter and locator semantics

**Implementation:** `execution/runner/PlaywrightCaseRunner.java`

The runner translates persisted actions into Playwright calls:

| Stored action | Playwright operation |
| --- | --- |
| `NAVIGATE` | `page.navigate(targetGuard.resolve(...))` |
| `CLICK` | `locator.click()` |
| `FILL` / `CLEAR` | `locator.fill(value)` / `locator.fill("")` |
| `SELECT_OPTION` | `locator.selectOption(value)` |
| `CHECK` / `UNCHECK` | `locator.check()` / `locator.uncheck()` |
| `WAIT` | bounded `page.waitForTimeout` |
| `WAIT_VISIBLE` / `WAIT_HIDDEN` | locator state wait |
| `ASSERT_TEXT_*` | Playwright text assertion |
| `ASSERT_VISIBLE` / `ASSERT_HIDDEN` | visibility assertion |
| `ASSERT_URL_CONTAINS` | page URL assertion |
| `TAKE_SCREENSHOT` | full-page PNG captured at the step position |

Locator types map to user-facing Playwright locators where possible: role,
label, test ID, text, placeholder, alt text, title, CSS, and XPath. Semantic
locators are preferred because they survive layout changes better than CSS
selectors. ROLE additionally requires a supported ARIA role.

### 3.7 Variables and evidence safety

The runner interpolates `${KEY}` in step input values using uppercase keys. The
current execution path loads non-secret variables only. Secret-bearing or
interpolated definitions suppress trace/screenshot capture to avoid exposing a
credential in evidence; the metadata still records that evidence was
suppressed.

`ArtifactWriter` writes under a normalized root, checks path containment,
calculates SHA-256, and stores artifact metadata. The UI previews PNGs through a
blob URL and downloads traces; it never receives the artifact filesystem path.

### 3.8 Reporting and failure classification

`DashboardService` filters accessible executions, counts functional outcomes,
and separates assertion failures from infrastructure errors. The execution
detail page shows the failing step and per-step duration, while categories such
as `TARGET_UNREACHABLE`, `NETWORK`, `WORKER_TIMEOUT`, `BROWSER_CRASH`, and
`DNS_POLICY` point to different recovery actions.

This distinction is a business rule: an unavailable target must not be counted
as a product regression, and a locator assertion must not be misreported as a
worker outage.

## 4. Database and migration syntax

Flyway files are ordered `V###__description.sql` scripts. They create tables,
constraints, indexes, and compatibility columns. JPA uses `ddl-auto: validate`,
so startup detects a Java/SQL mismatch instead of mutating production data.

Important relationships:

```text
users
  └─ project_members ─ projects
                         ├─ test_suites ─ test_cases ─ test_steps
                         └─ test_executions ─ test_case_results ─ test_step_results
                                                     └─ execution_artifacts (metadata)
```

Foreign keys and unique constraints enforce ownership and idempotency at the
database layer even when a caller retries or two workers race.

## 5. Testing strategy by layer

| Layer | What belongs there | Current location |
| --- | --- | --- |
| Pure unit | Policy, validation, sanitization, result classification | `backend/src/test/java` focused `*Test` classes |
| Spring/MockMvc | Controller contracts, auth, permissions, status codes | backend test classes using application context |
| PostgreSQL integration | Flyway upgrade, query validation, transactional persistence | `ApplicationContextIT`, `MigrationUpgradeIT` |
| React unit | Form states, route context, empty/error/loading branches | `frontend/src/features/**/*.test.tsx` |
| Playwright E2E | Registration, project onboarding, case authoring, queue navigation | `frontend/e2e/*.spec.ts` |
| Direct target smoke | The ecommerce app’s actual page/content and screenshots | local target checks and native ecommerce tests |

Tests should assert business outcomes rather than implementation trivia. For
example, a READY-case test should assert the backend rejects an empty or
non-NAVIGATE definition, not merely that a private helper was called.

## 6. Design decisions and boundaries

### Same-origin browser APIs

The frontend calls `/api` and `/ws` through the frontend container instead of
embedding a build-time backend host. This keeps local, CI, and deployed builds
portable and prevents a stale static bundle from pointing at `localhost:8080`.

### Modular monolith first

Auth, projects, definitions, execution, artifacts, and reporting share one
database and deployment because their transactions and audit history are
closely related. The worker boundary is still explicit, so it can be extracted
later if browser memory or queue latency requires it.

### Immutable history over mutable labels

Editing a case does not rewrite old case/step snapshots. A new execution is the
evidence for a new definition or environment. This is why the original
`TARGET_UNREACHABLE` run stays visible after a target bridge is repaired.

## 7. Safe extension checklist

When adding a feature:

1. Define the user outcome and failure modes.
2. Add/update a Flyway migration before changing entity assumptions.
3. Add a DTO and controller route only if the HTTP contract is necessary.
4. Put authorization and transactions in a service.
5. Add the frontend API function and query/mutation key.
6. Render loading, empty, error, and success states.
7. Add unit/integration/UI coverage at the smallest useful layer.
8. Update `docs/17-ui-to-execution-workflow.md`, this handbook, and the HTML diagram.
9. Run formatting, lint/typecheck, tests, build, Compose health, and inspect the diff.
