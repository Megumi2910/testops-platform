# Milestone 10 quality-gate defect ledger

## Severity policy

- **P0:** credential/data exposure, tenant escape, destructive corruption, or system-wide inability to operate.
- **P1:** core workflow blocked, incorrect authorization, or unhandled server failure in expected use.
- **P2:** significant accessibility, recovery, reliability, or consistency defect with a workaround.
- **P3:** low-risk polish or diagnostic improvement.

## Confirmed defects

### QG-001 — Partial DRAFT steps cannot be saved

- Severity: P1
- Status: RESOLVED in the Phase 2 error-contract slice
- Environment: TestOps `5deaa33d`, rebuilt and revision-verified
- Role: project manager
- Preconditions: active project, active suite, existing DRAFT case
- Reproduction: add a `NAVIGATE` step, leave its input empty, keep status DRAFT, save
- Expected: the partial draft is persisted, or a documented DRAFT structural error is mapped to `steps[0].inputValue`
- Previous actual: `PUT` returned `500 internal_error`; UI showed a generic alert
- Resolution: DRAFT replacement now validates structure and present values without requiring execution-only fields. READY retains complete action validation with step-specific paths.
- Verification: the rebuilt app saved the original partial DRAFT; focused backend tests cover DRAFT acceptance and READY rejection.
- Evidence: correlation ID `3a582f44-1b86-47a1-b321-a64c02775e3a`
- Likely subsystem: `DefinitionService.replaceSteps/validateStep`; validation is not status-aware
- Regression layer: backend unit + MockMvc + mounted builder + Playwright

### QG-002 — Domain errors are consumed by the authentication advice

- Severity: P1
- Status: RESOLVED in the Phase 2 error-contract slice
- Environment: TestOps `5deaa33d`
- Reproduction: trigger the `input_required` domain exception above
- Expected: standard `400` problem response with stable code and path-specific `errors[]`
- Previous actual: `AuthExceptionHandler.unexpected(Exception.class)` emitted `500`; backend logged the domain exception as unhandled
- Resolution: authentication advice now handles only authentication exceptions. Shared advice returns the canonical problem contract for domain, bean-validation, and sanitized unexpected failures.
- Verification: Chrome DevTools observed `400 input_required`, correlation ID `qa-ready-contract`, and `errors[0].path = steps[0].inputValue`; MVC advice tests cover the contract.
- Likely subsystem: global exception-advice ordering and duplicated response models
- Regression layer: MockMvc contract matrix

### QG-003 — Suite lifecycle controls and identity are missing

- Severity: P1
- Status: RESOLVED
- Role: project manager
- Reproduction: create and open a suite
- Expected: visible suite name/description plus edit and Move to trash actions; archived content has read-only/restore behavior
- Previous actual: the page jumped directly to case content and exposed none of those lifecycle controls
- Resolution: suite identity/edit/trash controls, project Trash, archived read-only direct links, accessible restore, and rename-on-conflict are implemented.
- Verification: Chrome DevTools archived the QA-owned suite, observed the read-only view without run/edit/create controls, restored it, and recorded only `200` lifecycle requests.
- Likely subsystem: suite detail route and missing lifecycle API/UI
- Regression layer: frontend component + Playwright lifecycle journey
- Backend resolution: lifecycle-filtered list/detail, versioned archive, restore, actor/time metadata, active-name reuse, and restore conflict responses are implemented in V021/API.

### QG-004 — Case archival is exposed as an unsafe status option

