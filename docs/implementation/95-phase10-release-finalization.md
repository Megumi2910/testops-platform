# Phase 10 release finalization implementation

Phase 10 freezes the exact candidate revision and proves the publication
boundary without merging or deploying it. The release validators are small,
fail-closed wrappers around the repository’s existing contracts:

- `verify-consecutive-ci.ps1` queries GitHub Actions for two completed runs of
  the exact SHA and requires the six named CI jobs to succeed in each run;
- `verify-release-runtimes.ps1` checks isolated normal and QA Compose projects,
  their backend/frontend health and full-SHA provenance, and one UI/API smoke
  probe per runtime;
- `verify-pr-state.ps1` requires draft/open/unmerged PR #3 on `main`, with the
  exact candidate head SHA and current evidence language; and
- `verify-plan-ready.ps1` ensures P1–P9 have ledgers and the P10 lease is the
  only active phase before finalization.

The aggregate browser matrix deliberately excludes the retained revision-A/B
test. That scenario requires two adjacent source revisions and a control
directory, and is validated independently by `verify-retained-swap.ps1`; the
single-revision aggregate therefore cannot safely claim it as part of its own
run.

The disposable `docker-compose.e2e.yml` profile raises only its refresh-attempt
budget to `1000`. The full matrix intentionally creates many isolated sessions
from one localhost address; this avoids cross-spec self-throttling while
leaving the production/default limiter unchanged. Rate-limit behavior remains
covered by backend contract tests and targeted negative browser cases.

These validators never merge a pull request, deploy production, delete the
default Compose project, or publish raw browser artifacts. Runtime names are
explicit (`testops-m10a-final-normal` and `testops-m10a-final-qa`) so a local
release check cannot mutate the developer’s default stack.

The QA overlay publishes its UI/API on `3300/8380`; the normal E2E overlay uses
`3100/8180`. Both remain separate from the developer’s default `3000/8080`
stack, which is never stopped by release verification.
