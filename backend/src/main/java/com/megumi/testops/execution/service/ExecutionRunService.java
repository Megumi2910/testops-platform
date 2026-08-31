package com.megumi.testops.execution.service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Collection;
import java.util.Comparator;
import java.util.UUID;
import java.util.Set;
import org.springframework.stereotype.Service;
import com.megumi.testops.execution.domain.ExecutionEntity;
import com.megumi.testops.execution.domain.ExecutionStatus;
import com.megumi.testops.execution.domain.ExecutionVariableSnapshotEntity;
import com.megumi.testops.execution.repository.ExecutionStepSnapshotRepository;
import com.megumi.testops.execution.domain.TestCaseResultEntity;
import com.megumi.testops.execution.repository.ExecutionRepository;
import com.megumi.testops.execution.repository.TestCaseResultRepository;
import com.megumi.testops.execution.repository.TestStepResultRepository;
import com.megumi.testops.execution.repository.ExecutionQueueGuardRepository;
import com.megumi.testops.execution.repository.ExecutionVariableSnapshotRepository;
import com.megumi.testops.execution.runner.ArtifactWriter;
import com.megumi.testops.execution.runner.EvidenceFileCleaner;
import com.megumi.testops.execution.runner.PlaywrightCaseRunner;
import com.megumi.testops.project.service.ProjectVariableCrypto;
import com.megumi.testops.execution.runner.PlaywrightCaseRunner.StepDefinition;

@Service
public class ExecutionRunService {
    static final String SECRET_EVIDENCE_SUPPRESSION_REASON = "SECRET_VARIABLE_USED";
    private static final Set<ExecutionStatus> TERMINAL_CASE_STATUSES = Set.of(
            ExecutionStatus.PASSED, ExecutionStatus.FAILED, ExecutionStatus.ERROR, ExecutionStatus.CANCELLED);
    private final ExecutionRepository executions;
    private final TestCaseResultRepository results;
    private final PlaywrightCaseRunner runner;
    private final ArtifactWriter artifacts;
    private final TestStepResultRepository stepResults;
    private final ExecutionQueueGuardRepository queueGuard;
    private final ExecutionVariableSnapshotRepository variableSnapshots;
    private final ProjectVariableCrypto variableCrypto;
    private final ExecutionStepSnapshotRepository stepSnapshots;
    private final EvidenceFileCleaner evidenceFiles;
    private final ExecutionTransactionExecutor transactions;
    public ExecutionRunService(ExecutionRepository executions, TestCaseResultRepository results, PlaywrightCaseRunner runner, ArtifactWriter artifacts, TestStepResultRepository stepResults, ExecutionQueueGuardRepository queueGuard, ExecutionVariableSnapshotRepository variableSnapshots, ProjectVariableCrypto variableCrypto, ExecutionStepSnapshotRepository stepSnapshots, EvidenceFileCleaner evidenceFiles, ExecutionTransactionExecutor transactions) { this.executions = executions; this.results = results; this.runner = runner; this.artifacts = artifacts; this.stepResults = stepResults; this.queueGuard = queueGuard; this.variableSnapshots = variableSnapshots; this.variableCrypto = variableCrypto; this.stepSnapshots = stepSnapshots; this.evidenceFiles = evidenceFiles; this.transactions = transactions; }
    public void run(UUID executionId) {
        var resultIds = transactions.required(() -> results
                .findByExecutionIdOrderByTestCase_NameAsc(executionId).stream()
                .map(TestCaseResultEntity::getId)
                .toList());
        for (UUID resultId : resultIds) {
            boolean skip = transactions.required(() -> skipOrCancelCase(executionId, resultId));
            if (!skip) {
                try {
                    transactions.required(() -> runCaseById(executionId, resultId));
                } catch (Exception exception) {
                    // The failed case transaction has already rolled back. Use
                    // freshly loaded entities in a new transaction so a file,
                    // repository, or cleanup failure cannot double-finalize a
                    // mutated in-memory execution.
                    transactions.required(() -> recordInfrastructureFailure(executionId, resultId));
                }
            }
            transactions.required(() -> recordHeartbeat(executionId));
        }
        transactions.required(() -> finishExecution(executionId));
    }

