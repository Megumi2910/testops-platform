# Phase 6 retained-deployment foundation evidence

## Current result

**P6 LIVE EVIDENCE PASS.** The revision/header, Playwright configuration,
client-navigation, orchestration, and evidence-output contracts pass focused
checks. The adjacent A/B run against the current revision-B commit built and
served both exact images, recorded one stale-chunk `404`, one reload, and
completed isolated teardown. The combined shell/security/Playwright/Chrome
DevTools manifest validates 30 case/viewport records and 300 assertions.

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
success-shaped evidence record. The live command returned zero after the
PowerShell worker correctly ignored a non-fatal Node stderr warning while
collecting the Playwright result.

## Canonical sanitized swap block

On a successful live run, `artifacts/browser-evidence/P6.json` retains the
shared top-level P6 schema and receives this `swap` contract:

- full `revision_a` and `revision_b`, with `adjacent=true`;
- exact A/B OCI and response-header revisions;
- static asset and static-404 B headers plus `proxy_headers_absent=true`;
- `document_reloads=1` and `stale_chunk_404s=1`;
- A recovery marker present, B diagnostic marker present, and no reload loop.

The file contains no cookies, authorization headers, passwords, OTPs, response
bodies, raw URLs with user data, screenshots, or traces. The account-shell,
account-security, and Chrome DevTools checks are merged into the same ignored
artifact by `scripts/merge-p6-browser-evidence.ps1`; the strict P6 validator
accepts the combined manifest only after all case records and exact negative
tuples are present.

## Release interpretation

This evidence closes the retained-deployment portion of P6. The canonical
manifest is merged and accepted alongside the account-shell/security matrices
and combined Playwright/Chrome DevTools evidence; the next milestone slice may
proceed with the same source SHA.
