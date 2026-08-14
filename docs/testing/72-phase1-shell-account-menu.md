# Phase 1 shell and account-menu test evidence

## Scope

This regression slice covers the failure reported after the release-candidate
merge: the signed-in top-right Account control looked like a link but offered
no visible account actions. It also covers the missing Account lazy-loading
fallback and the mobile navigation's keyboard/scroll behavior.

## Automated cases

| Case | Expected evidence | Result |
| --- | --- | --- |
| Verified member opens account menu | Security and sessions links are present; verify link is absent | PASS |
| Administrator opens account menu | Administration is present only with `USER_ADMINISTER` | PASS |
| Unverified member opens account menu | Verify email recovery link and persistent banner are present; Projects/Dashboard are absent | PASS |
| Account menu Escape | First item receives focus on open; Escape closes and restores trigger focus | PASS |
| Account sign-out | Logout callback runs and navigation changes to `/login` | PASS |
| Mobile drawer | Dialog semantics, initial focus, Escape close, body overflow lock, and trigger focus restoration | PASS |
| Route chunk/render failure | Root `errorElement` renders branded recovery copy and safe actions | PASS |

## Commands and results

```text
npm run lint                         PASS (0 errors, 0 warnings)
npm run typecheck                    PASS
npm test -- --run                    PASS (15 files, 48 tests)
npm run build                        PASS (Vite production build)
```

The pushed revision `4ca2d0776fd46db488158fc989afb14d58768c00` passed GitHub
Actions run [`31785998751`](https://github.com/Megumi2910/testops-platform/actions/runs/31785998751):
frontend, backend, containers, enabled E2E, local-target-disabled E2E, and
browser-crash E2E all completed successfully. The only annotations were
non-blocking Node.js 20 deprecation notices emitted by `upload-artifact`.

Tests run against the checked-out frontend source, not a stale browser tab or
an old container image. The next live gate must rebuild the QA stack from the
committed revision and repeat the Chrome DevTools matrix at desktop, tablet,
and `320×800`.

## Accessibility assertions

- Account trigger has a stable accessible name and menu disclosure state.
- Menu actions use native links/buttons with `role="menuitem"` and are
  keyboard reachable.
- Escape returns focus to the control that opened the menu.
- The mobile drawer is labelled as a modal navigation surface and traps Tab.
- The recovery page has a labelled heading and explicit, safe actions.

## Regression boundary

This file intentionally does not close QG-005 or QG-010 completely. Form
autocomplete/field metadata is still a separate accessibility slice. The new
root recovery page closes the generic-error part of stale chunk handling, but
the one-time automatic reload and retained-tab deployment test remain Phase 2
work.
