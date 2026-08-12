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
- Verification: Chrome DevTools archived and restored the QA-owned partial draft; the Trash success state appeared and the normal case status selector now contains only DRAFT/READY.
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

## Coverage blockers

| ID | Blocked coverage | Required resolution |
| --- | --- | --- |
| QG-B01 | Remaining TestOps OTP/recovery/session variants | Cooldown/idempotency and message-count proof are complete; add time-controlled expiry, invalid-code, password recovery, return-URL, and session cases |
| QG-B02 | Google and full session-revocation states | provider/session fixtures |
| QG-B03 | Project restore/conflict/stale version | lifecycle API/UI |
| QG-B04 | target blocked/unreachable variants | isolated local-disabled/unreachable profiles |
| QG-B05 | evidence redaction in browser artifacts | variable listing now enforces `VARIABLE_VIEW` and always masks secrets; runner screenshot/trace assertions remain |
| QG-B06 | ecommerce cross-customer/cross-seller/admin isolation | expanded idempotent fixtures |
| QG-B07 | remaining membership HTTP/browser matrix | service/MockMvc/PostgreSQL covers ancestry, cancellation, versions, archive, final manager, positive add/change/remove, duplicate, archived-project, and role denial paths; HTTP add/change/remove/duplicate responses are now explicit; PM and direct-URL viewer DevTools acceptance is complete; add test-manager/tester/non-member/admin browser journeys |
| QG-B08 | queue/cancel/retry/artifact matrix | authoring repair and executable READY fixtures |
| QG-B09 | dashboard populated browser matrix and query-count proof | two-project PostgreSQL isolation, half-open boundaries, recent cap, and full-window totals are automated; add Chrome DevTools role/range evidence and bounded-query instrumentation |
| QG-B10 | browser proof of administration boundaries | frontend permission guard and concurrent-safe last-active-admin protection implemented; full role matrix remains |
| QG-B11 | ecommerce search/filter/sort URL matrix | repeatable public Playwright suite |
| QG-B12 | ecommerce email verification/reset | Mailpit QA overlay |
| QG-B13 | checkout concurrency and destructive order states | isolated PostgreSQL integration harness |
| QG-B14 | two-user messaging | second customer/seller plus two-browser orchestration |

## Triage result

There are no confirmed P0 incidents. Phases 2, 3, and 4 are complete. Release status remains **PARTIAL** while the automated Phase 5 role, tenant, lifecycle, browser, accessibility, and PostgreSQL matrix remains open.
