# TestOps documentation

## Visual report portal

Start with the offline [TestOps visual system report](index.html). It links the current architecture, API handbook, beginner manual, UI-to-execution workflow, and feature/business-logic handbook. The pages work from `file://` and from a local static server:

```powershell
node scripts/docs/serve-report.mjs
# open http://localhost:4173/
```

The machine-readable [API catalog](reference/api-catalog.json) is generated into the [API handbook](reference/api-reference.html). The [source truth audit](planning/86-documentation-truth-audit.md) records what was verified live and what was unavailable, rather than presenting missing runtime evidence as complete.

For the current committed candidate gate, start with the [quality-gate operator guide](guides/23-quality-gate-operator-guide.md) and reconcile the result in the [Milestone 10A completion ledger](milestones/15-milestone-10a-testops-completion.md). The Milestone 9 release guide is historical evidence.

This directory is organized by the question a maintainer is trying to answer:

| Folder | Use it for | Start with |
| --- | --- | --- |
| [`architecture/`](architecture/) | Product boundaries, domain relationships, and the interactive system map | [Technical specification](architecture/01-technical-specification.md) |
| [`implementation/`](implementation/) | Source walkthroughs, executable steps, and UI-to-worker behavior | [Implementation handbook](implementation/00-project-implementation-handbook.md) |
| [`operations/`](operations/) | Runtime, database, target connectivity, and recovery procedures | [Local target testing guide](operations/12-local-target-testing-guide.md) |
| [`security/`](security/) | Authentication, authorization, secrets, and abuse controls | [Authentication and security](security/02-authentication-and-security.md) |
| [`milestones/`](milestones/) | Milestone scope, delivery decisions, and release-candidate evidence | [Milestone 10A completion ledger](milestones/15-milestone-10a-testops-completion.md) |
| [`planning/`](planning/) | Risks, roadmap, alternatives, and change-safety decisions | [Risks, roadmap, and decisions](planning/05-risks-roadmap-and-decisions.md) |
| [`testing/`](testing/) | Live QA matrices, defect evidence, automation gates, and completion status | [Full-system quality-gate baseline](testing/23-quality-gate-baseline.md) |
| [`guides/`](guides/) | Beginner-safe setup and operating procedures | [Quality-gate operator guide](guides/23-quality-gate-operator-guide.md) |
| [`workflows/`](workflows/) | End-to-end process maps and responsibility handoffs | [Full-system quality-gate workflow](workflows/23-quality-gate-flow.md) |

The root [README](../README.md) remains the project entry point. The machine-readable [`DOCUMENTATION-MANIFEST.json`](../DOCUMENTATION-MANIFEST.json) is the canonical list used by documentation checks and tooling.

## Reading paths

