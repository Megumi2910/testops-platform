# Phase 5 ecommerce messaging resilience evidence

The isolated Playwright contract
`frontend/e2e/phase5-ecommerce-messaging.spec.ts` passed **2/2 scenarios in
13.8 seconds** against the rebuilt ecommerce E2E stack on
`http://localhost:3101`.

Covered scenarios:

1. Customer-to-seller delivery over the live `/ws` SockJS/STOMP channel with
   the REST POST intentionally aborted.
2. Customer send while `/ws` is blocked, REST fallback delivery, seller unread
   filtering, and read-state removal after opening the thread.

Supporting checks:

| Check | Result |
| --- | --- |
| Ecommerce frontend unit tests | PASS — 11 tests |
| Ecommerce frontend production build | PASS |
| Disposable Compose rebuild | PASS — frontend/backend/database/Mailpit healthy |
| Chrome DevTools | Unavailable in this session; Playwright supplied browser evidence |

QG-B14 is **PARTIAL**. Browser live delivery, REST fallback, unread filtering,
and read-state behavior are covered. Backend-restart reconnect timing, native
high-contention messaging, and the complete multi-role messaging matrix remain.
