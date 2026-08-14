# Phase 5 ecommerce checkout evidence

## Matrix

| Scenario | Result | Layer |
| --- | --- | --- |
| Select one of two cart items | PASS | service + browser |
| Ignore client-visible cart price | PASS | service |
| Remove only purchased cart row | PASS | service + browser |
| Replay identical UUID idempotency key | PASS | coordinator + browser |
| Cancel pending order | PASS | service + browser |
| Repeated cancellation does not restore stock twice | PASS | service + browser |
| Simultaneous final-unit requests | OPEN | PostgreSQL integration |
| QR payment state and provider handoff | OPEN | native integration |

## Evidence

- Ecommerce backend: `./mvnw.cmd -B test` — **19 tests passed** on 2026-08-13.
- TestOps frontend lint and typecheck — **passed**.
- Isolated E2E Compose rebuild — database, backend, frontend, and Mailpit
  healthy.
- `phase5-ecommerce-checkout.spec.ts` — **1 passed in 2.4s**.
- The normal ecommerce development volume was not reset or mutated.

## Reproduction command

```powershell
cd D:\Projects\testops-platform\frontend
$env:ECOMMERCE_E2E_BASE_URL='http://localhost:3101'
$env:ECOMMERCE_E2E_CHECKOUT='true'
$env:ECOMMERCE_E2E_CUSTOMER_B_PASSWORD='(local value)'
npm run e2e -- phase5-ecommerce-checkout.spec.ts --workers=1
```

The test is stateful: use `D:\Projects\ecommerce-web\webcky\scripts\reset-e2e.ps1`
before a second run. Do not use it for the normal development volume.

## Release interpretation

The selective-checkout sub-gate is no longer blocked. QG-B13 remains PARTIAL
until database-level concurrency and payment-state cases are executed.

GitHub Actions run `31699514415` failed before any job step started because the
account Actions quota is exhausted. This is recorded as an external CI
availability blocker; the local gates above are the executable evidence for
this slice.
