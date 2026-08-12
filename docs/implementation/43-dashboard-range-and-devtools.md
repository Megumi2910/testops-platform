# Dashboard reporting ranges and browser quality gate

## Scope

The dashboard is a read-only reporting surface for executions visible to the
current account. This slice makes the reporting window explicit, keeps the
window in the URL, and records the live browser evidence needed by the Phase 5
quality gate.

## Implementation

`frontend/src/features/dashboard/dashboardWindow.ts` is the single source of
truth for the client window. It accepts `range=7`, `range=30`, or `range=90`.
If a caller supplies both `from` and `to`, the helper accepts the pair only when
both values are valid dates, `from <= to`, and the interval is no longer than
366 days. Invalid or incomplete parameters fall back to a 30-day UTC window.
The helper returns the ISO values used by React Query and a selector value used
by the UI, so the displayed period and the API request cannot drift apart.

`frontend/src/features/dashboard/DashboardPage.tsx` owns three independent
queries:

1. `summary` for pass, infrastructure, and execution totals;
2. `recent-failures` for the bounded attention list; and
3. `infrastructure-errors` for full-window category totals.

The queries share the same half-open UTC window and use separate React Query
keys. Changing the reporting-period selector removes any custom `from`/`to`
parameters, writes the selected `range` with a history-replacing navigation,
and causes exactly those three queries to refetch. The selector has a real
`id`/`name` and is labelled for keyboard and assistive-technology users.

Metric and detail cards remain mounted while data is loading. Their reserved
minimum heights prevent the loading-to-content transition from moving the
page. `aria-busy` communicates the aggregate loading state, while the date
announcement is a polite live region. Each panel retains an explicit loading,
empty, or unavailable state rather than leaving a blank region.

## Why this design

- URL state makes a reporting view bookmarkable and recoverable after refresh.
- A bounded client window protects the API from accidental unbounded scans; the
  backend still applies tenant membership and time-window checks.
- Independent queries avoid serial waterfalls while allowing one panel to
  render its own error or empty state.
- Stable card geometry addresses cumulative layout shift without JavaScript
  measurement or a brittle loading overlay.

## Verification

Run the focused frontend checks from `D:\Projects\testops-platform\frontend`:

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

The dashboard unit suite covers valid custom windows, invalid fallback, the
default seven-day request, the three-query contract, and URL updates when the
selector changes.

For live verification, rebuild the normal frontend image and open
`http://localhost:3000/dashboard?range=90` in Chrome DevTools:

```powershell
cd D:\Projects\testops-platform
docker compose up -d --build frontend
```

The rebuilt page produced no console messages and exactly three dashboard
requests, all `200`:

```text
GET /api/v1/dashboard/summary?from=2026-05-14T15:48:18.919Z&to=2026-08-12T15:48:18.919Z
GET /api/v1/dashboard/recent-failures?from=2026-05-14T15:48:18.919Z&to=2026-08-12T15:48:18.919Z
GET /api/v1/dashboard/infrastructure-errors?from=2026-05-14T15:48:18.919Z&to=2026-08-12T15:48:18.919Z
```

Chrome DevTools Lighthouse (desktop snapshot) reported accessibility `96` and
best practices `100`. The performance trace reported LCP `501 ms` and CLS
`0.03`, satisfying the Phase 5 local targets of LCP below `2.5 s` and CLS below
`0.1` on this machine. The SEO and agentic-browsing scores are informational
and are not Phase 5 release criteria for this authenticated application.

## Follow-up boundary

This closes the dashboard range/date/query-count and local accessibility/
performance evidence row. It does not close the complete Phase 5 gate: Google
identity, deterministic process-kill reproduction, broader administrator role
permutations, and the ecommerce matrix remain tracked separately.
