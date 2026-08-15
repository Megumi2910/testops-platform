# Test evidence — UTC reporting display and table semantics

## Automated coverage

`DashboardPage.test.tsx` verifies that two timestamps representing the same
instant in different offsets render to the same UTC reporting date. The
existing focused dashboard tests also verify URL-backed windows, trend rows,
empty states, and panel-specific retries.

`ExecutionPages.test.tsx` continues to cover execution history and detail
rendering; the table headers now expose explicit column scopes without changing
the accessible names or navigation links.

## Local checklist

| Gate | Result |
| --- | --- |
| Focused dashboard tests | PASS — 5 tests |
| Focused execution tests | PASS — 8 tests |
| Frontend lint/typecheck/unit/build | PASS — 21 files / 77 tests |
| Diff whitespace check | PASS |
| Chrome DevTools non-UTC display | Release-gate follow-up |

## Manual Chrome DevTools cases

- Set the browser timezone to a negative offset and confirm the selected
  `from`/`to` labels still show UTC days.
- Compare the reporting summary dates with daily trend row dates at the UTC
  boundary (00:00).
- Inspect the execution history accessibility tree and confirm each row maps
  to Status, Created, Progress, and Result headers.
- Tab through status links at desktop, tablet, and `320×800` without horizontal
  overflow.
- Confirm no credentials, cookies, or server exception details appear in the
  reporting text.
