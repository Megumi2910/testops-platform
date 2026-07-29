# Risks, Roadmap, and Decisions

## 1. Purpose

This document records the project’s deliberate limitations and the conditions that would justify changing the architecture. It avoids vague “future scalability” claims: every item names a failure mode, current response, tradeoff, and revisit condition.

Milestones 1 through 9 are reconciled against the current source and verification results. Scheduling, notifications, and distributed workers remain future work.

## 2. Risk register

### External target instability

**Risk:** A target outage, UI release, account change, inventory state, anti-bot behavior, or selector change can look like a regression.

**Current response:** classify target/browser/network problems as `ERROR`; use staging data; record target URL and, when possible, target release identifier.

**Tradeoff:** Results still depend on an external environment.

**Next work:** deterministic staging reset, target health check, deployment metadata.

### Test-data collision

**Risk:** Parallel cases share cart, inventory, or account state and interfere.

**Current response:** isolated browser contexts and unique/worker-specific test data.

**Tradeoff:** Data setup and cleanup become part of test design.

**Next work:** setup/reset API and scheduled cleanup.

### Refresh-token replay

**Risk:** A copied refresh token is used after rotation.

**Current response:** single-use opaque token, family tracking, atomic rotation, family revocation.

**Tradeoff:** Authentication is stateful at refresh time.

**Next work:** security-session UI and anomaly alerting.

### JWT revocation delay

**Risk:** A disabled user’s existing access JWT remains usable until expiry.

**Current response:** short lifetime, refresh revocation, critical-action status checks.

**Tradeoff:** Not every request is instantly revocable.

**Revisit when:** compliance or threat model requires immediate revocation.

### Account-link ambiguity

**Risk:** Password account and Google identity share an email but are not proven to be controlled by the same person.

**Current response:** explicit recent-authentication link flow.

**Tradeoff:** More login friction.

**Revisit when:** organization controls a verified Google Workspace domain and policy supports trusted linking.

### Browser resource exhaustion

**Risk:** Unbounded Playwright workers consume memory and destabilize API/database.

**Current response:** bounded worker count, queue capacity, execution limits.

**Tradeoff:** Users may wait.

**Next work:** separate worker processes and capacity metrics.

### Duplicate execution ownership

**Risk:** Two workers run the same test, possibly creating duplicate e-commerce orders.

**Current response:** atomic PostgreSQL claim, worker ID, heartbeat.

**Tradeoff:** Queue logic depends on PostgreSQL transactions.

**Revisit when:** queue throughput or routing exceeds database-backed design.

### Abandoned running execution

**Risk:** Worker/container dies after marking `RUNNING`.

**Current response:** lease heartbeat, stale recovery, partial results, explicit retry policy.

**Tradeoff:** Recovery cannot always know whether a target side effect occurred.

**Next work:** idempotency/test-data contracts for destructive scenarios.

### Historical result drift

**Risk:** Editing a case changes the representation of an old result.

**Current response:** execution definition snapshot.

**Tradeoff:** Additional storage and version comparison complexity.

**Next work:** immutable definition versions and diff UI.

### Artifact growth

**Risk:** Screenshots, traces, video, and logs fill disk or expose sensitive data.

**Current response:** failure-only capture, retention, size limit, redaction, generated paths.

**Tradeoff:** Less evidence for successful runs.

**Next work:** object storage and lifecycle policy.

### Selector maintenance

**Risk:** E-commerce UI changes break many database-defined steps.

**Current response:** accessible/test-ID locators and centralized reusable element mappings.

**Tradeoff:** The target application must treat selectors as a contract.

**Next work:** selector health smoke suite and target release integration.

### Secrets in browser evidence

**Risk:** Passwords or personal data appear in traces/screenshots.

**Current response:** masked project variables, limited trace policy, staging accounts, review of sensitive pages.

**Tradeoff:** Some debugging detail is intentionally omitted.