- Severity: P1
- Status: RESOLVED
- Role: project manager
- Reproduction: open an existing case editor
- Expected: explicit Move to trash confirmation, immutable history, read-only archived page, and restore-to-DRAFT flow
- Previous actual: `ARCHIVED` appeared beside DRAFT/READY in the ordinary status select; no trash, restore, conflict, or consequence UI existed
- Resolution: explicit Move to trash replaces the status option; archived cases render static steps and restore as DRAFT through conflict-aware dialogs.
- Verification: Chrome DevTools archived and restored the QA-owned partial draft and a newly authored QA-owned Homepage smoke draft; the Trash success state appeared, the archived entry retained its suite and timestamp, and the normal case status selector contains only DRAFT/READY. The full browser sequence and sanitized request list are recorded in [definition lifecycle browser evidence](38-definition-lifecycle-browser-evidence.md).
- Likely subsystem: case editor and definition lifecycle contract
- Regression layer: persistence integration + frontend dialog + Playwright
- Backend resolution: ordinary status accepts only DRAFT/READY; explicit archive/restore preserves steps/history and restore returns to DRAFT.

### QG-005 — TestOps form fields omit autocomplete metadata

- Severity: P2
- Evidence: Chrome DevTools issue on authenticated case editor
- Expected: identity and reusable form fields provide appropriate names/autocomplete semantics
- Actual: Chrome reports a form-field metadata issue
- Regression layer: accessibility/component tests

### QG-006 — Ecommerce header and card controls are not fully semantic

- Severity: P1
- Environment: ecommerce `7a430ea`, mobile `320×800`
- Evidence: accessibility tree contains unnamed header buttons/links; product cards appear as clickable generic containers rather than named links
- Expected: every control has a programmatic name and card navigation is a semantic link
- Actual: keyboard/screen-reader intent is ambiguous
- Regression layer: React accessibility tests + Playwright keyboard journey

### QG-007 — Ecommerce accessibility is below the release gate

- Severity: P1
- Evidence: Chrome Lighthouse mobile accessibility `80`, target `>=95`
- Expected: no serious route-level accessibility failures and score at least 95
- Actual: score 80, with form/control semantics among observed failures
- Regression layer: Lighthouse CI + axe/Playwright

### QG-008 — Ecommerce fixtures depend on third-party visual assets

- Severity: P2
- Evidence: homepage loads Google Fonts and multiple Unsplash resources; performance trace reports LCP render delay `771 ms`
- Expected: deterministic local assets for QA and no external availability dependency
- Actual: test rendering and evidence depend on third parties
- Regression layer: network allowlist assertion + visual smoke

### QG-009 — Incomplete ecommerce destinations look production-ready

- Severity: P2
- Evidence: wishlist and flash-sale destinations are publicly linked without a consistent incomplete/disabled contract
- Expected: implemented destinations, or clearly disabled/labelled placeholders
- Actual: navigation implies working features
- Regression layer: route inventory + UI unit tests

### QG-010 — Stale lazy chunks crash TestOps after a container rebuild

- Severity: P2
- Preconditions: keep a browser tab open while replacing the frontend image
- Reproduction: navigate from the stale tab after the new image starts
- Expected: one controlled reload or branded recovery boundary
- Actual: the browser requests a removed hashed chunk, receives `404`, and React Router renders its default unexpected-error page
- Likely subsystem: lazy-import recovery and root route error boundary
- Regression layer: deployment smoke with retained browser session

### QG-011 — Invalid Details stage does not focus the failing control

- Severity: P2
- Status: RESOLVED during the Phase 4 guided-authoring slice
- Role: project manager
- Preconditions: new-case builder on Details
- Reproduction: clear Name and choose **Continue to steps**
- Expected: remain on Details, announce `Name is required`, and focus Name
- Previous actual: the error was announced, but focus remained on the Continue button
- Resolution: Details uses `trigger('name', { shouldFocus: true })`; the mounted test asserts the field receives focus
- Verification: Chrome DevTools reproduced the original behavior, then confirmed the corrected accessibility tree marked Name as focused
- Regression layer: mounted React test + Chrome DevTools keyboard/accessibility check

### QG-012 — Stale case edits have no safe comparison workflow

