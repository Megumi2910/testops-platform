# Phase 5 worker and queue contract evidence

## Scope

This slice closes the deterministic backend portion of the execution reliability matrix. It protects the two controls that are easy to regress when the worker is disabled or the queue is saturated:

- a disabled worker must not recover, claim, or execute work;
- a full queue must reject a new request before it changes the queue guard, creates an execution, or writes snapshots.

The browser cancellation and retry journey remains in [`phase5-execution-matrix.spec.ts`](../../frontend/e2e/phase5-execution-matrix.spec.ts). These unit-level checks complement that browser evidence because worker-disabled and queue-capacity modes are deployment configuration, not user-editable state.

## Runtime contracts

`ExecutionWorker.poll()` first checks `testops.execution.worker-enabled`. When the value is `false`, it returns without calling stale-run recovery or the claim query. When enabled, one poll recovers stale runs, claims at most one queued execution, and invokes `ExecutionRunService` only when a claim exists.

`ExecutionService.queue*()` locks the singleton queue guard, compares `active_count` with `EXECUTION_QUEUE_CAPACITY`, and returns a structured `429 execution_queue_full` problem when the guard is full. The guard is not acquired and no execution, case result, step snapshot, or variable snapshot is persisted on that path. Idempotency is checked before capacity, so a replay still returns the original execution rather than being rejected as a new request.

## Tests

`ExecutionWorkerTest` covers:

1. disabled polling has no recovery, claim, or runner calls;
2. enabled polling recovers, claims, and runs one execution;
3. an enabled empty queue does not invoke the runner.

`ExecutionServiceTest.rejectsQueueWhenTheGuardIsAtCapacityBeforeWritingSnapshots` covers the queue-full contract and asserts status `429`, code `execution_queue_full`, no guard acquisition, and no persistence calls.

Focused command:

```powershell
cd D:\Projects\testops-platform\backend
.\mvnw.cmd -B '-Dtest=ExecutionWorkerTest,ExecutionServiceTest' test
```

Result on 2026-08-12: **13 tests passed**, including 3 worker tests and 10 execution-service tests.

## Remaining evidence

This slice does not claim the complete execution gate. The remaining `QG-B08` rows are secret-variable evidence suppression, target-escape/browser-crash handling, and the full screenshot/trace artifact matrix. Those require a rebuilt isolated browser stack and will be recorded separately with sanitized artifacts.
