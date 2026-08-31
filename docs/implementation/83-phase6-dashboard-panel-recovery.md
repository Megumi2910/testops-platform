# Phase 6 — Dashboard panel recovery

## Problem

The dashboard loads summary metrics, recent failures, and infrastructure
categories through three independent queries. Before this slice, only the
summary query had a retry action. A recent-failures or infrastructure error
could leave a large part of the page stuck on a generic empty/unavailable
message until the entire route was reloaded.

## Implementation

`frontend/src/features/dashboard/DashboardPage.tsx` now renders a focused
`DashboardPanelError` for each failed query. Every recovery control has a
specific accessible label and calls only that query's React Query `refetch`:

- the first summary metric card exposes one retry for the shared summary
  request while the other summary cards explain that they share its result;
- Recent failures retries only `dashboardApi.recent`;
- Infrastructure categories retries only `dashboardApi.infrastructure`.

The dashboard keeps successful panels visible while another panel is failing.
Loading states remain query-specific, and the “Clear” badge is withheld while
the recent-failures query is unavailable so an outage is not presented as a
healthy empty result. The backend contract and URL-backed reporting window are
unchanged.

## Why this boundary

The three requests are already independent at the API and query-cache layers.
Adding panel-local recovery preserves that architecture and avoids a broad
route reload that would discard successful data, URL state, and operator
context. The retry labels also give keyboard and screen-reader users enough
context to choose the correct recovery action.

## Verification

`DashboardPage.test.tsx` covers the initial three-query load and a failure
matrix where all panels fail, then verifies that retrying recent failures does
not refetch summary or infrastructure data before those controls are used.

```text
npm test -- --run src/features/dashboard/DashboardPage.test.tsx  # 4 tests
npm run lint
npm run typecheck
npm test -- --run                                             # 21 files / 76 tests
npm run build
git diff --check
```

Implementation commit `12ae233` passed all six required jobs in CI run
[`31869102692`](https://github.com/Megumi2910/testops-platform/actions/runs/31869102692),
including the full enabled E2E suite. The same run also verifies the artifact
preview focus-timing hardening shipped with this slice. The live Chrome
DevTools dashboard matrix remains a separate release gate.
