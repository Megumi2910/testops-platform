# Phase 7 — TestOps readiness contrast correction

## Scope

The rebuilt TestOps readiness page passed functional smoke checks, but Chrome
Lighthouse found two text colors below the WCAG AA contrast target. This slice
corrects those shared visual tokens without changing routes, API behavior, or
authentication flow.

## Root cause

`frontend/src/styles.css` declared a light indigo color for `.eyebrow` and a
muted gray for `.footer`. Against the readiness page background (`#f5f7fb`),
Lighthouse measured contrast ratios of `4.02` and `3.55`. Normal text and small
uppercase labels require at least `4.5:1`.

## Implementation

- `.eyebrow` now uses the existing `--brand-strong` token, with `#0b4dcc` as a
  fallback for standalone stylesheet use.
- `.footer` now uses `#5f6b82`, which retains the subdued visual hierarchy while
  meeting the normal-text contrast requirement.
- No component markup, API contract, or color used for status meaning changed.

Using an existing brand token for the eyebrow keeps future theme adjustments
centralized. The footer remains a literal readable neutral because it is not a
semantic status color and must stay legible on both the public and signed-in
shells.

## Verification

Frontend gates from `frontend/`:

```powershell
npm run lint
npm run typecheck
npm test -- --run
npm run build
```

All gates passed: 21 test files and 77 tests. The rebuilt frontend container
was healthy and served the current CSS. Chrome DevTools then confirmed:

- TestOps readiness title: `TestOps Platform`.
- Backend status: `UP`.
- Lighthouse desktop accessibility: `100`.
- No new application console exception; the only console entry is the expected
  unauthenticated refresh `401` during guest bootstrap.

The ecommerce target was not changed by this slice. Its separate mobile
Lighthouse score remains an ecommerce backlog item.