    private boolean skipOrCancelCase(UUID executionId, UUID resultId) {
        ExecutionEntity execution = executions.findById(executionId).orElse(null);
        TestCaseResultEntity result = results.findById(resultId).orElse(null);
        if (execution == null || result == null || TERMINAL_CASE_STATUSES.contains(result.getStatus())) return true;
        if (!execution.cancelRequested()) return false;
        finishCase(execution, result, ExecutionStatus.CANCELLED, "Cancellation requested");
        return true;
    }

    private void runCaseById(UUID executionId, UUID resultId) {
        ExecutionEntity execution = executions.findById(executionId)
                .orElseThrow(() -> new IllegalStateException("Execution disappeared while running"));
        TestCaseResultEntity result = results.findById(resultId)
                .orElseThrow(() -> new IllegalStateException("Case result disappeared while running"));
        if (!TERMINAL_CASE_STATUSES.contains(result.getStatus())) runCase(execution, result);
    }

    private void recordInfrastructureFailure(UUID executionId, UUID resultId) {
        ExecutionEntity execution = executions.findById(executionId).orElse(null);
        TestCaseResultEntity result = results.findById(resultId).orElse(null);
        if (execution == null || result == null || TERMINAL_CASE_STATUSES.contains(result.getStatus())) return;
        result.setFailure(null, "UNKNOWN");
        execution.setInfrastructureErrorCategory("UNKNOWN");
        finishCase(execution, result, ExecutionStatus.ERROR, "Execution infrastructure error");
    }

    private void recordHeartbeat(UUID executionId) {
        ExecutionEntity execution = executions.findById(executionId).orElse(null);
        if (execution == null) return;
        execution.heartbeat(Instant.now());
        executions.save(execution);
    }

    void runCase(ExecutionEntity execution, TestCaseResultEntity result) {
        var snapshots = variableSnapshots.findByExecutionIdOrderByKeyAsc(execution.getId());
        java.util.Map<String, String> resolvedVariables = new java.util.LinkedHashMap<>();
        java.util.Set<String> secretKeys = new java.util.HashSet<>();
        for (ExecutionVariableSnapshotEntity snapshot : snapshots) {
            String key = snapshot.getKey().toUpperCase(java.util.Locale.ROOT);
            if (snapshot.isSecret()) {
                secretKeys.add(key);
                resolvedVariables.put(key, variableCrypto.decrypt(execution.getProject().getId().toString(), snapshot.getKey(), snapshot.getCiphertext(), snapshot.getNonce(), snapshot.getKeyVersion()));
            } else {
                resolvedVariables.put(key, snapshot.getValue());
            }
        }
        // Built-ins are derived from the immutable execution record, never from
        // mutable project variables. They are non-secret and therefore do not
        // suppress screenshots or traces.
        resolvedVariables.put("RUN_ID", execution.getId().toString());
        resolvedVariables.put("RUN_TIMESTAMP", execution.getCreatedAt().toString());
        resolvedVariables.put("CASE_RESULT_ID", result.getId().toString());
        Set<String> secretValues = secretKeys.stream()
                .map(resolvedVariables::get)
                .filter(value -> value != null && !value.isEmpty())
                .collect(java.util.stream.Collectors.toUnmodifiableSet());
        PlaywrightCaseRunner.Result outcome = null;
        boolean suppressEvidence = result.isEvidenceSuppressed();
        int maxAttempts = Math.max(1, result.getRetryCountSnapshot() + 1);
        var definitions = stepSnapshots.findByCaseResultIdOrderByPositionAsc(result.getId()).stream().map(StepDefinition::from).toList();
        for (int attempt = 0; attempt < maxAttempts; attempt++) {
            result.start(Instant.now());
            results.save(result);
            outcome = runner.run(definitions, execution.getTargetOriginSnapshot(), execution.getId().toString(),
                    result.getId().toString(), resolvedVariables, secretKeys);
            if (outcome.secretBearing()) {
                suppressEvidence = true;
                result.suppressEvidence(SECRET_EVIDENCE_SUPPRESSION_REASON);
                results.save(result);
            }
            if (!outcome.infrastructureError() || attempt + 1 >= maxAttempts) break;
            evidenceFiles.delete(outcome.trace());
        }
        ExecutionStatus status = outcome.passed() ? ExecutionStatus.PASSED
                : outcome.infrastructureError() ? ExecutionStatus.ERROR : ExecutionStatus.FAILED;
        String safeOutcomeError = redactSecretValues(outcome.errorMessage(), secretValues);
        RuntimeException persistenceFailure = null;
        try {
            var outcomes = outcome.stepOutcomes();
            if (outcomes.isEmpty()) {
                for (var definition : definitions) {
                    stepResults.save(new com.megumi.testops.execution.domain.TestStepResultEntity(result,
                            definition.position(), definition.action(), "ERROR", null, safeOutcomeError));
                }
            } else {
                for (var step : outcomes) {
                    stepResults.save(new com.megumi.testops.execution.domain.TestStepResultEntity(result,
                            step.position(), step.action(), step.status(), step.durationMs(),
                            redactSecretValues(step.errorMessage(), secretValues)));
                }
            }
            Integer failedStep = outcome.passed() ? null : outcome.failedStepPosition();
            result.setFailure(failedStep, outcome.infrastructureCategory());
            if (outcome.infrastructureError()) {
                execution.setInfrastructureErrorCategory(outcome.infrastructureCategory());
            }
            // Evidence must be safely persisted (or explicitly suppressed)
            // before terminal counters are recorded. A persistence failure is
            // converted by run() into one ERROR result, never a second finish.
            persistEvidence(execution, result, outcome, suppressEvidence);
        } catch (RuntimeException ex) {
            persistenceFailure = ex;
            throw ex;
        } finally {
            // Also covers persistence failures before ArtifactWriter receives
            // the trace, so raw browser evidence never survives in temp.
            try {
                evidenceFiles.delete(outcome.trace());
            } catch (RuntimeException cleanupFailure) {
                if (persistenceFailure != null) persistenceFailure.addSuppressed(cleanupFailure);
                else throw cleanupFailure;
            }
        }
        result.finish(status, Instant.now(), safeOutcomeError);
        results.save(result);
        execution.record(status);
        executions.save(execution);
    }

