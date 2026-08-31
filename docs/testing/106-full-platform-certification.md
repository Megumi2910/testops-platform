# Full TestOps certification — 2026-08-31

## Status

**PASS for the agreed non-OAuth scope.** The owner explicitly retained real
Google OAuth testing, so this report records that provider as user-owned and
not executed by the certification agent. It does not imply real-provider
coverage that was not performed.

## Environments and evidence

| Scope | Result | Evidence |
| --- | --- | --- |
| Normal TestOps and ecommerce target | PASS | The persistent `Ecommerce` project has exactly 9 catalog-managed suites, 38 cases, 34 READY cases, and 4 documented DRAFT shared-state workflows. The six runnable suites retained final green executions: 1/1, 10/10, 10/10, 2/2, 7/7, and 4/4 cases respectively. A restart preserved definitions, secret variables, execution history, and artifacts. |
| QA role isolation | PASS | API login/project matrix passed for administrator, project manager, test manager, tester, viewer, non-member, isolation manager, unverified, locked, and disabled identities. The administrator saw both QA projects; each project role saw only its assigned project; substituted project access returned `403`; locked and disabled login returned `403`. |
| Deterministic E2E | PASS | 103 Chromium tests passed on the isolated E2E stack. The focused stale-bearer revocation regression also passed. |
| Local target disabled | PASS | The isolated `3101` stack passed `local-target-disabled.spec.ts`: a user cannot create a project when no safe target origin is registered. |
| Retained deployment recovery | PASS | The live A/B validator completed one stale-chunk `404`, one document reload, and a stable revision-B page with no reload loop. |
| Guest browser/runtime | PASS | Chrome DevTools observed an accessible landing page, no console messages, and only expected requests: provider discovery `200`, anonymous refresh `204`, and readiness `200`. Mobile Lighthouse scored accessibility 100 and best practices 100. |
| Real Google OAuth | USER-OWNED / NOT EXECUTED | Google authorization reaches the configured provider and deterministic OAuth regression passes. Real account selection, reload, logout/retry, existing-password recovery, and Account Security linking remain the account owner's manual check. |

## Corrections made during certification

- Rotated the legacy ecommerce account secret and removed its guarded historic
  normal-stack execution evidence before creating the reusable catalog. Secret
  values are confined to ignored runtime configuration and TestOps secret
  variables; no secret values are recorded here.
- Corrected the catalog search locator to the visible page-search field and
  reduced the review assertion to the stable review marker exposed by the
  target. The target does not expose a review-edit affordance, so that
  shared-target workflow remains a documented DRAFT rather than a false
  unattended assertion.
- Made a missing refresh cookie an intentional `204 No Content` bootstrap
  result. This removes the anonymous-page `401` console noise while retaining
  invalid refresh-cookie rejection.
- Rewrote the stale-session test to prove that an already-issued bearer is
  rejected after an administrator locks the user; reactivation does not revive
  that bearer.

## Completion notes

- The focused final non-OAuth browser subset passed 20/20 checks, including
  accessibility, keyboard/dialog behavior, cross-origin navigation blocking,
  and glyph/account-trigger activation at 320, 390, 800, and 801 CSS pixels.
- The normal frontend/backend restart preserved the catalog inventory (9
  suites, 38 cases, 34 READY), 10 retained executions, and 71 artifacts; the
  normal health endpoint returned `200` after restart.
- The existing PR CI passed all six jobs: frontend, backend, containers, E2E,
  local-target-disabled, and browser-crash. The PR remains open and unmerged.

Raw Playwright, DevTools, retained-swap, database-backup, and artifact output
is ignored. The committed evidence contains no tokens, cookies, OTPs,
passwords, request bodies, or external-account identifiers.