**Next work:** stronger artifact redaction and secret-aware fields.

## 3. Delivery roadmap

### Milestone 1 — Scaffold and runtime

Initially implemented during the foundation milestones and reconciled on `codex/milestone-9-release-candidate`:

- repository structure;
- React and Spring Boot builds;
- PostgreSQL and Flyway;
- Playwright browser launch;
- Docker Compose;
- CI baseline;
- health endpoints.

Evidence:

- clean checkout builds;
- database migrates;
- browser opens the approved target;
- no secret in Git.

### Milestone 2 — Authentication (implemented and stabilized)

Delivered in the current foundation slice:

- user/role schema;
- registration/login with mandatory email OTP verification;
- JWT validation;
- rotating refresh token;
- logout/session revocation;
- Google OpenID Connect;
- account-link policy;
- frontend auth bootstrap.

Stabilization delivered:

- one-source SMTP configuration with UTF-8 mail and sanitized delivery failures;
- startup validation for authentication, mail, Google, cookie, origin, limits, and bootstrap settings;
- memory-only frontend access tokens with deduplicated refresh and one retry;
- refresh row locking, family replay revocation, replay audit, origin checks, cache headers, and bounded rate limits;
- JWT `jti`, audience validation, strict role mapping, and token-version failure propagation;
- optional file-based first-admin bootstrap and additive `V006` authentication index;
- persistent PgAdmin volume and health check without a fixed container name;
- focused configuration, rate-limit, origin, and cookie tests plus synchronized documentation.

Evidence:

- backend unit tests cover configuration invariants, bounded rate limits, same-origin refresh/logout, and cookie attributes;
- frontend lint, typecheck, test, and build gates remain deterministic;
- deterministic Playwright and Compose configuration checks do not contact the live e-commerce site;
- the PostgreSQL Testcontainers context test remains required and should run on Docker Desktop/Linux CI when the local Windows named-pipe limitation is absent;
- tokens are absent from URLs and persistent browser storage.

### Milestone 3 — Test management

Deliver:

- projects;
- membership;
- variables;
- suites;
- cases;
- ordered allowlisted steps;
- validation;
- archive behavior.

The implemented API uses `/api/v1/projects`, project-member routes with email-based adds, `/variables`, `/suites`, and aggregate `/cases` routes. Target validation is static and allowlist-based in Milestone 3; Milestone 4 adds runtime DNS/IP revalidation immediately before browser navigation. Secret variables require an explicit feature flag and mounted AES-256-GCM key.

Evidence:

- CRUD integration tests;
- permission tests;
- invalid URL/action rejected;
- secret values masked.

- backend compile and 26 unit tests pass;
- frontend lint, typecheck, Vitest, and production build pass;
- Flyway migrations V007 through V010 are present and `ddl-auto=validate` remains enabled.

### Milestone 4 — Execution (implemented foundation)

Deliver:

- `QUEUED` execution;
- worker claim;
- Playwright contexts;
- core actions/assertions;
- incremental results;
- screenshots/traces;
- cancellation;
- cancellation and bounded in-process worker;
- guarded navigation and screenshot artifacts;
- polling execution history UI.

Evidence and remaining hardening:

- queue/case API contracts, idempotency, role checks, migrations, and deterministic local UI are implemented;
- stale-worker recovery, infrastructure-only retry, trace persistence for non-secret cases, guarded navigation, and artifact download are implemented;
- target-specific login/search/cart suites, broader live-target probing, and secret-variable snapshot hardening remain opt-in follow-up work.

### Milestone 5 — Identity and authorization (implemented)

Deliver:

- unified password/Google accounts;
- platform and project roles;
- effective project permissions;
- account/session controls and admin user management;
- additive identity migrations and safe runtime toggles.

### Milestone 6 — Product readiness, reporting, and operations (implemented foundation)

Deliver:

