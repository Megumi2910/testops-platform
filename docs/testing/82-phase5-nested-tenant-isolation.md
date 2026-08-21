# Phase 5 test evidence — nested project/suite/case isolation

## Scenario matrix

| ID | Actor | Substitution | Expected | Layer |
| --- | --- | --- | --- | --- |
| NTI-01 | Project member | Foreign suite under local project | `404 suite_not_found`; no case query | Definition service |
| NTI-02 | Project member | Foreign case under local suite | `404 case_not_found`; no step read | Definition service |
| NTI-03 | Project manager | Foreign case update | `404 case_not_found`; no save/step replacement | Definition service |
| NTI-04 | Tester | Foreign case queue | `404 case_not_found`; no queue guard/execution row | Execution service |
| NTI-05 | Project member | Foreign case deep link in browser | `404` response and recoverable case-load alert | Playwright |
| NTI-06 | Same actor | Legitimate case after rejection | Case renders normally | Playwright |

## Reproduction commands

From `backend/` (Linux/CI or a machine with a functioning Maven wrapper):

```powershell
./mvnw -B -DskipITs -Dtest='com.megumi.testops.project.service.DefinitionSecurityTest,com.megumi.testops.ExecutionServiceTest' test
```

From `frontend/` against the isolated QA stack:

```powershell
npx playwright test e2e/phase5-role-matrix.spec.ts --grep "substitute a case identifier"
```

The browser test is intentionally part of the existing role matrix. It uses
Mailpit-backed registration and the guided case builder, and it does not reset
the normal development database.

## Evidence interpretation

The HTTP status is more important than the wording of the client alert. A
`404` confirms that the controller/service contract is non-disclosing. The
absence of a queue guard or repository write in the service tests verifies the
failure occurs before side effects. The final legitimate-case assertion is a
cache/session regression check: a rejected deep link must not leave the user
stuck in an error state for resources they do own.

## Current result

The frontend lint, typecheck, 20-file/62-test unit suite, production build,
documentation manifest parse, link check, and Playwright test discovery all
pass. CI run `31859393419` passed all six required jobs, including backend
Maven verification, Compose health, local-disabled target coverage, browser
crash coverage, and the full enabled Playwright suite. The focused backend
command was historically blocked on the Windows machine because `mvnw.cmd`
failed in its PowerShell bootstrap before invoking Maven. The wrapper cache
fix and Testcontainers Docker API compatibility configuration now make the
full `mvnw.cmd -B -ntp verify` gate pass locally; CI remains the authoritative
regression result for the original slice.
