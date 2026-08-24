# Milestone 10A — TestOps first-release completion

## Current slice: Phase 6 retained deployment and account-shell proof

This document is the current release ledger for Milestone 10A. It replaces the
Milestone 9 release-candidate document as the source of truth for work on the
completion branch. It deliberately separates **evidence already captured**
from **work that is still required**; a historical `PARTIAL` row is not a
permission to skip a gate, and a passing unit test is not proof that a live
container or browser route is current.

### Release boundary

Milestone 10A completes the existing TestOps first-release contract:

- account registration, verification, recovery, password security, Google
  linking, and sessions;
- projects, target checks, suites, cases, variables, members, and Trash;
- queued Chromium execution, immutable snapshots, step outcomes, screenshots,
  traces, dashboard reporting, and failure recovery;
- permission and tenant isolation for every nested resource;
- an accessible, responsive, discoverable UI and beginner-safe documentation.

Scheduling, notifications, distributed workers, multiple browser engines,
permanent execution deletion, and ecommerce feature development remain outside
this milestone. Ecommerce is the TestOps target only.

## Provenance and branch decision

| Item | Evidence | Result |
| --- | --- | --- |
| Starting revision | `git rev-parse origin/main` = `1d63878b9dfd52d1ba9936473ef1dcc1f4e85f8d` | PASS |
| Completion branch | `codex/milestone-10-testops-completion` tracks `origin/main` | PASS |
| Historical branch | `codex/milestone-9-release-candidate` remains at `b0e591b`; it is not the development base | RECORDED |
| User-owned worktree paths | `docs/architecture/01-technical-specification.md`, `.agents/`, and `skills-lock.json` remain dirty and unstaged | PASS |
| Existing local gates | Frontend lint/typecheck/unit (`42/42`) and backend tests (`136/136`) passed before this slice | PASS, rerun required on this branch |

No reset, stash, checkout-overwrite, or database-volume deletion was used to
move to the completion branch.

## Public-repository safety audit

The repository is public (`https://github.com/Megumi2910/testops-platform`).
The audit was read-only and covered the current tree, recent history, CI
configuration, and published artifact metadata.

### Findings

- Tracked credential-like files: only `.env.example` templates. No `.pem`,
  `.key`, database, trace, screenshot, archive, or report files are tracked.
- Current-tree signatures for private keys, GitHub tokens, AWS access keys,
  SMTP passwords, and literal credentials returned no matches. The remaining
  `client_secret` and `password=` matches are source/test examples or generated
  configuration references, not committed values.
- `.github/scripts/prepare-e2e-secrets.sh` creates an RSA key pair, OTP pepper,
  AES variable key, and bootstrap password with `openssl` for every CI run.
  The bootstrap password is masked before it is placed in `GITHUB_ENV`; the
  files live under ignored `backend/.secrets/`.
- The merge workflow run `31778837913` failed before any job step executed.
  This is recorded as a scheduling/quota event, not as product-test evidence.
- Published Actions artifact metadata contains Playwright report names and
  sizes only. No artifacts from the zero-step merge run were published. Future
  evidence must remain sanitized and must not include cookies, OTPs, tokens, or
  passwords.
- GitHub secret-scanning alerts could not be queried because secret scanning is
  disabled for this repository (`404`). This is a repository capability limit,
  not proof that history is clean; the local pattern/history audit remains the
  required compensating control until scanning is enabled.

### QA startup correction

The first isolated rebuild exposed a configuration defect: the normal
`BOOTSTRAP_ADMIN_ENABLED=true` value was inherited by the `local-qa` profile
after its fixture runner had already created users. The backend correctly
refused to create a second first user and the health check never became ready.
The QA overlay now sets `BOOTSTRAP_ADMIN_ENABLED=false`; the fixture runner is
the sole owner of QA identities. This does not change the normal development
Compose defaults or production bootstrap behavior.

### CI hardening applied

`.github/workflows/ci.yml` now declares a top-level default of:

```yaml
permissions:
  contents: read
```

This matches the workflow's actual needs (checkout, build, test, and report
publication). A later job that needs another capability must request it on the
specific job, rather than broadening the default token.

## Documentation reconciliation

The following documents remain valuable historical evidence and are not
silently rewritten:

- `docs/milestones/14-milestone-9-release-candidate.md` records the merged
  release-candidate decision;
- `docs/testing/23-quality-gate-baseline.md` records the original full-system
  matrix and its open rows;
- `docs/testing/24-defect-ledger.md` records defect IDs and regression owners.

This ledger is now the canonical interpretation of their status. In
particular, the browser-crash implementation and target-policy code exist in
source, but their release claims still require a fresh rebuilt runtime and
Chrome DevTools evidence. QG-005 (form metadata) and QG-010 (stale lazy chunk
recovery) remain active defects until their dedicated phases pass. The existing
HTML workflow diagram also labels the current Phase 0 boundary so a codebase
walkthrough cannot be mistaken for a release sign-off.

## Phase 0 verification procedure

Run these commands from the repository root after the slice is committed:

