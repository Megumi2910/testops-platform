# Phase 5 ecommerce messaging evidence

## Browser contract

| Step | Expected evidence | Result |
| --- | --- | --- |
| Sign in as Customer A and Seller B in separate contexts | Both sessions remain isolated; seller lands on `/seller` | PASS |
| Resolve Customer A's deterministic Seller B thread | Thread is owned by both accounts; foreign-thread reads remain rejected by the role-isolation contract | PASS |
| Open `/messages/{threadId}` in both contexts | Existing seed message and composer render | PASS |
| Abort Customer A `POST /api/messages/threads/*/messages` | The test cannot pass through REST fallback | PASS |
| Send a unique message from Customer A | Seller B receives the message over `/ws` and Customer A sees the topic echo | PASS |

Command:

```powershell
$env:ECOMMERCE_E2E_BASE_URL='http://localhost:3101'
$env:ECOMMERCE_E2E_MESSAGING='true'
$env:ECOMMERCE_E2E_CUSTOMER_PASSWORD='MockCustomer!123'
$env:ECOMMERCE_E2E_SELLER_B_PASSWORD='MockSellerB!123'
npm run e2e -- phase5-ecommerce-messaging.spec.ts --workers=1
```

The clean rerun passed 1 scenario in 5.0 seconds after rebuilding only the isolated backend image with the controller fix. Screenshots and traces remain in the ignored Playwright result directory; no credentials, tokens, or message fixtures are committed.

The post-fix combined isolated gate also passed 7 scenarios (Mailpit authentication, checkout, messaging, and role isolation) in 23.6 seconds. The existing 13-scenario storefront smoke contract passed in 23.0 seconds against the same rebuilt stack.

## Backend evidence

`MessageWebSocketControllerTest` covers the controller's principal lookup and topic publication. `WebSocketAuthInterceptorTest` covers four channel-level cases: missing CONNECT authentication, unauthorized SUBSCRIBE, unauthorized SEND, and an allowed member. The focused Maven run passed all 5 tests.

## Quality-gate interpretation

`QG-B14` moves from fixture-only coverage to **PARTIAL with live WebSocket delivery proven**. Reconnect behavior, explicit REST fallback, unread badges, and native simultaneous-user stress remain separate cases. GitHub Actions cannot currently provide a remote result because the account has consumed its 3,000 included minutes; the observed failure is quota exhaustion before any job step, not a code assertion.

After this slice was pushed, TestOps workflow `31701107482` completed with all six jobs failed and zero executed steps. This is the current remote-evidence record for the quota block; it does not invalidate the passing local gates above.
