# Milestone 10 full-system quality-gate baseline

## Purpose and stop rule

This document is the canonical browser-testing baseline for TestOps at `http://localhost:3000` and the ecommerce target at `http://localhost:3001`. The baseline was established before lifecycle or product fixes. A failed or blocked row is evidence, not a release waiver. Product work may begin only after every row below is either executed or tied to a defect/blocker ID.

The local baseline uses QA-owned records only. It never resets the normal PostgreSQL volumes. Fixture credentials live in ignored secret files or environment variables and are deliberately absent from this document, screenshots, traces, and Git history.

## Environment provenance

| Application | Checked revision | Runtime proof | Result |
| --- | --- | --- | --- |
| TestOps | `5deaa33db239b0351aa4066c9279a51a83c9b1d7` | Backend and frontend OCI `org.opencontainers.image.revision` labels match; Compose reports healthy | PASS |
| Ecommerce | `7a430eaa48e58c2e144e2034d678aa0616822737` | Backend and frontend OCI revision labels match; Compose reports healthy | PASS |

Run `scripts/setup-quality-gate.ps1` once to create the ignored TestOps fixture secret, rebuild both stacks with revision labels, start the TestOps QA overlay, and invoke `scripts/verify-running-revisions.ps1`. The verifier waits for health and fails when any application image is stale.

## Fixture inventory

The `local-qa` TestOps profile creates or reconciles these stable identities: platform administrator, project manager, test manager, tester, viewer, non-member, isolation-project manager, unverified user, locked user, and disabled user. It also creates `[QA] Primary workspace` and `[QA] Isolation workspace`. The primary project grants the four project roles. The isolation project has its own manager and deliberately excludes every primary-project member. Password state is reconciled from the ignored file on every QA-profile startup.

Login probes returned `200` for the administrator, project manager, test manager, tester, viewer, non-member, and unverified fixtures. Locked and disabled fixtures returned the expected `403`. The project manager also completed a real browser login.

Ecommerce already has idempotent development fixtures for one verified customer, one unverified customer, one seller, one administrator, three approved products, a cart, a completed order, a verified review, and a message thread. The expanded two-customer/two-seller and state-rich fixture matrix is not yet present; this blocks the corresponding isolation tests under `QG-B06`.

## Evidence method

- Chrome DevTools is the exploratory source for accessibility-tree snapshots, network requests, console diagnostics, responsive emulation, and performance traces.
- Playwright is the repeatable hands layer. A Playwright navigation and semantic-text assertion confirmed the rebuilt ecommerce homepage and `Danh mục sản phẩm` contract.
- Raw browser output belongs in ignored `.playwright-mcp/` or `qa-artifacts/`. Only sanitized summaries are committed.
- Network evidence records methods, statuses, timing when relevant, and correlation IDs. Authorization headers, cookies, OTPs, passwords, and token values must not appear in committed evidence.

## TestOps matrix