- registration persistence diagnostics and self-service project creation;
- execution snapshots, failure categories, dashboard APIs, and accessible filters;
- session-family revocation and opt-in artifact retention;
- frontend onboarding/empty states and reporting navigation.

### Milestone 7 — Guided local-target testing (implemented)

Deliver:

- opt-in exact-origin localhost transport through the Docker host gateway;
- browser-based target checks and persisted target health;
- structured action/locator metadata;
- guided templates, step validation, queue navigation, and screenshot evidence;
- enabled and negative local-target acceptance scenarios.

### Milestone 8 — Workspace experience closure (implemented)

Deliver:

- responsive application shell and project workspace;
- permission-aware controls and recoverable authentication states;
- dashboard and execution evidence improvements;
- reusable local UI primitives without a global component framework.

### Milestone 9 — Release candidate closure (implemented; runtime gates environment-dependent)

Deliver:

- npm-only repository hygiene and generated-artifact exclusions;
- batched project onboarding counts without per-suite case requests;
- focused project route modules with shared outlet context;
- stable case-step IDs, URL-addressable builder stages, navigation protection, and saved-case recovery;
- separate enabled and disabled local-target CI jobs;
- reconciled release documentation and intentional commit boundaries.

The release candidate does not add scheduling, notifications, worker extraction, object storage, or cross-browser execution.

### Future scale improvements

Only when justified:

- separate API and worker profiles;
- multiple workers;
- object storage;
- scheduled suites;
- notifications;
- immutable definition versions;
- cross-browser pools.

## 4. Explicit first-release exclusions

- arbitrary Java/JavaScript/shell execution;
- uploaded test source code;
- unrestricted target URLs;
- production payment/order mutation;
- Kubernetes;
- distributed browser grid;
- message broker without measured need;
- AI-generated tests;
- multi-tenant billing;
- enterprise SSO beyond Google;
- real-time collaborative editor;
- full browser/version/OS certification matrix.

These exclusions protect the core outcome: a working, secure, explainable test-management platform.

## 5. Decision log

### Decision: Playwright for Java

**Problem:** The target is a dynamic e-commerce UI and the platform needs stable locators, auto-waiting, isolation, screenshots, and traces.

**Chosen approach:** Playwright for Java with Chromium initially.

**Why it works here:** It stays inside the Java/Spring ecosystem while improving browser-test ergonomics and evidence.

**Rejected alternative:** Selenium WebDriver as the primary runner.

**Tradeoff:** Selenium Grid and broad vendor/version matrices are less central.

**Revisit when:** Formal certification requires real browser/OS combinations that Playwright does not cover.

### Decision: TestOps-issued JWT for both login methods

**Problem:** Password and Google users need one authorization model.

**Chosen approach:** Both resolve a local user and receive the same local access JWT and refresh session.

**Rejected alternative:** Accept Google tokens directly for Google users.

**Tradeoff:** TestOps owns signing keys, refresh rotation, and revocation.

**Revisit when:** Authentication moves to a dedicated authorization server.

### Decision: opaque rotating refresh token

**Problem:** Long-lived browser sessions require revocation and replay detection.

**Chosen approach:** Random opaque token in `HttpOnly` cookie; hash and family stored in PostgreSQL.

**Rejected alternative:** Long-lived access JWT or refresh JWT with no server state.

**Tradeoff:** Refresh is stateful and transactional.

**Revisit when:** A dedicated identity platform supplies session management.

### Decision: access JWT in memory

**Problem:** JavaScript-accessible persistent storage increases credential exposure.

**Chosen approach:** In-memory access token; refresh cookie restores session after reload.

**Rejected alternative:** `localStorage`.

**Tradeoff:** Application startup needs a refresh call and refresh deduplication.

**Revisit when:** A backend-for-frontend removes browser token handling.

### Decision: modular monolith

**Problem:** The system needs boundaries but has one team and one relational data model.

**Chosen approach:** One Spring Boot codebase organized by feature.

**Rejected alternative:** Auth, execution, and reporting microservices.

