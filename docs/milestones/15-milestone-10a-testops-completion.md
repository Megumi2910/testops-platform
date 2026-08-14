# Milestone 10A — TestOps first-release completion

## Current slice: Phase 4 project and definition workflow closure

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
- Full backend `.\mvnw.cmd -B verify` reaches the integration phase but the
  Windows Java process cannot discover Docker through Testcontainers, even
  though the same Docker Desktop engine serves Compose. It fails before a
  PostgreSQL container is created with `Could not find a valid Docker
  environment`. This is an environment blocker for the local integration gate,
  not a product assertion failure; CI's Linux runner and the isolated QA
  Compose health gate remain required evidence.

## Phase 0 result

**Status: PASS for Phase 0.** The completion branch is pushed, the isolated QA
stack is healthy and revision-matched, frontend and backend unit/package gates
are green, and remote CI run `31782848666` executed and passed all six jobs.

The full local Testcontainers integration gate remains an environment-specific
Windows limitation and is covered by the passing Linux CI backend job. This
does not waive the integration tests in later slices.

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
