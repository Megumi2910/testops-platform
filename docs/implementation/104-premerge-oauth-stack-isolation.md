# Pre-merge OAuth recovery and stack isolation

OAuth callback redirects are intentionally a small public browser contract.
Only `account_link_required`, `account_unavailable`, `email_unverified`, and
`oauth_sign_in_failed` may appear as `oauth_error`; all other service and
provider failures become `oauth_sign_in_failed`. Redirects never carry a token,
secret, exception text, or raw provider error.

An existing password account is not silently linked to Google. The recovery UI
directs the person to password sign-in and then `/account#security` for explicit
linking. Other safe reasons offer retry, verified-account, or administrator
guidance.

Compose isolates localhost authentication state:

| Stack | Frontend | Refresh cookie | OAuth-session cookie | Google mode |
| --- | --- | --- | --- | --- |
| normal | `3000` | `testops_refresh` | `testops_oauth_session` | operator-configured |
| QA | `3300` | `testops_qa_refresh` | `testops_qa_oauth_session` | forced off |
| E2E | `3100` | `testops_e2e_refresh` | `testops_e2e_oauth_session` | deterministic fixture |

The QA overlay also sets `FRONTEND_ORIGIN=http://localhost:3300`, preventing a
refresh cookie issued for one local stack from being trusted by another.