- Severity: P1
- Status: RESOLVED
- Role: project manager in two authenticated tabs
- Preconditions: both tabs load the same active case version
- Reproduction: save a change in tab B, then save a different change from stale tab A
- Expected: preserve local edits, fetch latest server state, compare differences, and require an explicit reload or retry choice
- Previous actual: the API returned `409 stale_version`, but the editor exposed only the generic error detail
- Resolution: a focused comparison panel shows differing visible fields and action sequence; Reload replaces local state, while Retry submits local state with the latest fetched version
- Verification: Chrome DevTools observed `PUT 409 → GET 200`, focused comparison, `PUT 200` retry, and an independent Reload flow; the QA fixture was restored
- Regression layer: pure comparison tests + mounted component + two-tab Chrome DevTools journey

### QG-013 — OTP resend leaks account state and is not consistently idempotent

- Severity: P1
- Status: RESOLVED
- Preconditions: verification page or authenticated unverified recovery flow
- Reproduction: request resend for an unknown address; request authenticated resend repeatedly during the configured delay
- Expected: the public response cannot reveal account existence, and every resend path enforces one server-owned cooldown without sending duplicate messages
- Previous actual: the public service threw `verification_unavailable` for an unknown address; the authenticated service skipped the active challenge cooldown check
- Resolution: both paths acquire a pessimistic user-row lock and share one cooldown decision; public responses always use the same generic `202` shape, while the UI consumes the server retry window
- Verification: focused backend and mounted frontend tests; Chrome DevTools observed generic `202` plus disabled 60-second countdown; a QA registration followed by two simultaneous resend calls left Mailpit at exactly one message
- Regression layer: backend service tests + frontend component test + Mailpit browser acceptance

### QG-014 — Auth recovery E2E asserts obsolete success copy

- Severity: P2
- Status: RESOLVED
- Evidence: CI run `31465170480`; backend, frontend, containers, and local-disabled E2E passed while enabled E2E failed only on `fresh verification code`
- Expected: recovery automation verifies the generic security contract, disabled cooldown, and mailbox side effect
- Previous actual: two tests asserted a frontend phrase removed by the enumeration-safe response contract and did not count messages
- Resolution: both journeys assert the generic status and disabled countdown; the reload journey uses a bounded resend-response observation and verifies Mailpit remains at one message whether the UI suppresses the repeat or the backend accepts it idempotently
- Regression layer: Playwright + Mailpit

### QG-015 — Dashboard performs unbounded scans and truncates category totals

- Severity: P1
- Status: RESOLVED
- Preconditions: an authenticated member or administrator requests a dashboard range containing multiple executions and failures
- Reproduction: load summary/recent failures and inspect repository calls; compare infrastructure categories after the range contains more than 50 failed results
- Expected: tenant filtering and aggregation happen in PostgreSQL; recent cards are bounded without changing full-window category totals
- Previous actual: `ExecutionRepository.findAll()` loaded every execution, case results were fetched once per execution, and infrastructure categories were derived from the already limited recent-failure list
- Resolution: `DashboardReadRepository` applies the membership/global-administrator predicate to four scoped reads; totals and UTC trends aggregate in PostgreSQL, recent failures are limited to 50 in SQL, and infrastructure categories use an independent full-window `ERROR` aggregate
- Verification: four focused service tests; healthy rebuilt backend; Chrome DevTools `200` responses for all four endpoints; read-only PostgreSQL UTC grouping returned four historical buckets; isolated V021 PostgreSQL fixture proved 56 visible executions, two-project isolation, half-open dates, recent limit 50, and full category count 55; no query exception in backend logs
- Regression layer: backend service tests + PostgreSQL integration test

### QG-016 — Project archive/restore was not concurrency-safe

- Severity: P1
- Status: RESOLVED in the project lifecycle version slice
- Preconditions: two project tabs or a direct API caller hold the same project response
- Reproduction: archive or restore without a version, repeat a state transition, or submit a stale version
- Expected: the mutation requires the current project version and reports a structured conflict without changing state
- Previous actual: project archive/restore endpoints accepted no optimistic version and repeated transitions were silently idempotent
- Resolution: both endpoints require `If-Match`; `ProjectService` checks the current version, rejects stale requests and invalid repeated transitions, flushes the incremented JPA version before responding, and audits only successful changes. The frontend sends the loaded version and refreshes its cache from the response.
- Verification: `ProjectServiceContractTest` and `AuthorizationHttpContractTest` cover success, stale, repeated-state, and missing-header paths; the rebuilt isolated Playwright archived-project test passed.
- Regression layer: backend unit + MockMvc + Playwright

