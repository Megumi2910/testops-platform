# Operations, Scaling, and Maintenance

## 1. Operating thesis

The system should degrade by capability, not collapse as one unit.

- Google may be unavailable while password login and existing JWTs continue.
- Playwright may be unavailable while users still inspect history.
- The e-commerce target may be down while project management remains usable.
- Artifact storage may fail without erasing the original assertion result.
- One worker may die without leaving an execution permanently running.

This document defines the intended operating contract. Milestones 1 and 2 plus the Milestone 3 management foundation and Milestone 4 execution foundation verify the local service names, ports, health checks, authentication configuration, project-variable feature flag, queue/worker behavior, and scripts below; production deployment settings remain `TODO: verify`.

## 2. Runtime services

| Component | Responsibility | Hard startup dependency |
|---|---|---|
| Frontend | Management UI and auth bootstrap. | No |
| Spring Boot API | Auth, CRUD, queue requests, results, dashboard. | Yes |
| PostgreSQL | Durable state and worker coordination. | Yes |
| Playwright worker | Browser execution. | No for read-only platform use |
| Artifact storage | Screenshots, traces, logs. | Prefer no |
| Google | New Google login. | No |
| E-commerce target | Test execution. | No |

Local Compose uses `docker-compose.yml` with `postgres` (`5432`), `backend` (`8080`), `frontend` (`3000`), and the optional local PgAdmin surface (`5050`). PostgreSQL must be healthy before the backend starts, and the frontend waits for the backend health check. Named `postgres18_data`, `artifacts_data`, and `pgadmin4_data` volumes preserve local state across restarts. PgAdmin has its own health check and does not use a fixed container name, so multiple Compose projects can coexist.

The tracked PgAdmin template uses the non-secret, validator-safe placeholder
`admin@testops.example.com`. Do not replace it with a special-use `.invalid`,
`.test`, or `localhost` address: PgAdmin 9.16 rejects those domains before the
service can become healthy.

## 3. Environment configuration

### Database

```dotenv
POSTGRES_DB=testops
POSTGRES_USER=testops
POSTGRES_PASSWORD=change-me
DB_URL=jdbc:postgresql://postgres:5432/testops
DB_USERNAME=testops
DB_PASSWORD=change-me
```

### Authentication