```powershell
git status --short --branch
git rev-parse HEAD
docker compose -f docker-compose.yml config --quiet
docker compose -p testops-quality-gate -f docker-compose.yml -f docker-compose.qa.yml config --quiet
docker compose -p testops-quality-gate -f docker-compose.yml -f docker-compose.qa.yml build --build-arg VCS_REF=$(git rev-parse HEAD)
docker compose -p testops-quality-gate -f docker-compose.yml -f docker-compose.qa.yml up -d
docker compose -p testops-quality-gate -f docker-compose.yml -f docker-compose.qa.yml ps
```

The QA project name is intentional: it keeps its Compose network and named
volumes separate from a user's normal development project. Do not run
`down -v` against the normal Compose project. Verify the backend and frontend
OCI label `org.opencontainers.image.revision` equals `git rev-parse HEAD`, and
wait for the backend and frontend health checks before browser testing.

After the runtime is rebuilt, rerun the local frontend and backend gates, then
push this branch. A remote CI run must reach actual job steps; an immediate
zero-step failure is recorded as infrastructure/quota evidence and blocks the
release decision until a later run executes.

### Rebuild evidence captured

The isolated Compose project `testops-quality-gate` was rebuilt from the
Phase 0 source revision returned by `git rev-parse HEAD` at capture time.
PostgreSQL, Mailpit, pgAdmin,
backend, and frontend reported healthy; `http://localhost:8080/actuator/health`
and `http://localhost:3000/` both returned HTTP 200. The backend and frontend
OCI `org.opencontainers.image.revision` labels exactly matched that commit.
The normal Compose project was not started and no normal volume was reset.

### Local gate evidence captured

- Frontend: `npm run lint`, `npm run typecheck`, `npm test -- --run`
  (`13` files / `42` tests), and `npm run build` all pass.
- Backend unit/package gate: `.\mvnw.cmd -B -DskipITs verify` passes with
  `136` tests and zero failures.
- Full backend `.\mvnw.cmd -B -ntp verify` now passes locally with Docker
  Desktop. The Maven wrapper handles a normal Windows cache directory, and the
  Failsafe Testcontainers client negotiates Docker API `1.40` or newer. The
  run reports `144` unit tests plus `10` integration tests, with zero failures,
  zero errors, and one expected skip.

## Phase 0 result

**Status: PASS for Phase 0.** The completion branch is pushed, the isolated QA
stack is healthy and revision-matched, frontend and backend unit/package gates
are green, and remote CI run `31782848666` executed and passed all six jobs.

The full local Testcontainers integration gate is now green on Windows with
Docker Desktop. The wrapper and API-version fixes are documented in the
[quality-gate operator guide](../guides/23-quality-gate-operator-guide.md).
This does not waive the integration tests in later slices.

The Phase 0 result is complete and remains the release gate for the branch.
The first Phase 1 shell slice is now implemented and verified; the remaining
Phase 1 work continues only after its commit and CI run are recorded below.

## Phase 1 slice result — application shell and account menu

**Status: PASS for this slice.** `AccountPage` now uses the shared lazy-page
loading boundary. The desktop Account control is an accessible menu with
identity, security, sessions, verification recovery, administrator-only
navigation, and sign-out. The mobile drawer has a backdrop, focus containment,
Escape handling, and body-scroll locking. The root router renders a branded
recovery page for render/chunk failures instead of the generic React Router
error view.

