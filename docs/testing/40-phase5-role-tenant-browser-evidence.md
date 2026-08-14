# Phase 5 role and tenant browser evidence

## Scope

This slice closes the repeatable browser coverage for the core project-role and nested-resource boundaries required by Milestone 10 Phase 5. It runs against the isolated E2E stack, not the normal development database, and creates only run-prefixed QA records.

The test source is [`frontend/e2e/phase5-role-matrix.spec.ts`](../../frontend/e2e/phase5-role-matrix.spec.ts).

It proves:

- `TEST_MANAGER` can author a case and queue a suite run.
- `TESTER` can queue a suite run but cannot create a case.
- `VIEWER` can open the suite but cannot create a case or queue a run.
- Project members do not receive the Members navigation link unless the API grants `MEMBER_MANAGE`.
- A verified non-member cannot load the project workspace.
- A member cannot substitute a suite ID from another project. The nested request returns `404`, and the UI renders the non-disclosing “Unable to load this suite” state.
- The legitimate suite remains readable after the foreign-identifier attempt.

The browser assertions use semantic roles and the application’s own authenticated request path. The foreign-suite request is captured with Playwright’s response listener while React Query calls the API with its in-memory bearer token; this avoids making the test depend on private token storage or exposing a token in output.

## Environment and commands

The isolated stack uses:

| Service | Host port |
| --- | ---: |
| TestOps frontend | `3100` |
| TestOps backend | `8180` |
| Static target site | `3204` |
| Mailpit | `8025` / `1025` |
| E2E PostgreSQL | `55432` |

Start or repair only the E2E Mailpit service when the container has been detached from the Compose network:

```powershell
docker compose -p testops-e2e -f docker-compose.yml -f docker-compose.e2e.yml up -d --force-recreate mailpit
```

This command recreates Mailpit only. It does not remove or reset either PostgreSQL volume. Confirm that Mailpit is healthy and mapped to `8025` before running registration-based tests.

Run the slice from `frontend/`:

```powershell
$env:E2E_BASE_URL = 'http://127.0.0.1:3100'
$env:MAILPIT_URL = 'http://127.0.0.1:8025'
$env:E2E_TARGET_ORIGIN = 'http://localhost:3204'
npm run lint
npm run typecheck
npm run e2e -- phase5-role-matrix.spec.ts
```

The verified run on 2026-08-12 passed both tests in 16 seconds. Lint and type checking passed before the browser run. Playwright artifacts remain in ignored `frontend/test-results/` and `frontend/playwright-report/`; they are not committed.

## Defect found and corrected during this slice

The first browser attempt reported “Email verification is temporarily unavailable.” The backend was configured for Mailpit, but the running `testops-e2e-mailpit-1` container had no Docker network attachment or host port mapping. The backend could not deliver OTP mail, and the helper could not read the Mailpit API. Recreating only the Mailpit service with the declared Compose files rejoined it to `testops-e2e_default`, restored the `8025`/`1025` mappings, and made registration deterministic.

The first version of the role test also used full-page reloads when switching accounts. TestOps keeps the short-lived access token in the frontend module and uses the refresh cookie only under `/api/v1/auth`; a full reload can therefore leave a test page in the bootstrap loading state when the isolated session has already rotated. The final test keeps each account in its authenticated SPA context and uses `history.pushState` plus a router `popstate` event for direct-route coverage. This preserves the same security boundary users exercise while avoiding a test-only dependency on token internals.

Generated Playwright HTML and trace bundles are now excluded from ESLint input through `frontend/eslint.config.js`. Browser reports are generated output, not application source, and linting them produced thousands of irrelevant third-party bundle errors after a failed run.

## Interpretation

Passing this slice closes the project-role and basic tenant-isolation portion of Phase 5. It does not close the entire release gate. The following remain separate evidence items:

- platform administrator and unverified-account route matrix;
- password recovery, invalid/expired OTP, Google identity, and session revoke flows;
- execution cancellation/retry/worker/artifact and secret-redaction assertions;
- dashboard role/range browser evidence and query instrumentation;
- complete keyboard/mobile and performance measurements;
- two consecutive green CI runs for the complete Phase 5 matrix.

The quality-gate baseline and defect ledger retain those items as open rather than treating this focused pass as a release waiver.
