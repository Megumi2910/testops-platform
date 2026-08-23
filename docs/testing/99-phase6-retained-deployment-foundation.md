# Phase 6 retained-deployment foundation evidence

## Current result

**SOURCE FOUNDATION PASS; LIVE A/B RESULT OPEN.** The revision/header,
Playwright configuration, client-navigation, orchestration, and evidence-output
contracts pass focused checks. No two-image success is claimed because the
adjacent revision-B diagnostic marker has not yet been committed and exercised.

## Acceptance matrix

| Contract | Evidence now | Live completion condition |
| --- | --- | --- |
| Exact image/HTTP identity | Dockerfile/Nginx contract test covers full `VCS_REF`, shell, asset, static `404`, proxy exclusions, and inherited security headers | both built images and both running frontend containers report their exact full SHA |
| Real source delta | orchestrator requires A to be B's first parent and checks marker absence/presence in `AuthPages.tsx` | committed B changes the lazy `AuthPages` chunk while A remains marker-free |
| Retained document | Playwright spec starts on A and clicks the primary-navigation **Sign in** link unambiguously; direct `/login` navigation is forbidden | one A chunk response is `404`, one document reload occurs, B marker/header render, and the A session marker remains |
| Stable origin | A may receive an anonymous loopback port, then B is pinned to that observed port before frontend recreation | the retained document reaches B on the same origin and receives an HTTP `404`, never a dead-port connection failure |
| Loop prevention | spec rejects a second document request during the stability window | `document_reloads=1`, `reload_loop=false` in sanitized evidence |
| Evidence integrity | dry run emits no pipeline manifest; successful path requires Docker and Playwright query results | ignored P6 evidence contains adjacent revisions, labels, headers, exact counts, and no unexpected/leaked data |
| Runtime secret boundary | focused source contract requires every mounted RSA/pepper/variable/bootstrap/QA file and checks provisioning occurs after the last Docker build | ephemeral values remain in the disposable ignored worktree and never enter output or an image layer |

## Fresh focused evidence

```text
Revision and health contract PASS assertions=31
Quality-gate script contract PASS assertions=82
frontend typecheck PASS
frontend lint PASS
```

The script dry run also resolved two distinct adjacent full commits and stated
the detached-worktree/build/header/browser sequence without creating a
success-shaped evidence record.

## Canonical sanitized swap block

On a successful live run, `artifacts/browser-evidence/P6.json` retains the
shared top-level P6 schema and receives this `swap` contract:

- full `revision_a` and `revision_b`, with `adjacent=true`;
- exact A/B OCI and response-header revisions;
- static asset and static-404 B headers plus `proxy_headers_absent=true`;
- `document_reloads=1` and `stale_chunk_404s=1`;
- A recovery marker present, B diagnostic marker present, and no reload loop.

The file contains no cookies, authorization headers, passwords, OTPs, response
bodies, raw URLs with user data, screenshots, or traces. Later account-shell
and Chrome DevTools checks merge their sanitized case/viewport/network fields
into the same ignored artifact.

## Release interpretation

This evidence closes only the revision-A foundation slice. `QG-010` and formal
P6 AC1 remain open until the live orchestrator returns zero and its pipeline
manifest is accepted. Account-shell/security matrices and combined
Playwright/Chrome DevTools evidence are separate P6 acceptance criteria.
