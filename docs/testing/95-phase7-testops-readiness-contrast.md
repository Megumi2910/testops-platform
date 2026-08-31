# Phase 7 — Readiness contrast regression evidence

## Test case

**ID:** QG-039

**Purpose:** Ensure the public TestOps readiness shell meets the accessibility
contrast threshold after a rebuilt frontend deployment.

### Preconditions

1. Start Docker Desktop and the normal TestOps Compose stack.
2. Rebuild the frontend from the checked-out source.
3. Open `http://localhost:3000/` in Chrome DevTools as a guest.

### Steps and expected results

1. Capture an accessibility snapshot. The page exposes a named `main`, an H1,
   readiness status, and keyboard-operable links.
2. Confirm the status card reports `Backend ready` and `UP`.
3. Run a desktop Lighthouse snapshot. Accessibility is at least `95`.
4. Inspect the console. No application exception is present. A `401` from the
   anonymous refresh probe is expected during guest bootstrap and is not a
   product failure.
5. Inspect network requests. The document, JavaScript, CSS, readiness API, and
   actuator health request return `200`; no request targets an obsolete asset.

## Evidence

| Check | Result |
| --- | --- |
| Frontend lint | PASS |
| Frontend typecheck | PASS |
| Frontend unit tests | PASS — 21 files / 77 tests |
| Frontend production build | PASS |
| Rebuilt frontend container | PASS — healthy |
| Lighthouse desktop accessibility | PASS — 100 |
| TestOps readiness API/health | PASS — 200 / `UP` |
| Console | PASS — expected guest refresh `401` only |

The raw Lighthouse report and browser traces remain local QA artifacts and are
not committed because they can contain runtime metadata. This sanitized record
is the regression evidence for QG-039.
