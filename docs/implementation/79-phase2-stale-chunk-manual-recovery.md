# Phase 2 — Stale lazy-chunk manual recovery

## Outcome

TestOps now treats the browser's common dynamic-import error variants as stale
bundle failures and gives operators a deterministic manual retry after the
automatic recovery attempt. This is a small follow-up to the existing
revision-aware lazy loader; it does not change route authorization or the
deployed asset-cache policy.

## Implementation

`frontend/src/app/lazyWithRecovery.ts` now recognizes the Vite/Chromium message
`error loading dynamically imported module` in addition to the existing
`ChunkLoadError`, failed-fetch, module-script, and CSS-preload variants. The
automatic marker remains scoped by application revision and full route, so one
broken route cannot consume another route's retry budget and a newly deployed
revision gets a fresh budget.

The module also exports `clearChunkRecoveryMarker`. The branded
`RouteErrorPage` calls it before `window.location.reload()`. This gives an
operator-initiated retry a clean marker while preserving the safety property of
one automatic reload per route/revision. Storage failures remain non-fatal: the
page still renders and the browser's normal reload action remains available.

## Why this approach

The automatic reload handles the normal retained-tab deployment race. If the
new asset is not available yet, repeating that reload automatically could loop
forever. A session-scoped marker prevents the loop. A manual retry is a
different intent: the operator may have waited for the deployment or fixed a
cache/proxy issue, so clearing only the current route's marker makes that retry
explicit without weakening automatic-loop protection for other routes.

## Boundaries

- No user data, tokens, or route state are stored in the marker.
- The marker is session-scoped and revision-scoped; it is not a server-side
  deployment lock.
- A true two-image A/B deployment swap and live Chrome DevTools proof remain
  operational follow-ups for QG-010.

## Files

- `frontend/src/app/lazyWithRecovery.ts`
- `frontend/src/app/RouteErrorPage.tsx`
- `frontend/src/app/lazyWithRecovery.test.ts`
- `frontend/e2e/phase2-stale-bundle.spec.ts`
