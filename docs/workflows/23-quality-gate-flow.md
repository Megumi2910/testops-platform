# Full-system quality-gate workflow

## Current isolated candidate flow

```mermaid
flowchart TD
    Head["Committed candidate revision"] --> Dirty{"Candidate source paths dirty?"}
    Dirty -->|Yes| Worktree["Validated detached worktree at exact HEAD"]
    Dirty -->|No| Static["Frontend, backend, Compose, docs, and secret contracts"]
    Worktree --> Static
    Static --> Build["Build with full VCS_REF"]
    Build --> Scoped["Start explicit non-default Compose project"]
    Scoped --> Health{"OCI revisions and health match?"}
    Health -->|No| Diagnose["Bounded project ps/log diagnostics"]
    Health -->|Yes| Browser{"Browser mode enabled?"}
    Browser -->|No| Teardown["Project-scoped teardown"]
    Browser -->|Yes| E2E["Playwright matrix and post-browser secret audit"]
    E2E --> Teardown
    Diagnose --> Teardown
```

The aggregate entry point is `scripts/verify.ps1 -ProjectName <isolated>`.
`-NoBrowser` removes published ports but retains image, startup, health, and
revision proof. Cleanup always receives the same explicit project name and
Compose file list; the developer's default project is outside the gate's
mutation boundary.

## Historical full-system workflow

```mermaid
flowchart TD
    Source["Checked-out TestOps and ecommerce commits"] --> Build["Build images with OCI revision labels"]
    Build --> Verify["Verify labels and container health"]
    Secret["Ignored QA password file"] --> Fixtures["local-qa fixture reconciliation"]
    Fixtures --> Browser["Chrome DevTools exploratory matrix"]
    Verify --> Browser
    Browser --> Ledger["Sanitized defect ledger"]
    Browser --> Regression["Playwright repeatable proof"]
    Ledger --> Freeze{"All rows executed or blocked?"}
    Freeze -->|No| Browser
    Freeze -->|Yes| Repair["P1 security and error-contract slices"]
    Repair --> Automation["Backend, frontend, PostgreSQL, Playwright gates"]
    Automation --> Recheck["Repeat Chrome matrix"]
    Recheck --> Release{"Zero P0/P1 and release metrics pass?"}
```

The important boundary is the first decision: exploratory evidence is completed and triaged before product fixes. Each later repair gets a focused regression test, updated documentation, a scoped commit, a push, and green CI before the next slice.

## Guided authoring repair path

```mermaid
flowchart LR
    Details["Details: name, priority, retries, tags, isolation"] --> Validate{"Name valid?"}
    Validate -->|No| Focus["Announce error and focus Name"]
    Validate -->|Yes| Steps["Steps: backend-owned action fields"]
    Steps --> Review["Review: static execution summary"]
    Review --> Save["Create DRAFT or READY"]
    Save --> Queue{"Save & run queue succeeds?"}
    Queue -->|Yes| Execution["Open execution"]
    Queue -->|No| Retry["Keep saved READY case; retry queue only"]
```

Server paths such as `steps[2].locatorRole` are translated to the stable client ID of the corresponding editable row. Reordering therefore cannot make a backend violation appear on a different step.

## Stale-version recovery

```mermaid
flowchart LR
    Save["Save case with loaded version"] --> Conflict{"409 stale_version?"}
    Conflict -->|No| Done["Update query cache"]
    Conflict -->|Yes| Latest["Fetch latest case without resetting form"]
    Latest --> Compare["Focus local vs server comparison"]
    Compare --> Reload["Reload server version"]
    Compare --> Retry["Retry local changes with latest version"]
    Reload --> Done
    Retry --> Save
```

The comparison intentionally summarizes step actions instead of repeating locator and input values. The user's local editor remains intact until one recovery button is chosen.

## Phase 9 browser-quality flow

```mermaid
flowchart LR
    Candidate[Committed candidate revision] --> Matrix[Playwright 18 case-viewports]
    Matrix --> Views[1440x900 / 768x1024 / 320x800]
    Views --> A11y[Keyboard, focus, forms, dialogs, overflow, a11y helper]
    Matrix --> Perf[Chromium route PerformanceObserver records]
    DevTools[Chrome DevTools Lighthouse + trace] --> Perf
    Perf --> Thresholds[Accessibility >=95, LCP <=2500ms, CLS <=0.1]
    A11y --> Manifest[Sanitized P9 browser manifest]
    Thresholds --> Manifest
    Manifest --> Ledgers[Defect + milestone ledger validators]
```

The DevTools capture is a public readiness anchor at desktop and narrow
mobile; authenticated routes use the sanitized Chromium matrix. This keeps
the evidence revision-matched without serializing cookies, tokens, or raw
browser payloads.

## Verification resend path

