# Phase 5 secret-failure evidence and artifact authorization

## Purpose

Passing secret-variable coverage is not enough. A failed assertion can capture a failure screenshot or a trace at exactly the moment a password is present, and an artifact endpoint must never disclose execution files to a non-member. This slice adds a repeatable browser failure journey and a service-level authorization regression.

## Secret-bearing failure behavior

The browser case navigates to the static QA target, fills its search field with an encrypted project variable, and then fails an `ASSERT_VISIBLE` step. `ExecutionRunService` decrypts the variable only inside the worker and passes the secret-key set to `PlaywrightCaseRunner`. Because the case has used a secret, the runner:

- omits the failure screenshot;
- deletes the temporary trace after tracing stops;
- preserves the failure category and step result;
- sanitizes the response so the plaintext cannot appear in the error message or execution JSON.

This remains a case-level safety boundary. A secret used by any earlier step suppresses all evidence for that case, even if the failing assertion itself does not contain the variable.

## Artifact authorization

`ExecutionService.artifactDownload` resolves the authenticated user and project first. Global administrators may continue, while every other caller must have project membership before the execution or artifact repositories are queried. The regression test verifies that a non-member receives the existing `403 project_access_denied` exception and that no artifact path is resolved.

This keeps authorization before resource lookup, which avoids both data disclosure and unnecessary filesystem access. Artifact metadata remains visible only through the existing execution-view permission path; download authorization is still project-scoped.

## Verification

```powershell
cd frontend
npm run e2e -- phase5-evidence-safety.spec.ts

cd ..\backend
./mvnw -q '-Dtest=ExecutionServiceTest,PlaywrightCaseRunnerTest,ExecutionRunServiceTest' test
```

The browser journey uses generated QA names and values, never committed credentials. It expects one `ASSERTION_FAILURE`, zero artifacts, and no secret plaintext in the authenticated execution response.

## Follow-up gates

This closes the covered secret-bearing failure and non-member download paths. Browser-crash reproduction, artifact download checks for every role, and Chrome DevTools evidence remain separate Phase 5 release gates.
