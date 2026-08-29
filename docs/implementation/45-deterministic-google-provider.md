# Deterministic Google OAuth provider for Phase 5 QA

## Why this exists

Google sign-in was the last authentication path without a repeatable browser fixture. A real Google account is unsuitable for CI: it requires external credentials, network access, human verification, and a changing provider response. The E2E Compose profile now supplies a tiny local OAuth2 provider that follows the authorization-code flow but returns a fixed, non-secret test identity.

This is a test seam, not a production identity service. It is enabled only by `docker-compose.e2e.yml`; the normal stack keeps Google disabled unless an operator supplies real credentials.

## Container and browser networking

The browser follows the authorization redirect, so it must receive a URL that is reachable from the host browser (`http://localhost:9090`). The backend exchanges the code and requests user information from inside its container, so it must receive the Docker service address (`http://oauth-provider:9090`). A single URL cannot satisfy both network perspectives.

`GoogleClientConfiguration` therefore accepts two optional settings:

| Setting | Consumer | E2E value | Purpose |
| --- | --- | --- | --- |
| `GOOGLE_PUBLIC_BASE_URI` | browser | `http://localhost:9090` | Authorization endpoint used by the login link |
| `GOOGLE_PROVIDER_BASE_URI` | backend | `http://oauth-provider:9090` | Token, user-info, and certificate endpoints |
| `GOOGLE_SCOPES` | backend/provider | `profile,email` | OAuth2 user-info flow without an OIDC ID token |

Production defaults remain `https://accounts.google.com` and `openid,profile,email`. The E2E provider deliberately does not mint a signed ID token or publish signing keys, so including `openid` would make Spring Security require an ID-token validation path that this deterministic fixture does not claim to implement.

## Provider contract

`frontend/e2e/oauth-provider/index.js` implements only the calls needed by the application:

- `GET /health` — Compose health check.
- `GET /o/oauth2/v2/auth` — validates the callback and state, then redirects with the fixed test code.
- `POST /token` — exchanges only `e2e-google-code` for the fixed bearer token.
- `GET /userinfo` — returns the fixed verified profile when that bearer token is supplied.
- `GET /certs` — returns an empty key set for compatibility with the client registration.

The fixed profile is `QA Google User` / `qa.google@testops.local`. These values are fixtures, not credentials. The provider does not log request headers, authorization values, codes, or tokens.

## Application behavior

The frontend displays “Continue with Google” only when the backend platform-options response says Google is enabled. The callback page keeps provider details private and accepts only four safe reasons: `account_link_required`, `account_unavailable`, `email_unverified`, and `oauth_sign_in_failed`. The first presents password sign-in followed by explicit Account Security linking; the remaining values provide bounded retry/contact guidance. Tokens, client secrets, stacks, and provider exceptions never appear.

The normal, QA, and E2E profiles use distinct refresh and OAuth-session cookie
names. QA explicitly disables Google even when `backend/.env` contains real
provider settings; deterministic Google remains E2E-only.

## Rebuild and run

From the repository root:

```powershell
docker compose -p testops-e2e -f docker-compose.yml -f docker-compose.e2e.yml up -d --build --force-recreate oauth-provider backend frontend
docker compose -p testops-e2e -f docker-compose.yml -f docker-compose.e2e.yml ps
```

The provider is published on host port `9090`; the TestOps E2E frontend remains on `3100` and the backend on `8180`. Recreate the backend whenever `GoogleClientConfiguration`, `application.yaml`, or the Compose environment changes; Spring binds the client registration during application startup.

Run the focused browser contract from `frontend`:

```powershell
npm exec playwright test e2e/phase5-google-boundary.spec.ts --config=e2e/playwright.config.ts --workers=1
```

The slice is healthy when both tests pass: deterministic sign-in reaches the authenticated home page and survives a session refresh, while a synthetic provider failure renders only the safe callback message.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Login link points at `oauth-provider` | Public and private base URIs were not separated | Set `GOOGLE_PUBLIC_BASE_URI=http://localhost:9090` and recreate the backend |
| Token exchange succeeds but sign-in fails | `openid` is enabled against the user-info-only fixture | Set E2E `GOOGLE_SCOPES=profile,email`; leave production defaults unchanged |
| Provider health is unhealthy | Container did not rebuild or port `9090` is occupied | Inspect `docker compose ... logs oauth-provider`, then recreate the service or free the port |
| Provider link is absent | `GOOGLE_AUTH_ENABLED` is false or the frontend has stale static assets | Set the E2E flag and rebuild the frontend image |
| Callback displays provider details | A regression bypassed the callback's generic error mapping | Run the focused test; do not publish raw OAuth errors, tokens, or stack traces |

Chrome DevTools was unavailable during this slice because the tool reported its usage limit. Playwright and container health/log evidence were used instead; a real Google provider and a later DevTools pass remain release-gate work.