    private void persistEvidence(ExecutionEntity execution, TestCaseResultEntity result,
            PlaywrightCaseRunner.Result outcome, boolean suppressEvidence) {
        if (suppressEvidence) {
            return;
        }
        if (outcome.screenshot() != null) {
            artifacts.writeScreenshot(execution, result, outcome.failedStepPosition(), outcome.screenshot());
        }
        for (var screenshot : outcome.screenshots()) {
            artifacts.writeScreenshot(execution, result, screenshot.stepPosition(), screenshot.bytes());
        }
        Path trace = outcome.trace();
        if (trace == null || !Files.exists(trace)) return;
        artifacts.writeTrace(execution, result, trace);
    }

    static String redactSecretValues(String message, Collection<String> secretValues) {
        if (message == null || message.isBlank()) return message;
        String redacted = message;
        for (String secret : secretValues.stream().sorted(Comparator.comparingInt(String::length).reversed()).toList()) {
            redacted = redacted.replace(secret, "[REDACTED]");
        }
        return redacted.length() > 500 ? redacted.substring(0, 497) + "..." : redacted;
    }
    void finishCase(ExecutionEntity execution, TestCaseResultEntity result, ExecutionStatus status, String message) { result.finish(status, Instant.now(), message); results.save(result); execution.record(status); executions.save(execution); }
    void finishExecution(UUID id) { ExecutionEntity execution = executions.findById(id).orElse(null); if (execution == null || execution.getCompletedCases() < execution.getTotalCases() || !Set.of(ExecutionStatus.QUEUED, ExecutionStatus.RUNNING).contains(execution.getStatus())) return; ExecutionStatus status = execution.getCancelledCases() > 0 ? ExecutionStatus.CANCELLED : execution.getErrorCases() > 0 ? ExecutionStatus.ERROR : execution.getFailedCases() > 0 ? ExecutionStatus.FAILED : ExecutionStatus.PASSED; execution.finish(status, Instant.now(), execution.getErrorMessage()); executions.save(execution); queueGuard.lockGuard().ifPresent(guard -> { guard.release(); queueGuard.save(guard); }); }
}
