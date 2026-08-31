# Phase 2 stale-chunk manual-recovery evidence

## Automated checks

| Scenario | Expected result | Result |
| --- | --- | --- |
| Vite reports `error loading dynamically imported module` | Classified as a chunk-load failure | PASS |
| Same route/revision fails twice | Only the first automatic attempt reloads | PASS (existing regression) |
| A different route fails in the same revision | It has an independent automatic attempt | PASS (existing regression) |
| Operator retries from the branded recovery page | The current marker is cleared and a new retry is allowed | PASS |
| Retained tab cannot load a newly requested chunk | Branded recovery page shows safe reload/readiness actions | PASS (Playwright smoke) |

## Commands

```text
cd frontend
npm test -- --run src/app/lazyWithRecovery.test.ts src/app/RouteErrorPage.test.tsx  PASS (2 files / 4 tests)
```

The full frontend lint, typecheck, unit, and production-build gates remain the
publication gate. The Playwright retained-tab smoke verifies the current
single-image failure simulation; the two-image deployment swap and Chrome
DevTools retained-tab capture are still operational follow-ups.

## Publication evidence

Commit `9dd6465` passed the complete CI workflow in run
[`31865017062`](https://github.com/Megumi2910/testops-platform/actions/runs/31865017062):

- `frontend` — lint, typecheck, 68 unit tests, and production build: PASS
- `backend` — Maven verification: PASS
- `containers` — Compose configuration, build, and health smoke: PASS
- `e2e` — enabled target suite: PASS
- `e2e-local-disabled` — local-target policy suite: PASS
- `e2e-browser-crash` — browser-crash recovery suite: PASS

GitHub emitted only the existing non-blocking Node.js 20 deprecation
annotation for `actions/upload-artifact@v4`.

## Regression ownership

- Automatic marker and error recognition: `lazyWithRecovery.test.ts`
- Branded recovery rendering: `RouteErrorPage.test.tsx`
- Browser-level retained-tab behavior: `frontend/e2e/phase2-stale-bundle.spec.ts`
