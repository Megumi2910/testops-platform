# Milestone 10 quality-gate defect ledger

## Severity policy

- **P0:** credential/data exposure, tenant escape, destructive corruption, or system-wide inability to operate.
- **P1:** core workflow blocked, incorrect authorization, or unhandled server failure in expected use.
- **P2:** significant accessibility, recovery, reliability, or consistency defect with a workaround.
- **P3:** low-risk polish or diagnostic improvement.

## Post-merge status interpretation

The defect entries below preserve their original IDs, evidence, and regression
owners. For the current Milestone 10A release decision, use the [completion
ledger](../milestones/15-milestone-10a-testops-completion.md): a historical
resolution is not a substitute for rebuilding the merged revision and rerunning
the browser gate. QG-005 (form metadata) is resolved in source. QG-010 (stale
lazy chunks) has source-level recovery coverage, while the two-image deployment
and live browser evidence remain open. The public repository's GitHub secret-scanning endpoint is unavailable,
so the Phase 0 local audit is recorded as a compensating control rather than a
claim that hosted scanning ran.

The Phase 1 documentation follow-up run `31786506438` briefly failed the
existing Mailpit password-reset E2E test after 33 passing tests. A failed-job
rerun passed the complete enabled E2E suite and all other CI jobs were green;
this is recorded as a transient test-infrastructure/fixture timing signal,
not as evidence against the shell/account-menu implementation.

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
- Status: RESOLVED in the Phase 7 definition-form metadata slice
- Evidence: Chrome DevTools issue on authenticated case editor
- Expected: identity and reusable form fields provide appropriate names/autocomplete semantics
- Previous actual: definition fields such as case name/retry count, suite names, target origin, and variable values omitted an explicit autocomplete policy
- Resolution: non-personal TestOps definition fields now declare `autocomplete="off"`; project identity keeps the standard `organization` token and member identity keeps `email`. This prevents browser autofill heuristics from treating test definitions and secret-variable inputs as personal credentials.
- Verification: mounted CasePage and VariablesPage tests assert the metadata on case and variable controls; the full frontend lint, typecheck, unit, and build gates remain required before publication
- Regression layer: accessibility/component tests plus Chrome DevTools form metadata matrix

### QG-006 — Ecommerce header and remaining controls are not fully semantic

- Severity: P1
- Status: PARTIALLY RESOLVED; catalog, shared-header, unavailable-feature, and product-gallery sub-slices verified locally
- Environment: ecommerce `3f06fde`, mobile `320×800`
- Evidence: catalog cards use named React Router links, homepage category cards use native buttons, the shared header exposes named search/cart/message/account/menu controls, and the product-gallery browser contract proves named zoom/navigation buttons plus dialog Escape/focus restoration. The remaining baseline still contains route-level form, contrast, and mobile findings
- Expected: every control has a programmatic name and card navigation is a semantic link
- Actual: catalog, header, unavailable-destination, and gallery portions are resolved for this slice, but the overall accessibility defect remains open until the remaining routes and full Lighthouse target are remediated
- Regression layer: React accessibility tests + Playwright keyboard journey

### QG-007 — Ecommerce accessibility is below the release gate

- Severity: P1
- Evidence: Chrome Lighthouse mobile accessibility `80`, target `>=95`
- Expected: no serious route-level accessibility failures and score at least 95
- Actual: score 80, with form/control semantics among observed failures
- Regression layer: Lighthouse CI + axe/Playwright

### QG-008 — Ecommerce fixtures depend on third-party visual assets

- Severity: P2
- Status: RESOLVED for storefront and permanent mock fixtures; fresh Lighthouse timing remains a separate performance check
- Evidence: the previous baseline loaded Google Fonts and multiple Unsplash resources; the new Playwright network allowlist observed zero external image, stylesheet, or font requests after a clean container rebuild
- Expected: deterministic local assets for QA and no external availability dependency
- Resolution: local SVG banners/team art, checked-in public mock product art, system fonts, local category fallback, and seeder synchronization for existing `MOCK-*` rows. Seeder values are copied into mutable lists before Hibernate replacement.
- Actual: source and permanent fixtures are deterministic; the prior `771 ms` render-delay measurement must be refreshed before the overall performance gate can be closed
- Regression layer: network allowlist assertion + visual smoke