| Area | Coverage executed in this baseline | State | Defect/blocker |
| --- | --- | --- | --- |
| Authentication | Manager browser login; API login across every seeded role/state; protected app load and refresh; enumeration-safe OTP resend, server countdown, concurrent/reload idempotency, invalid-code, protected return-URL, Mailpit verification, expired-code rejection, and verified password reset are covered by `phase5-auth-session-matrix.spec.ts`, `AuthServiceRecoveryTest`, and `auth-recovery.spec.ts`. `phase5-google-boundary.spec.ts` completes the deterministic local OAuth provider success and safe callback-failure paths. | PARTIAL | `QG-B01` still includes real Google-provider and Chrome DevTools auth variants; locked/disabled browser coverage is tracked separately under `QG-B02` |
| Account/sessions | Account page lists active refresh-token families, exposes loading/error/empty states, supports individual revoke and revoke-all, and signs out after global revocation. The deterministic Google provider also creates a verified identity and survives a session refresh in `phase5-google-boundary.spec.ts`. | PARTIAL | Real Google-provider behavior and Chrome DevTools session evidence remain |
| Projects | Two fixture projects render; target project opens; project-manager Edit project uses the versioned update contract; active duplicate-name creation returns an inline `409`; versioned project archive/restore and archived-project definition blocking are covered by `definition-lifecycle.spec.ts`; the Phase 5 role matrix also proves member/non-member project boundaries and nested suite substitution; the unverified recovery journey proves restricted project navigation after login; CI run `31687273461` passed all six jobs after the disposable crash job rerun | PARTIAL | `projects.spec.ts` and `ProjectEditPage.test.tsx` close edit/name-conflict coverage; Google/session variants remain under `QG-B01` and `QG-B02` |
| Target connectivity | Exact `localhost:3001` check returned `REACHABLE` and `POST 200` | PARTIAL | `QG-B04` Disabled-local and unreachable variants require isolated profiles to avoid mutating the normal stack |
| Suites | Backend lifecycle plus visible identity/edit/Trash/direct read-only/restore UI; QA suite archive and restore returned `200`; `definition-lifecycle.spec.ts` proves archived direct links remove Run/New case/Edit controls until restore and that same-name restore conflicts return `409` before a rename succeeds | PASS | `QG-003` resolved; expanded role automation remains in Phase 5 |
| Cases/steps | Guided Details → Steps → Review, backend-owned metadata, focused validation, draft save, explicit Move to trash, Trash projection, restore-to-DRAFT, stable server-step mapping, queue recovery, two-tab conflict recovery, and repeatable `definition-lifecycle.spec.ts` coverage | PARTIAL | `QG-004`, `QG-011`, and `QG-012` resolved; lifecycle browser evidence and the isolated Playwright path are recorded in `testing/38-definition-lifecycle-browser-evidence.md`; HTTP/browser role automation remains |
| Variables | Listing now requires advertised `VARIABLE_VIEW`; secret values remain masked for every API consumer; browser journeys prove passing and failing secret cases suppress evidence while ordinary variables retain screenshot/trace artifacts | PARTIAL | `QG-B05` full artifact-download authorization and browser variants remain |
| Members | Backend/HTTP/PostgreSQL protect scope/invariants; HTTP and service positive add/change/remove, duplicate, archived-project, final-manager, and stale-version paths are covered; the repeatable Phase 5 Playwright matrix proves test-manager, tester, viewer, and non-member controls while Chrome DevTools covers PM and administrator journeys | PASS | QG-B07 closed; broader execution and lifecycle browser matrix remains |
| Role and tenant browser matrix | `phase5-role-matrix.spec.ts` covers project roles, tenant scope, foreign-suite substitution, and `/admin/users` denial for test manager/tester/viewer/non-member; `phase5-unverified-boundary.spec.ts` covers authenticated-but-restricted users, the persistent verification banner, safe return navigation, and resend cooldown; `phase5-auth-session-matrix.spec.ts` covers invalid OTP, protected return navigation, and two-browser session revoke/revoke-all; `phase5-account-status.spec.ts` covers fresh login denial for locked and disabled accounts; `phase5-google-boundary.spec.ts` covers deterministic Google sign-in and sanitized provider failure | PARTIAL | Real-provider/Chrome DevTools auth, execution-artifact, and complete accessibility/performance variants remain in `QG-B01`, `QG-B05`, `QG-B08`, and `QG-B09` |
| Executions | Archived suites are blocked from queueing; requester/manager/denied cancellation and foreign execution IDs have service plus HTTP problem coverage; the browser matrix proves cooperative cancellation, infrastructure retry count, failure-category persistence, secret/non-secret evidence behavior, secret-bearing assertion failure suppression, click/form target escape, member screenshot/trace downloads, and non-member artifact denial; `ExecutionWorkerTest` and `ExecutionServiceTest` prove disabled polling, pre-persistence queue-full rejection, and authorization-before-lookup; the dedicated `zz-phase5-browser-crash.spec.ts` kills real managed Chromium in a fresh container and verifies `ERROR`/`BROWSER_CRASH`, failed-step preservation, and sanitized evidence; CI run `31684261528` passed all six jobs including the isolated crash job | PARTIAL | `QG-B08` real process-kill classification is closed; deployment-mode Chrome DevTools evidence and the broader final matrix remain |
| Dashboard | Tenant-scoped SQL totals/trends; bounded recent failures; independent full-window categories; two-project PostgreSQL fixture; inclusive-start/exclusive-end and >50-error proof; browser matrix renders the dashboard after a real completed run; URL-backed 7/30/90-day ranges; Chrome DevTools confirms the selected UTC window, exactly three `200` panel requests, no console messages, Lighthouse accessibility 96, LCP 501 ms, and CLS 0.03; CI run `31614750283` passed all five jobs for commit `e68c657` | PASS for dashboard sub-gate | `QG-015` and `QG-B09` resolved; broader Phase 5 role/ecommerce and browser-crash gates remain |
| Administration | Frontend route requires `USER_ADMINISTER`; transactional last-active-admin protection has focused coverage; browser matrix proves guest login redirect, verified-member denial, and project-role/non-member denial; the isolated bootstrap-admin journey changes a generated user's role/status and proves final-admin protection with inline error feedback | PARTIAL | `QG-B10` Google/session and full release matrix remain; focused administrator and role-boundary browser verification is documented in `testing/52-phase5-role-unverified-browser-evidence.md` |
| Responsive/accessibility | Lifecycle dialogs expose modal semantics, initial focus, focus trap and restoration; Trash at `320×800` has no horizontal overflow | PARTIAL | `QG-005` existing case-step form metadata remains; complete keyboard/mobile matrix continues in Phase 4/5 |

## Ecommerce matrix

