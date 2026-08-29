# Pre-merge OAuth and localhost-stack regression boundary

Backend handler tests assert password-account collision mapping, unavailable
account mapping, and fallback sanitization. Mounted callback tests assert
actionable recovery for collision, unavailable, unverified, and generic
failure without showing raw provider detail.

`scripts/verify-compose-configs.ps1` renders normal, QA, and E2E profiles and
asserts their refresh/OAuth-session names. It also proves that the QA render
contains `http://localhost:3300` and explicitly sets `GOOGLE_AUTH_ENABLED` to
`false`.

Live browser evidence must include: QA password login, full reload, a `200`
refresh response; deterministic E2E Google success; existing-password recovery;
and a synthetic provider failure with no unexpected console error or sensitive
network payload.
