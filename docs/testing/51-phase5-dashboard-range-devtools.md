# Phase 5 dashboard range and Chrome DevTools evidence

## Test identity

| Field | Value |
| --- | --- |
| Application | TestOps Platform |
| URL | `http://localhost:3000/dashboard?range=90` |
| Browser tool | Chrome DevTools MCP |
| Environment | Normal Docker Compose stack, rebuilt from the current checkout |
| Date | 2026-08-12 |
| Role | QA Administrator |
| Data policy | Existing execution data was read only; no database volume was reset |

## Functional matrix

| Case | Action | Expected | Observed |
| --- | --- | --- | --- |
| D-01 | Load the dashboard with `range=90` | Selector and UTC period reflect 90 days | `Last 90 days`; `5/14/2026 – 8/12/2026 (UTC)` |
| D-02 | Load the populated dashboard | Metrics, recent failures, and categories render | `67%` functional pass, `63%` infrastructure rate, `8` executions, six recent failures, and `TARGET_UNREACHABLE` category |
| D-03 | Inspect XHR/fetch traffic after reload | One request per dashboard panel, no `500` | Exactly three dashboard requests, all `200`; auth provider/refresh were also `200` |
| D-04 | Inspect console after reload | No unexpected errors/warnings/issues | No console messages found |
| D-05 | Change selector from 30 to 90 days | URL is updated and all panels refetch with the same window | URL became `?range=90`; three additional `200` requests shared `2026-05-14…` to `2026-08-12…` |
| D-06 | Inspect accessibility tree | Named control, headings, skip link, live date, semantic links | `Reporting period` combobox has `id`/`name`, level-1/level-2 headings, skip link, polite date live region, and named `Open run` links |

## Performance and accessibility evidence

| Metric | Result | Gate |
| --- | ---: | --- |
| Lighthouse accessibility (desktop snapshot) | 96 | Pass: `>=95` |
| Lighthouse best practices | 100 | Informational pass |
| Largest Contentful Paint | 501 ms | Pass: `<2500 ms` |
| Cumulative Layout Shift | 0.03 | Pass: `<0.1` |
| Console errors/warnings | 0 | Pass |

The publication gate also passed CI run `31614750283` for commit `e68c657`.
All five jobs—backend, frontend, containers, enabled E2E, and
local-disabled E2E—completed successfully.

The first trace before the layout fix measured CLS `0.16`. The dashboard then
kept metric/detail card slots mounted and gave them stable minimum heights. A
fresh trace measured CLS `0.03`; this is the regression proof for the fix.

## Reproduction commands

```powershell
cd D:\Projects\testops-platform
docker compose up -d --build frontend
docker compose ps frontend backend
```

Then use Chrome DevTools MCP:

1. `list_pages`, then select the TestOps page.
2. Navigate to `http://localhost:3000/dashboard?range=90`.
3. Capture an accessibility snapshot.
4. List `xhr`/`fetch` requests and confirm the three dashboard endpoints are
   `200` and use one identical UTC window.
5. List console messages and confirm there are none.
6. Run Lighthouse desktop snapshot and a performance trace.

Do not commit raw DevTools reports, cookies, authorization headers, or account
secrets. Store raw traces under an ignored QA artifact directory and retain
only sanitized values like the table above.

## Remaining Phase 5 coverage

This evidence closes QG-B09. The release remains `PARTIAL` until QG-B01/B02
Google and account-state variants, QG-B08 real browser-crash/deployment
evidence, QG-B10 broader administrator role permutations, and ecommerce
QG-B11–QG-B14 are complete and the final CI gate passes twice consecutively.
