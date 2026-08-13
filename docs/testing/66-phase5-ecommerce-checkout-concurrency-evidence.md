# Phase 5 ecommerce checkout concurrency evidence

## Scenario

Two verified customers concurrently buy `MOCK-CONCURRENCY-001`, a permanent
QA fixture with exactly one approved unit. The scenario runs against the
isolated frontend at `http://localhost:3101` and uses two Playwright browser
contexts so each request has its own authentication state.

## Result

| Assertion | Result |
| --- | --- |
| Fixture is present and has stock `1` | PASS |
| Two requests are sent concurrently | PASS |
| Exactly one request returns `200` | PASS |
| Losing request returns a normal `4xx` stock error | PASS |
| Losing request does not produce an optimistic-lock `500` | PASS |
| Stock becomes `0` while the winning order is pending | PASS |
| Cancelling the winning order restores stock to `1` | PASS |
| Normal development volume is untouched | PASS |

The clean run passed `1` scenario in `3.9s`. The ecommerce backend suite passed
`22/22` tests. Compose health was green for the dedicated database, backend,
frontend, and Mailpit services.

## Reproduction

```powershell
cd D:\Projects\ecommerce-web\webcky
docker compose -f docker-compose.e2e.yml --profile e2e down -v
docker compose -f docker-compose.e2e.yml --profile e2e up -d --build

cd D:\Projects\testops-platform\frontend
$env:ECOMMERCE_E2E_BASE_URL='http://localhost:3101'
$env:ECOMMERCE_E2E_CHECKOUT='true'
$env:ECOMMERCE_E2E_CUSTOMER_PASSWORD='(local value)'
$env:ECOMMERCE_E2E_CUSTOMER_B_PASSWORD='(local value)'
npm run e2e -- e2e/phase5-ecommerce-checkout-concurrency.spec.ts --workers=1
```

Only the named E2E volume is removed by the reset. Never run the command
against the normal development Compose file.

## Defect history

The first run after adding a row lock still returned a `500` because Hibernate
reused a stale managed product instance. The backend log identified
`ObjectOptimisticLockingFailureException` at the locking query. Detaching the
previous instance before acquiring the lock fixed the issue; the clean rerun
returned the expected `4xx` stock response.

## Release interpretation

QG-B13's concurrency sub-gate is PASS. Payment-state, stale-stock UI refresh,
and review-eligibility scenarios remain open, so the overall Milestone 10
quality gate remains PARTIAL. TestOps CI run `31704931872` is recorded as
quota-blocked before any job steps started; the account has consumed all 3,000
included Actions minutes.