**Tradeoff:** Browser workload initially shares deployment lifecycle with API.

**Revisit when:** Worker scaling/fault isolation becomes measurable.

### Decision: PostgreSQL-backed worker claim

**Problem:** Multi-instance execution needs durable ownership.

**Chosen approach:** atomic row claim with `FOR UPDATE SKIP LOCKED`, worker ID, and heartbeat.

**Rejected alternative:** in-memory queue as the long-term authority.

**Tradeoff:** PostgreSQL handles both business data and queue coordination.

**Revisit when:** queue routing/throughput/retention becomes operationally distinct.

### Decision: polling before WebSocket

**Problem:** UI needs progress but not high-frequency bidirectional collaboration.

**Chosen approach:** poll while execution is non-terminal.

**Rejected alternative:** WebSocket from the first release.

**Tradeoff:** repeated requests and small display delay.

**Revisit when:** detailed live logs or concurrent volume make polling expensive.

### Decision: existing e-commerce site as external target

**Problem:** A working e-commerce application already exists.

**Chosen approach:** TestOps stores only the test contract and evidence.

**Rejected alternative:** build a second demo shop in this repository.

**Tradeoff:** reproducibility depends on external environment and test data.

**Revisit when:** CI requires a deterministic local fixture.

### Decision: definition snapshots

**Problem:** Mutable cases can corrupt the meaning of historical runs.

**Chosen approach:** snapshot executed definitions into execution/results.

**Rejected alternative:** always join result to current case.

**Tradeoff:** additional storage.

**Revisit when:** full versioned definition model is justified.

### Decision: selective artifact capture

**Problem:** Rich traces improve diagnosis but consume storage and may contain sensitive data.

**Chosen approach:** screenshot and trace for failure/error; video off by default.

**Rejected alternative:** record everything.

**Tradeoff:** successful-run evidence is limited.

**Revisit when:** compliance, debugging, or storage economics change.

## 6. When to scale

| Symptom | Change |
|---|---|
| API slows during browser runs | Separate API and worker runtime. |
| Oldest queued age grows | Add workers after test-data isolation. |
| Duplicate ownership appears | Fix atomic claim before adding infrastructure. |
| Worker restarts leave stale runs | Add/repair heartbeat recovery. |
| Artifact disk fills | Retention, then object storage. |
| Dashboard slows | Query plans, indexes, summaries. |
| PostgreSQL queue claim becomes bottleneck | Evaluate dedicated broker. |
| Cross-browser matrix grows | Browser-specific worker pools. |
| Deployments regularly interrupt runs | Drain workers and separate deployment lifecycle. |
| Immediate JWT revocation required | Token version or revocation cache. |

## 7. Change safety

### Authentication

Verify:

- password and Google login;
- account linking;
- refresh concurrency/replay;
- logout;
- cookies through proxy;
- issuer/audience;
- disabled user;
- role/membership checks;
- no token in URL/log.

### Execution

Verify:

- Playwright thread ownership;
- context isolation;
- browser cleanup;
- database transaction length;
- atomic claim;
- heartbeat;
- cancellation;
- failure/error classification;
- snapshots;
- target allowlist;
- secret masking.

### Data

Verify:

- forward migration;
- clean database;
- previous-version upgrade;
- delete behavior;
- history compatibility;
- index plans;
- backup.

### Target contract

Verify:

- route changes;
- selector changes;
- account state;
- catalog/inventory;
- locale/currency;
- checkout side effects;
- staging cleanup;
- artifact privacy.

## 8. Documentation verification backlog

After source exists:

- replace intended stack with verified versions;
- add only verified badges;
- update route tables from controllers;
- update schema from migrations;
- record current versus legacy paths;
- verify all commands;
- add safe screenshots under `docs/assets`;
- add live URL only after verification;
- add source anchors where they help maintainers;
- remove `TODO: verify` only with evidence;
- ensure README and deep docs describe the same runtime.