```mermaid
flowchart LR
    UI["Verify page or unverified banner"] --> API["POST resend"]
    API --> Lock["Lock user row"]
    Lock --> Decision{"Eligible now?"}
    Decision -->|No| Same["202 + remaining cooldown"]
    Decision -->|Yes| Send["Invalidate old challenge; send one code"]
    Send --> Same
    Same --> Countdown["Disable and count down from server window"]
```

Unknown public addresses follow the same generic `202` response shape without creating a challenge. The QA overlay routes the one eligible message to Mailpit; simultaneous cooldown requests do not increase its message count.

## Dashboard reporting path

```mermaid
flowchart LR
    Dashboard[DashboardPage] --> API[DashboardController]
    API --> Identity[ProjectAccessService]
    Identity --> Filter[User + global role + optional filters]
    Filter --> SQL[DashboardReadRepository]
    SQL --> Membership{Global admin?}
    Membership -->|No| Exists[EXISTS project_members]
    Membership -->|Yes| Scope[All projects]
    Exists --> Aggregate[PostgreSQL aggregation]
    Scope --> Aggregate
    Aggregate --> Summary[Totals + UTC trends]
    Aggregate --> Recent[Newest 50 failures]
    Aggregate --> Categories[All ERROR categories in window]
```

Recent failure cards and infrastructure categories deliberately have different bounds. Cards are a 50-row diagnostic preview; categories are a complete aggregate for the requested half-open UTC window. Both are tenant-scoped before PostgreSQL returns data.

The repeatable database proof is `scripts/verify-dashboard-postgres.ps1`. It creates a disposable PostgreSQL container on a Docker-selected loopback port, passes its connection through `TEST_DATABASE_*`, runs the complete `ApplicationContextIT`, and stops only that generated container. CI continues to use Testcontainers automatically when no external URL is supplied.

## Project permission decision

```mermaid
flowchart LR
    Response[ProjectService response] --> Permission[Permission strings]
    Permission --> UI[React shows allowed controls]
    Request[API mutation or queue] --> Guard[ProjectAccessService role guard]
    Guard --> Admin{Platform ADMIN?}
    Admin -->|Yes| Allow[Allow managed operation]
    Admin -->|No| Member{Project membership?}
    Member -->|No| DenyAccess[project_access_denied]
    Member -->|Yes| Role{Role in operation set?}
    Role -->|No| DenyRole[project_role_required]
    Role -->|Yes| Allow
```

The response and guard are tested separately. A visible frontend control never substitutes for the backend decision, and a backend denial should not be hidden behind a generic client error.

## Scoped identifier and cancellation path

```mermaid
flowchart LR
    Request["Nested resource request"] --> Project["Resolve project + caller"]
    Project --> Scoped["Repository lookup includes parent ID"]
    Scoped -->|Missing or foreign| Hidden["404 resource_not_found"]
    Scoped -->|Execution found| Owner{"Requester?"}
    Owner -->|Yes| Cancel["Accept cancellation"]
    Owner -->|No| Manager{"Current project manager?"}
    Manager -->|Yes| Cancel
    Manager -->|No| Deny["403 cancel_denied"]
```

Membership demotion/removal uses the same project-scoped lookup. A write targeting the final project manager stops with `409 final_project_manager` before mutation or audit persistence.

The disposable PostgreSQL gate follows a successful two-manager demotion with final-manager, stale-version, and archived-project attempts. Every rejected write is re-read from PostgreSQL to prove the membership row and manager role remain intact.

## Member-management UI path

```mermaid
flowchart LR
    Page["MembersPage + project permissions"] --> Manage{"MEMBER_MANAGE and ACTIVE?"}
    Manage -->|No| Read["Read-only role badges"]
    Manage -->|Yes| Controls["Role selector + Save + Remove"]
    Controls --> Version["Send current project.version"]
    Version --> Success{"Mutation succeeds?"}
    Success -->|Yes| Refresh["Invalidate members + project"]
    Success -->|No final manager| Conflict["Explain manager handoff"]
    Success -->|No stale version| Reload["Require refreshed project state"]
```

## Positive membership lifecycle path

```mermaid
flowchart LR
    PM[Project manager] --> Add[POST members]
    Add --> Normalize[Normalize email and role]
    Normalize --> Duplicate{Already a member?}
    Duplicate -->|Yes| Conflict[409 member_exists]
    Duplicate -->|No| Save[Persist membership + assign actor]
    Save --> AuditAdd[Audit MEMBER_ADDED]
    PM --> Change[PUT member role]
    PM --> Remove[DELETE member]
    Change --> Active{Project active + version current?}
    Remove --> Active
    Active -->|No| Guard[409 project_archived or stale_version]
    Active -->|Yes| Mutate[Persist role/delete]
    Mutate --> Audit[Audit MEMBER_ROLE_CHANGED or MEMBER_REMOVED]
```