| Area | Coverage executed in this baseline | State | Defect/blocker |
| --- | --- | --- | --- |
| Public catalog | Homepage, categories, featured/hot/new products and same-origin APIs all returned `200` | PASS | — |
| Responsive home | Chrome mobile emulation at `320×800`; no transport failure; semantic tree captured; category cards, product/category links, and shared-header controls now expose native semantics | PARTIAL | `QG-006` remaining route/form semantics and full mobile keyboard matrix still need closure |
| Performance | Previous mobile LCP `939 ms`, CLS `0.00`; local system fonts, SVG banners, About art, and seeded product assets now load same-origin; no external image/style/font requests in the 13-scenario contract | PASS WITH RISK | Fresh Lighthouse timing still required; QG-008 deterministic-assets sub-gate is resolved |
| Accessibility | Previous mobile Lighthouse accessibility `80`; best practices `81`; SEO `92`; local header/catalog contract now passes 12/12 browser scenarios | FAIL | `QG-006` remaining route/form findings and `QG-007` Lighthouse >=95 must be rerun after the full remediation |
| Search/catalog variants | The repeatable ecommerce contract covers seeded category navigation, product detail, keyword search, filter/sort URL state, no-result recovery, retry, and pagination | PASS for catalog sub-gate | `QG-B11` catalog/search coverage is closed; email, checkout, messaging, seller/admin, and accessibility gates remain |
| Auth/email | Existing verified and unverified fixtures are documented | BLOCKED | `QG-B12` Mailpit verification/reset/resend matrix is not attached to the normal QA overlay |
| Cart/checkout/orders/reviews | Stable cart, completed order, and review fixture exist | BLOCKED | `QG-B13` destructive and concurrency scenarios are restricted to the isolated PostgreSQL harness |
| Messaging | One deterministic customer–seller thread exists | BLOCKED | `QG-B14` second customer/seller and two-browser orchestration are absent |
| Seller/admin boundaries | One seller and administrator exist | BLOCKED | `QG-B06` cross-seller/customer/admin fixtures are incomplete |
| Unfinished destinations | Wishlist/flash-sale and other destinations remain visible | FAIL | `QG-009` incomplete features are not consistently labelled or disabled |

## Reproduced critical path

1. Sign in as the QA project manager.
2. Open `[QA] Primary workspace` and run the target check; health becomes `REACHABLE`.
3. Create suite `[QA-RUN-20260809] Definition lifecycle`.
4. Create blank case `[QA-RUN-20260809] Partial draft` as `DRAFT` with zero steps; creation returns `201`.
5. Add a default `NAVIGATE` step and leave its input empty.
6. Save the still-DRAFT case.
7. The update returns `500 internal_error` and the UI displays `An unexpected error occurred`.

The sanitized request body contains a DRAFT case and `steps[0]` with action `NAVIGATE`, empty input, and timeout `15000`. Correlation ID `3a582f44-1b86-47a1-b321-a64c02775e3a` ties browser evidence to the backend log. The log identifies an `ApiException` with `input_required` semantics being consumed by `AuthExceptionHandler`'s broad `Exception.class` handler. The definition service also validates every supplied step with READY-level completeness during replacement, so the behavior is wrong at both validation and response-contract layers.

## Frozen repair order

1. ~~`QG-001` and `QG-002`: split DRAFT/READY validation and consolidate the problem contract.~~ Resolved and browser-verified.
2. ~~Security blockers: ancestry, variable visibility, admin invariant, cancellation ownership, and archived-resource mutation.~~ Focused code and regression coverage complete; two-project/browser expansion remains in Phase 5.
3. ~~Suite/case trash and restore, including partial uniqueness and history preservation.~~ Resolved and browser-verified.
4. ~~Builder field mapping, pending protection, conflicts, dirty navigation, Save & run recovery, OTP resend cooldown/idempotency, and dashboard aggregation.~~ Phase 4 is browser/runtime verified.
5. Automated TestOps gate and complete role/tenant matrix.
6. Ecommerce fixture expansion, database/concurrency, permission, messaging, accessibility, and deterministic assets.

## Commands executed

```powershell
cd D:\Projects\testops-platform
.\backend\mvnw.cmd -B test
docker compose -f docker-compose.yml -f docker-compose.qa.yml config --quiet
.\scripts\setup-quality-gate.ps1
.\scripts\verify-running-revisions.ps1

cd D:\Projects\ecommerce-web\webcky
docker compose config --quiet
```

The original baseline backend verification passed with 59 tests. After the Phase 2–5 repairs, the current backend unit/package gate passes 111 tests, including ancestry, membership, and cancellation assertions beyond the prior 101-test gate. The focused authorization slice passes 22 tests, and the positive membership lifecycle slice passes its focused `ProjectMembershipSecurityTest` and `ProjectAccessServiceTest` gate. The isolated PostgreSQL gate additionally passes all 7 `ApplicationContextIT` cases on a clean V021 schema. Both Compose configurations parsed, both stacks became healthy, and all four application images matched their checked-out revisions at baseline capture.
