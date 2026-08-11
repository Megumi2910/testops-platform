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
