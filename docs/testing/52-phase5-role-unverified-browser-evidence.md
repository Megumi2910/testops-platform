# Phase 5 role and unverified-account browser evidence

## Environment

| Field | Value |
| --- | --- |
| Application | TestOps Platform |
| Frontend | `http://localhost:3100` |
| Backend | `http://localhost:8180` |
| Target fixture | `http://localhost:3201` |
| Mailpit | `http://127.0.0.1:8025` |
| Database | Disposable `testops-e2e` PostgreSQL volume |
| Browser | Playwright Desktop Chrome |
| Data | Run-prefixed QA accounts only |

## Matrix

| Scenario | Expected | Result |
| --- | --- | --- |
| Test manager opens the shared suite | New case and Run ready cases are visible; Admin is absent | PASS |
| Tester opens the shared suite | Run ready cases is visible; New case and Admin are absent | PASS |
| Viewer opens the shared suite | Read-only suite; New case, Run ready cases, Members, and Admin are absent | PASS |
| Non-member opens the project | Safe project-load denial; Admin route redirects to dashboard | PASS |
| Project-role account navigates to `/admin/users` | Route guard redirects to `/dashboard`; Users heading is absent | PASS for test manager, tester, and viewer |
| Foreign suite ID under a legitimate project | Authenticated API returns `404`; safe error state renders | PASS |
| Unverified account signs in | Session is accepted, but the intended `/projects` destination enters verification recovery | PASS |
| Unverified shell navigation | Persistent banner is present; Projects and Dashboard links are hidden | PASS |
| Verify now link | Opens `/verify-email?email=…&recover=1` | PASS |
| Verification resend cooldown | Verification page is visible and resend control is disabled during server cooldown | PASS |

## Command and result

```powershell
cd D:\Projects\testops-platform\frontend
$env:E2E_BASE_URL = 'http://localhost:3100'
$env:MAILPIT_URL = 'http://127.0.0.1:8025'
$env:E2E_TARGET_ORIGIN = 'http://localhost:3201'
npx playwright test phase5-role-matrix.spec.ts phase5-unverified-boundary.spec.ts
```

Result: **3 passed**, 21.6 seconds.

The first attempt exposed an environment defect rather than a product defect:
the Mailpit container existed but had no network endpoint, so registration
returned a sanitized temporary-email error. Recreating only the Mailpit
service reattached it to `testops-e2e_default`; the exact same browser suite
then passed. This recovery is documented so CI and local operators can
distinguish infrastructure setup failures from authorization regressions.

## Release interpretation

This closes the browser portion of QG-B10 for project roles, non-members, and
unverified recovery. It does not claim the complete Phase 5 release: Google
OAuth, real process-kill browser-crash evidence, ecommerce QG-B11–QG-B14, and
the final consecutive-CI/accessibility matrix remain outstanding.
