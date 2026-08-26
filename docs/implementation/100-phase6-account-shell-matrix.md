# Phase 6 account-shell matrix

## Outcome and evidence boundary

Phase 6 turns the account shell from a desktop-oriented implementation into a
single responsive interaction contract. The same navigation and account menu
now cover guest, unverified, verified-member, and administrator states at
desktop, tablet, and minimum-width mobile viewports.

The source and mounted unit result is complete. The Playwright matrix is
implemented and discoverable; the live run also guards the desktop breakpoint
against the `.icon-button` display rule overriding the hidden navigation
trigger. The committed revision-B stack must still run all nine tests and
write the ignored sanitized result sidecar before this document claims a full
browser PASS.

## Responsive shell decisions

The drawer breakpoint is `800px`, so the required `768×1024` tablet viewport
uses the same modal navigation contract as `320×800`. While open, the drawer:

- spans the full `100dvh` viewport;
- owns vertical scrolling with `overflow-y: auto`;
- contains scroll chaining with `overscroll-behavior: contain`;
- keeps the existing body-scroll lock, initial focus, focus trap, and trigger
  restoration behavior.

The account name is a real shrinkable flex item rather than an inline span.
`min-width: 0`, a bounded flex basis, and `text-overflow: ellipsis` prevent a
long display name from forcing horizontal overflow while preserving the full
name in the button's accessible label and menu identity.

The desktop hamburger trigger uses the more-specific `.icon-button.nav-menu`
selector because the shared `.icon-button` rule is declared later in the
stylesheet. The mobile media rule restores `inline-flex` at `800px` and below;
this keeps the trigger hidden at `1440px` while preserving the tablet/mobile
drawer contract.

## Nested keyboard behavior

The account menu and mobile drawer both listen for Escape. Closing both on one
key press would skip an interaction layer and move focus unexpectedly. The
drawer now ignores Escape while its descendant account menu is present (or a
child handler has already prevented the event), so:

1. the first Escape closes the account menu and restores the account trigger;
2. the second Escape closes the drawer, restores body scrolling, and returns
   focus to the hamburger button.

The browser matrix explicitly waits for that trigger-focus restoration before
opening the menu again with ArrowDown. This makes the evidence deterministic
across React's state commit boundary while asserting the same user-visible
keyboard contract. The account trigger stops its ArrowUp/ArrowDown event before
the document-level menu-key handler can observe the closing menu's stale
listener, preventing the newly opened menu from skipping its first or last
item.

Native buttons retain browser Enter/Space activation. The menu continues to
support Arrow Up/Down, Home, End, forward Tab wrapping, and reverse Tab
wrapping. Pointer-down outside, route/hash navigation, the close control, the
backdrop, and sign-out remain explicit dismissal paths.

At the `320px` minimum viewport the drawer leaves only a narrow exposed
backdrop strip. The browser test clicks that deterministic left-edge hit area,
rather than the covered center of the backdrop, so it exercises the real
pointer dismissal without letting the drawer intercept the event.

## Browser contract and safe evidence

`frontend/e2e/account-shell.spec.ts` defines the six validator case IDs at
`1440×900`, `768×1024`, and `320×800`—18 case/viewport records in total. Two
unique ordinary accounts are created through registration and Mailpit OTP
verification; the administrator state uses the disposable E2E bootstrap
administrator. The isolated Compose overlay raises only the login attempt,
login-IP, and refresh budgets to `100` so the deliberate repeated sign-in
matrix is not
mistaken for an attack; production defaults remain unchanged. Readiness uses
URL, element, response, and Mailpit predicates; there are no fixed readiness
sleeps.

The final ignored P6 manifest is assembled by
`scripts/merge-p6-browser-evidence.ps1`, which combines the shell/security
sidecars with the retained-swap block and records sanitized Playwright and
Chrome DevTools capture identifiers. The strict validator accepts the
PowerShell JSON parser's typed UTC timestamp while still enforcing the exact
ISO-8601 contract in the raw manifest.

Only after all 18 records complete does the suite write
`artifacts/browser-evidence/inputs/account-shell-result.json`. The ignored
sidecar contains case IDs, viewport IDs, pass status, assertion totals, a UTC
timestamp, and the `sanitized` flag. It excludes fixture email addresses,
display names, cookies, credentials, OTPs, headers, request/response bodies,
and URLs containing user data. A failed or incomplete suite removes the
sidecar instead of leaving success-shaped stale evidence.

## Source verification

Run from `frontend/`:

```powershell
npm test -- --run src/components/AppShell.test.tsx
npm run typecheck
npx eslint src/components/AppShell.tsx src/components/AppShell.test.tsx e2e/helpers/auth.ts e2e/account-shell.spec.ts
npm run e2e -- account-shell.spec.ts --list
```

The current source pass is 13 focused unit tests, successful typechecking,
focused lint with zero findings, and nine listed Playwright tests. The live
account-shell run, Playwright MCP capture, Chrome DevTools capture, and merge
into canonical P6 evidence remain release-gate work rather than implied
results.
