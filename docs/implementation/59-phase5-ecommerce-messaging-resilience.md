# Phase 5 — ecommerce messaging resilience

This implementation closes the browser-visible reconnect, REST-fallback, and
unread portion of the ecommerce messaging gate.

## Flow

```text
MessagesPage
  ├─ SockJS/STOMP /ws
  │    ├─ live thread subscription
  │    └─ broker notification → lightweight thread refresh
  ├─ messageApi.sendMessage (REST fallback)
  ├─ messageApi.getThreads (5-second unread synchronization)
  └─ messageApi.markAsRead (open thread / incoming message)
```

The socket is an acceleration path. REST remains authoritative for sending,
thread summaries, message loading, and read state.

## Implementation decisions

- `messageWebSocket.js` suppresses routine reconnect, parse, and closed
  subscription logs while preserving status callbacks for the page.
- A failed STOMP send changes the status to `disconnected` and throws to the
  existing `ChatPanel` fallback handler.
- `MessagesPage` polls the summary endpoint every five seconds because the
  current backend broadcasts thread messages without a dedicated unread event.
  The interval is cleared on unmount.
- Incoming messages for the selected thread call `markAsRead`; messages in
  other threads remain unread until opened.
- Message-load errors include an explicit retry control.

## Regression contract

`frontend/e2e/phase5-ecommerce-messaging.spec.ts` covers live delivery and the
disconnected path. It aborts only the customer’s `/ws` requests, sends through
REST, waits for the seller unread filter to receive the new message, opens the
thread, and verifies that the unread action disappears after the server-side
read update.

The final isolated run passed both scenarios. GitHub Actions run
`31705254097` remains quota-blocked before steps began; no remote run was
triggered after the account exhausted its included minutes.

## Remaining boundary

The browser contract does not claim that a backend restart reconnects every
subscription without loss, nor does it replace native multi-user stress tests.
Those remain open Phase 5 QG-B14 work.
