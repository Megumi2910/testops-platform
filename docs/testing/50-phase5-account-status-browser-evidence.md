# Phase 5 account-status browser evidence

## Evidence matrix

| Journey | Expected result | Evidence |
| --- | --- | --- |
| Fresh account after administrator sets `LOCKED` attempts password login | Stays on `/login`; accessible alert contains `This account is unavailable`; no session is created | `phase5-account-status.spec.ts` |
| Fresh account after administrator sets `DISABLED` attempts password login | Stays on `/login`; accessible alert contains `This account is unavailable`; no session is created | `phase5-account-status.spec.ts` |
| Generated account cleanup | Status returns to `ACTIVE` even when assertions fail after mutation | `finally` cleanup in `phase5-account-status.spec.ts` |

## Reproduction

The test requires the disposable E2E stack, Mailpit, and the generated bootstrap password. Run it after rebuilding the stack when backend or frontend source changes:

```powershell
docker compose -p testops-e2e -f docker-compose.yml -f docker-compose.e2e.yml up -d --build
cd frontend
$env:E2E_BASE_URL = 'http://localhost:3100'
$env:MAILPIT_URL = 'http://127.0.0.1:8025'
$env:E2E_ADMIN_EMAIL = 'qa.bootstrap-admin@testops.local'
$env:E2E_ADMIN_PASSWORD = (Get-Content ..\backend\.secrets\bootstrap-admin-password -Raw).Trim()
npm run e2e -- phase5-account-status.spec.ts --reporter=line
```

The browser test reads only visible status and alert text. It does not persist bearer tokens or email contents as evidence.

## Interpretation

`LOCKED` and `DISABLED` both map to the intentionally non-specific `account_unavailable` response. Keeping the same public message avoids account-state enumeration while still giving the user a clear recovery path through an administrator. A `200` response, a redirect away from `/login`, or a generic network error is a regression.

## Remaining Phase 5 work

This closes the locked/disabled password-session row. Google provider behavior, full administrator role permutations, Chrome DevTools dashboard/date/query evidence, ecommerce matrix coverage, and the complete accessibility/performance release gate remain open.
