# Phase 1 account-menu keyboard evidence

## Automated result

The focused mounted suite passes 7 tests, including the new keyboard paths:

```text
npm test -- --run src/components/AppShell.test.tsx
Test Files  1 passed (1)
Tests       7 passed (7)
```

The regression renders the shared `AppShell` with the same `AuthContext` used
by the application. It enters the menu from the desktop trigger, asserts the
initial focus position for both arrow directions, and verifies both Tab
boundaries without depending on a browser's native Tab simulation.

The implementation commit `dfc5d36` also passed the complete CI workflow:
[`31865910829`](https://github.com/Megumi2910/testops-platform/actions/runs/31865910829).
Backend, frontend, containers, enabled E2E, local-disabled E2E, and
browser-crash E2E were all successful.

## Manual Chrome DevTools follow-up

Against a rebuilt TestOps image, repeat this short matrix at desktop and
`320×800`:

| Step | Expected result |
| --- | --- |
| Focus the account trigger and press ArrowDown | Menu opens; Account security is focused |
| Focus the trigger and press ArrowUp | Menu opens; the last visible action is focused |
| Press Tab from the last action | Focus wraps to the first action |
| Press Shift+Tab from the first action | Focus wraps to the last action |
| Press Escape | Menu closes and trigger regains focus |
| Activate Account security, sessions, verification, admin, and sign out | Route/action completes and menu closes |

Record the accessibility tree, focused node, viewport, console output, and
revision label in the quality-gate evidence directory. Do not record tokens,
passwords, OTPs, or raw authorization headers.

## Release interpretation

This is a source-level and mounted-test PASS for the keyboard follow-up. The
overall Milestone 10A release remains PARTIAL until the rebuilt runtime passes
the live Chrome DevTools matrix, retained-tab deployment test, role matrix, and
the remaining release thresholds.

The handler also treats document-level `End`, `Home`, and Arrow events as
menu navigation when focus is inside the menu, keeping the browser and
mounted regression contracts aligned.

## Phase 6 follow-on evidence

The current implementation expands the focused mounted result from seven to
13 tests and adds Enter/Space, Home/End, nested Escape, bidirectional drawer
Tab, and exact `1440×900`/`768×1024`/`320×800` Playwright coverage. See
[`100-phase6-account-shell-matrix.md`](100-phase6-account-shell-matrix.md) for
the source-verified result and the still-open live evidence boundary.

## Pre-merge pointer-target follow-up

The current pre-merge regression additionally activates the hamburger from its
SVG coordinates and opens the account menu from the avatar, display name, and
rightmost Account disclosure. Those child nodes are deliberately
`pointer-events: none`, so each interaction must resolve to its native button.
The browser matrix exercises the `320`, `390`, `800`, and `801` CSS-pixel
breakpoints alongside the existing keyboard, Escape, focus-restoration, and
backdrop assertions. See
[`105-premerge-navigation-accessibility.md`](105-premerge-navigation-accessibility.md)
for the current verification record.