### QG-009 — Incomplete ecommerce destinations look production-ready

- Severity: P2
- Status: PARTIAL — wishlist and Flash Sale now have explicit unavailable status regions and disabled empty-state controls; wallet/voucher cards and header integrations already say coming soon
- Evidence: `ecommerce-smoke.spec.ts` proves the wishlist notice plus disabled filter/view controls and the Flash Sale unavailable notice
- Expected: implemented destinations, or clearly disabled/labelled placeholders
- Actual: the covered routes no longer imply working features; simulated settings and any unreviewed destination remain to audit
- Regression layer: route inventory + Playwright browser contract

### QG-010 — Stale lazy chunks crash TestOps after a container rebuild

- Severity: P2
- Preconditions: keep a browser tab open while replacing the frontend image
- Reproduction: navigate from the stale tab after the new image starts
- Expected: one controlled reload or branded recovery boundary
- Actual (before Phase 1): the browser requests a removed hashed chunk, receives `404`, and React Router renders its default unexpected-error page
- Phase 1 slice update: the root router now renders a branded recovery page with safe reload/readiness actions and no stack details. Phase 2 now adds revision-aware lazy imports, one automatic reload per route/revision, recognition of the Vite `error loading dynamically imported module` variant, and a manual retry that clears the current marker. Local gates and CI run [`31865017062`](https://github.com/Megumi2910/testops-platform/actions/runs/31865017062) pass all six jobs. A full two-image A/B deployment swap and live Chrome DevTools proof remain operational follow-ups.
- Likely subsystem: lazy-import recovery and root route error boundary
- Regression layer: lazy-import unit test + retained-tab Playwright smoke + deployment smoke with a rebuilt browser session

### QG-020 — Signed-in Account control appeared inert

- Severity: P1
- Status: RESOLVED in the Phase 1 shell slice
- Preconditions: a verified or unverified user is signed in and viewing any shell route
- Previous actual: the desktop header rendered a text link to `/account`; users had no discoverable path to security, sessions, verification recovery, administration, or sign-out actions from the top-right control.
- Resolution: `AppShell` now composes an account menu from the current user and effective platform permissions. Unverified users receive a verification link, administrators receive `/admin/users`, and sign-out clears auth state before navigating to `/login`. The same actions are available in the mobile drawer.
- Verification: `frontend/src/components/AppShell.test.tsx` covers verified, unverified, administrator, Escape/focus, sign-out, and mobile drawer behavior; `RouteErrorPage.test.tsx` covers chunk recovery. CI run `31785998751` passed all six jobs for the implementation commit. Live Chrome DevTools verification is still required against the rebuilt QA image.
- Keyboard follow-up: the trigger now opens with ArrowDown/ArrowUp and the
  menu wraps Tab and Shift+Tab at its first and last actions. The focused
  mounted regression is documented in
  [`account-menu keyboard evidence`](89-phase1-account-menu-keyboard.md); the
  implementation commit `dfc5d36` passed all six CI jobs in run
  [`31865910829`](https://github.com/Megumi2910/testops-platform/actions/runs/31865910829).
  The rebuilt-runtime Chrome DevTools matrix remains open.
- Regression layer: mounted React tests + Chrome DevTools responsive/keyboard matrix

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

### QG-027 — Direct case links ignored archived parent-suite lifecycle

- Severity: P1
- Status: RESOLVED in the Phase 4 project/definition guard slice
- Role: project manager or test manager with a bookmarked case URL
- Preconditions: an active child case remains under an archived suite
- Reproduction: open `/projects/{projectId}/suites/{suiteId}/cases/{caseId}` directly after archiving the suite
- Expected: the case is inspectable but read-only; save, run, archive, and child restore controls are unavailable until the suite is restored
- Previous actual: the case page fetched only the case and derived edit/run permission without loading the parent suite, so it could present enabled controls even though backend writes were rejected with `suite_archived`
- Resolution: `CasePage` loads the suite lifecycle alongside the case and applies the same active-suite boundary before rendering controls. The archived-suite warning explains the recovery path and static steps remain available.
- Verification: `frontend/src/features/projects/CasePage.test.tsx` passes the direct-link regression; backend `DefinitionService.activeSuite(...)` remains the authorization authority.
- Regression layer: mounted frontend test + nested backend service/HTTP coverage + Playwright lifecycle matrix

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
- Verification: `phase5-role-matrix.spec.ts` and `phase5-unverified-boundary.spec.ts` passed 3/3 in 21.6 seconds on 2026-08-13; the frontend static gates passed; the isolated Mailpit service was recreated on the declared Compose network after the first run found a detached stale container
- Regression layer: Playwright browser matrix plus existing service, MockMvc, and PostgreSQL authorization tests
- Remaining boundary: Google/session, dashboard, execution-artifact, and complete accessibility/performance rows are tracked separately and are not waived by this focused pass

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

### QG-024 — Secret-bearing failures and artifact downloads lacked complete regression coverage

- Severity: P1
- Status: RESOLVED for secret-bearing assertion failures and non-member download denial; browser-crash and full role matrix remain open
- Preconditions: a READY case uses an encrypted variable before a failing assertion, or a caller requests an artifact without project membership
- Expected: failure evidence is suppressed and non-members are denied before artifact lookup
- Previous actual: passing secret cases were covered, but failure evidence and the authorization-before-lookup path were not independently proven
- Resolution: `phase5-evidence-safety.spec.ts` now adds a secret-bearing failing case; `ExecutionServiceTest` verifies `403 project_access_denied` before execution/artifact repositories are queried
- Verification: focused backend run passed; CI run `31605913214` passed the full Playwright suite and all companion jobs
- Regression layer: Playwright browser journey plus service unit test

### QG-025 — Browser shutdown and binary artifact downloads lacked deterministic proof

- Severity: P1
- Status: RESOLVED for deterministic classification and member/non-member HTTP access
- Preconditions: Playwright closes a page/context/browser directly or through a wrapped exception; a READY case produces screenshot and trace artifacts
- Expected: browser shutdowns are classified as `BROWSER_CRASH` infrastructure failures; project members can retrieve evidence; non-members receive `403` before file access
- Previous actual: category matching only inspected the top-level exception, and the browser matrix checked artifact metadata but not both binary download paths or an independent outsider
- Resolution: `PlaywrightCaseRunner.browserCrash` walks a bounded cause chain; `phase5-artifact-download.spec.ts` verifies PNG/ZIP status, headers, and byte lengths as a member and denial as a non-member
- Verification: focused backend and browser checks passed locally; CI run `31605913214` passed all jobs including the full E2E suite
- Regression layer: `PlaywrightCaseRunnerTest`, `ExecutionServiceTest`, and Playwright browser journey

### QG-026 — Administrator mutations lacked browser proof and actionable errors

- Severity: P1
- Status: RESOLVED; focused browser verification and remote CI passed
- Preconditions: isolated E2E stack has a disposable bootstrap administrator and a generated managed account
- Expected: an administrator can change a user's platform role and account status; attempting to remove the final active administrator returns `409 final_active_admin`, leaves the account active, and displays an inline error
- Previous actual: the page fired PATCH requests without accessible control names, pending protection, or visible mutation errors, and only guest/member route guards were automated
- Resolution: `AdminUsersPage` now names both selects by email, disables controls while a mutation is pending, refetches after success, and renders status/error feedback. `AdminUserController` and `AdminUserService` now use the explicit auth-enabled property condition so their routes are registered reliably. The E2E Compose profile exposes only a generated bootstrap password to the CI process; `phase5-administrator-crud.spec.ts` covers positive changes and the final-admin invariant
- Verification: first local browser run exposed the missing controller mapping. After changing the condition, rebuilding the disposable stack, and recreating the E2E backend/frontend, `phase5-administrator-crud.spec.ts` passed in 4.2 seconds with role/status persistence and final-admin protection. CI run `31609560806` passed backend, frontend, containers, local-disabled E2E, and the full E2E suite for commit `53258e1`
- Regression layer: Playwright browser journey plus existing `AdminUserServiceTest` and `AdminUsersPage` route guard tests

### QG-028 — Administration user list had no pagination or retry recovery

- Severity: P2
- Status: RESOLVED in the Phase 5 administration-list slice
- Preconditions: a platform administrator opens `/admin/users` with more than 50 users or the list request fails
- Expected: the UI consumes server pagination, keeps search and page state coherent, and offers a retry action after a transient list failure
- Previous actual: `AdminUsersPage` always requested `size=50`, ignored `totalPages`, and rendered a dead-end error paragraph without recovery
- Resolution: the query now sends `page`, `size=25`, and deferred `query`; search resets the page, previous data remains visible during fetches, and **Try again** refetches the list
- Verification: `frontend/src/features/auth/AdminUsersPage.test.tsx` covers page navigation and failed-then-successful retry; backend controller/service already expose bounded page metadata
- Regression layer: mounted frontend test + administrator Playwright matrix + backend controller contract

### QG-029 — Variable API and direct route did not share the permission contract

- Severity: P2
- Status: RESOLVED in the Phase 5 variable-permission slice
- Preconditions: a project member opens `/variables` directly or a role matrix changes without updating the variable service
- Expected: the API enforces the advertised `VARIABLE_VIEW` and `VARIABLE_MANAGE` capabilities; unauthorized direct links explain the denial without issuing a doomed request; secrets remain masked
- Previous actual: `ProjectVariableService` repeated a `PROJECT_MANAGER` role check while the project response exposed named variable permissions, and the direct frontend route fetched variables for users who had no visibility navigation
- Resolution: `ProjectAccessService.requireProjectPermission` now reuses `ProjectService.permissionSet`; variable list/mutations require the corresponding permission, and `VariablesPage` gates the query and renders a back-to-project recovery state
- Verification: focused backend permission/masking tests passed 20 tests; focused frontend permission/masking/member/route tests passed 3 files / 8 tests
- Regression layer: backend service tests + mounted frontend route test + Phase 5 role browser matrix

### QG-030 — Members list failure had no in-place recovery

- Severity: P2
- Status: RESOLVED in the Phase 5 member-list recovery slice
- Preconditions: an authenticated project member opens `/projects/{id}/members` and the list request fails
- Expected: the page explains the failure and offers a keyboard-operable retry without losing the project context or changing role controls
- Previous actual: the page rendered a generic error sentence with no retry action, requiring a route reload
- Resolution: `MembersPage` now renders an alert beside **Try again** and refetches the same React Query key in place; manager mutation controls and viewer read-only rows are unchanged
- Verification: focused frontend member/variable/route group passed 3 files / 9 tests
- Regression layer: mounted frontend test + project-role browser matrix + backend membership tests

### QG-031 — Stale membership conflicts did not refresh current data

- Severity: P2
- Status: RESOLVED in the Phase 5 membership stale-recovery slice
- Preconditions: two project managers submit membership changes using different project versions
- Expected: the stale `409` remains understandable, current project/member data is refreshed, and recovery does not issue duplicate list requests
- Previous actual: the UI displayed “Reloaded data is required” but did not refresh the project or member queries; invalidating the member key and its parent project key also caused repeated member requests
- Resolution: all membership mutation errors with `stale_version` now refresh the exact project/member keys; parent-key invalidation no longer cascades into a second member refetch
- Verification: `MembersPage.test.tsx` passed 5/5, including one post-conflict member refetch
- Regression layer: mounted frontend test + two-tab optimistic-version browser matrix + backend membership tests

### QG-032 — Final administrator conflicts lacked stable UI guidance

- Severity: P2
- Status: RESOLVED in the Phase 5 administrator-conflict slice
- Preconditions: a platform administrator attempts to demote or disable the only active administrator
- Expected: the server rejects the unsafe mutation and the UI explains that another active administrator must remain
- Previous actual: the page displayed the raw server message without a stable, actionable mapping for the structured error code
- Resolution: `AdminUsersPage` maps `final_active_admin`, missing-user, and known validation codes to concise sanitized guidance while keeping the server invariant authoritative
- Verification: `AdminUsersPage.test.tsx` passed 3/3, including the structured `409 final_active_admin` response
- Regression layer: mounted frontend test + administrator browser matrix + backend final-admin service tests

### QG-033 — CI exposed administrator wording drift and password-reset handoff flake

- Severity: P2
- Status: RESOLVED in the CI auth-recovery remediation slice
- Preconditions: administrator conflict browser assertion or password-reset completion followed by return to Sign in
- Expected: stable final-admin wording remains discoverable; reset email survives the route transition without persisting credentials
- Actual: the first message omitted the browser contract phrase; reset email state could be lost across navigation in one CI attempt
- Resolution: retain the invariant phrase in the actionable message; carry only the email through `/login?email=...`, initialize the login field from it, and update the browser assertion to accept the documented query
- Verification: AuthPages/AdminUsersPage focused suite passed 8/8; CI run `31858093963` passed all six jobs and the enabled E2E suite without failure or flake
- Regression layer: mounted frontend + enabled Playwright E2E + Mailpit recovery flow

### QG-034 — Nested project/suite/case substitution lacked complete regression coverage

- Severity: P1
- Status: RESOLVED
- Preconditions: an authenticated project member substitutes a suite or case UUID from another project or suite
- Expected: the request returns a non-disclosing `404`, performs no definition mutation or queue write, and a later
  legitimate case remains usable
- Previous actual: source lookups were parent-scoped, but the release matrix only proved a foreign suite substitution;
  foreign-case read, mutation, and queue paths were not independently guarded by regression tests
- Resolution: `DefinitionSecurityTest` covers foreign-case reads and updates, `ExecutionServiceTest` covers foreign-case
  queueing before the queue guard, and `phase5-role-matrix.spec.ts` exercises two real projects and READY cases through
  the UI
- Verification: frontend lint, typecheck, 20-file/62-test unit suite, production build, documentation links, and
  Playwright test discovery passed. CI run `31859393419` passed all six required jobs, including backend Maven
  verification and the full enabled Playwright suite; the Windows wrapper limitation is recorded as local environment
  evidence only
- Regression layer: backend service tests plus Playwright role/tenant matrix

### QG-035 — Active-session context omitted the optional client IP

- Severity: P2
- Status: RESOLVED for the account-center presentation slice
- Preconditions: an authenticated user has multiple active sessions and the
  session API returns `createdIp` for some rows but not others
- Expected: each row shows the available browser, issue/expiry, and IP
  context; missing optional values use a clear fallback without failing the
  page
- Previous actual: `AccountPage` discarded `createdIp`, making sessions harder
  to distinguish during account-security review
- Resolution: render `IP <value>` or `IP Unavailable`, while retaining the
  existing browser fallback and revoke controls
- Verification: `AccountPages.test.tsx` covers both populated and omitted IP
  values using documentation-only test addresses
- Regression layer: mounted frontend account-center test; edge forwarding and
  session ownership remain in the backend/browser authentication gates

### QG-036 — Execution evidence failures had no in-place recovery

- Severity: P2
- Status: RESOLVED in the Phase 6 execution retry-recovery slice
- Preconditions: an authenticated member opens Runs or an execution detail
  page while the backend or artifact storage is temporarily unavailable
- Previous actual: list/detail errors offered only explanatory text, and a
  failed screenshot/trace request had no user-facing state or retry path
- Resolution: list and detail queries expose a pending-aware **Try again**
  action; artifact requests show a sanitized error and retry the same artifact
  identifier without leaving the page
- Verification: `ExecutionPages.test.tsx` passes list, detail, and screenshot
  retry scenarios; CI run `31861395936` passes all six required jobs
- Regression layer: mounted React tests plus the Phase 7 browser matrix

### QG-037 — Screenshot previews were not keyboard-accessible

- Severity: P2
- Status: RESOLVED in the Phase 7 artifact-preview dialog slice
- Preconditions: an authenticated member opens a successful screenshot artifact
  from an execution detail page
- Previous actual: the image rendered in an inline block with a close button,
  but no dialog semantics, initial focus, Escape handling, or focus restoration
- Resolution: `ArtifactPreview` exposes a named modal region, focuses its close
  control, traps Tab, closes on Escape, and restores focus to the invoking
  artifact button
- Verification: `ExecutionPages.test.tsx` passes the named-dialog, initial
  focus, Escape, and focus-restoration scenarios; CI run
  [`31862272093`](https://github.com/Megumi2910/testops-platform/actions/runs/31862272093)
  passes all six required jobs
- Regression layer: mounted React test plus Chrome DevTools accessibility and
  responsive matrix

### QG-038 — Authentication field errors were not associated with controls

- Severity: P2
- Status: RESOLVED in the Phase 7 auth-field accessibility slice
- Preconditions: a login, verification, or password-reset request returns a
  structured field violation
- Previous actual: the page showed a generic alert, but the affected input had
  no stable id, invalid state, or description relationship
- Resolution: `AuthField` supplies stable labels, standard autocomplete tokens,
  `aria-invalid`, and `aria-describedby`; `AuthPages` maps normalized
  `ApiError.fieldErrors` to the matching control while retaining a sanitized
  page-level alert
- Verification: `AuthPages.test.tsx` proves an invalid reset code is announced
  beside the input and that the input points to its error description. Local
  frontend gates passed, and CI run
  [`31863227868`](https://github.com/Megumi2910/testops-platform/actions/runs/31863227868)
  passed all six required jobs; the live Chrome DevTools form and viewport
  matrix remains open
- Regression layer: mounted authentication tests plus Chrome DevTools form and
  keyboard matrix

### QG-039 — Readiness shell text failed contrast checks

- Severity: P2
- Status: RESOLVED in the Phase 7 readiness contrast slice
- Preconditions: rebuilt TestOps frontend, guest readiness route
- Previous actual: Lighthouse measured `.eyebrow` at `4.02:1` and the footer at
  `3.55:1` against the readiness background
- Resolution: the eyebrow uses the stronger brand token and the footer uses a
  readable neutral that both meet WCAG AA normal-text contrast
- Verification: frontend lint, typecheck, 21 files / 77 tests, and production
  build pass; rebuilt Chrome DevTools Lighthouse desktop accessibility is `100`
- Regression layer: frontend gates plus Chrome DevTools/Lighthouse readiness
  snapshot

## Coverage blockers

| ID | Blocked coverage | Required resolution |
| --- | --- | --- |
| QG-B01 | Remaining TestOps OTP/recovery variants | Cooldown/idempotency, invalid-code, protected return-URL, session revoke, message-count proof, expired-code rejection, and verified password recovery are complete; Google provider coverage remains under `QG-B02` |
| QG-B02 | Google and locked/disabled session states | `phase5-account-status.spec.ts` covers fresh password-session denial for `LOCKED` and `DISABLED` accounts; local 5.3-second run and CI `31611690370` passed. `phase5-google-boundary.spec.ts` now covers deterministic local-provider sign-in, session refresh, and sanitized callback failure; real Google-provider credentials and Chrome DevTools variants remain |
| QG-B03 | Project restore/conflict/stale version | RESOLVED by versioned archive/restore API, frontend cache wiring, project-manager edit/name-conflict browser coverage in `projects.spec.ts`, and lifecycle E2E; stale-version UI remains covered by the existing focused conflict contract |
| QG-B04 | target blocked/unreachable variants | isolated local-disabled/unreachable profiles |
| QG-B05 | evidence redaction in browser artifacts | variable listing now enforces `VARIABLE_VIEW` and always masks secrets; `phase5-evidence-safety.spec.ts` proves passing and failing secret cases suppress all artifacts, ordinary cases retain screenshot/trace, and secret plaintext is absent from the detail response; member/non-member download authorization is covered separately |
| QG-B06 | ecommerce cross-customer/cross-seller/admin isolation | PARTIAL: fixtures and read isolation are covered by `phase5-ecommerce-role-isolation.spec.ts`; `phase5-ecommerce-permission-matrix.spec.ts` now proves guest/unverified restrictions, customer/seller/admin boundary denial, non-disclosing foreign-product mutation rejection, and administrator read surfaces. Seller/admin writes, seller order ownership transitions, review ownership, and the complete endpoint/UI matrix remain |
| QG-B07 | remaining membership HTTP/browser matrix | RESOLVED: service/MockMvc/PostgreSQL covers ancestry, cancellation, versions, archive, final manager, positive add/change/remove, duplicate, archived-project, and role denial paths; HTTP add/change/remove/duplicate responses are explicit; Chrome DevTools confirms PM, test-manager, tester, viewer, non-member, and administrator boundaries |
| QG-B08 | queue/cancel/retry/artifact matrix | cancellation and infrastructure retry browser evidence are covered by `phase5-execution-matrix.spec.ts`; retry asserts concise sanitized connection errors with no Playwright stack/call-log leakage. `ExecutionWorkerTest` proves disabled polling never claims work, and `ExecutionServiceTest` proves a full queue returns `429 execution_queue_full` before persistence and denies non-member artifacts before lookup. `phase5-evidence-safety.spec.ts` proves click/form target escape and secret-bearing failure suppression; `phase5-artifact-download.spec.ts` proves member PNG/ZIP downloads and outsider denial. `zz-phase5-browser-crash.spec.ts` now terminates real managed Chromium in a fresh container and verifies `ERROR`/`BROWSER_CRASH`, failed-step preservation, and sanitized error text; deployment-mode DevTools evidence remains |
| QG-B09 | dashboard populated browser matrix and query-count proof | RESOLVED: `phase5-dashboard-admin-matrix.spec.ts` renders the dashboard after a real passed run; `DashboardPage.test.tsx` covers bounded URL windows and selector refetch; rebuilt Chrome DevTools evidence confirms the selected UTC range, exactly three `200` panel requests, no console messages, Lighthouse accessibility 96, LCP 501 ms, and CLS 0.03. See [dashboard range and DevTools evidence](51-phase5-dashboard-range-devtools.md) |
| QG-B10 | browser proof of administration boundaries | Focused administrator CRUD/final-admin, locked/disabled, project-role `/admin/users` denial, and unverified recovery journeys are covered by `phase5-administrator-crud.spec.ts`, `phase5-account-status.spec.ts`, `phase5-role-matrix.spec.ts`, and `phase5-unverified-boundary.spec.ts`; Google/session and broader release variants remain |
| QG-B11 | ecommerce search/filter/sort URL matrix | RESOLVED for the catalog sub-gate: `ecommerce-smoke.spec.ts` covers category navigation, product detail, keyword/no-result search, filter/sort URL state, retry, and pagination against the permanent mock catalog; checkout, messaging, permissions, and accessibility remain separate gates |
| QG-B12 | ecommerce email verification/reset | RESOLVED for the deterministic delivery sub-gate: `ecommerce-auth-mailpit.spec.ts` passes registration → same-origin verification, unverified resend/cooldown, and password reset (3/3) against the isolated ecommerce PostgreSQL/Mailpit profile. Real SMTP-provider behavior remains outside this local gate; see `testing/60-phase5-ecommerce-mailpit-auth-evidence.md` |
| QG-B13 | checkout concurrency and destructive order states | PARTIAL: `OrderServiceImplCheckoutTest` and `phase5-ecommerce-checkout.spec.ts` prove server-side pricing, selected-item cleanup, UUID idempotency replay, and exact-once cancellation restoration; `phase5-ecommerce-checkout-concurrency.spec.ts` proves two-user final-unit locking, one successful order, one normal `4xx` rejection, and exact restoration; `phase5-ecommerce-payment-stale-stock.spec.ts` proves backend-owned QR configuration and stale-cart recovery; `phase5-ecommerce-reviews.spec.ts` and `ReviewServiceEligibilityTest` prove completed-purchaser creation, duplicate rejection, and non-purchaser rejection. Payment capture/webhooks and the broader checkout accessibility matrix remain; see `testing/66-phase5-ecommerce-checkout-concurrency-evidence.md`, `testing/67-phase5-payment-stale-stock-evidence.md`, and `testing/69-phase5-ecommerce-review-evidence.md` |
| QG-B14 | two-user messaging | PARTIAL: separate customer-A/seller-B and customer-B/seller-B threads are seeded, foreign REST reads return `404`, and the two-context browser contract proves WebSocket send/receive, disconnected REST fallback, unread filtering, and read-state removal; backend-restart reconnect timing, native stress, and the complete role/thread matrix remain; see `testing/68-phase5-ecommerce-messaging-resilience-evidence.md` |

## Triage result

There are no confirmed P0 incidents. Phases 2, 3, and 4 are complete, and `QG-017` through `QG-026` close the core role/tenant, unverified recovery, session, OTP-expiry, password-recovery, canonical E2E-origin, navigation-boundary, evidence-suppression, secret-failure, deterministic artifact-access, administrator mutation, and dashboard reporting slices. The deterministic Google OAuth sub-gate is now closed for the isolated E2E provider; release status remains **PARTIAL** while real-provider/Chrome DevTools authentication, real browser-crash reproduction, broader account/session permutations, ecommerce, and twice-consecutive-CI gates remain open.
