# Test evidence — daily dashboard trends

## Automated coverage

`frontend/src/features/dashboard/DashboardPage.test.tsx` verifies:

1. The trends request receives the same normalized UTC window as summary,
   recent failures, and infrastructure categories.
2. A trend error exposes `Retry daily trend` without hiding the other panels.
3. Retrying the trend query calls only `dashboardApi.trends` and renders the
   recovered daily row.
4. The page keeps its URL-backed reporting range while data recovers.

## Local results

| Gate | Result |
| --- | --- |
| Focused dashboard tests | PASS — 4 tests |
| Frontend lint | PASS |
| Frontend typecheck | PASS |
| Frontend unit suite | PASS — 21 files / 76 tests |
| Frontend production build | PASS |
| Diff whitespace check | PASS |

## Remote CI

Commit `d9aba24` passed all six required jobs in CI run
[`31869900629`](https://github.com/Megumi2910/testops-platform/actions/runs/31869900629):
frontend, backend, containers, enabled E2E, local-target-disabled E2E, and
browser-crash E2E. The run produced only the known `actions/upload-artifact`
Node 20 deprecation annotations.

## Manual Chrome DevTools checklist

After rebuilding the QA stack:

- capture the trends request and verify the selected `from`/`to` values;
- confirm a populated window exposes a named table with UTC day, passed,
  failed, and error headings;
- exercise an empty window and confirm the actionable empty state;
- block only `/dashboard/trends` and confirm its retry does not refetch the
  other three endpoints;
- test 7, 30, 90-day, and custom URL windows at desktop, tablet, and
  `320×800` without horizontal overflow;
- verify no credentials, cookies, raw SQL, or unsanitized server exception is
  rendered in the trend panel.
