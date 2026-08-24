# Phase 6 retained-deployment foundation

## Why this gate exists

A browser tab can outlive a frontend container. After a deployment, that tab
still runs revision A's router and may request an A-only hashed chunk from the
revision B container. A unit test that aborts a request inside one build proves
the recovery boundary, but it does not prove that the deployed images, response
headers, chunk removal, and retained document all belong to distinct revisions.

Phase 6 therefore treats deployment identity and browser recovery as one
contract. The source foundation, adjacent live A/B swap, account-shell and
account-security matrices, and combined Playwright/Chrome DevTools evidence
have all passed for the current revision-B commit.

## Served revision contract

`frontend/Dockerfile` carries the full `VCS_REF` into both the OCI
`org.opencontainers.image.revision` label and `TESTOPS_REVISION`. The
unprivileged Nginx entrypoint renders `frontend/nginx.conf` as a template, so
the served header and image label receive the same unshortened value.

| Response boundary | `X-TestOps-Revision` | Other header behavior |
| --- | --- | --- |
| SPA shell and client routes | exact frontend revision, `always` | no-store on `index.html`; `nosniff` and strict referrer policy retained |
| Hashed static asset | exact frontend revision, `always` | immutable cache plus both security headers |
| Missing static asset | exact frontend revision even on `404` | both security headers remain present |
| `/api`, `/oauth2`, `/login/oauth2`, `/actuator` | absent | backend/proxy responses cannot be mislabelled as frontend source |

Nginx stops inheriting parent `add_header` directives as soon as a location
defines one of its own. The index, SPA, and asset locations therefore repeat
the security headers alongside the revision/cache headers deliberately.

## True retained-tab orchestration

`scripts/verify-retained-swap.ps1` accepts two full revisions and fails unless
revision A is the first parent of revision B. It then:

1. creates clean detached worktrees for both commits;
2. proves the revision-B marker is absent from A, present in B, and introduced
   by the adjacent source delta in `AuthPages.tsx`;
3. builds separate A/B frontend images and a B backend image from clean build
   contexts, then checks every OCI revision label;
4. provisions ephemeral RSA keys, OTP pepper, variable key, and bootstrap/QA
   password files only after the image builds, under the disposable ignored
   worktree secret mount;
5. starts an isolated disposable Compose project on a random loopback frontend
   port and verifies the A shell, asset, static `404`, proxy exclusion, health,
   and security-header contracts;
6. keeps the A document open in Playwright while the script replaces only the
   frontend with B on A's already-observed loopback port, then verifies B
   health, label, and headers;
7. clicks the retained A shell's visible **Sign in** link inside primary
   navigation (avoiding the duplicate home-page call to action). The A router requests
   its unloaded `AuthPages` chunk, receives one `404`, records the A recovery
   marker, reloads one document, and renders the parameterized B marker;
   8. observes a bounded quiescence window to reject a second reload, merges only
   sanitized booleans/revisions/counts into ignored
   `artifacts/browser-evidence/P6.json`, and emits a query-backed pipeline
   manifest.

The PowerShell worker boundary collects Node/Playwright stderr with a
temporary non-terminating error preference. This keeps harmless runtime
warnings (for example, `NO_COLOR`) from aborting evidence collection before
the worker's actual exit state is evaluated.

Readiness is predicate-driven: Compose health, exact response identity, and
filesystem coordination signals control the swap. The only timed window is a
post-success stability assertion used to detect a reload loop.

## Failure and safety behavior

- A dirty working tree is never used as either build context.
- Equal, shortened, non-adjacent, or reversed revisions fail before Docker
  mutation.
- Dry-run output never contains a success-shaped `EVIDENCE_JSON` record.
- Raw Playwright reports stay in temporary worktrees; coordination files stay
  under ignored `qa-artifacts/`; the canonical evidence file is also ignored.
- Runtime secrets are generated after all image builds, never copied from the
  developer checkout, never printed, and deleted with the temporary worktree.
- The evidence merge preserves account-shell/DevTools fields written by later
  P6 checks instead of replacing the whole document.
- Teardown targets only the explicit non-default Compose project and its
  disposable volumes. Normal development volumes are outside the command.

## Source-level verification

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-revision-contract.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-quality-gate-scripts.ps1
npm --prefix frontend run typecheck
npm --prefix frontend run lint
```

The source contracts produced 31 revision/header assertions and 82
orchestration/config assertions. A live adjacent run against the current
revision-B commit passed, recording one document reload, one stale-chunk
`404`, the A recovery marker, and the B marker, with no reload loop. The
combined canonical manifest now validates 30 case/viewport records and 300
assertions with zero unexpected failures, console exceptions, or security
findings. The command remains repeatable after revision B contains the
diagnostic marker:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-retained-swap.ps1 `
  -ProjectName testops-m10a-gate
```
