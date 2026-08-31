# Phase 6 account-shell matrix evidence

## Current result

**SOURCE/MOUNTED PASS; LIVE BROWSER RESULT OPEN.** The component regressions,
TypeScript contract, focused lint, and Playwright discovery gate pass. The
runtime matrix is implemented. The first live attempt correctly exposed a
desktop-only CSS specificity defect in the hamburger trigger; the fix is now
covered by the desktop `toBeHidden()` assertion and must be rerun against the
rebuilt revision-B image. Formal P6 browser acceptance remains open until the
sidecar and combined tool captures are accepted.

## Exact case and viewport matrix

Each row runs at `1440×900`, `768×1024`, and `320×800`.

| Validator case ID | Contract |
| --- | --- |
| `account-shell-guest` | Readiness and Sign in remain available; authenticated workspace and account controls are absent |
| `account-shell-unverified` | Verification banner and recovery action are present; Projects, Dashboard, and Admin remain hidden |
| `account-shell-verified` | Projects, Dashboard, security, and sessions are present; verification/admin actions are absent; long name truncates without losing its accessible name |
| `account-shell-administrator` | Administrator permission exposes both Admin navigation and the Administration menu action |
| `account-shell-keyboard-navigation` | Enter, Space, arrows, Home, End, both Tab boundaries, nested Escape order, focus restoration, and drawer body lock |
| `account-shell-dismissal-and-sign-out` | Outside pointer, hash change, route selection, backdrop, and sign-out close the correct layer and reach the expected state |

The matrix therefore yields exactly 18 records. Tablet is intentionally a
drawer viewport; this protects the `768px` boundary that the previous
`760px` media query missed.

## Mounted regression result

```text
npm test -- --run src/components/AppShell.test.tsx
Test Files  1 passed (1)
Tests       13 passed (13)

npm run typecheck
PASS

npx eslint src/components/AppShell.tsx src/components/AppShell.test.tsx e2e/helpers/auth.ts e2e/account-shell.spec.ts
PASS (0 errors, 0 warnings)

npm run e2e -- account-shell.spec.ts --list
PASS (9 tests in 1 file)
```

The unit suite covers the four account boundaries, long-name target, complete
menu movement, outside/hash/route closure, nested Escape ordering, both drawer
Tab boundaries, body-scroll restoration, backdrop dismissal, and sign-out
navigation. The live matrix also asserts trigger-focus restoration before the
next keyboard-open event, avoiding a false race at the React commit boundary.
The component guard ignores stale document-level arrow events when focus is
outside the open menu, so a fresh ArrowDown starts at the first item rather
than bubbling into the new menu.

## Fixture and readiness controls

- Every ordinary-account fixture has a random run suffix and reserved
  `example.test` address.
- Mailpit delivery is polled by message-count predicate before the OTP is read.
- Administrator credentials come only from `E2E_ADMIN_EMAIL` and
  `E2E_ADMIN_PASSWORD`; they are never copied into evidence.
- The isolated `docker-compose.e2e.yml` overlay sets
  `AUTH_LOGIN_FAILURE_LIMIT=100`, `AUTH_LOGIN_IP_LIMIT=100`, and
  `AUTH_REFRESH_LIMIT=100` for the
  repeated role/viewport sign-in matrix; this is not a production
  configuration change.
- The suite is serial because it provisions shared rate-limited registration
  fixtures, while every viewport test receives a fresh Playwright page.
- No `waitForTimeout` or fixed readiness delay exists in the shell spec.

After the retained-swap run, `scripts/merge-p6-browser-evidence.ps1` merges
this sidecar with account-security and Chrome DevTools captures into the
ignored canonical `artifacts/browser-evidence/P6.json`; the strict evidence
validator is the release gate for the combined 30 case/viewport records.

At `320px`, backdrop dismissal targets the exposed left-edge strip because the
drawer intentionally covers the center of the viewport.

## Sidecar completion rule

At run start, the suite removes any previous
`artifacts/browser-evidence/inputs/account-shell-result.json`. Its `afterAll`
hook writes a new file only when all six case IDs exist at all three exact
viewports. `assertions.total` is computed from the per-case successful
assertion counters, and `assertions.failed` plus each
`assertions_failed` remain zero.

This sidecar is an input, not formal evidence by itself. P6 completion still
requires the committed revision-B runtime, the retained A/B swap, Playwright
MCP and Chrome DevTools MCP captures, canonical evidence validation, and the
tracked plan receipts.