```dotenv
AUTH_ENABLED=false
AUTH_REGISTRATION_ENABLED=false
JWT_ISSUER=https://testops.example.com
JWT_AUDIENCE=testops-api
JWT_PRIVATE_KEY_PATH=/run/secrets/testops/jwt-private.pem
JWT_PUBLIC_KEY_PATH=/run/secrets/testops/jwt-public.pem
JWT_ACCESS_TTL=PT10M
REFRESH_TOKEN_TTL=P14D
REFRESH_COOKIE_SECURE=true
FRONTEND_ORIGIN=https://testops.example.com
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

The Google callback is derived as `${FRONTEND_ORIGIN}/login/oauth2/code/google`; keep the frontend origin exact and do not configure a second callback or success/failure redirect variable.

### Email verification

```dotenv
EMAIL_DELIVERY_ENABLED=false
EMAIL_OTP_PEPPER_PATH=/run/secrets/testops/email-otp-pepper
EMAIL_OTP_LIFETIME=PT10M
EMAIL_OTP_RESEND_DELAY=PT1M
EMAIL_OTP_MAX_ATTEMPTS=5
EMAIL_OTP_MAX_SENDS_PER_HOUR=5
MAIL_HOST=smtp.example.com
MAIL_PORT=587
MAIL_USERNAME=
MAIL_PASSWORD=
MAIL_FROM_ADDRESS=
MAIL_FROM_NAME=TestOps Platform
MAIL_SMTP_AUTH=true
MAIL_STARTTLS=true
MAIL_STARTTLS_REQUIRED=false
MAIL_CONNECTION_TIMEOUT_MS=5000
MAIL_READ_TIMEOUT_MS=5000
MAIL_WRITE_TIMEOUT_MS=5000
```

Registration remains unavailable until email delivery is enabled and valid SMTP credentials are supplied. SMTP failure is not an API readiness failure; the unverified account can use the rate-limited resend flow.

When first-account bootstrap is explicitly enabled, provide `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_DISPLAY_NAME`, and `BOOTSTRAP_ADMIN_PASSWORD_PATH`. The password is read from that mounted file and is never placed in environment output or logs. `PROJECT_VARIABLE_KEY_PATH` is reserved for the later encrypted project-variable feature.

### Execution

```dotenv
EXECUTION_WORKER_ENABLED=true
EXECUTION_WORKER_COUNT=1
EXECUTION_QUEUE_CAPACITY=20
EXECUTION_CLAIM_INTERVAL=PT2S
EXECUTION_HEARTBEAT_INTERVAL=PT15S
EXECUTION_STALE_AFTER=PT2M
EXECUTION_MAX_DURATION=PT15M
EXECUTION_DEFAULT_STEP_TIMEOUT=PT15S
PLAYWRIGHT_BROWSER=chromium
ARTIFACT_DIRECTORY=/app/artifacts
```

### Web and target

```dotenv
FRONTEND_ORIGIN=https://testops.example.com
TARGET_ALLOWED_ORIGINS=https://staging-shop.example.com
SHOP_TEST_EMAIL=
SHOP_TEST_PASSWORD=
```

Never commit real values.

## 4. Local development

Intended full runtime:

```bash
cp postgres_db/.env.example postgres_db/.env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
cp pgadmin4/.env.example pgadmin4/.env
docker compose up --build
```

Hybrid development:

```bash
docker compose up postgres
```

```bash
cd backend
./mvnw spring-boot:run -Dspring-boot.run.profiles=local
```

```bash
cd frontend
npm ci
npm run dev
```

The cross-platform verification entry points are `scripts/verify.ps1` and `scripts/verify.sh`. They run backend tests, frontend quality gates when npm is available, Compose validation, and both image builds. Use `scripts/setup-local.ps1` or `scripts/setup-local.sh` to generate ignored auth/crypto files and enable the local bootstrap workflow; the scripts never reset volumes or contact the target. The non-interactive variants `scripts/setup-local.ps1 -Force -GenerateBootstrapPassword -EnableEmailDelivery -EnableGoogle` and `scripts/setup-local.sh --force --generate-bootstrap-password --enable-email-delivery --enable-google` preserve existing scoped environment files, merge the selected provider flags, generate PKCS#8/X.509 JWT material, and store the generated bootstrap password under `backend/.secrets/`. Registration is enabled only together with email delivery so startup validation cannot accept an unusable registration configuration. CI creates ignored runtime env files from the tracked examples before validating Compose, so a clean checkout does not depend on developer secrets. The `local` profile is limited to database connection overrides; future feature profiles remain `TODO: verify`.

## 5. Container design

### Frontend

- build React with Node;
- serve static assets through Nginx;
- proxy `/api` and OAuth callback paths to backend;
- use SPA fallback;
- apply security headers.

### Backend

For the initial combined runtime:

- base image includes the supported Playwright browser dependencies;
- Maven dependency and Playwright image/browser version are aligned;
- backend runs as non-root;
- artifact directory is writable;
- init/PID handling prevents zombie browser processes;
- memory and shared-memory settings are explicit.

### Future worker image

The same application artifact may run with:

```text
SPRING_PROFILES_ACTIVE=worker
```

and API instances with:

```text
SPRING_PROFILES_ACTIVE=api
```

Do not create separate repositories until operational ownership requires it.

## 6. Health model

Suggested health groups:

- liveness: process and event loop/thread availability;
- readiness: PostgreSQL and migrations;
- dependency status: worker, artifact storage, Google configuration, target probe.

Playwright and target availability should not make the entire API unready.

Detailed health is protected outside local development.

## 7. Worker ownership

### Initial

One bounded worker may be enough.

### Multi-worker

Use PostgreSQL claiming with `FOR UPDATE SKIP LOCKED`.

Store:

- `worker_id`;
- `claimed_at`;
- `heartbeat_at`;
- `attempt_number`.

A worker renews heartbeat during the run.

### Stale execution recovery

A scheduled recovery process finds:

```text
RUNNING and heartbeat older than configured threshold
```

Recovery:

1. confirm the worker is no longer alive or lease expired;
2. move to `INTERRUPTED`;
3. preserve partial results;
4. finalize as `ERROR` or requeue only under explicit retry policy;
5. record audit/operational event.

Never silently replay a destructive checkout test.

## 8. Playwright process maintenance

### Worker model

One Playwright instance per worker thread.

Reuse a browser within a worker where stable, but create a fresh `BrowserContext` for each independent case or session.

Recycle browser process after configurable conditions:

- number of cases;
- memory threshold;
- crash;
- protocol error;
- maximum age.

### Version upgrades

Pin together:

- Playwright Maven version;
- Playwright Docker image;
- installed browser binaries.

Upgrade procedure:

1. update dependency and image in one branch;
2. rebuild cleanly;
3. run auth/search/cart smoke suites;
4. run full regression;
5. compare traces and screenshots;
6. merge only after environment parity is confirmed.

Avoid `latest`.

## 9. Capacity controls

Configure:

- maximum workers;
- queue capacity;
- maximum active executions per user/project;
- maximum cases per suite;
- maximum steps per case;
- maximum step timeout;
- maximum suite duration;
- maximum retries;
- maximum artifact size;
- trace/video policy.

When capacity is unavailable, return a controlled `429` or `503` rather than accepting unlimited work.

Monitor the **age of the oldest queued execution**, not only queue length.

## 10. Scaling stages

### Stage 1: single combined backend

Use when:

- one or a few users;
- one browser worker;
- low queue delay;
- local or demo deployment.

### Stage 2: separate API and worker processes

Trigger:

- browser memory affects API;
- deployments interrupt executions;
- queue age grows;
- worker crashes restart API;
- different scaling schedules are needed.

### Stage 3: multiple workers

Add:

- database job claim;
- heartbeat lease;
- project/user concurrency limits;
- isolated target test accounts;
- object storage;
- worker metrics.

### Stage 4: dedicated queue or orchestration

Consider RabbitMQ, Redis Streams, or another broker only when:

- PostgreSQL queue claim becomes a measured bottleneck;
- delayed/retry routing becomes complex;
- many independent worker pools exist;
- operational ownership can support another stateful system.

### Stage 5: browser fleet/grid

Consider only when:

- cross-browser/version/OS matrices are contractual;
- many parallel runs justify dedicated infrastructure;
- the team can operate browser pools.

Kubernetes is not a first-response scaling tool.

## 11. Test-data operations

E-commerce tests require deterministic data.

Preferred approaches:

- unique run-specific accounts;
- worker-specific accounts;
- reset/setup API;
- seeded staging catalog;
- non-production payment adapter;
- cleanup job for test-created orders.

Avoid one shared cart/account across parallel runs.

A crashed worker may skip cleanup, so data should remain identifiable:

```text
TESTOPS-{executionId}
testops+{executionId}@example.com
```

## 12. Selector maintenance

Preferred locator order:

1. role and accessible name;
2. label;
3. stable test ID;
4. stable visible text;
5. CSS;
6. XPath.

Centralize repeated target elements:

```text
LOGIN_EMAIL
LOGIN_PASSWORD
LOGIN_SUBMIT
PRODUCT_SEARCH
ADD_TO_CART
CART_TOTAL
CHECKOUT_SUBMIT
```

A target UI change should update one shared mapping when possible, not dozens of cases.

Track target application version or deployment identifier with executions when available.

## 13. Artifact operations

### Capture policy

| Artifact | Default |
|---|---|
| Failure screenshot | Yes |
| Trace | Failed/error case |
| Video | Off |
| Console log | Error/debug policy |
| Network metadata | Opt-in |
| Network body | Off or redacted |
| Success screenshot | Off |

### Storage layout

```text
executions/
└── 2026/
    └── 07/
        └── {executionId}/
            ├── {caseResultId}-failure.png
            ├── {caseResultId}-trace.zip
            └── execution.log