- New to the codebase: implementation handbook → backend/frontend walkthroughs → interactive workflow diagram.
- Diagnosing a local target: local-target guide → live-target recovery → guided follow-ups.
- Reviewing a feature: architecture specification → data/API workflows → feature implementation handbook.
- Exercising the ecommerce target: [ecommerce browser smoke contract](implementation/19-ecommerce-browser-smoke.md) → ecommerce frontend reliability guide.
- Exercising the ecommerce target as a beginner: [ecommerce dogfooding guide](operations/15-ecommerce-dogfooding-guide.md) → [catalog synchronization](implementation/21-catalog-synchronization.md).
- Synchronizing the ecommerce TestOps catalog: [catalog synchronization](implementation/21-catalog-synchronization.md) → [local target guide](operations/12-local-target-testing-guide.md).
- Reproducing release gates: [release-gate verification](implementation/22-release-gate-verification.md) → [ecommerce dogfooding guide](operations/15-ecommerce-dogfooding-guide.md).
- Running the Milestone 10 quality gate: [operator guide](guides/23-quality-gate-operator-guide.md) → [baseline matrix](testing/23-quality-gate-baseline.md) → [defect ledger](testing/24-defect-ledger.md).
- Reviewing the Phase 1 shell and account menu: [implementation notes](implementation/63-phase1-testops-shell-account-menu.md) → [test evidence](testing/72-phase1-shell-account-menu.md) → [interactive workflow](implementation/17-ui-to-execution-workflow.html).
- Reviewing account-menu keyboard entry and Tab wrapping: [implementation notes](implementation/80-phase1-account-menu-keyboard.md) → [test evidence](testing/89-phase1-account-menu-keyboard.md) → [interactive workflow](implementation/17-ui-to-execution-workflow.html).
- Reviewing Phase 2 stale-bundle recovery: [implementation notes](implementation/64-phase2-stale-bundle-recovery.md) → [test evidence](testing/73-phase2-stale-bundle-recovery.md) → [interactive workflow](implementation/17-ui-to-execution-workflow.html).
- Reviewing Phase 3 account security and identity recovery: [implementation notes](implementation/65-phase3-account-security.md) → [test evidence](testing/74-phase3-account-security.md) → [interactive workflow](implementation/17-ui-to-execution-workflow.html).
- Reviewing Phase 4 project and definition lifecycle guards: [implementation notes](implementation/66-phase4-project-definition-guards.md) → [test evidence](testing/75-phase4-project-definition-guards.md) → [interactive workflow](implementation/17-ui-to-execution-workflow.html).
- Reviewing Phase 5 administration list recovery and pagination: [implementation notes](implementation/67-phase5-admin-user-pagination.md) → [test evidence](testing/76-phase5-admin-user-pagination.md) → [interactive workflow](implementation/17-ui-to-execution-workflow.html).
- Reviewing Phase 5 variable permissions and secret masking: [implementation notes](implementation/68-phase5-variable-permissions.md) → [test evidence](testing/77-phase5-variable-permissions.md) → [interactive workflow](implementation/17-ui-to-execution-workflow.html).
- Reviewing Phase 5 member-list recovery and read-only roles: [implementation notes](implementation/69-phase5-member-list-recovery.md) → [test evidence](testing/78-phase5-member-list-recovery.md) → [interactive workflow](implementation/17-ui-to-execution-workflow.html).
- Reviewing Phase 5 stale membership recovery and duplicate-refetch prevention: [implementation notes](implementation/70-phase5-membership-stale-recovery.md) → [test evidence](testing/79-phase5-membership-stale-recovery.md) → [interactive workflow](implementation/17-ui-to-execution-workflow.html).
- Reviewing Phase 5 administrator conflict guidance: [implementation notes](implementation/71-phase5-admin-conflict-guidance.md) → [test evidence](testing/80-phase5-admin-conflict-guidance.md) → [interactive workflow](implementation/17-ui-to-execution-workflow.html).
- Reviewing the CI administrator/password-recovery remediation: [implementation notes](implementation/72-ci-auth-recovery-remediation.md) → [test evidence](testing/81-ci-auth-recovery-remediation.md) → [interactive workflow](implementation/17-ui-to-execution-workflow.html).
- Reviewing TestOps definition-form browser autofill semantics: [implementation notes](implementation/78-phase7-testops-form-autocomplete.md) → [test evidence](testing/87-phase7-testops-form-autocomplete.md) → [interactive workflow](implementation/17-ui-to-execution-workflow.html).
- Reviewing stale lazy-chunk recovery and manual retry: [implementation notes](implementation/79-phase2-stale-chunk-manual-recovery.md) → [test evidence](testing/88-phase2-stale-chunk-manual-recovery.md) → [interactive workflow](implementation/17-ui-to-execution-workflow.html).
- Reviewing the true retained revision-A/revision-B deployment gate: [Phase 6 foundation](implementation/90-phase6-retained-deployment-foundation.md) → [source-level evidence and live boundary](testing/99-phase6-retained-deployment-foundation.md) → [quality-gate operator guide](guides/23-quality-gate-operator-guide.md).
- Reviewing nested project/suite/case tenant isolation: [implementation notes](implementation/73-phase5-nested-tenant-isolation.md) → [test evidence](testing/82-phase5-nested-tenant-isolation.md) → [interactive workflow](implementation/17-ui-to-execution-workflow.html).
- Reviewing active-session context and safe missing-IP fallbacks: [implementation notes](implementation/74-phase5-session-context.md) → [test evidence](testing/83-phase5-session-context.md) → [interactive workflow](implementation/17-ui-to-execution-workflow.html).
- Reviewing execution list/detail and artifact retry recovery: [implementation notes](implementation/75-phase6-execution-retry-recovery.md) → [test evidence](testing/84-phase6-execution-retry-recovery.md) → [interactive workflow](implementation/17-ui-to-execution-workflow.html).
- Reviewing accessible screenshot previews: [implementation notes](implementation/76-phase7-artifact-preview-dialog.md) → [test evidence](testing/85-phase7-artifact-preview-dialog.md) → [interactive workflow](implementation/17-ui-to-execution-workflow.html).
- Reviewing authentication field-error accessibility: [implementation notes](implementation/77-phase7-auth-field-error-accessibility.md) → [test evidence](testing/86-phase7-auth-field-error-accessibility.md) → [interactive workflow](implementation/17-ui-to-execution-workflow.html).
- Reviewing TestOps readiness contrast and Lighthouse evidence: [implementation notes](implementation/86-phase7-testops-readiness-contrast.md) → [test evidence](testing/95-phase7-testops-readiness-contrast.md) → [defect ledger](testing/24-defect-ledger.md).
- Understanding DRAFT saves and API errors: [problem responses and DRAFT validation](implementation/24-problem-contract-and-draft-validation.md).
- Reviewing tenant, lifecycle, variable, cancellation, and administrator boundaries: [Phase 2 security boundaries](implementation/25-phase-2-security-boundaries.md).
- Implementing history-preserving suite/case deletion: [definition trash lifecycle backend](implementation/26-definition-trash-backend.md).
- Operating suite/case Trash and restore in the web app: [definition Trash UI](implementation/27-definition-trash-ui.md).
- Understanding case metadata, field-error mapping, and Save & run recovery: [guided authoring recovery](implementation/28-guided-authoring-recovery.md).
- Resolving two-editor stale-version conflicts safely: [case optimistic-lock recovery](implementation/29-case-version-conflicts.md).
- Understanding verification resend timing, idempotency, and Mailpit evidence: [OTP resend cooldown](implementation/30-otp-resend-cooldown.md).
- Understanding tenant-scoped reporting, bounded failures, and full-window infrastructure totals: [dashboard aggregate queries](implementation/31-dashboard-aggregate-queries.md).
- Reproducing the isolated PostgreSQL dashboard regression gate on Windows: [dashboard PostgreSQL regression](testing/32-dashboard-postgres-regression.md).
- Reviewing project-manager, test-manager, tester, viewer, non-member, and administrator capabilities: [project permission regression matrix](testing/33-project-permission-matrix.md).
- Reproducing nested-resource isolation, final-manager conflicts, and execution cancellation ownership: [authorization HTTP regression](testing/34-authorization-http-regression.md).
- Verifying membership transitions, optimistic versions, final-manager retention, and archived-project blocking on PostgreSQL: [membership PostgreSQL regression](testing/35-membership-postgres-regression.md).
- Verifying successful member add/change/remove paths, duplicate protection, archived-project guards, and role denial: [membership positive lifecycle](testing/37-membership-positive-lifecycle.md).
- Operating version-aware member role changes and safe removal from the project UI: [member management UI](implementation/36-member-management-ui.md).
- Designing exact and repeated locators: [executable step language](implementation/10-executable-step-language.md) → [execution correctness](implementation/20-phase-6-execution-correctness.md).
- Verifying the negative target matrix: use the local-disabled Compose profile described in the [local target guide](operations/12-local-target-testing-guide.md).
- Reviewing delivery status: [Milestone 10A completion ledger](milestones/15-milestone-10a-testops-completion.md) → risks/roadmap/decisions. The Milestone 9 release-candidate document is retained as historical context.

Paths in this directory are intentionally relative to this index so links continue to work on GitHub and from a checked-out repository.
