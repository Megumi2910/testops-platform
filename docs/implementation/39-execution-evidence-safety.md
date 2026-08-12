# Phase 5 execution evidence and navigation safety

## Why this slice exists

TestOps executes user-authored browser steps in a managed Chromium context. Two boundaries must hold together:

1. A test may use a secret variable to authenticate against a target, but the secret must never become a persisted screenshot, trace, error message, or API value.
2. A target page may attempt to leave the approved project origin through a link, form submission, redirect, popup, or script. The worker must classify that attempt as `BLOCKED_NAVIGATION`, not as an ordinary network outage.

The policies live in the worker next to Playwright because it is the only component that sees the resolved secret and the browser's real navigation events.

## Secret evidence policy

`ExecutionRunService` decrypts encrypted variable snapshots only inside the worker transaction. It passes the resolved value and the uppercase secret-key set to `PlaywrightCaseRunner`; the API never returns the plaintext value.

`PlaywrightCaseRunner.referencesSecret` checks locator, input, and expected-value templates. Once any step references a configured secret:

- explicit `TAKE_SCREENSHOT` steps are skipped;
- failure screenshots are not captured;
- tracing is stopped and the temporary trace is deleted before the result leaves the worker;
- sanitized error text removes password-, token-, and secret-like assignments.

Non-secret variables do not set the suppression flag. Their explicit screenshots and normal trace are persisted by `ArtifactWriter`, with the originating step position recorded in `execution_artifacts.step_position`.

This is a conservative case-level policy: one secret-bearing step suppresses the whole case's evidence. It avoids partial screenshots that could reveal a value entered earlier or a token rendered later in the same page.

The isolated E2E Compose override explicitly enables secret variables and points the backend at the generated `/run/secrets/testops/project-variable-key`. This is required because CI starts from `backend/.env.example`, which keeps secret variables disabled by default; the repeatable QA profile must declare its security-sensitive mode explicitly rather than inheriting a developer's local `.env`.

## Navigation policy

`ExecutionTargetGuard.resolve` remains the source of truth for absolute and relative URLs. The runner now also attaches a `Page.onRequest` navigation listener in addition to the existing main-frame and popup listeners. This catches the request before a click or form submission can turn into a connection-refused error.

When a navigation request cannot resolve to the exact project origin, the listener records one `NavigationViolation`. The step loop checks that violation after the action and records it as the action's failure:

```text
errorCategory = BLOCKED_NAVIGATION
errorMessage  = Browser navigation left the approved project target
```

The check remains fail-closed for localhost/private targets: local development requires the feature flag and an exact allowlisted `http://localhost:<port>` origin.

## Verification

`frontend/e2e/phase5-evidence-safety.spec.ts` creates QA-owned variables and cases through the UI. It proves that secret cases have no artifacts while ordinary-variable cases retain both a screenshot and a trace. It also uses a static target link and form whose actions point to an unreachable, unapproved port; both cases finish with `BLOCKED_NAVIGATION` and the sanitized recovery message.

Focused checks:

```powershell
cd frontend
npm run lint
npm run typecheck
npm run test -- --run
npm run e2e -- phase5-evidence-safety.spec.ts

cd ..\backend
./mvnw -q '-Dtest=PlaywrightCaseRunnerTest,ExecutionRunServiceTest,ExecutionServiceTest' test
```

The isolated E2E stack is started under the separate `testops-e2e` Compose project name so normal development containers and volumes are not recreated.

The full Playwright run also hardens the existing password-recovery journey: after the recovery page's Back to sign in link, the test waits for `/login` and confirms the controlled email value before submitting. This prevents a React remount/race from turning a valid recovery flow into a browser-native required-field failure when the entire suite runs in sequence.

## Tradeoff and follow-up

Suppressing all evidence for a secret-bearing case makes diagnosis less visual, but it is safer than attempting pixel-level redaction after capture. A future redaction service would need an explicit threat model and deterministic masking gate; it is outside this slice.
