# Phase 7 authentication field-error evidence

## Scope

This slice verifies the public authentication forms' semantic labels,
autocomplete tokens, and structured field-error association. Account-center
password panels and the full live Chrome DevTools accessibility matrix remain
separate release gates.

## Automated coverage

| Scenario | Expected contract | Result |
| --- | --- | --- |
| Reset-code confirmation returns `errors.otp` | Reset-code input is `aria-invalid="true"` and points to its inline error | PASS |
| Reset-code error is announced | The six-digit recovery guidance is visible with `role="alert"` | PASS |
| OTP input semantics | Verification/reset/setup controls use numeric input and `one-time-code` | PASS by source inspection and existing tests |
| Credential autocomplete | Login and recovery fields use standard email/password tokens | PASS by source inspection |

## Commands

```text
cd frontend
npm test -- --run src/features/auth/AuthPages.test.tsx   PASS (6 tests)
npm run lint                                            PASS
npm run typecheck                                       PASS
npm test -- --run                                      PASS (21 files / 67 tests)
npm run build                                           PASS
```

The pushed implementation commit's CI run is recorded in the milestone
document after publication. The live Chrome DevTools route/role/viewport
matrix remains a separate release gate.

## Regression ownership

- Implementation: `frontend/src/features/auth/AuthField.tsx` and
  `frontend/src/features/auth/AuthPages.tsx`
- Mounted regression: `frontend/src/features/auth/AuthPages.test.tsx`
- Browser follow-up: verify focus placement, native validation, screen-reader
  announcements, and mobile keyboard behavior for login, register, verify, and
  reset routes.

