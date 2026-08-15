# Phase 7 — Accessible authentication field errors

## Outcome

Authentication forms now give every email, password, display-name, and OTP
control a stable `id`, an explicit label association, and an appropriate
autocomplete token. When the API returns a structured field violation, the
affected control receives `aria-invalid="true"` and points to an inline,
screen-reader-readable error through `aria-describedby`.

## Why this boundary matters

Authentication failures are often recoverable user mistakes: an expired code,
an invalid email, or a password that does not meet the policy. A page-level
alert explains that something went wrong, but it does not tell keyboard or
assistive-technology users which control must be corrected. The field-level
contract keeps the backend as the source of validation truth while making the
next action visible at the control that needs it.

## Implementation

`frontend/src/features/auth/AuthField.tsx` is the small presentation primitive
used by the public authentication pages. It renders the label and input,
preserves the existing HTML autocomplete tokens (`email`, `name`,
`current-password`, `new-password`, and `one-time-code`), and derives a stable
error id from the control id.

`frontend/src/features/auth/AuthPages.tsx` now keeps the normalized
`ApiError.fieldErrors` map beside the page-level message. The submit and resend
handlers copy server violations into that map without exposing raw stack traces
or credentials. A generic page alert remains for the overall request failure;
the inline error provides the field-specific recovery instruction.

## Design decision

The field primitive accepts native input attributes instead of introducing a
form library. Authentication pages already own their small state machines and
the backend problem contract already normalizes field paths. This keeps the
change local, avoids duplicate validation rules, and leaves project forms free
to use their existing React Hook Form `Field` component.

## Verification evidence

Implementation commit `6af07d1` passed remote CI run
[`31863227868`](https://github.com/Megumi2910/testops-platform/actions/runs/31863227868).
All six jobs passed: frontend, backend, containers, enabled E2E,
local-target-disabled E2E, and browser-crash E2E. GitHub also emitted only a
non-blocking Node.js 20 deprecation annotation for `actions/upload-artifact`.
The live Chrome DevTools form and viewport matrix remains a separate release
gate.

## Failure and recovery behavior

- A malformed or rejected request still renders the existing sanitized alert.
- A known server field path is rendered beside its input and announced with
  `role="alert"`.
- Unknown or non-field failures stay page-level and do not create misleading
  field errors.
- Clearing or resubmitting a form clears stale field messages before the next
  response.
- OTP inputs continue to use `inputMode="numeric"`, six-digit constraints,
  and `autocomplete="one-time-code"`; no OTP or password is placed in a URL.

## Source anchors

- `frontend/src/features/auth/AuthField.tsx`
- `frontend/src/features/auth/AuthPages.tsx`
- `frontend/src/lib/api.ts` (`ApiError.fieldErrors`)
- `frontend/src/features/auth/AuthPages.test.tsx`