The focused positive lifecycle regression is documented in [membership positive lifecycle](../testing/37-membership-positive-lifecycle.md). Its MockMvc assertions prove `201` add, `200` role change, `204` removal, and structured duplicate conflicts. Chrome DevTools then verifies the same boundary for project manager, test manager, tester, viewer, non-member, and administrator journeys.

## Phase 5 role and tenant browser path

```mermaid
flowchart LR
    Register[Register and verify QA accounts] --> Grant[Project manager grants role]
    Grant --> Matrix{Effective permissions}
    Matrix --> TM[TEST_MANAGER: create + run]
    Matrix --> Tester[TESTER: run only]
    Matrix --> Viewer[VIEWER: read only]
    Matrix --> NonMember[Non-member: project load denied]
    Primary[Primary project] --> Foreign[Foreign suite identifier]
    Foreign --> Scoped[Parent-scoped API lookup]
    Scoped --> Hidden[404 without resource disclosure]
    Hidden --> Legitimate[Legitimate suite remains readable]
```

The repeatable browser proof for this path is [`phase5-role-tenant-browser-evidence.md`](../testing/40-phase5-role-tenant-browser-evidence.md) and [`phase5-role-matrix.spec.ts`](../../frontend/e2e/phase5-role-matrix.spec.ts). Each account keeps its authenticated SPA context while the test uses semantic navigation; this avoids coupling the test to the frontend's in-memory access-token implementation. A foreign suite ID is asserted at the network boundary as `404`, then the UI's non-disclosing error state and the legitimate suite are both checked.

## Definition Trash and restore path

```mermaid
flowchart LR
    Author[Guided case builder] --> Draft[Save DRAFT]
    Draft --> Archive[Move to trash]
    Archive --> Confirm{Accessible confirmation?}
    Confirm -->|Cancel| Draft
    Confirm -->|Confirm| History[Archive metadata + preserve steps/history]
    History --> Trash[Project Trash: archived suite/case]
    Trash --> ReadOnly[Direct link is read-only; run/edit/create blocked]
    Trash --> Restore[Restore with optional name]
    Restore --> Conflict{Active name conflict?}
    Conflict -->|Yes| Rename[Return 409; choose a new name]
    Conflict -->|No| Active[Restore active definition]
    Active --> CaseState{Definition type}
    CaseState -->|Case| DraftAgain[Return case as DRAFT]
    CaseState -->|Suite| Ready[Restore suite access; preserve child states]
```

The browser proof for this path is captured in [definition lifecycle browser evidence](../testing/38-definition-lifecycle-browser-evidence.md). A newly authored QA-owned draft was saved, archived with a focused modal, observed in the project Trash list, restored through the name-aware dialog, and found again under the active suite as `DRAFT`. The lifecycle requests returned `201` for creation and `200` for archive/list/restore, with no console messages. The repeatable E2E equivalent is `frontend/e2e/definition-lifecycle.spec.ts`, which runs against the isolated target-site profile. Archived definitions retain execution history but cannot be mutated or queued.

Project archive and restore follow the same safe mutation boundary. The UI sends the loaded project version in `If-Match`; the backend rejects missing or stale versions and repeated state transitions with structured problems. See [project lifecycle version evidence](../testing/39-project-lifecycle-version-evidence.md).

## Phase 5 authentication, return, and session path

```mermaid
flowchart LR
    DeepLink[Anonymous protected deep link] --> Login[/login?returnTo=...]
    Login --> Credentials{Password accepted?}
    Credentials -->|No| Invalid[Structured login error]
    Credentials -->|Yes| Verified{Email verified?}
    Verified -->|No| Verify[/verify-email?email=...&returnTo=...]
    Verify --> Code{OTP valid and active?}
    Code -->|No| CodeError[Inline invalid/expired error]
    Code -->|Yes| Destination[Return to sanitized destination]
    Destination --> Account[Account: list active sessions]
    Account --> Revoke[Revoke one family -> 204 -> refetch]
    Account --> RevokeAll[Revoke all -> invalidate tokens -> login]
```

The return value is always a same-origin relative path. `returnTo.ts` rejects absolute, protocol-relative, and backslash-containing values before React Router navigates. `SessionController` lists only active refresh-token families for the authenticated subject, checks ownership before individual revocation, and returns `204` for empty successful writes so the shared `apiFetch` helper can complete and React Query can refetch. The repeatable proof is [Phase 5 auth/session browser evidence](../testing/41-phase5-auth-session-browser-evidence.md) and `frontend/e2e/phase5-auth-session-matrix.spec.ts`. Expiry, recovery, Google, administrator, execution, and accessibility/performance paths remain separate gate rows.
