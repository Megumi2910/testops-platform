# Role and unverified-account browser boundaries

## Scope

This slice closes the browser-visible portion of the Phase 5 platform-boundary
gap that was not covered by the earlier project-role matrix. It verifies both
the capability payload shown inside a project and the separate platform-admin
route guard. It also verifies the recovery path for a user who can authenticate
but has not yet verified their email.

## Role contract

`frontend/e2e/phase5-role-matrix.spec.ts` creates a run-prefixed manager,
test-manager, tester, viewer, and non-member account. The manager grants the
three project roles and the test then opens the same suite in independent
browser contexts:

- `TEST_MANAGER` can create a case and queue ready cases;
- `TESTER` can queue ready cases but cannot create definitions;
- `VIEWER` can read the suite but cannot create or queue;
- a non-member cannot load the project; and
- no project role or non-member receives the platform `Admin` navigation link.

Each member also attempts a normal navigation to `/admin/users`. The frontend
`PlatformPermissionRoute` must redirect to `/dashboard` and must not render the
Users heading. The non-member receives the same non-disclosing redirect after
the project access denial. This tests the route guard through a real browser,
not only by inspecting a permission array.

The existing test also substitutes a suite identifier from a second project.
The parent-scoped API returns `404`, the UI shows the safe “Unable to load this
suite” state, and the legitimate suite remains available.

## Unverified recovery contract

`frontend/e2e/phase5-unverified-boundary.spec.ts` registers a generated account
through the real Mailpit-backed flow, intentionally stops before entering the
OTP, then signs in with the valid password. The authenticated session is
allowed to exist, but the account is restricted:

- `/projects` is preserved as the intended destination and the verification
  route is shown;
- the shell does not expose Projects or Dashboard navigation;
- the persistent `.verification-banner` explains the restriction;
- its `Verify now` link contains the account email and recovery flag; and
- following it opens the verification page, where the server-owned resend
  cooldown is visible and the resend control is disabled while cooling down.

This mirrors the product rule that verification is required for workspace
operations without treating an unverified account as an invalid login.

## Fixture and environment recovery

The tests use only generated `example.test` identities and a disposable E2E
database. Verification mail is read from Mailpit; no password, OTP, cookie, or
token is written to the repository. If registration reports
“Email verification is temporarily unavailable” while the backend is healthy,
inspect the disposable Mailpit network attachment:

```powershell
docker inspect testops-e2e-backend-1 --format '{{json .NetworkSettings.Networks}}'
docker inspect testops-e2e-mailpit-1 --format '{{json .NetworkSettings.Networks}}'
```

Both services must have an endpoint on `testops-e2e_default`. Recreate only the
disposable Mailpit service if it is detached:

```powershell
docker compose -p testops-e2e -f docker-compose.yml -f docker-compose.e2e.yml \
  up -d --force-recreate mailpit
```

Never reset the normal development database to repair this fixture.

## Verification

With the disposable stack on `3100/8180`, target fixture on `3201`, and Mailpit
on `8025`, the focused command passed all three scenarios in 21.6 seconds:

```powershell
cd D:\Projects\testops-platform\frontend
$env:E2E_BASE_URL = 'http://localhost:3100'
$env:MAILPIT_URL = 'http://127.0.0.1:8025'
$env:E2E_TARGET_ORIGIN = 'http://localhost:3201'
npx playwright test phase5-role-matrix.spec.ts phase5-unverified-boundary.spec.ts
```

The implementation closes the browser role/admin-route and unverified
recovery sub-gate. Google identity, real browser-crash deployment behavior,
ecommerce workflows, and the final twice-consecutive release gate remain open.