```

Generated names prevent path traversal.

### Retention example

- successful artifacts: 7–14 days;
- failed/error artifacts: 30–90 days;
- metadata: longer;
- audit events: security policy;
- expired refresh tokens: security retention then purge.

`TODO: verify` required academic/demo retention.

## 14. Observability

### API

- request count;
- error rate;
- p50/p95/p99 latency;
- database pool usage;
- login failure rate;
- refresh replay;
- authorization denial rate.

### Worker

- queued count;
- oldest queue age;
- active executions;
- execution duration;
- browser launch duration;
- heartbeat age;
- worker restarts;
- browser crash rate.

### Product quality

- passed/failed cases;
- infrastructure errors;
- flaky retry rate;
- failure by case;
- failure by target release;
- recent repeated failures.

### Storage

- artifact bytes/day;
- remaining disk;
- database growth;
- cleanup failures;
- backup age;
- restore-test result.

## 15. Logging

Required context:

- correlation ID;
- user ID;
- project ID;
- suite ID;
- execution ID;
- case ID;
- worker ID;
- attempt;
- status and duration.

Never log:

- password;
- JWT;
- refresh token or hash;
- cookie;
- authorization header;
- Google secret;
- private key;
- target secret;
- sensitive page content.

Use structured logs and controlled stack traces.

## 16. CI/CD

Pull-request pipeline:

1. frontend install from lockfile;
2. frontend lint, test, build;
3. backend compile, unit, integration tests;
4. Testcontainers PostgreSQL;
5. Flyway clean and upgrade-path checks;
6. Docker image build;
7. optional local deterministic Playwright smoke suite.

Do not make normal PR CI depend on Google, SMTP, or the live external commerce site. Use fake mail and mocked OIDC providers for deterministic tests.

On Windows, Testcontainers may fail before the Spring context starts when Docker Desktop exposes a named pipe that the current Testcontainers client cannot negotiate. Treat that as an environment prerequisite, not as a reason to skip the integration test: rerun with Docker Desktop/Linux CI available. The deterministic unit, frontend, Compose-configuration, and local Playwright checks remain useful without that integration runtime.

Release pipeline may:

- publish immutable images;
- deploy demo/staging;
- run health checks;
- run safe smoke tests;
- require manual approval for production-like targets.

Secrets remain in GitHub Actions secrets or deployment secret management.

## 17. Database maintenance

### Migration

- no edit to applied versioned migration;
- forward-only correction;
- backup before risky release;
- test previous-version upgrade;
- monitor lock duration.

### Query maintenance

Use `EXPLAIN ANALYZE` for:

- execution history filters;
- dashboard trends;
- queue claim;
- stale heartbeat recovery;
- session list.

Archive/partition only when measured history size justifies it.

## 18. Backup and recovery

### PostgreSQL

- scheduled backup;
- encrypted storage;
- documented restore;
- periodic restore test;
- backup credentials separated from application credentials.

### Artifact storage

- lifecycle cleanup;
- metadata/storage reconciliation;
- object versioning if required;
- checksum validation for important evidence.

### Disaster recovery priorities

1. identity and authorization data;
2. project/test definitions;
3. execution metadata/results;
4. artifacts;
5. derived dashboard data.

Dashboards can be rebuilt. Identity and result history cannot.

## 19. Graceful shutdown

On shutdown:

1. stop accepting new execution claims;
2. continue or cancel active work according to timeout;
3. update heartbeat/status;
4. close browser contexts;
5. close browser and Playwright;
6. preserve partial results;
7. mark interrupted work for recovery.

Container termination grace period must exceed normal cleanup time.

## 20. Operational playbook

### Password login works but Google fails

Check:

- client ID/secret;
- exact callback URI;
- proxy forwarded host/scheme;
- OAuth state persistence;
- consent-screen/test-user status;
- system clock;
- callback logs without token values.

Password login remains available.

### Google succeeds but frontend is logged out

Check:

- refresh cookie set;
- `Secure`, `SameSite`, `Path`, domain;
- frontend callback calls refresh;
- CORS credentials;
- refresh record committed;
- proxy route consistency.

### Refresh loops with repeated `401`

Check:

- cookie presence/path;
- concurrent refresh deduplication;
- token expiry/revocation/replay;
- frontend retry logic;
- clock skew;
- user status.

### Execution remains queued

Check:

- worker process;
- claim query and index;
- queue capacity;
- database connection;
- worker profile;
- oldest queue age.

### Execution remains running

Check:

- heartbeat;
- max duration;
- browser process;
- Playwright protocol;
- target availability;
- worker shutdown;
- stale recovery.

### Many cases fail after a target release

Check:

- deployment version;
- selector changes;
- route changes;
- test data;
- cookie/banner overlays;
- locale/currency;
- account state.

Run a small smoke suite before changing expected results.

### Artifact missing

Check:

- writable storage;
- disk capacity;
- context closed;
- trace stopped;
- metadata transaction;
- authorization path.

Do not replace the original test outcome with an artifact-storage outcome.

### Database pool exhaustion

Check:

- long transactions;
- browser work inside transaction;
- dashboard query plans;
- unclosed streams;
- worker claim loop frequency;
- pool size versus concurrency.

## 21. Maintenance schedule

### Every change

- tests;
- migrations;
- secrets scan;
- docs update;
- target contract review if selectors changed.

### Weekly or per active development cycle

- queue age;
- repeated flaky cases;
- disk usage;
- failed cleanup;
- dependency alerts;
- disabled/unused accounts.

### Monthly or before release

- restore test;
- JWT key-rotation readiness;
- Google redirect verification;
- target credential rotation;
- Playwright/browser upgrade review;
- retention cleanup;
- role and membership review.

## 22. Change-safety checklist

Before authentication changes:

- test both login methods;
- refresh concurrency;
- replay;
- cookies behind proxy;
- issuer/audience;
- role mapping;
- account linking;
- disabled-user behavior.

Before execution changes:

- thread ownership;
- browser cleanup;
- no long transaction;
- ownership/heartbeat;
- failure classification;
- snapshots;
- cancellation race;
- target allowlist.

Before schema changes:

- new migration;
- clean and upgrade path;
- delete behavior;
- historical compatibility;
- index impact;
- rollback/recovery plan.

Before target-selector changes:

- confirm product behavior;
- update shared locator mapping;
- run smoke suite;
- preserve old execution snapshots;
- review screenshots for sensitive data.
