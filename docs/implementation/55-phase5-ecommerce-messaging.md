# Phase 5 ecommerce messaging implementation

## What this slice closes

The ecommerce messaging path now has a real two-user browser contract. A verified customer can send a message to a seller through the same-origin SockJS/STOMP connection, and the seller's independent browser context receives it without the REST fallback being used. The REST API and WebSocket interceptor continue to enforce thread membership.

## Runtime path

1. `frontend/src/services/messageWebSocket.js` opens SockJS at `/ws`, authenticates the STOMP `CONNECT` frame with the local access token, subscribes to `/topic/thread/{threadId}`, and sends to `/app/chat/{threadId}`.
2. `backend/src/main/java/com/second_project/ecommerce/config/WebSocketAuthInterceptor.java` authenticates `CONNECT` and checks ownership for `SUBSCRIBE` and `SEND` destinations before the message reaches a controller.
3. `MessageWebSocketController` resolves the authenticated STOMP `Principal`, looks up the sender by principal name, delegates persistence to `MessageService`, and publishes the resulting `MessageDto` to the thread topic.
4. `frontend/src/pages/MessagesPage.jsx` merges topic messages into the active thread. If the socket is unavailable it keeps the existing REST send path as a recovery mechanism and exposes connection state to the user.

## Defect and design decision

The previous controller used Spring Security's `@AuthenticationPrincipal CustomUserDetails` parameter annotation. In a Spring Messaging handler this parameter was not resolved as the WebSocket session principal. Jackson therefore attempted to deserialize the message payload into `CustomUserDetails` and failed with `InvalidDefinitionException` before `sendMessage` ran. The controller now accepts the standard `java.security.Principal`, which Spring Messaging resolves from the authenticated STOMP session. Typing notifications use the same contract, and error delivery is guarded when a principal is absent.

This keeps authentication at the channel interceptor, where unauthenticated and non-member destinations are rejected, while the controller receives only the stable username needed to load the domain `User`. It avoids serializing security objects through the message payload and does not weaken thread authorization.

## Verification

- Backend focused gate: `.\mvnw.cmd -B '-Dtest=MessageWebSocketControllerTest,WebSocketAuthInterceptorTest' test` — 5 tests passed.
- `MessageWebSocketControllerTest` proves a STOMP `Principal` is used to find the sender and publish the saved DTO.
- `WebSocketAuthInterceptorTest` proves unauthenticated CONNECT and non-member subscribe/send are rejected while a member remains allowed.
- Isolated E2E stack: `http://localhost:3101` with the dedicated `ecommerce_e2e_pgdata` volume.
- Browser gate: `phase5-ecommerce-messaging.spec.ts` — 1 test passed in 5.0 seconds. It uses two independent contexts, aborts Customer A's REST message request, and verifies the unique message is visible in both contexts.
- Regression rerun: the combined Mailpit, role-isolation, checkout, and messaging gate passed 7 scenarios in 23.6 seconds; the existing 13-scenario storefront smoke gate passed in 23.0 seconds.

## Remaining boundary

This closes live WebSocket send/receive and ownership checks. Reconnect timing, explicit REST-fallback delivery, unread-state assertions, and the native multi-user stress/concurrency harness remain open Phase 5 work. The GitHub Actions account has exhausted its included minutes (`3,000/3,000`), so pushed workflows currently fail before executing a job; local evidence is the authoritative verification until the billing cycle resets or a paid budget is enabled.
