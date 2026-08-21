# Phase 1/2 — Rebuilt-runtime shell and stale-bundle browser gate

## Scope

This slice verifies the already-implemented application shell, account menu,
account security route, mobile navigation drawer, and stale-lazy-chunk recovery
against containers rebuilt from the current completion-branch revision. Source
tests alone cannot prove that the image being served contains the current
bundle, so the test stack was rebuilt before any browser conclusion was made.

## Runtime used

- Git revision: `8d85c03712323c0ed0c9e41bc18b47174bf3c351`
- Compose project: `testops-live-gate`
- Frontend: `http://localhost:3100`
- Backend: `http://localhost:8180`
- Mailpit: `http://localhost:8025`
- Target site: `http://localhost:3201`
- Frontend and backend OCI revision labels: the same revision above

The isolated project uses separate PostgreSQL and artifact volumes. The normal
development stack on ports `3000` and `8080` was not reset or stopped.

## Browser checks

The focused Playwright group passed all six scenarios:

- retained-tab lazy-chunk recovery;
- invalid OTP followed by valid verification;
- protected deep-link return through verification;
- individual session revoke and revoke-all;
- deterministic Google sign-in and refresh;
- sanitized OAuth callback failure.

Chrome DevTools then verified the rebuilt runtime:

- the signed-in account trigger exposes the accessible name
  `Open account menu for QA Google User`;
- opening the trigger exposes a `menu` with Account security, Active sessions,
  and Sign out;
- Escape closes the menu and restores focus to the trigger;
- at `320×800`, the navigation drawer exposes a modal dialog, a close action,
  and a focusable primary navigation;
- the account security deep link renders sessions, password setup, login
  methods, and revoke actions;
- account-page requests returned `200` for the document, providers,
  refresh, and session list;
- no console errors or warnings were present on the authenticated account
  route;
- mobile Lighthouse accessibility and best-practices scores were `100`;
- `document.documentElement.scrollWidth` equalled `window.innerWidth` (`320`),
  so the shell has no horizontal overflow at the release mobile width.

## Interpretation

The rebuilt runtime now proves the shell/account implementation is being served
by the current images and is keyboard- and mobile-usable in the tested paths.
The retained-tab Playwright case still simulates a missing chunk by aborting the
new request. A true revision-A/revision-B image swap remains an operational
deployment test and is intentionally not claimed by this document.

## Where to verify

- `frontend/src/components/AppShell.tsx`
- `frontend/src/app/lazyWithRecovery.ts`
- `frontend/src/app/RouteErrorPage.tsx`
- `frontend/e2e/phase2-stale-bundle.spec.ts`
- `frontend/e2e/phase5-auth-session-matrix.spec.ts`
- `frontend/e2e/phase5-google-boundary.spec.ts`
- `docker-compose.e2e.yml`
