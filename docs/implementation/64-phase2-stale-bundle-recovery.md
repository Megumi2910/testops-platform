# Phase 2 — Stale-bundle recovery and deployment cache safety

## Why this slice exists

TestOps is a Vite single-page application served by Nginx. A tab that remains
open during a frontend deployment can keep the old `index.html` and then ask
for a hashed JavaScript chunk that the new image no longer contains. Without a
boundary, React Router receives a dynamic-import rejection and the user sees a
generic error page with no safe recovery path.

This slice makes that failure recoverable while preserving normal lazy loading.
The browser gets one automatic reload for the affected build and route. If the
same route still cannot load after that reload, the branded route error page is
shown and offers a manual reload plus a return to Readiness. A build revision
is included when the container is built, so support can correlate the browser
message with the image that served it.

## Implementation

### Shared lazy-import boundary

`frontend/src/app/lazyWithRecovery.ts` owns the policy used by every lazy route
in `frontend/src/app/router.tsx`.

1. `isChunkLoadError` recognizes Vite dynamic-import failures, module-script
   failures, and CSS preload failures. Ordinary API or domain errors do not
   trigger a reload.
2. `recoverFromChunkError` creates a session-only key:
   `testops:lazy-route-recovery:<revision>:<route>`.
3. A missing key is marked and the browser reloads once. A second failure for
   the same revision and route does not reload again, preventing an infinite
   loop during a broken deployment.
4. Storage failures are treated as “manual recovery only”; the error page still
   renders instead of allowing an exception from `sessionStorage` to mask the
   original failure.

The route remains lazy and keeps the existing `LazyPage` Suspense fallback.
The recovery wrapper only runs when the import promise rejects, so it does not
add a request or a render to successful navigation.

### Revision propagation

`frontend/Dockerfile` accepts `VCS_REF` in the build stage and exposes it as
`VITE_APP_REVISION` before `npm run build`. The same build argument is declared
in `docker-compose.yml`; CI supplies `${{ github.sha }}` through the workflow
environment. The final Nginx image retains the OCI
`org.opencontainers.image.revision` label as an independent container check.

`RouteErrorPage` displays the revision only when the build supplied one. It
never displays the thrown error or a stack trace, which keeps deployment
diagnostics useful without leaking runtime details.

### Nginx cache policy

`frontend/nginx.conf` now marks the SPA shell (`/index.html`) as
`no-store/no-cache` and revalidates it after deployment. Hashed JavaScript,
CSS, fonts, and images keep their immutable one-year cache because their names
change whenever Vite emits new content. API, OAuth, and actuator proxy blocks
are unchanged.

## Design decisions and tradeoffs

- **Session storage instead of local storage:** the guard is scoped to the
  current browser tab and disappears when that tab closes; another tab can
  recover independently.
- **Revision plus route in the key:** a deployment may legitimately need a
  fresh recovery attempt, while a failure on `/account` should not suppress a
  recovery attempt on `/projects`.
- **One automatic reload:** automatic retries repair the common stale-tab case,
  but repeated retries can overload a broken deployment and hide the cause.
  The second failure therefore becomes an explicit, user-controlled action.
- **No runtime environment fetch:** the static bundle cannot safely depend on a
  mutable `.env` file after it has been built. The revision is embedded at
  image-build time instead.

## Verification and limits

The unit suite covers error classification and the one-reload-per-route policy.
`frontend/e2e/phase2-stale-bundle.spec.ts` keeps the first application shell,
blocks a newly requested route chunk, and verifies that the automatic retry
ends at the branded recovery page rather than looping.

The E2E test simulates a retained tab by aborting the new chunk request. A
future deployment pipeline can add a two-image A/B swap around the same test;
that operational test is not required for the local recovery contract in this
slice.

## Where to verify

- `frontend/src/app/lazyWithRecovery.ts`
- `frontend/src/app/router.tsx`
- `frontend/src/app/RouteErrorPage.tsx`
- `frontend/Dockerfile`
- `frontend/nginx.conf`
- `docker-compose.yml`
- `.github/workflows/ci.yml`
- `frontend/e2e/phase2-stale-bundle.spec.ts`
