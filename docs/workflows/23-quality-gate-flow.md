# Full-system quality-gate workflow

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

The focused positive lifecycle regression is documented in [membership positive lifecycle](../testing/37-membership-positive-lifecycle.md). Its MockMvc assertions prove `201` add, `200` role change, `204` removal, and structured duplicate conflicts; the remaining gap is browser proof for every project role.