### QG-017 — Role and nested-resource browser boundaries were not repeatably covered

- Severity: P1
- Status: RESOLVED for the core project-role and tenant-isolation slice; the full Phase 5 release matrix remains open
- Environment: isolated TestOps E2E stack on `3100/8180`, static target on `3204`, Mailpit on `8025`
- Preconditions: verified QA users, one primary project with a suite, and a second project owned by a different user
- Previous gap: role controls had focused component/HTTP evidence, but no repeatable browser proof that TEST_MANAGER, TESTER, VIEWER, and non-member capabilities matched the project permission payload, and no browser assertion for a foreign suite identifier under a legitimate project
- Resolution: `frontend/e2e/phase5-role-matrix.spec.ts` registers run-prefixed accounts, grants project roles, checks New case/Run ready cases/Members visibility, verifies non-member project denial, and captures the authenticated foreign-suite request as `404` before confirming the legitimate suite remains readable
- Verification: both Playwright tests passed on 2026-08-12; frontend lint, typecheck, and the 32-test unit suite passed; the isolated Mailpit service was recreated on the declared Compose network after the first run found a detached stale container
- Regression layer: Playwright browser matrix plus existing service, MockMvc, and PostgreSQL authorization tests
- Remaining boundary: administrator, unverified, session, dashboard, execution-artifact, and complete accessibility/performance rows are tracked separately and are not waived by this focused pass

### QG-018 — Authenticated deep links and session management were not browser-complete

- Severity: P1
- Status: RESOLVED for the invalid-code, protected-return, and refresh-session slice; the broader authentication matrix remains open
- Environment: isolated TestOps E2E stack on `3100/8180`, Mailpit on `8025`, rebuilt from the current source revision
- Reproduction: open `/projects` while anonymous, register an unverified account, sign in, open Account in a second browser context, revoke one session, and revoke all
- Previous actual: authenticated login could be redirected to `/` before the verification guard; `GET /api/v1/users/me/sessions` fell through to static-resource handling with `500`; individual revoke returned an empty `200`, so the frontend skipped its refetch
- Resolution: login's authenticated branch now preserves the sanitized `returnTo`; `SessionController` is registered when `testops.auth.enabled=true` and returns an explicit `204` for individual revocation; Account renders session loading/error/empty states and re-fetches after a successful revoke
- Verification: `frontend/e2e/phase5-auth-session-matrix.spec.ts` passed all three scenarios; backend verification passed 124 tests; frontend lint, typecheck, unit tests (33), and isolated image rebuild passed. CI run `31588286405` also exposed and resolved an ambiguous non-exact `Projects` heading locator in the protected-return test; the product route itself was correct.
- Regression layer: backend unit/HTTP contract plus Playwright browser matrix
- Remaining boundary: Google OAuth, locked/disabled browser journeys, and administrator access are tracked under `QG-B02` and `QG-B10`; OTP expiry and password recovery are now covered by `QG-019`

### QG-019 — Password-reset purpose was rejected by the challenge schema

- Severity: P1
- Status: RESOLVED in the Phase 5 password-recovery slice
- Environment: isolated TestOps E2E stack on `3100/8180`, PostgreSQL, and Mailpit on `8025`
- Reproduction: verify an account, request a password reset, and persist a `PASSWORD_RESET` challenge
- Previous actual: the service returned a database check-constraint error because `email_verification_challenges_purpose_check` still allowed only `REGISTRATION` and `ADD_PASSWORD`
- Resolution: `V022__password_reset_challenge_purpose.sql` replaces the named PostgreSQL constraint with the three supported purposes; the public reset endpoints are permit-all and return the documented generic/204 contracts
- Verification: `AuthServiceRecoveryTest` passed 3 tests; the rebuilt E2E stack ran all 4 `auth-recovery.spec.ts` scenarios successfully, including Mailpit reset delivery and sign-in using the new password
- Regression layer: migration, service, frontend, and Playwright/Mailpit browser tests

