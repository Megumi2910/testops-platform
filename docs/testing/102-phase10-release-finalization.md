# Phase 10 release-finalization evidence boundary

The final release slice requires one candidate SHA from the local gate,
isolated normal/QA runtime smoke, two consecutive CI attempts, and the
existing draft PR. The CI contract is the six-job set:

`frontend`, `backend`, `containers`, `e2e`, `e2e-local-disabled`, and
`e2e-browser-crash`.

The evidence is query-backed where it leaves the workstation. GitHub Actions
run IDs and job conclusions are read with the GitHub CLI; the PR validator
reads the draft state and head SHA from GitHub. Local runtime evidence remains
sanitized to status, health, revision, and HTTP 200 smoke outcomes. The PR
must remain open and draft, and no production endpoint is touched.

The aggregate Playwright command covers the single-revision browser matrix.
The retained revision-A/B tab reload remains a separate evidence-producing gate
because it must build and compare two adjacent revisions; run
`scripts/verify-retained-swap.ps1` for that boundary before final publication.
The ordinary CI E2E job uses the same exclusion, so a missing retained-swap
control directory cannot turn the six-job CI contract into a false product
failure.

The disposable E2E Compose profile uses a `1000` refresh-attempt budget because
all browser specs share the localhost limiter while creating isolated sessions.
This is test-harness capacity only; production/default Compose limits are not
changed, and rate-limit semantics are still verified by focused contract cases.

The QA runtime smoke uses the isolated overlay endpoints `http://localhost:3300`
and `http://localhost:8380/actuator/health`; the developer’s default stack keeps
its `3000/8080` ports and remains running throughout the check.

QA explicitly trusts `http://localhost:3300`, uses
`testops_qa_refresh`/`testops_qa_oauth_session`, and disables real Google OAuth
regardless of inherited backend environment values. The normal stack uses the
`testops_refresh`/`testops_oauth_session` pair and deterministic Google stays
isolated to the E2E pair. A QA password login must therefore survive a full
reload with `POST /api/v1/auth/refresh` returning `200`.

The validator accepts the JSON-lines form emitted by current Docker Desktop as
well as array-form Compose output, then applies the same two-service health and
full-SHA provenance assertions.

Run the local validators from the candidate checkout:

```powershell
$sha = git rev-parse HEAD
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-release-runtimes.ps1 -ExpectedRevision $sha
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-consecutive-ci.ps1 -Count 2 -ExpectedRevision $sha
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-pr-state.ps1 -Number 3 -ExpectedRevision $sha
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-plan-ready.ps1 -PlanId testops-m10a-completion-20260823
```

These checks are the publication boundary; they do not authorize merge or
deployment.
