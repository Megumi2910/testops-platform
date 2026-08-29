# Documentation truth audit

The original browser/report capture was verified against revision `ded01b87f7ec913ab9547c75c8eeb7dd5c5790f1` on 2026-08-15. The current-checkout reconciliation on 2026-08-23 updates the source and migration inventory through V023; screenshots remain labelled with their captured revision. This ledger deliberately separates facts that are present in source, facts verified in a running browser, and facts that still require a later runtime check.

## Repository shape

| Surface | Current source of truth | Observed scope |
|---|---|---|
| Backend | `backend/src/main/java/com/megumi/testops` | Spring Boot modular monolith with auth, projects, definitions, execution, dashboard, configuration, and shared API contracts. |
| Frontend | `frontend/src` | React Router application with lazy routes and feature folders for auth, projects, executions, dashboard, and system health. |
| Persistence | `backend/src/main/resources/db/migration` | PostgreSQL/Flyway migrations `V001` through `V024`; `V024` adds administrator-managed target origins with optimistic versioning. Applied schema must be checked against the running database during the browser evidence pass. |
| Browser runner | `backend/src/main/java/com/megumi/testops/execution/runner` | Playwright Java worker with isolated contexts, immutable execution snapshots, navigation guards, step outcomes, and artifacts. |
| Runtime | `docker-compose.yml`, `docker-compose.e2e.yml`, `docker-compose.qa.yml` | TestOps frontend/backend/PostgreSQL/pgAdmin plus opt-in E2E target and Mailpit services. |
| Target | `frontend/e2e/target-site` and the separate ecommerce application | A local storefront is used by the deterministic E2E profile; the separate ecommerce site is an external target boundary, not part of this documentation rewrite. |

## Controller and route inventory

The current API surface is owned by these controllers:

- `AuthController` — registration, verification, resend, login, refresh, logout, password recovery, password setup/change, and Google identity actions.
- `SessionController` — current-user session listing and individual revocation.
- `AdminUserController` — administrator user listing, role/status changes, and session revocation.
- `PlatformOptionsController` — feature flags, target-origin metadata, action definitions, and supported roles/permissions.
- `ProjectController` — projects, target checks, archive/restore, and membership.
- `DefinitionController` — suites, cases, lifecycle, restore, and ordered steps.
- `ProjectVariableController` — project variable list, create, update, and delete.
- `ExecutionController` — queueing, summaries, detail, results, cancellation, and artifact download.
- `DashboardController` — summary, trends, recent failures, and infrastructure categories.

The frontend router currently exposes public authentication routes, account/security, dashboard, administration, projects, nested project workspace routes, Trash, variables, members, executions, and execution detail.

## Known documentation mismatches

| Existing document | Mismatch | Required correction |
|---|---|---|
| `docs/architecture/01-technical-specification.md` | Status describes early Milestones 1–4; package examples use `com.example`; role language is legacy; current account, Trash, target, snapshot, and dashboard behavior is under-described. | Reconcile to current source and label deferred behavior explicitly. Preserve the user-owned table-formatting changes. |
| `docs/architecture/03-data-model-api-and-workflows.md` | Tables and routes are labelled proposed; migration history stops at `V012`; sessions and dashboards are called planned; the error example uses a map rather than `errors[]`. | Convert to current implementation reference and link exhaustive endpoint details to the API handbook. |
| `docs/architecture/15-codebase-architecture.html` | The page has grown into a chronological release log and treats ecommerce implementation history as equal to TestOps architecture. | Rewrite as a stable architecture explanation; keep historical slice notes in milestone/implementation documents. |
| `docs/implementation/17-ui-to-execution-workflow.html` | The canonical workflow visual is stored under implementation and mixes historical notes with the current flow. | Move the canonical workflow page into `docs/workflows/` and update links/manifest. |
| `DOCUMENTATION-MANIFEST.json` | The manifest is broad but does not provide a generated endpoint inventory, screenshot inventory, or last-verified revision contract. | Add canonical report pages, source anchors, generated/manual ownership, and verification metadata. |

## Browser evidence status

Chrome DevTools is available. At audit time:

- `http://localhost:3000` responded with the TestOps page title `TestOps Platform`; Chrome DevTools snapshots confirmed the public readiness, sign-in, and registration routes and showed no page console errors during the final HTTP documentation review.
- `http://localhost:3001` was not running and returned `ERR_CONNECTION_REFUSED`.
- The rebuilt documentation server was checked at desktop and a 320-pixel viewport. The portal, architecture, API handbook, workflow guide, and feature handbook had no horizontal overflow; the API filter controls have labels, names, and IDs.
- The committed TestOps screenshot inventory now includes `docs/assets/screenshots/testops/readiness.png`, `sign-in.png`, and `register.png`. Chrome DevTools was used for live route inspection; Playwright serialization was used only because the Chrome DevTools screenshot file writer rejected the workspace path. The images contain no credentials or tokens.

The final report does not present ecommerce screenshots as available until the controlled ecommerce stack is started and the target revision is recorded. TestOps screenshots are limited to public/empty-state routes because no QA account was used during this documentation-only capture.

## Evidence and privacy boundary

Screenshots and examples will use synthetic QA users, reserved `.test` domains, and non-secret project data. Tokens, cookies, OTP values, password fields, secret variables, raw request payloads, and personal email addresses are excluded from committed artifacts. Raw traces remain ignored under QA artifact directories.

## Preservation constraints

The following pre-existing user-owned paths remain untouched and uncommitted during this documentation work:

- `docs/architecture/01-technical-specification.md` formatting changes already present in the worktree.
- `.agents/`.
- `skills-lock.json`.

## Completion rule for this audit

The audit is complete when the canonical report can distinguish `CURRENT`, `LEGACY`, `DEFERRED`, and `RUNTIME-UNVERIFIED` claims, and every later HTML/Markdown page links back to a source anchor or evidence record rather than repeating an unverified assumption.
