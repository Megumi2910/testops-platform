# Phase 1 slice — TestOps shell and account menu

## Outcome

This slice makes the first-release shell usable after sign-in. The desktop
account control is now an actual accessible menu, the same actions are
available from the mobile drawer, and the lazy Account route uses the same
loading boundary as every other feature route. Route-level failures now have a
branded recovery page instead of falling through to the browser's generic
error screen.

The slice does not claim to finish all of Milestone 10A Phase 1. Automatic
stale-chunk reloads, revision-aware recovery telemetry, and the complete
account-security form work remain later slices.

## Source map

| Responsibility | Implementation |
| --- | --- |
| Lazy Account loading | `frontend/src/app/router.tsx` wraps `AccountPage` in `LazyPage`. |
| Route recovery | `frontend/src/app/RouteErrorPage.tsx` is the root route `errorElement`; React Router sends loader/render/chunk failures here. |
| Navigation and account actions | `frontend/src/components/AppShell.tsx` owns route-aware menu closure, sign-out navigation, and the mobile drawer. |
| Visual states | `frontend/src/styles.css` defines the account panel, mobile backdrop, focus states, and recovery layout. |
| Regression coverage | `frontend/src/components/AppShell.test.tsx` and `frontend/src/app/RouteErrorPage.test.tsx`. |

## Account menu contract

The trigger exposes `aria-haspopup="menu"`, `aria-expanded`, `aria-controls`,
and a name containing the signed-in display name. The menu renders the
identity summary followed by only the destinations the current user can use:

- `/account#security` for account security;
- `/account#sessions` for active sessions;
- `/verify-email?...&recover=1` for unverified users;
- `/admin/users` only when `USER_ADMINISTER` is present;
- a sign-out button for every authenticated user.

The menu uses `role="menu"` and `role="menuitem"`. Opening focuses the first
action. Arrow Up/Down, Home, and End move within the action list; Escape closes
and restores focus to the trigger; pointer-down outside closes it. Selecting a
destination closes both the menu and the mobile drawer before navigation.

Sign-out deliberately clears the auth state through `AuthProvider.logout()`
and then navigates to `/login`. The provider's `finally` block still clears the
local access token if the server request fails, so the UI cannot remain
visually authenticated after a failed logout request.

## Mobile behavior

The existing hamburger control now opens a modal-labelled drawer with a
backdrop. While open, body scrolling is disabled and Tab/Shift+Tab wrap around
the drawer controls. Escape, the close button, the backdrop, or navigation
closes the drawer and restores focus to the hamburger trigger. The account
menu remains composed inside the drawer rather than duplicating a second set
of account actions.

## Route recovery behavior

The root router declares `RouteErrorPage` as its `errorElement`. A missing
route remains a normal 404 page, while a dynamic-import/chunk error explains
that the tab may have an older bundle and offers **Reload application** and
**Return to readiness**. Other render or route failures get the same safe
recovery actions without exposing stack traces, tokens, or backend details.

Phase 2 will add the one-reload-per-revision guard and retained-tab deployment
test. Keeping that policy separate prevents a recovery page from accidentally
creating a reload loop in this first shell slice.

## Verification

From `frontend/`:

```powershell
npm run lint
npm run typecheck
npm test -- --run
npm run build
```

The slice added six assertions across the shell and route-recovery tests (five
account/drawer cases and one route-error case). The full frontend suite passes
with 15 test files and 48 tests; lint has no warnings, typecheck succeeds, and
the Vite production build succeeds.

## Known follow-ups

- Add the automatic single reload and `VITE_APP_REVISION` guard in Phase 2.
- Refactor the Account page into the security, login-method, and sessions
  panels described by Phase 3.
- Run the Chrome DevTools desktop/tablet/320px keyboard matrix against the
  rebuilt QA image; unit tests do not replace live evidence.