### QG-020 — CI password-recovery run used a non-canonical browser origin

- Severity: P1
- Status: RESOLVED in the E2E environment contract slice
- Environment: CI isolated TestOps stack, frontend `3100`, backend `8180`, Mailpit `8025`
- Reproduction: run Playwright with `E2E_BASE_URL=http://127.0.0.1:3100` while the backend is configured with `FRONTEND_ORIGIN=http://localhost:3100`; complete password reset and click the final Sign in button
- Expected: origin-protected refresh/logout requests use the configured frontend origin; the final login submits the filled email and reaches the workspace
- Previous actual: refresh/logout returned `403 Request origin is not allowed`; the controlled login form could be rerendered with an empty email, so Chromium blocked submission before `/api/v1/auth/login`
- Resolution: Playwright defaults and CI profiles now use `localhost` to match `FRONTEND_ORIGIN`. `OriginGuard` remains unchanged and production remains fail-closed.
- Verification: focused recovery Playwright run passed all four scenarios against rebuilt containers; full local Playwright run passed 24 scenarios with 10 intentional ecommerce skips; CI rerun is required as the publication gate
- Regression layer: Playwright recovery journey plus CI Compose environment configuration

### QG-021 — Browser actions could mask target escape as a network failure

- Severity: P1
- Status: RESOLVED in the Phase 5 evidence-safety slice
- Preconditions: a READY case clicks a target link or submits a form whose action resolves outside the project origin
- Reproduction: use the static QA target's `Outside target` link or `Submit outside form`
- Expected: the worker rejects the main-frame navigation as `BLOCKED_NAVIGATION` before connection errors can change the category
- Previous actual: explicit `NAVIGATE` steps were guarded, but click/form requests were only observed after navigation; an unreachable destination could be reported as `TARGET_UNREACHABLE`
- Resolution: `PlaywrightCaseRunner` now observes navigation requests as well as frame and popup events, records one violation, and attributes it to the action's step outcome
- Verification: `phase5-evidence-safety.spec.ts` passed two cases; both execution case results contained `BLOCKED_NAVIGATION` and `Browser navigation left the approved project target`
- Regression layer: Playwright browser journey plus runner/service tests

### QG-022 — Secret evidence had no repeatable browser proof

- Severity: P1
- Status: RESOLVED for passing secret/non-secret cases in the Phase 5 evidence-safety slice
- Preconditions: a READY case interpolates a secret variable into an action and includes `TAKE_SCREENSHOT`
- Expected: secret-bearing cases persist no screenshot or trace; non-secret cases retain their evidence; secret plaintext is absent from the execution response
- Previous actual: worker suppression existed in source, but the release matrix did not prove persisted artifact behavior through the UI/API
- Resolution: the new browser journey creates both variable types through the Variables page and inspects the authenticated execution detail response
- Verification: two browser cases passed on the rebuilt isolated stack; the secret case had zero artifacts and the plain case had `SCREENSHOT` plus `TRACE`
- Regression layer: Playwright browser journey plus `ExecutionRunServiceTest` and `ExecutionServiceTest`

### QG-023 — CI E2E profile disabled secret variables

- Severity: P1
- Status: RESOLVED in the E2E environment configuration; remote rerun pending
- Preconditions: run the full Playwright suite in CI, where `backend/.env.example` is copied before Compose startup
- Reproduction: create a secret project variable in `phase5-evidence-safety.spec.ts`
- Expected: the variable is accepted and the worker suppresses its evidence
- Actual: the CI-only profile returned the generic save-variable failure because secret variables were disabled by default
- Resolution: `docker-compose.e2e.yml` now sets `PROJECT_SECRET_VARIABLES_ENABLED=true` and `PROJECT_VARIABLE_KEY_PATH=/run/secrets/testops/project-variable-key`; the CI preparation script emits Base64 for exactly 32 random bytes, which matches the backend AES key contract
- Verification: local isolated stack passes the two evidence-safety cases; the first corrected CI profile reached Compose startup but exposed the key-format defect, which this follow-up fixes; another CI run is required
- Regression layer: full Playwright CI workflow and Compose config gate

