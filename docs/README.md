# TestOps documentation

This directory is organized by the question a maintainer is trying to answer:

| Folder | Use it for | Start with |
| --- | --- | --- |
| [`architecture/`](architecture/) | Product boundaries, domain relationships, and the interactive system map | [Technical specification](architecture/01-technical-specification.md) |
| [`implementation/`](implementation/) | Source walkthroughs, executable steps, and UI-to-worker behavior | [Implementation handbook](implementation/00-project-implementation-handbook.md) |
| [`operations/`](operations/) | Runtime, database, target connectivity, and recovery procedures | [Local target testing guide](operations/12-local-target-testing-guide.md) |
| [`security/`](security/) | Authentication, authorization, secrets, and abuse controls | [Authentication and security](security/02-authentication-and-security.md) |
| [`milestones/`](milestones/) | Milestone scope, delivery decisions, and release-candidate evidence | [Milestone 9 release candidate](milestones/14-milestone-9-release-candidate.md) |
| [`planning/`](planning/) | Risks, roadmap, alternatives, and change-safety decisions | [Risks, roadmap, and decisions](planning/05-risks-roadmap-and-decisions.md) |

The root [README](../README.md) remains the project entry point. The machine-readable [`DOCUMENTATION-MANIFEST.json`](../DOCUMENTATION-MANIFEST.json) is the canonical list used by documentation checks and tooling.

## Reading paths

- New to the codebase: implementation handbook → backend/frontend walkthroughs → interactive workflow diagram.
- Diagnosing a local target: local-target guide → live-target recovery → guided follow-ups.
- Reviewing a feature: architecture specification → data/API workflows → feature implementation handbook.
- Exercising the ecommerce target: [ecommerce browser smoke contract](implementation/19-ecommerce-browser-smoke.md) → ecommerce frontend reliability guide.
- Exercising the ecommerce target as a beginner: [ecommerce dogfooding guide](operations/15-ecommerce-dogfooding-guide.md) → [catalog synchronization](implementation/21-catalog-synchronization.md).
- Synchronizing the ecommerce TestOps catalog: [catalog synchronization](implementation/21-catalog-synchronization.md) → [local target guide](operations/12-local-target-testing-guide.md).
- Reproducing release gates: [release-gate verification](implementation/22-release-gate-verification.md) → [ecommerce dogfooding guide](operations/15-ecommerce-dogfooding-guide.md).
- Designing exact and repeated locators: [executable step language](implementation/10-executable-step-language.md) → [execution correctness](implementation/20-phase-6-execution-correctness.md).
- Verifying the negative target matrix: use the local-disabled Compose profile described in the [local target guide](operations/12-local-target-testing-guide.md).
- Reviewing delivery status: milestone 9 release candidate → risks/roadmap/decisions.

Paths in this directory are intentionally relative to this index so links continue to work on GitHub and from a checked-out repository.
