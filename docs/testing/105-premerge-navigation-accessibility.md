# Pre-merge navigation accessibility verification

## Regression coverage

`frontend/src/components/AppShell.test.tsx` verifies that a click dispatched
from the hamburger SVG opens the drawer, that the hamburger references
`site-navigation`, and that avatar, display-name, and Account-label clicks all
open and close the account menu through the owning button.

`frontend/e2e/account-shell.spec.ts` repeats the same hit-testing in its
established account-shell matrix. The dedicated
`frontend/e2e/navigation-hit-targets.spec.ts` adds the release-boundary matrix
without changing the historical P6 evidence shape. Both click the centre
coordinate of each rendered visual child, assert `pointer-events: none`, and
verify the resulting drawer/menu state. The new viewport matrix is:

| Width | Expected navigation |
| --- | --- |
| 320 | Drawer and exposed backdrop edge |
| 390 | Drawer |
| 800 | Drawer (inclusive breakpoint) |
| 801 | Desktop navigation |

The existing suite also retains keyboard entry, Tab containment, nested Escape
ordering, focus return, scroll restoration, route/hash dismissal, and backdrop
dismissal. Browser evidence must contain no unexpected console or network
failures; the unauthenticated refresh `401` before sign-in is an explicitly
documented negative response.

At `801px`, the regression also fails if the compact desktop account trigger
extends beyond the viewport. The visible display-name target becomes compact,
while the full accessible trigger name remains intact.

## Commands

```powershell
npm --prefix frontend test -- --run src/components/AppShell.test.tsx
npm --prefix frontend run typecheck
npm --prefix frontend run e2e -- e2e/account-shell.spec.ts e2e/navigation-hit-targets.spec.ts
```

Do not put cookies, passwords, provider callbacks, or user identifiers in
browser evidence sidecars.
