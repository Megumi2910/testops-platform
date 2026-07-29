package com.megumi.testops.execution.service;

import java.time.Instant;
import java.util.UUID;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.megumi.testops.execution.domain.ExecutionEntity;
import com.megumi.testops.execution.domain.ExecutionStatus;
import com.megumi.testops.execution.domain.TestCaseResultEntity;
import com.megumi.testops.execution.repository.ExecutionRepository;
import com.megumi.testops.execution.repository.TestCaseResultRepository;
import com.megumi.testops.execution.repository.TestStepResultRepository;
import com.megumi.testops.execution.repository.ExecutionQueueGuardRepository;
import com.megumi.testops.execution.runner.ArtifactWriter;
import com.megumi.testops.execution.runner.PlaywrightCaseRunner;
import com.megumi.testops.project.repository.ProjectVariableRepository;
import com.megumi.testops.project.repository.TestStepRepository;

@Service
public class ExecutionRunService {
    private final ExecutionRepository executions;
    private final TestCaseResultRepository results;
    private final PlaywrightCaseRunner runner;
    private final ArtifactWriter artifacts;
    private final ProjectVariableRepository variables;
    private final TestStepRepository stepDefinitions;
    private final TestStepResultRepository stepResults;
    private final ExecutionQueueGuardRepository queueGuard;
    public ExecutionRunService(ExecutionRepository executions, TestCaseResultRepository results, PlaywrightCaseRunner runner, ArtifactWriter artifacts, ProjectVariableRepository variables, TestStepRepository stepDefinitions, TestStepResultRepository stepResults, ExecutionQueueGuardRepository queueGuard) { this.executions = executions; this.results = results; this.runner = runner; this.artifacts = artifacts; this.variables = variables; this.stepDefinitions = stepDefinitions; this.stepResults = stepResults; this.queueGuard = queueGuard; }
    @Transactional
    public void run(UUID executionId) {
        ExecutionEntity execution = executions.findById(executionId).orElse(null); if (execution == null) return;
        for (TestCaseResultEntity result : results.findByExecutionIdOrderByTestCase_NameAsc(executionId)) {
            execution = executions.findById(executionId).orElse(null); if (execution == null) return;
            if (execution.cancelRequested()) { finishCase(execution, result, ExecutionStatus.CANCELLED, "Cancellation requested"); continue; }
            try { runCase(execution, result); } catch (Exception exception) { result.setFailure(null, "UNKNOWN"); execution.setInfrastructureErrorCategory("UNKNOWN"); finishCase(execution, result, ExecutionStatus.ERROR, "Execution infrastructure error"); }
            // runCase is transactional and updates the versioned execution row.
            // Reload it before recording the worker heartbeat so the outer
            // worker loop never merges a stale entity after a case completes.
            execution = executions.findById(executionId).orElse(null);
            if (execution == null) return;
            execution.heartbeat(Instant.now()); executions.save(execution);
        }
        finishExecution(executionId);
    }
    @Transactional
    void runCase(ExecutionEntity execution, TestCaseResultEntity result) {
        java.util.Map<String, String> safeVariables = variables.findByProjectIdOrderByKeyAsc(execution.getProject().getId()).stream().filter(v -> !v.isSecret()).collect(java.util.stream.Collectors.toUnmodifiableMap(v -> v.getKey().toUpperCase(java.util.Locale.ROOT), v -> v.getPlaintextValue()));
        PlaywrightCaseRunner.Result outcome = null;
        int maxAttempts = Math.max(1, result.getTestCase().getRetryCount() + 1);
        for (int attempt = 0; attempt < maxAttempts; attempt++) { result.start(Instant.now()); results.save(result); outcome = runner.run(result.getTestCase(), execution.getProject().getTargetOrigin(), execution.getId().toString(), result.getId().toString(), safeVariables); if (!outcome.infrastructureError() || attempt + 1 >= maxAttempts) break; }
        ExecutionStatus status = outcome.passed() ? ExecutionStatus.PASSED : outcome.infrastructureError() ? ExecutionStatus.ERROR : ExecutionStatus.FAILED;
        var outcomes = outcome.stepOutcomes();
        if (outcomes.isEmpty()) {
            var definitions = stepDefinitions.findByTestCaseIdOrderByPositionAsc(result.getTestCase().getId());
            for (var definition : definitions) stepResults.save(new com.megumi.testops.execution.domain.TestStepResultEntity(result, definition.getPosition(), definition.getAction(), "ERROR", null, outcome.errorMessage()));
        } else {
            for (var step : outcomes) stepResults.save(new com.megumi.testops.execution.domain.TestStepResultEntity(result, step.position(), step.action(), step.status(), step.durationMs(), step.errorMessage()));
        }
        Integer failedStep = outcome.passed() ? null : outcome.failedStepPosition();
        result.setFailure(failedStep, outcome.infrastructureError() ? outcome.infrastructureCategory() : null);
        if (outcome.infrastructureError()) execution.setInfrastructureErrorCategory(outcome.infrastructureCategory());
        result.finish(status, Instant.now(), outcome.errorMessage()); results.save(result); execution.record(status); executions.save(execution);
        if (outcome.screenshot() != null) artifacts.writeScreenshot(execution, result, outcome.failedStepPosition(), outcome.screenshot());
        for (var screenshot : outcome.screenshots()) artifacts.writeScreenshot(execution, result, screenshot.stepPosition(), screenshot.bytes());
        if (outcome.trace() != null && java.nio.file.Files.exists(outcome.trace())) artifacts.writeTrace(execution, result, outcome.trace());
    }
    @Transactional
    void finishCase(ExecutionEntity execution, TestCaseResultEntity result, ExecutionStatus status, String message) { result.finish(status, Instant.now(), message); results.save(result); execution.record(status); executions.save(execution); }
    @Transactional
    void finishExecution(UUID id) { ExecutionEntity execution = executions.findById(id).orElse(null); if (execution == null || execution.getCompletedCases() < execution.getTotalCases() || !Set.of(ExecutionStatus.QUEUED, ExecutionStatus.RUNNING).contains(execution.getStatus())) return; ExecutionStatus status = execution.getCancelledCases() > 0 ? ExecutionStatus.CANCELLED : execution.getErrorCases() > 0 ? ExecutionStatus.ERROR : execution.getFailedCases() > 0 ? ExecutionStatus.FAILED : ExecutionStatus.PASSED; execution.finish(status, Instant.now(), execution.getErrorMessage()); executions.save(execution); queueGuard.lockGuard().ifPresent(guard -> { guard.release(); queueGuard.save(guard); }); }
}