Source-level evidence is documented in
[`63-phase1-testops-shell-account-menu.md`](../implementation/63-phase1-testops-shell-account-menu.md)
and [`72-phase1-shell-account-menu.md`](../testing/72-phase1-shell-account-menu.md).
Frontend lint, typecheck, 48 unit tests, and the production build are the local
gates for this slice. Automatic stale-chunk reload and the live Chrome DevTools
matrix remain open for later Phase 1/2 slices. Remote CI run
[`31785998751`](https://github.com/Megumi2910/testops-platform/actions/runs/31785998751)
passed all six required jobs for commit `4ca2d077`; the workflow emitted only
non-blocking `upload-artifact` Node.js 20 deprecation annotations.
The documentation-only follow-up run [`31786506438`](https://github.com/Megumi2910/testops-platform/actions/runs/31786506438)
initially exposed one transient Mailpit password-reset E2E failure (33 passed,
one failed, 32 skipped); rerunning the failed job completed the full enabled
E2E suite successfully. All six jobs are therefore green on the current
branch, and the transient result remains recorded for future flake triage.

## Phase 1 follow-up slice — account-menu keyboard navigation

**Status: PASS for this source and mounted-test slice.** The signed-in account
trigger now opens from ArrowDown on the first action or ArrowUp on the last
action. While open, Tab wraps from the last menu item to the first and
Shift+Tab wraps in the opposite direction; Escape still restores focus to the
trigger. The implementation keeps the existing native links, permission-aware
items, outside-click handling, and mobile drawer behavior.

Implementation and regression evidence are recorded in
[`80-phase1-account-menu-keyboard.md`](../implementation/80-phase1-account-menu-keyboard.md)
and [`89-phase1-account-menu-keyboard.md`](../testing/89-phase1-account-menu-keyboard.md).
The focused AppShell suite passes 7 tests. Implementation commit `dfc5d36`
passed all six CI jobs in run
[`31865910829`](https://github.com/Megumi2910/testops-platform/actions/runs/31865910829).
Rebuilt-runtime Chrome DevTools verification remains part of the broader Phase
1 accessibility gate.

## Phase 6 slice result — execution rerun and cancellation recovery

**Status: PASS for this source and mounted-test slice.** Execution detail now
offers **Run current suite again** only when the execution has a suite and the
active project grants `EXECUTION_START`. Queueing uses the current suite
endpoint, invalidates the run list, and navigates to the new execution instead
of mutating or replaying historical evidence. Cancellation and rerun failures
are inline, sanitized, and retryable; pending controls prevent duplicate
requests.

Implementation and test evidence are recorded in
[`81-phase6-execution-rerun-recovery.md`](../implementation/81-phase6-execution-rerun-recovery.md)
and [`90-phase6-execution-rerun-recovery.md`](../testing/90-phase6-execution-rerun-recovery.md).
The focused execution suite passes 5 tests; the full frontend suite passes 21
files / 72 tests, with lint, typecheck, and production build passing. The
CI run [`31866759003`](https://github.com/Megumi2910/testops-platform/actions/runs/31866759003)
passed all six required jobs for commit `7205b29`. The rebuilt-runtime Chrome
DevTools execution matrix and broader Phase 6 release gate remain open.

## Phase 6 slice result — categorized execution failure guidance

**Status: PASS for this source and mounted-test slice.** Execution detail now
uses the persisted failure category to explain whether an operator is facing an
assertion, locator, target, navigation-policy, timeout, browser, definition,
or worker problem. Infrastructure alerts and individual case results each show
the category, a sanitized explanation, and a recommended recovery action. A
missing or newly introduced category falls back to safe generic guidance rather
than guessing that the target is unreachable. When the same category is
present at execution and case level, the detail page keeps one diagnostic label
and retains the case recovery text so browser locators remain unambiguous.

Implementation and regression evidence are recorded in
[`82-phase6-failure-guidance.md`](../implementation/82-phase6-failure-guidance.md)
and [`91-phase6-failure-guidance.md`](../testing/91-phase6-failure-guidance.md).
The focused execution suite passes 8 tests; the complete frontend suite passes
21 files / 75 tests, with lint, typecheck, and production build passing. The
rebuilt-runtime Chrome DevTools category matrix remains open.

The first implementation push exposed a deterministic enabled-E2E regression:
the same `TARGET_UNREACHABLE` category was labelled at both execution and case
level, causing a strict Playwright locator to find two matches. The correction
keeps both recovery explanations but renders one shared diagnostic label. The
replacement CI run
[`31868169503`](https://github.com/Megumi2910/testops-platform/actions/runs/31868169503)
passed all six required jobs, including enabled E2E, so this source and CI
slice is closed. The rebuilt-runtime Chrome DevTools category matrix remains
open as release-gate evidence.

## Phase 6 slice result — dashboard panel recovery

**Status: PASS for this source and mounted-test slice.** Dashboard summary,
recent-failure, and infrastructure-category queries now render independent
error states with panel-specific retry controls. A failed recent-failures
request no longer presents a misleading green “Clear” badge, and successful
panels remain visible while another panel is retried.

Implementation and regression evidence are recorded in
[`83-phase6-dashboard-panel-recovery.md`](../implementation/83-phase6-dashboard-panel-recovery.md)
and [`92-phase6-dashboard-panel-recovery.md`](../testing/92-phase6-dashboard-panel-recovery.md).
The focused dashboard suite passes 4 tests; the full frontend suite passes 21
files / 76 tests, with lint, typecheck, and production build passing.
Implementation commit `12ae233` passed all six required jobs in CI run
[`31869102692`](https://github.com/Megumi2910/testops-platform/actions/runs/31869102692),
including enabled E2E. The rebuilt-runtime Chrome DevTools dashboard matrix
remains open as release-gate evidence.

## Phase 6 slice result — daily dashboard trends

**Status: PASS for this source and mounted-test slice.** The dashboard now
consumes the existing tenant-scoped trends endpoint and presents exact UTC
daily counts for passed, failed, and infrastructure-error cases in a semantic
table. Trend loading, empty, error, and retry states remain independent from
summary metrics, recent failures, and infrastructure categories.

Implementation and regression evidence are recorded in
[`84-phase6-dashboard-trends.md`](../implementation/84-phase6-dashboard-trends.md)
and [`93-phase6-dashboard-trends.md`](../testing/93-phase6-dashboard-trends.md).
The focused dashboard suite passes 4 tests; the full frontend suite passes 21
files / 76 tests, with lint, typecheck, and production build passing. Commit
`d9aba24` then passed all six required jobs in CI run
[`31869900629`](https://github.com/Megumi2910/testops-platform/actions/runs/31869900629),
including enabled, local-target-disabled, and browser-crash E2E. The run
emitted only the existing `actions/upload-artifact` Node 20 deprecation
annotations. The rebuilt-runtime Chrome DevTools trend and responsive matrix
remains open as release-gate evidence.

## Phase 6 slice result — UTC reporting display and table semantics

**Status: PASS for this source and mounted-test slice.** Dashboard reporting
boundaries now use an explicit UTC date formatter, preventing a browser's local
timezone from shifting the visible day. Execution-history headers now declare
their column scope for assistive technology without changing the lightweight
summary contract or navigation behavior.

Implementation and regression evidence are recorded in
[`85-phase6-dashboard-utc-display.md`](../implementation/85-phase6-dashboard-utc-display.md)
and [`94-phase6-dashboard-utc-display.md`](../testing/94-phase6-dashboard-utc-display.md).
The focused dashboard suite passes 5 tests, the focused execution suite passes
8 tests, and the full frontend suite passes 21 files / 77 tests with lint,
typecheck, and production build passing. Commit `5c23300` passed all six
required jobs in CI run
[`31870802458`](https://github.com/Megumi2910/testops-platform/actions/runs/31870802458),
including enabled, local-target-disabled, and browser-crash E2E. The run
emitted only the existing `actions/upload-artifact` Node 20 deprecation
annotations. The rebuilt-runtime Chrome DevTools check remains open as
release-gate evidence.

## Phase 2 slice result — revision-aware stale-bundle recovery

**Status: PASS for this implementation slice.** Lazy route imports now pass
through `frontend/src/app/lazyWithRecovery.ts`. Vite chunk/preload failures are
classified before they reach the root error boundary; the first failure stores
one session-scoped key for the current application revision and route, reloads
the page once, and then falls back to the branded recovery page if the same
route still cannot load. The guard prevents an infinite reload loop while
allowing a different route or a newly deployed revision to recover once.

`VITE_APP_REVISION` is populated from `VCS_REF` in the frontend build and
Compose/CI pass the checked-out revision through the build. Nginx marks
`index.html` as non-cacheable while retaining immutable caching for hashed
assets, so a fresh navigation obtains the current shell without changing API or
OAuth proxy behavior. The unit suite covers error classification and the
per-route/revision guard; `frontend/e2e/phase2-stale-bundle.spec.ts` aborts a
new lazy chunk from a retained tab and verifies the recovery boundary and build
revision.

The targeted retained-tab Playwright regression passed against the rebuilt
isolated QA frontend at `http://localhost:3000`; the earlier failure against
the old image is retained as evidence that the runtime must be rebuilt before
browser conclusions are trusted.

Implementation and test evidence are recorded in
[`64-phase2-stale-bundle-recovery.md`](../implementation/64-phase2-stale-bundle-recovery.md)
and [`73-phase2-stale-bundle-recovery.md`](../testing/73-phase2-stale-bundle-recovery.md).
The browser test intentionally simulates the removed-chunk condition in one
image; a full revision-A/revision-B container swap and live Chrome DevTools
deployment capture remain operational follow-ups before the overall release
gate can close.

## Phase 3 slice result — account security and identity recovery

**Status: PASS for this implementation slice.** The shared auth context now
exposes `reloadUser()`, allowing account mutations to refresh the authoritative
user summary without duplicating `/auth/me` calls in presentation components.
The account page is split into overview, login methods, password, password
setup, and active-session sections with stable deep-link anchors.

Password changes now validate confirmation, protect the submit action while it
is pending, and sign the browser out to `/login?reason=password-changed` after
the backend revokes all refresh sessions. Google-only users receive a guided
Send setup code → Confirm password flow; successful setup refreshes the user
summary so `PASSWORD` appears without a full reload. Google unlinking uses a
current-password confirmation dialog and returns to
`/login?reason=google-unlinked` after session cleanup. Session rows have
per-action pending states, retryable loading failures, an explicit empty state,
and `Intl.DateTimeFormat` timestamps; revoke-all returns to
`/login?reason=sessions-revoked`.

Implementation and regression evidence are recorded in
[`65-phase3-account-security.md`](../implementation/65-phase3-account-security.md)
and [`74-phase3-account-security.md`](../testing/74-phase3-account-security.md).
The local frontend gate is green at 17 test files / 53 tests. Live Chrome
DevTools verification against a rebuilt QA image, including the account
security panels and Mailpit password/Google mutation journeys, remains part of
the complete Phase 3 gate. The focused live Playwright auth/session matrix
passed 3/3 against the rebuilt QA frontend, including real Mailpit verification
and session revocation.

## Phase 4 slice result — project and definition lifecycle guards

**Status: PASS for this implementation slice.** Direct case URLs now load the
parent suite lifecycle in parallel with the case and backend action metadata.
When a suite is archived, the case page explains the parent lifecycle boundary,
renders its steps read-only, and withholds save, run, archive, and child-restore
controls until the suite is restored. This mirrors the backend
`DefinitionService.activeSuite(...)` rule instead of waiting for a rejected
mutation. The project overview's local-target recovery link now points to the
canonical `main` documentation path rather than the retired release-candidate
branch.

Implementation and regression evidence are recorded in
[`66-phase4-project-definition-guards.md`](../implementation/66-phase4-project-definition-guards.md)
and [`75-phase4-project-definition-guards.md`](../testing/75-phase4-project-definition-guards.md).
The focused lifecycle group passed 3 test files / 8 tests. A live
`definition-lifecycle.spec.ts` run passed its first two journeys; the later two
were stopped before project creation by the QA backend's registration rate limit
(`429 Too many attempts`). That is an environment-fixture throttle and remains
an isolated E2E rerun requirement, not a product-pass claim.

## Phase 5 slice result — administration user-list recovery and pagination

**Status: PASS for this implementation slice.** The administrator user page now
uses the backend's bounded `page`, `size`, and `query` contract, preserves the
previous page while a new page loads, resets pagination when search changes, and
offers a retry action after a list failure. Existing route and backend guards
remain authoritative, and per-user role/status mutations retain their pending
locks and final-active-administrator protection.

Implementation and regression evidence are recorded in
[`67-phase5-admin-user-pagination.md`](../implementation/67-phase5-admin-user-pagination.md)
and [`76-phase5-admin-user-pagination.md`](../testing/76-phase5-admin-user-pagination.md).
The focused group passed 3 test files / 8 tests. This closes the list recovery
and pagination slice only; the broader Phase 5 variable secrecy, membership
isolation, final-admin, and full Chrome DevTools matrix remain open.

## Phase 5 slice result — variable permission contract and direct-link recovery

**Status: PASS for this implementation slice.** Variable list and mutation
operations now enforce the advertised `VARIABLE_VIEW` and `VARIABLE_MANAGE`
permissions through the shared project permission policy. This keeps the
backend guard aligned with the permissions used by project navigation. Direct
`/variables` links without visibility render an actionable restricted state
without issuing a request that is guaranteed to fail, and secret values remain
masked in the rendered list.

Implementation and regression evidence are recorded in
[`68-phase5-variable-permissions.md`](../implementation/68-phase5-variable-permissions.md)
and [`77-phase5-variable-permissions.md`](../testing/77-phase5-variable-permissions.md).
The focused backend group passed 20 tests and the focused frontend group
passed 3 files / 8 tests. The broader Phase 5 tenant-isolation, final-admin,
artifact, and Chrome DevTools release matrix remains open.

## Phase 5 slice result — member-list recovery

**Status: PASS for this implementation slice.** The Members page now exposes
an in-place **Try again** action after a failed list request. Manager mutation
controls and viewer read-only rendering remain unchanged, and project/backend
membership guards continue to enforce tenant scope.

Implementation and regression evidence are recorded in
[`69-phase5-member-list-recovery.md`](../implementation/69-phase5-member-list-recovery.md)
and [`78-phase5-member-list-recovery.md`](../testing/78-phase5-member-list-recovery.md).
The focused group passed 3 files / 9 tests. The broader Phase 5 two-project
browser matrix, final-admin coverage, artifacts, and Chrome DevTools gate
remain open.

## Phase 5 slice result — membership stale-version recovery

**Status: PASS for this implementation slice.** Membership mutations now
refresh exact project and member queries after a `stale_version` conflict, so
operators receive current data before retrying. The same exact-key refresh
also removes duplicate member-list requests caused by invalidating a child key
and its parent key together.

Implementation and regression evidence are recorded in
[`70-phase5-membership-stale-recovery.md`](../implementation/70-phase5-membership-stale-recovery.md)
and [`79-phase5-membership-stale-recovery.md`](../testing/79-phase5-membership-stale-recovery.md).
The focused Members page suite passed 1 file / 5 tests. The broader Phase 5
two-project browser matrix, final-admin coverage, artifacts, and Chrome
DevTools gate remain open.

## Phase 5 slice result — administrator conflict guidance

**Status: PASS for this implementation slice.** The administration page now
maps the structured `final_active_admin` response to clear guidance that keeps
another active administrator in place. Known missing-user and validation codes
also receive stable, sanitized messages; the backend remains authoritative for
the concurrent invariant.

Implementation and regression evidence are recorded in
[`71-phase5-admin-conflict-guidance.md`](../implementation/71-phase5-admin-conflict-guidance.md)
and [`80-phase5-admin-conflict-guidance.md`](../testing/80-phase5-admin-conflict-guidance.md).
The focused administrator suite passed 1 file / 3 tests. The broader Phase 5
browser matrix, account permutations, artifacts, and Chrome DevTools gate
remain open.

## Phase 5 slice result — nested tenant-isolation regression coverage

**Status: PASS for this implementation slice.** The existing project-scoped
suite and suite-scoped case guards were verified rather than rewritten. New
backend tests cover foreign-case reads, updates, and queueing before any step,
queue, or execution side effect. The role matrix now creates two real projects
and READY cases, substitutes a foreign case UUID in a local URL, expects a
non-disclosing `404`, and proves the legitimate case still opens afterward.

Implementation and test evidence are recorded in
[`73-phase5-nested-tenant-isolation.md`](../implementation/73-phase5-nested-tenant-isolation.md)
and [`82-phase5-nested-tenant-isolation.md`](../testing/82-phase5-nested-tenant-isolation.md).
The frontend typecheck, unit suite (20 files / 62 tests), and production build
passed. Documentation manifest/link checks and Playwright test discovery also
passed. CI run `31859393419` passed all six required jobs, including backend
Maven verification and the full enabled Playwright suite. The earlier Windows
wrapper failure is closed by the Maven cache and Docker API compatibility
follow-up; the current full backend gate is now green locally as well.

## Phase 5 slice result — active-session context

**Status: PASS for this implementation slice.** The account center now shows
the optional client IP returned with each active session, while preserving
safe `Unknown browser` and `IP Unavailable` fallbacks when a proxy omits
context. Existing revoke and revoke-all semantics are unchanged.

Implementation and test evidence are recorded in
[`74-phase5-session-context.md`](../implementation/74-phase5-session-context.md)
and [`83-phase5-session-context.md`](../testing/83-phase5-session-context.md).
The focused AccountPage suite covers both populated and missing IP branches;
CI run `31860303253` passed all six required jobs for commit `87d4429`,
including the enabled Playwright suite. The broader Google, locked/disabled,
and Chrome DevTools session matrix remains open.

## Phase 6 slice result — execution retry recovery

**Status: PASS for this implementation slice.** The Runs page and
execution detail page now provide an in-place retry for failed execution
queries. Screenshot and trace actions have pending protection, and artifact
failures expose only a sanitized message plus a retry for the same artifact.
Execution records, queue state, permissions, and evidence-retention rules are
unchanged.

Implementation and local regression evidence are recorded in
[`75-phase6-execution-retry-recovery.md`](../implementation/75-phase6-execution-retry-recovery.md)
and [`84-phase6-execution-retry-recovery.md`](../testing/84-phase6-execution-retry-recovery.md).
The focused suite passes 3 tests, the full frontend suite passes 21 files / 66
tests, the production build passes, and CI run
[`31861395936`](https://github.com/Megumi2910/testops-platform/actions/runs/31861395936)
passes all six required jobs. The broader Phase 6 execution semantics and
Phase 7 live accessibility/browser matrix remain open.

## Phase 7 slice result — accessible artifact preview

**Status: PASS for this implementation slice.** Screenshot evidence now
uses a named dialog region with initial focus on **Close preview**, Escape
handling, a contained Tab cycle, and focus restoration to the invoking
artifact button. The existing inline preview, artifact retry behavior, and
backend evidence policy are unchanged. The close-control handoff now uses a
layout effect so fast artifact responses cannot expose a visible dialog before
its initial focus is installed.

Implementation and local regression evidence are recorded in
[`76-phase7-artifact-preview-dialog.md`](../implementation/76-phase7-artifact-preview-dialog.md)
and [`85-phase7-artifact-preview-dialog.md`](../testing/85-phase7-artifact-preview-dialog.md).
The focused and full frontend suites, lint, typecheck, and build pass locally.
Remote CI run
[`31862272093`](https://github.com/Megumi2910/testops-platform/actions/runs/31862272093)
passes all six required jobs (frontend, backend, containers, enabled E2E,
local-target-disabled E2E, and browser-crash E2E). The live Chrome DevTools
desktop/tablet/320×800 accessibility and performance matrix remains open.

## Phase 7 slice result — authentication field-error accessibility

**Status: PASS for this implementation slice.** Public authentication inputs
now use stable label associations and standard autocomplete tokens. Structured
backend field violations are connected to the affected control with
`aria-invalid` and `aria-describedby`, while the existing page-level alert
remains sanitized and recoverable.

Implementation and regression evidence are recorded in
[`77-phase7-auth-field-error-accessibility.md`](../implementation/77-phase7-auth-field-error-accessibility.md)
and [`86-phase7-auth-field-error-accessibility.md`](../testing/86-phase7-auth-field-error-accessibility.md).
The focused test passes 6 tests; the full frontend suite passes 21 files / 67
tests, with lint, typecheck, and build also passing locally. Remote CI run
[`31863227868`](https://github.com/Megumi2910/testops-platform/actions/runs/31863227868)
passed all six jobs (frontend, backend, containers, enabled E2E,
local-target-disabled E2E, and browser-crash E2E). The run emitted only a
non-blocking Node.js 20 deprecation annotation for `actions/upload-artifact`;
the live Chrome DevTools form and viewport matrix remains open.

### Phase 7 form metadata follow-up

QG-005 is now resolved in source for the TestOps definition workflow. Case,
suite, target-origin, and variable controls declare explicit non-personal
`autocomplete="off"` metadata while account and member identity fields retain
semantic tokens. Focused mounted coverage passes 2 files / 3 tests. The
complete frontend gate and rebuilt Chrome DevTools route matrix remain the
publication checks for this slice.

### Phase 2 stale-chunk manual recovery follow-up

QG-010 now has source-level recovery coverage for the Vite/Chromium
`error loading dynamically imported module` variant. The branded recovery page
clears only the current route/revision's automatic-retry marker before a manual
reload, preventing an automatic loop while allowing an operator to retry after
a deployment or proxy/cache correction. Focused lazy-loader and route-error
tests pass 2 files / 4 tests. The two-image deployment swap and live Chrome
DevTools retained-tab evidence remain open release-gate work. Commit `9dd6465`
passed all six required CI jobs in
[`31865017062`](https://github.com/Megumi2910/testops-platform/actions/runs/31865017062).

## Phase 1/2 slice result — rebuilt-runtime shell and browser gate

**Status: PASS for the rebuilt-runtime smoke slice.** The isolated
`testops-live-gate` Compose project was rebuilt from commit `8d85c03`; the
frontend and backend OCI revision labels matched the checked-out revision. The
focused Playwright group passed all six scenarios covering stale-chunk recovery,
OTP recovery, protected deep links, sessions, deterministic Google sign-in, and
sanitized OAuth failure.

Chrome DevTools verified the signed-in account menu, Escape focus restoration,
the mobile navigation dialog at `320×800`, the Account security route, and
console/network behavior. Mobile Lighthouse accessibility and best-practices
scores were both `100`, and the document had no horizontal overflow. The
sanitized implementation and test records are in
[`87-phase1-2-live-runtime-browser-gate.md`](../implementation/87-phase1-2-live-runtime-browser-gate.md)
and
[`96-phase1-2-live-runtime-browser-gate.md`](../testing/96-phase1-2-live-runtime-browser-gate.md).

This closes the current-image shell/account smoke gate. It does not close the
operational two-image revision-A/revision-B deployment swap or the complete
Milestone 10A Chrome DevTools matrix.

## Phase 3 slice result — password-reset handoff and account recovery notices

**Status: PASS for this implementation slice.** A successful password reset
now navigates to `/login?reason=password-reset&email=...`; the sign-in page
shows an accessible, sanitized success notice and preserves only the email.
The same notice pattern now explains password changes, Google unlinking, and
session revocation. No backend contract changed.

Implementation and test evidence are recorded in
[`88-phase3-password-reset-handoff.md`](../implementation/88-phase3-password-reset-handoff.md)
and
[`97-phase3-password-reset-handoff.md`](../testing/97-phase3-password-reset-handoff.md).
The full frontend gate passed 21 files / 80 tests, lint, typecheck, and build;
the isolated Mailpit Playwright auth/session matrix passed 7 tests. Chrome
DevTools confirmed the rebuilt login notice and expected anonymous refresh
`401`; no application exception was observed. Remaining Phase 3 work includes
the broader account mutation and role/browser matrix.

## Phase 4 slice result — existing case editor navigation guard

**Status: PASS for this implementation slice.** Existing case pages now warn
before losing unsaved metadata or ordered-step edits through internal links or
browser refresh. Intentional post-run and move-to-trash navigation remains
unblocked, while archived and read-only cases stay quiet.

Implementation and regression evidence are recorded in
[`89-phase4-case-editor-navigation-guard.md`](../implementation/89-phase4-case-editor-navigation-guard.md)
and
[`98-phase4-case-editor-navigation-guard.md`](../testing/98-phase4-case-editor-navigation-guard.md).
The focused CasePage suite passed 2 tests; frontend lint and typecheck passed.
The broader Phase 4 project, Trash, guided-builder, and browser matrix remains
open.

## Phase 5 CI remediation — administrator wording and reset handoff

The first published administrator-conflict slice exposed an enabled-E2E
contract mismatch and a flaky password-reset return to Sign in. The UI now
retains the stable `final active administrator` wording while adding the
recovery action, and password-reset links preserve only the entered email in
`/login?email=...`. Passwords, OTPs, tokens, and server details are never
placed in the URL.

Implementation and evidence are recorded in
[`72-ci-auth-recovery-remediation.md`](../implementation/72-ci-auth-recovery-remediation.md)
and [`81-ci-auth-recovery-remediation.md`](../testing/81-ci-auth-recovery-remediation.md).
The focused remediation suite passed 2 files / 8 tests. CI run `31858093963`
then passed all six jobs, including the enabled 67-test E2E workflow without a
failure or flake.

## Phase 7 slice result — readiness contrast correction

**Status: PASS for this implementation slice.** Chrome Lighthouse found two
low-contrast colors on the public readiness shell. The eyebrow now uses the
strong brand token and the footer uses a readable neutral. No route, API, or
authentication behavior changed.

Implementation and regression evidence are recorded in
[`86-phase7-testops-readiness-contrast.md`](../implementation/86-phase7-testops-readiness-contrast.md)
and
[`95-phase7-testops-readiness-contrast.md`](../testing/95-phase7-testops-readiness-contrast.md).
Frontend lint, typecheck, 21 files / 77 tests, and production build pass. The
rebuilt frontend is healthy and Chrome DevTools Lighthouse reports desktop
accessibility `100`. The remaining live role, mobile, and retained-tab release
matrix is still required before Milestone 10A can be marked complete.

## Completion pass P5 — isolated revision-matched verification harness

**Status: PASS for the isolated candidate-gate phase.** The aggregate Windows
entry point now verifies a clean committed candidate in a validated detached
worktree, uses an explicit non-default Compose project, supports an unpublished
port mode, and tears down only that disposable project and its volumes. Startup
failure diagnostics are project-scoped and include every selected service.

The tracked PgAdmin credentials now use a validator-compatible non-secret
placeholder. This closes the real pgAdmin 9.16 restart discovered by the gate;
reserved `.invalid`, `.test`, and `localhost` addresses are rejected before its
health check can pass. Running revision verification parses structured Docker
inspection JSON, avoiding Windows PowerShell Go-template quoting while still
failing closed for a missing/mismatched full SHA or unhealthy service.

Formal P5 evidence was captured for committed revision
`106ae5e0b1e073f3b1559074e4db9f41bdc248ec`:

- aggregate gate: frontend lint/typecheck/build and 24 files / 131 tests,
  complete Maven verification, five Compose configurations, documentation and
  secret audits, revision-pinned image build, all selected services healthy,
  OCI revision provenance, and scoped teardown;
- orchestration contract: 55 assertions;
- revision/health contract: 15 assertions;
- secret-safety audit: 625 files, zero public artifact publishers, and four
  ignored local artifact roots.

The machine receipts are recorded under
`.agent/plans/testops-m10a-completion-20260823/receipts/P5/`. This phase does not
claim the retained revision-A/revision-B browser swap; that proof is the current
Phase 6 slice.

## Phase 6 revision-A foundation — retained deployment provenance

**Status: SOURCE FOUNDATION PASS; LIVE A/B PROOF OPEN.** The frontend image now
renders the exact full `VCS_REF` into `X-TestOps-Revision` for the SPA shell,
hashed assets, and static `404` responses. API, OAuth, login-OAuth, and Actuator
responses remain unstamped. Index, SPA, and asset locations repeat the security
headers that Nginx would otherwise stop inheriting after a location-level
`add_header` directive.

The new retained-swap runner requires distinct adjacent commits, clean detached
worktrees/build contexts, marker absence in A and presence in B, exact OCI and
response identities, predicate-driven health coordination, retained client-side
**Sign in** navigation, exactly one old-chunk `404`, exactly one document reload,
the revision-A recovery marker, the revision-B page marker, and a stable final B
document. It merges sanitized counts/revisions/booleans into the shared ignored
P6 evidence file and emits query-backed pipeline evidence only after a real
successful run. Dry run cannot satisfy AC1.

Fresh foundation checks pass:

- revision/header contract: 31 assertions;
- orchestration/config contract: 82 assertions;
- frontend typecheck and lint.

Implementation and evidence boundaries are recorded in
[`90-phase6-retained-deployment-foundation.md`](../implementation/90-phase6-retained-deployment-foundation.md)
and
[`99-phase6-retained-deployment-foundation.md`](../testing/99-phase6-retained-deployment-foundation.md).
Formal P6 AC1 remains unchecked until the adjacent revision-B marker commit
exists and `scripts/verify-retained-swap.ps1` completes live. The account-shell,
account-security, and combined Playwright/Chrome DevTools criteria are also
separate open P6 work.

## Phase 6 revision-B account shell and security source slice

**Status: SOURCE PASS; LIVE P6 EVIDENCE OPEN.** Revision B now closes the
tablet breakpoint at `800px`, constrains the mobile drawer to the viewport,
preserves nested Escape ordering, and covers guest, unverified, verified, and
administrator states at `1440×900`, `768×1024`, and `320×800`. The account
security slice adds deterministic strict-profile OAuth fixtures, consumes link
intent on every callback path, keeps provider failures generic, and clears the
access token before mutation-triggered logout.

The focused shell/auth unit tests, OAuth handler tests, provider contract tests,
frontend typecheck/lint, and Playwright discovery gates pass. The new shell and
security specifications write sanitized ignored sidecars only after their full
matrices pass. Formal P6 AC1–AC4 remain open until revision B is committed,
the true adjacent A/B runtime completes, both Playwright and Chrome DevTools
captures are recorded, and the strict evidence manifest validates.

See [`100-phase6-account-shell-matrix.md`](../implementation/100-phase6-account-shell-matrix.md),
[`100-phase6-account-shell-matrix.md`](../testing/100-phase6-account-shell-matrix.md),
[`101-phase6-account-security-matrix.md`](../implementation/101-phase6-account-security-matrix.md),
and [`101-phase6-account-security-matrix.md`](../testing/101-phase6-account-security-matrix.md).

## Phase 6 completion — retained deployment, account shell, and account security

**Status: PASS for P6.** Final revision B is `f74e5f2af8ec4c272c43535de7df9288099f6c43`, directly
parented by revision A `2b0225b3ebe24d95634d8f5fde8ece04d27cefe2`. The live
isolated retained-tab run `retained-swap-20260824T123200Z-9808e06085` built
exact OCI/header identities, observed one stale chunk `404`, one document
reload, both revision markers, and no reload loop. The shell matrix passed
9/9 tests and 18/18 case-viewports; the security matrix passed all 11 desktop
cases and eight exact negative tuples. Playwright MCP and Chrome DevTools MCP
captures were merged by `scripts/merge-p6-browser-evidence.ps1`; strict
validation passed for 30 records and 300 assertions with zero unexpected
failures, console exceptions, or security findings.

## Phase 7 completion — authorization and resource lifecycle

P7 implementation is now source-complete: administrator role/status transitions
revoke active sessions exactly once on real changes (including reactivation),
shared JSON/blob refresh failures clear the token and AuthProvider state with a
bounded retry, and the role/status, tenant, variable, and member browser
contracts are present without skipped cases. The final status and receipt-backed
evidence counts will be appended after the isolated P7 runtime and
`artifacts/browser-evidence/P7.json` strict validation pass.
