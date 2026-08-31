# Phase 9 browser-quality and performance evidence

The Phase 9 browser matrix passed on the committed candidate revision. The
Playwright run completed 18 case-viewports with zero failures. It covered
readiness, login, registration, password reset, the authenticated shell,
projects, dashboard, account, the account menu, the mobile drawer, native
form/error states, dialogs, focus transitions, overflow, and the automated
accessibility helper at desktop, tablet, and `320×800`.

The sanitized result contains 143 assertions and no failed assertions. The
route performance records cover readiness, projects, dashboard, and account at
all three viewports. LCP remained below the 2500 ms threshold and CLS remained
below 0.1 for every record.

Chrome DevTools MCP independently captured Lighthouse and performance-trace
evidence for the public readiness route at `1440×900` and `320×800`. Both
captures reported accessibility 100, LCP below 500 ms, and CLS at or below
0.01. Raw Lighthouse reports and DevTools payloads remain outside the
repository; only the sanitized summary is retained in the ignored
`artifacts/performance/chrome-lighthouse.json` input and generated
`artifacts/performance/P9.json` evidence.

The release manifest is `artifacts/browser-evidence/P9.json` (ignored). Run:

```powershell
npm --prefix frontend run e2e -- e2e/accessibility-matrix.spec.ts --project=chromium
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-performance.ps1 -ProjectName testops-m10a-gate
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/assert-browser-evidence.ps1 -Phase P9
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-defect-ledger.ps1
```

The P9 defect disposition is explicit: no P0/P1 TestOps defects remain open,
P2/P3 entries have a status, disposition, or resolution, and ecommerce
reference-suite rows are out of scope for TestOps release acceptance.
