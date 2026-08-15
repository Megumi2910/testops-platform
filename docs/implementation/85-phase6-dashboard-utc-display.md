# Phase 6 — UTC reporting display and execution table semantics

## Problem

Dashboard API windows are UTC timestamps. The page previously formatted the
range with `Date#toLocaleDateString()`, which lets the browser's local timezone
shift the visible day. The execution-history table also relied on implicit
table-header semantics, making column relationships less explicit to assistive
technology.

## Implementation

`frontend/src/features/dashboard/dashboardFormatting.ts` exports
`formatDashboardDate`, an `Intl.DateTimeFormat` configured with
`timeZone: 'UTC'`; `DashboardPage.tsx` uses it for the selected window. The
same contract is used for the daily trend table, so the
range summary and trend rows cannot disagree when an operator is outside UTC.

`frontend/src/features/executions/ExecutionPages.tsx` marks every execution
history header with `scope="col"`. This keeps the existing lightweight summary
list unchanged while making Status, Created, Progress, and Result relationships
explicit for screen readers.

No API, database, or execution behavior changed. The fix is presentation-only
and keeps the server's half-open UTC window authoritative.

## Verification

The dashboard test proves timestamps representing the same UTC instant render
as the same reporting day. Existing dashboard and execution tests continue to
cover panel recovery, trend retry isolation, artifact evidence, and execution
navigation.

```text
npm test -- --run src/features/dashboard/DashboardPage.test.tsx
npm test -- --run src/features/executions/ExecutionPages.test.tsx
npm run lint
npm run typecheck
npm test -- --run
npm run build
git diff --check
```

The rebuilt Chrome DevTools matrix should still verify a non-UTC browser,
keyboard table navigation, and the mobile `320×800` layout before the overall
release gate closes.

Commit `5c23300` passed all six required CI jobs in run
[`31870802458`](https://github.com/Megumi2910/testops-platform/actions/runs/31870802458):
frontend, backend, containers, enabled E2E, local-target-disabled E2E, and
browser-crash E2E. Only the existing `actions/upload-artifact` Node 20
deprecation annotations were emitted.