## Coverage blockers

| ID | Blocked coverage | Required resolution |
| --- | --- | --- |
| QG-B01 | Remaining TestOps OTP/recovery variants | Cooldown/idempotency, invalid-code, protected return-URL, session revoke, message-count proof, expired-code rejection, and verified password recovery are complete; Google and locked/disabled provider variants remain under `QG-B02` |
| QG-B02 | Google and locked/disabled session states | provider fixtures and browser matrix; individual/revoke-all session behavior is complete |
| QG-B03 | Project restore/conflict/stale version | RESOLVED by versioned archive/restore API, frontend cache wiring, and lifecycle E2E; broader edit/duplicate/project-role coverage remains in the Projects row |
| QG-B04 | target blocked/unreachable variants | isolated local-disabled/unreachable profiles |
| QG-B05 | evidence redaction in browser artifacts | variable listing now enforces `VARIABLE_VIEW` and always masks secrets; `phase5-evidence-safety.spec.ts` proves passing secret cases suppress all artifacts, ordinary cases retain screenshot/trace, and secret plaintext is absent from the detail response; secret-bearing failure and full download authorization variants remain |
| QG-B06 | ecommerce cross-customer/cross-seller/admin isolation | expanded idempotent fixtures |
| QG-B07 | remaining membership HTTP/browser matrix | RESOLVED: service/MockMvc/PostgreSQL covers ancestry, cancellation, versions, archive, final manager, positive add/change/remove, duplicate, archived-project, and role denial paths; HTTP add/change/remove/duplicate responses are explicit; Chrome DevTools confirms PM, test-manager, tester, viewer, non-member, and administrator boundaries |
| QG-B08 | queue/cancel/retry/artifact matrix | cancellation and infrastructure retry browser evidence are covered by `phase5-execution-matrix.spec.ts`; retry asserts concise sanitized connection errors with no Playwright stack/call-log leakage. `ExecutionWorkerTest` proves disabled polling never claims work, and `ExecutionServiceTest` proves a full queue returns `429 execution_queue_full` before persistence. `phase5-evidence-safety.spec.ts` proves click/form target escape is `BLOCKED_NAVIGATION`; browser-crash, secret-bearing failure, and complete artifact-download assertions remain |
| QG-B09 | dashboard populated browser matrix and query-count proof | `phase5-dashboard-admin-matrix.spec.ts` renders the dashboard after a real passed run and asserts all three dashboard API responses are HTTP 200; add Chrome DevTools role/range evidence and bounded-query instrumentation |
| QG-B10 | browser proof of administration boundaries | `phase5-dashboard-admin-matrix.spec.ts` proves guest login preservation and verified-member denial; frontend permission guard and concurrent-safe last-active-admin protection implemented; bootstrap-administrator CRUD and full role matrix remain |
| QG-B11 | ecommerce search/filter/sort URL matrix | repeatable public Playwright suite |
| QG-B12 | ecommerce email verification/reset | Mailpit QA overlay |
| QG-B13 | checkout concurrency and destructive order states | isolated PostgreSQL integration harness |
| QG-B14 | two-user messaging | second customer/seller plus two-browser orchestration |

## Triage result

There are no confirmed P0 incidents. Phases 2, 3, and 4 are complete, and `QG-017` through `QG-022` close the core role/tenant, session, OTP-expiry, password-recovery, canonical E2E-origin, navigation-boundary, and passing evidence-suppression slices. `QG-023` now includes the Compose flag and key-format fixes and awaits a clean remote CI rerun. Release status remains **PARTIAL** while Google/locked/disabled variants, administration, browser-crash/secret-failure evidence, dashboard, accessibility/performance, and twice-consecutive-CI gates remain open.
