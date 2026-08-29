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

The browser callback regression expects the recovery card heading
`Google sign-in needs attention` and its full actionable message. It must not
revert to the former passive completion screen, because that would hide the
password-recovery action for an existing password account.

The account-security browser helper reads the E2E refresh-cookie name
(`testops_e2e_refresh` by default) when it transfers a refresh rotation into a
probe context. It must not assume the normal-stack cookie name, or the
simultaneous-stack isolation contract would make the probe appear signed out.

After a Google unlink leaves a password account, the deterministic provider
must return `account_link_required`. The account-security browser path asserts
that safe callback reason and the password-first linking guidance rather than
accepting a generic provider failure.
