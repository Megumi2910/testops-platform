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
- Role: project manager
- Reproduction: create and open a suite
- Expected: visible suite name/description plus edit and Move to trash actions; archived content has read-only/restore behavior
- Actual: the page jumps directly to case content and exposes none of those lifecycle controls
- Likely subsystem: suite detail route and missing lifecycle API/UI
- Regression layer: frontend component + Playwright lifecycle journey

### QG-004 — Case archival is exposed as an unsafe status option

- Severity: P1
- Role: project manager
- Reproduction: open an existing case editor
- Expected: explicit Move to trash confirmation, immutable history, read-only archived page, and restore-to-DRAFT flow
- Actual: `ARCHIVED` appears beside DRAFT/READY in the ordinary status select; no trash, restore, conflict, or consequence UI exists
- Likely subsystem: case editor and definition lifecycle contract
- Regression layer: persistence integration + frontend dialog + Playwright

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

## Coverage blockers

| ID | Blocked coverage | Required resolution |
| --- | --- | --- |
| QG-B01 | TestOps OTP/recovery/session variants | Mailpit-driven auth harness and time-controlled challenges |
| QG-B02 | Google and full session-revocation states | provider/session fixtures |
| QG-B03 | Project restore/conflict/stale version | lifecycle API/UI |
| QG-B04 | target blocked/unreachable variants | isolated local-disabled/unreachable profiles |
| QG-B05 | evidence redaction in browser artifacts | variable listing now enforces `VARIABLE_VIEW` and always masks secrets; runner screenshot/trace assertions remain |
| QG-B06 | ecommerce cross-customer/cross-seller/admin isolation | expanded idempotent fixtures |
| QG-B07 | membership mutation and final-manager rules | security contract tests |
| QG-B08 | queue/cancel/retry/artifact matrix | authoring repair and executable READY fixtures |
| QG-B09 | dashboard range/tenant/query verification | aggregate fixtures and query-count instrumentation |
| QG-B10 | browser proof of administration boundaries | frontend permission guard and concurrent-safe last-active-admin protection implemented; full role matrix remains |
| QG-B11 | ecommerce search/filter/sort URL matrix | repeatable public Playwright suite |
| QG-B12 | ecommerce email verification/reset | Mailpit QA overlay |
| QG-B13 | checkout concurrency and destructive order states | isolated PostgreSQL integration harness |
| QG-B14 | two-user messaging | second customer/seller plus two-browser orchestration |

## Triage result

There are no confirmed P0 incidents. `QG-001` and `QG-002` are resolved, and the first Phase 2 security slice now enforces nested ancestry, variable visibility, cancellation ownership, archived-suite mutation/queue guards, the active-administrator invariant, and the frontend admin route. Other P1 lifecycle and authoring defects remain open, so release status is **PARTIAL** and the next product slice is Phase 3 history-preserving trash and restore.
