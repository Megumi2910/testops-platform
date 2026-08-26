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

These validators never merge a pull request, deploy production, delete the
default Compose project, or publish raw browser artifacts. Runtime names are
explicit (`testops-m10a-final-normal` and `testops-m10a-final-qa`) so a local
release check cannot mutate the developer’s default stack.
