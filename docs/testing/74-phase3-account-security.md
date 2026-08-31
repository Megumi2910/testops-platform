# Phase 3 — Account security regression evidence

## Scope

This slice covers the frontend contract around existing authentication APIs.
Backend credential validation, token-version invalidation, refresh-token
revocation, and OTP rate limits remain server-owned and are covered by the
backend authentication suite.

| Case | Expected result | Result |
| --- | --- | --- |
| Auth context refresh | `reloadUser()` calls `/auth/me` and updates shared identity | PASS (mounted account test) |
| Password change | Requires confirmation, locks submission, signs out, and preserves reason query | PASS |
| Google-only password setup | Send code → confirm code/password → refresh identity | PASS |
| Google unlink | Confirmation dialog requires current password and signs out after success | PASS |
| Session list | Loading, empty, error/retry, and per-row revoke states are rendered | PASS (component contract) |
| Revoke all | Pending protection and sign-out redirect reason are wired | PASS (source + component contract) |
| Account deep links | `#security`, `#login-methods`, and `#sessions` target stable sections | PASS (source contract) |
| Form accessibility | Named controls, password autocomplete tokens, one-time-code autocomplete, and dialog focus | PASS (lint + mounted controls) |

## Commands and results

From `frontend/`:

```powershell
npm run lint
npm run typecheck
npm test -- --run
npm run build
```

Current local result: lint PASS, typecheck PASS, 17 test files / 53 tests
PASS, and Vite production build PASS.

The rebuilt isolated QA frontend also passed the focused live Playwright
`phase5-auth-session-matrix.spec.ts` (3/3): invalid OTP recovery, protected
deep-link verification, and individual/all-session revocation. The test used
the QA Mailpit service and did not reset the normal development volumes.

The three focused account tests are in
`frontend/src/features/auth/AccountPages.test.tsx`. They use a real
`QueryClientProvider` and `MemoryRouter`, mock only the network boundary, and
assert redirect reasons, endpoint payloads, and identity refresh behavior.

## Remaining release evidence

The complete Phase 3 gate still requires a rebuilt QA image and Chrome DevTools
verification of the live password-reset, session-revoke, Google-provider, and
unverified-user journeys. Those checks are intentionally not replaced by
mounted tests. Sensitive credentials, OTPs, and tokens must remain outside
screenshots, traces, and committed documentation.
