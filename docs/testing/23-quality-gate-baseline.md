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
| Authentication | Manager browser login; API login across every seeded role/state; protected app load and refresh; enumeration-safe OTP resend, server countdown, concurrent/reload idempotency, and one-message Mailpit proof | PARTIAL | `QG-013` and stale E2E assertion `QG-014` resolved; expiry, invalid-code, recovery, return-URL, and session variants remain under `QG-B01` |
| Account/sessions | Authenticated account navigation is reachable | BLOCKED | `QG-B02` Password/Google identity and revoke variants require provider/session fixtures |
| Projects | Two fixture projects render; target project opens; project archive/restore and archived-project definition blocking are covered by `definition-lifecycle.spec.ts` | PARTIAL | `QG-B03` Edit, duplicate, stale-version, and full permission matrix are not exposed as one safe QA flow |
| Target connectivity | Exact `localhost:3001` check returned `REACHABLE` and `POST 200` | PARTIAL | `QG-B04` Disabled-local and unreachable variants require isolated profiles to avoid mutating the normal stack |
| Suites | Backend lifecycle plus visible identity/edit/Trash/direct read-only/restore UI; QA suite archive and restore returned `200`; `definition-lifecycle.spec.ts` proves archived direct links remove Run/New case/Edit controls until restore and that same-name restore conflicts return `409` before a rename succeeds | PASS | `QG-003` resolved; expanded role automation remains in Phase 5 |
| Cases/steps | Guided Details → Steps → Review, backend-owned metadata, focused validation, draft save, explicit Move to trash, Trash projection, restore-to-DRAFT, stable server-step mapping, queue recovery, two-tab conflict recovery, and repeatable `definition-lifecycle.spec.ts` coverage | PARTIAL | `QG-004`, `QG-011`, and `QG-012` resolved; lifecycle browser evidence and the isolated Playwright path are recorded in `testing/38-definition-lifecycle-browser-evidence.md`; HTTP/browser role automation remains |
| Variables | Listing now requires advertised `VARIABLE_VIEW`; secret values remain masked for every API consumer | PARTIAL | `QG-B05` browser artifact redaction assertions remain |
| Members | Backend/HTTP/PostgreSQL protect scope/invariants; HTTP and service positive add/change/remove, duplicate, archived-project, final-manager, and stale-version paths are covered; PM, test-manager, tester, viewer, non-member, and administrator Chrome DevTools journeys confirm permission-aware navigation and mutation boundaries | PASS | QG-B07 closed; broader execution and lifecycle browser matrix remains |
| Executions | Archived suites are blocked from queueing; requester/manager/denied cancellation and foreign execution IDs have service plus HTTP problem coverage | PARTIAL | `QG-B08` retry/worker/target-escape, persisted role HTTP coverage, and full browser matrix remain |
| Dashboard | Tenant-scoped SQL totals/trends; bounded recent failures; independent full-window categories; two-project PostgreSQL fixture; inclusive-start/exclusive-end and >50-error proof | PARTIAL | `QG-015` resolved; `QG-B09` now covers populated Chrome DevTools role/range checks and explicit query-count instrumentation |
| Administration | Frontend route requires `USER_ADMINISTER`; transactional last-active-admin protection has focused coverage; direct PM navigation redirected to dashboard with no console/network failure | PARTIAL | `QG-B10` complete Chrome DevTools role matrix remains |
| Responsive/accessibility | Lifecycle dialogs expose modal semantics, initial focus, focus trap and restoration; Trash at `320×800` has no horizontal overflow | PARTIAL | `QG-005` existing case-step form metadata remains; complete keyboard/mobile matrix continues in Phase 4/5 |

## Ecommerce matrix

| Area | Coverage executed in this baseline | State | Defect/blocker |
| --- | --- | --- | --- |
| Public catalog | Homepage, categories, featured/hot/new products and same-origin APIs all returned `200` | PASS | — |
| Responsive home | Chrome mobile emulation at `320×800`; no transport failure; semantic tree captured | PARTIAL | `QG-006` unnamed controls and non-semantic product cards |
| Performance | Mobile LCP `939 ms`, CLS `0.00`; no throttling; render delay `771 ms` | PASS WITH RISK | `QG-008` external fonts/images remain nondeterministic and dominate the dependency chain |
| Accessibility | Mobile Lighthouse accessibility `80`; best practices `81`; SEO `92` | FAIL | `QG-006`, `QG-007` |
| Search/catalog variants | Stable seeded content is visible | BLOCKED | `QG-B11` category/filter/sort/no-result/URL variants need the repeatable browser suite |
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
