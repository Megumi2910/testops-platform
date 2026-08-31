# Phase 6 — Daily dashboard trends

## Problem

The backend already exposed a tenant-scoped `/api/v1/dashboard/trends`
contract, but the React dashboard never requested or displayed it. Operators
could see current totals and recent failures, but not how pass, failure, and
infrastructure-error counts changed across the selected reporting window.

## Implementation

`frontend/src/features/dashboard/DashboardPage.tsx` now consumes the existing
`dashboardApi.trends(from, to)` query and renders an accessible table:

- the query key includes the normalized UTC `from` and `to` values, so changing
  the URL range fetches the matching window;
- each row shows the UTC day, passed cases, failed cases, and errors;
- dates are formatted for people while the underlying day remains UTC;
- loading, empty, error, and panel-specific retry states use the shared UI
  primitives;
- the existing summary, recent-failure, and infrastructure panels remain
  independent and visible when trends fail.

No chart library or new endpoint was introduced. A semantic table is easier to
read with a keyboard or screen reader, works at the existing mobile width, and
keeps exact counts available for evidence and support tickets.

## Verification

The dashboard tests cover the range parameters, trend rendering/recovery, and
independent retries across all four query surfaces.

```text
npm test -- --run src/features/dashboard/DashboardPage.test.tsx  # 4 tests
npm run lint
npm run typecheck
npm test -- --run                                             # 21 files / 76 tests
npm run build
git diff --check
```

The implementation commit `d9aba24` passed the full six-job CI workflow in
run [`31869900629`](https://github.com/Megumi2910/testops-platform/actions/runs/31869900629):
frontend, backend, containers, enabled E2E, local-target-disabled E2E, and
browser-crash E2E. The workflow emitted only the existing `upload-artifact`
Node 20 deprecation annotations; no job or test failed. A rebuilt Chrome
DevTools pass should still confirm table headings, UTC labels, mobile overflow,
and retry network isolation before the broader release gate closes.
