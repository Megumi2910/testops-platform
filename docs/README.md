# TestOps documentation

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
