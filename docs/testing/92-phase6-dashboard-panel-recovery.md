# Test evidence — dashboard panel recovery

## Automated coverage

`frontend/src/features/dashboard/DashboardPage.test.tsx` verifies:

1. The summary, recent-failures, and infrastructure requests use the selected
   URL-backed UTC window.
2. Independent panel failures expose specific retry controls rather than a
   false “Clear” state.
3. Retrying recent failures refetches only that panel and leaves the summary
   and infrastructure errors available for their own retry actions.
4. Retried successful data replaces the panel error without navigating away or
   changing the reporting range.

## Local results

| Gate | Result |
| --- | --- |
| Focused dashboard tests | PASS — 4 tests |
| Frontend lint | PASS |
| Frontend typecheck | PASS |
| Frontend unit suite | PASS — 21 files / 76 tests |
| Frontend production build | PASS |
| Diff whitespace check | PASS |

## Manual Chrome DevTools checklist

After rebuilding the QA stack, use the Network panel to fail each dashboard
endpoint independently and verify:

- a failed summary request leaves all three metric cards actionable;
- a failed recent-failures request does not show the green “Clear” badge;
- a failed infrastructure request leaves the failures panel usable;
- clicking one retry sends only that endpoint request;
- the selected 7/30/90-day or custom URL range survives every retry;
- no response body, token, cookie, or server exception is rendered in the
  error alert.

The responsive pass should cover desktop, tablet, and `320×800`; retry buttons
must remain keyboard-operable and visible without horizontal overflow.
