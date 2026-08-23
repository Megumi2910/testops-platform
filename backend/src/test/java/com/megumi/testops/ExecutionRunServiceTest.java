package com.megumi.testops;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import com.megumi.testops.auth.domain.UserEntity;
import com.megumi.testops.execution.domain.ExecutionEntity;
import com.megumi.testops.execution.domain.ExecutionStatus;
import com.megumi.testops.execution.domain.ExecutionVariableSnapshotEntity;
import com.megumi.testops.execution.domain.TestCaseResultEntity;
import com.megumi.testops.execution.domain.TestStepResultEntity;
import com.megumi.testops.execution.repository.ExecutionArtifactRepository;
import com.megumi.testops.execution.repository.ExecutionQueueGuardRepository;
import com.megumi.testops.execution.repository.ExecutionRepository;
import com.megumi.testops.execution.repository.TestCaseResultRepository;
import com.megumi.testops.execution.repository.TestStepResultRepository;
import com.megumi.testops.execution.repository.ExecutionVariableSnapshotRepository;
import com.megumi.testops.execution.repository.ExecutionStepSnapshotRepository;
import com.megumi.testops.execution.runner.ArtifactWriter;
import com.megumi.testops.execution.runner.EvidenceFileCleaner;
import com.megumi.testops.execution.runner.PlaywrightCaseRunner;
import com.megumi.testops.execution.service.ExecutionRunService;
import com.megumi.testops.execution.service.ExecutionTransactionExecutor;
import com.megumi.testops.project.domain.ProjectEntity;
import com.megumi.testops.project.domain.TestCaseEntity;
import com.megumi.testops.project.domain.TestSuiteEntity;
import com.megumi.testops.project.service.ProjectVariableCrypto;

class ExecutionRunServiceTest {
    private final ExecutionRepository executions = mock(ExecutionRepository.class);
    private final TestCaseResultRepository results = mock(TestCaseResultRepository.class);
    private final PlaywrightCaseRunner runner = mock(PlaywrightCaseRunner.class);
    private final ArtifactWriter artifactWriter = mock(ArtifactWriter.class);
    private final TestStepResultRepository stepResults = mock(TestStepResultRepository.class);
    private final ExecutionQueueGuardRepository queueGuard = mock(ExecutionQueueGuardRepository.class);
    private final ExecutionVariableSnapshotRepository variableSnapshots = mock(ExecutionVariableSnapshotRepository.class);
    private final ProjectVariableCrypto variableCrypto = mock(ProjectVariableCrypto.class);
    private final ExecutionStepSnapshotRepository stepSnapshots = mock(ExecutionStepSnapshotRepository.class);
    private EvidenceFileCleaner evidenceFiles;
    private final ExecutionTransactionExecutor transactions = new ExecutionTransactionExecutor();
    private ExecutionRunService service;
    private ExecutionEntity execution;
    private TestCaseResultEntity caseResult;

    @BeforeEach
    void setUp() {
        Instant now = Instant.now();
        UserEntity user = new UserEntity("runner@example.test", "Runner", "ACTIVE", true, now);
        ProjectEntity project = new ProjectEntity("Runner project", null, "https://target.example.test", user, now);
        TestSuiteEntity suite = new TestSuiteEntity(project, "Runner suite", null, user, now);
        TestCaseEntity testCase = new TestCaseEntity(suite, "Homepage smoke", null, "READY", "HIGH", null, 0, false, user, now);
        execution = new ExecutionEntity(project, suite, user, 1, java.util.UUID.randomUUID(), now);
        caseResult = new TestCaseResultEntity(execution, testCase);
        evidenceFiles = new EvidenceFileCleaner();
        service = new ExecutionRunService(executions, results, runner, artifactWriter,
                stepResults, queueGuard, variableSnapshots, variableCrypto, stepSnapshots, evidenceFiles,
                transactions);
    }

    @Test
    void persistsPerStepOutcomeAndScreenshotStepPosition() {
        PlaywrightCaseRunner.Result outcome = new PlaywrightCaseRunner.Result(
                true,
                null,
                null,
                false,
                false,
                null,
                null,
                null,
                List.of(new PlaywrightCaseRunner.StepOutcome(1, "NAVIGATE", "PASSED", 42L, null)),
                List.of(new PlaywrightCaseRunner.CapturedScreenshot(2, new byte[] { 1, 2, 3 })));
        when(executions.findById(execution.getId())).thenReturn(Optional.of(execution));
        when(results.findByExecutionIdOrderByTestCase_NameAsc(execution.getId())).thenReturn(List.of(caseResult));
        when(results.findById(caseResult.getId())).thenReturn(Optional.of(caseResult));
        when(variableSnapshots.findByExecutionIdOrderByKeyAsc(execution.getId())).thenReturn(List.of());
        when(stepSnapshots.findByCaseResultIdOrderByPositionAsc(caseResult.getId())).thenReturn(List.of());
        when(runner.run(any(), any(), any(), any(), any(), any())).thenReturn(outcome);
        when(queueGuard.lockGuard()).thenReturn(Optional.empty());

        service.run(execution.getId());

        assertEquals(ExecutionStatus.PASSED, execution.getStatus());
        assertEquals(ExecutionStatus.PASSED, caseResult.getStatus());
        ArgumentCaptor<TestStepResultEntity> captured = ArgumentCaptor.forClass(TestStepResultEntity.class);
        verify(stepResults).save(captured.capture());
        assertEquals(1, captured.getValue().getPosition());
        assertEquals("NAVIGATE", captured.getValue().getAction());
        assertEquals("PASSED", captured.getValue().getStatus());
        assertEquals(42L, captured.getValue().getDurationMs());
        verify(artifactWriter).writeScreenshot(execution, caseResult, 2, new byte[] { 1, 2, 3 });
    }

    @Test
    void suppliesStableGeneratedValuesWithoutMarkingThemSecret() {
        PlaywrightCaseRunner.Result outcome = new PlaywrightCaseRunner.Result(
                true, null, null, false, false, null, null, null, List.of(), List.of());
        when(executions.findById(execution.getId())).thenReturn(Optional.of(execution));
        when(results.findByExecutionIdOrderByTestCase_NameAsc(execution.getId())).thenReturn(List.of(caseResult));
        when(results.findById(caseResult.getId())).thenReturn(Optional.of(caseResult));
        when(variableSnapshots.findByExecutionIdOrderByKeyAsc(execution.getId())).thenReturn(List.of());
        when(stepSnapshots.findByCaseResultIdOrderByPositionAsc(caseResult.getId())).thenReturn(List.of());
        when(runner.run(any(), any(), any(), any(), any(), any())).thenReturn(outcome);
        when(queueGuard.lockGuard()).thenReturn(Optional.empty());

        service.run(execution.getId());

        var captured = org.mockito.ArgumentCaptor.forClass(java.util.Map.class);
        verify(runner).run(any(), any(), any(), any(), captured.capture(), any());
        @SuppressWarnings("unchecked") var values = (java.util.Map<String, String>) captured.getValue();
        assertEquals(execution.getId().toString(), values.get("RUN_ID"));
        assertEquals(execution.getCreatedAt().toString(), values.get("RUN_TIMESTAMP"));
        assertEquals(caseResult.getId().toString(), values.get("CASE_RESULT_ID"));
    }

    @Test
    void decryptsSecretSnapshotInsideWorkerBeforeRunningCase() {
        var now = Instant.now();
        var secret = com.megumi.testops.project.domain.ProjectVariableEntity.encrypted(execution.getProject(), "PASSWORD", new byte[] { 9 }, new byte[] { 8 }, 1, now);
        var snapshot = ExecutionVariableSnapshotEntity.secret(execution, secret);
        PlaywrightCaseRunner.Result outcome = new PlaywrightCaseRunner.Result(true, null, null, true, false, null, null, null);
        when(executions.findById(execution.getId())).thenReturn(Optional.of(execution));
        when(results.findByExecutionIdOrderByTestCase_NameAsc(execution.getId())).thenReturn(List.of(caseResult));
        when(results.findById(caseResult.getId())).thenReturn(Optional.of(caseResult));
        when(variableSnapshots.findByExecutionIdOrderByKeyAsc(execution.getId())).thenReturn(List.of(snapshot));
        when(stepSnapshots.findByCaseResultIdOrderByPositionAsc(caseResult.getId())).thenReturn(List.of());
        when(variableCrypto.decrypt(execution.getProject().getId().toString(), "PASSWORD", new byte[] { 9 }, new byte[] { 8 }, 1)).thenReturn("super-secret");
        when(runner.run(any(), any(), any(), any(), any(), any())).thenReturn(outcome);
        when(queueGuard.lockGuard()).thenReturn(Optional.empty());

        service.run(execution.getId());

        @SuppressWarnings("unchecked")
        ArgumentCaptor<java.util.Map<String, String>> variablesCaptor = ArgumentCaptor.forClass(java.util.Map.class);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<java.util.Set<String>> secretKeysCaptor = ArgumentCaptor.forClass(java.util.Set.class);
        verify(runner).run(any(), anyString(), anyString(), anyString(), variablesCaptor.capture(), secretKeysCaptor.capture());
        assertEquals("super-secret", variablesCaptor.getValue().get("PASSWORD"));
        assertEquals(java.util.Set.of("PASSWORD"), secretKeysCaptor.getValue());
        assertTrue(caseResult.isEvidenceSuppressed());
        assertEquals("SECRET_VARIABLE_USED", caseResult.getEvidenceSuppressionReason());
    }

    @Test
    void redactsResolvedSecretValuesFromCaseAndStepFailuresBeforePersistence() {
        var now = Instant.now();
        var secret = com.megumi.testops.project.domain.ProjectVariableEntity.encrypted(execution.getProject(),
                "PASSWORD", new byte[] { 9 }, new byte[] { 8 }, 1, now);
        var snapshot = ExecutionVariableSnapshotEntity.secret(execution, secret);
        String rawSecret = "super-secret-value";
        PlaywrightCaseRunner.Result outcome = new PlaywrightCaseRunner.Result(
                false,
                "Expected string: " + rawSecret,
                null,
                true,
                false,
                "ASSERTION_FAILURE",
                1,
                null,
                List.of(new PlaywrightCaseRunner.StepOutcome(1, "ASSERT_TEXT", "FAILED", 12L,
                        "Locator contained " + rawSecret)),
                List.of());
        prepareRun(caseResult);
        when(variableSnapshots.findByExecutionIdOrderByKeyAsc(execution.getId())).thenReturn(List.of(snapshot));
        when(variableCrypto.decrypt(execution.getProject().getId().toString(), "PASSWORD",
                new byte[] { 9 }, new byte[] { 8 }, 1)).thenReturn(rawSecret);
        when(runner.run(any(), any(), any(), any(), any(), any())).thenReturn(outcome);

        service.run(execution.getId());

        assertFalse(caseResult.getErrorMessage().contains(rawSecret));
        assertTrue(caseResult.getErrorMessage().contains("[REDACTED]"));
        ArgumentCaptor<TestStepResultEntity> step = ArgumentCaptor.forClass(TestStepResultEntity.class);
        verify(stepResults).save(step.capture());
        assertFalse(step.getValue().getErrorMessage().contains(rawSecret));
        assertTrue(step.getValue().getErrorMessage().contains("[REDACTED]"));
    }

    @Test
    void suppressesEveryArtifactWhenASecretIsUsedAfterAnEarlierScreenshot() throws Exception {
        Path trace = Files.createTempFile("testops-secret-trace-", ".zip");
        PlaywrightCaseRunner.Result outcome = new PlaywrightCaseRunner.Result(
                false,
                "Assertion failed",
                new byte[] { 9 },
                true,
                false,
                "ASSERTION_FAILURE",
                3,
                trace,
                List.of(new PlaywrightCaseRunner.StepOutcome(1, "TAKE_SCREENSHOT", "PASSED", 5L, null)),
                List.of(new PlaywrightCaseRunner.CapturedScreenshot(1, new byte[] { 1, 2, 3 })));
        prepareRun(caseResult);
        when(runner.run(any(), any(), any(), any(), any(), any())).thenReturn(outcome);

        service.run(execution.getId());

        assertTrue(caseResult.isEvidenceSuppressed());
        assertEquals("SECRET_VARIABLE_USED", caseResult.getEvidenceSuppressionReason());
        assertFalse(Files.exists(trace));
        verify(artifactWriter, never()).writeScreenshot(any(), any(), any(byte[].class));
        verify(artifactWriter, never()).writeScreenshot(any(), any(), any(), any(byte[].class));
        verify(artifactWriter, never()).writeTrace(any(), any(), any());
    }

    @Test
    void suppressionRemainsStickyAcrossRetriesAndDeletesEveryTrace() throws Exception {
        TestCaseResultEntity retryResult = retryResult(1);
        Path firstTrace = Files.createTempFile("testops-secret-retry-", ".zip");
        Path finalTrace = Files.createTempFile("testops-secret-final-", ".zip");
        PlaywrightCaseRunner.Result first = new PlaywrightCaseRunner.Result(
                false, "Target unavailable", null, true, true, "TARGET_UNREACHABLE", 1, firstTrace,
                List.of(), List.of());
        PlaywrightCaseRunner.Result second = new PlaywrightCaseRunner.Result(
                true, null, null, false, false, null, null, finalTrace,
                List.of(), List.of(new PlaywrightCaseRunner.CapturedScreenshot(2, new byte[] { 7 })));
        prepareRun(retryResult);
        when(runner.run(any(), any(), any(), any(), any(), any())).thenReturn(first, second);

        service.run(execution.getId());

        assertEquals(2, retryResult.getAttemptCount());
        assertTrue(retryResult.isEvidenceSuppressed());
        assertEquals("SECRET_VARIABLE_USED", retryResult.getEvidenceSuppressionReason());
        assertFalse(Files.exists(firstTrace));
        assertFalse(Files.exists(finalTrace));
        verify(artifactWriter, never()).writeScreenshot(any(), any(), any(), any(byte[].class));
        verify(artifactWriter, never()).writeTrace(any(), any(), any());
    }

    @Test
    void deletesSupersededNonSecretTraceAndPersistsOnlyFinalAttempt() throws Exception {
        TestCaseResultEntity retryResult = retryResult(1);
        Path supersededTrace = Files.createTempFile("testops-superseded-", ".zip");
        Path finalTrace = Files.createTempFile("testops-final-", ".zip");
        PlaywrightCaseRunner.Result first = new PlaywrightCaseRunner.Result(
                false, "Browser crashed", null, false, true, "BROWSER_CRASH", null, supersededTrace,
                List.of(), List.of());
        PlaywrightCaseRunner.Result second = new PlaywrightCaseRunner.Result(
                true, null, null, false, false, null, null, finalTrace,
                List.of(), List.of());
        prepareRun(retryResult);
        when(runner.run(any(), any(), any(), any(), any(), any())).thenReturn(first, second);

        service.run(execution.getId());

        assertFalse(retryResult.isEvidenceSuppressed());
        assertFalse(Files.exists(supersededTrace));
        assertFalse(Files.exists(finalTrace));
        verify(artifactWriter, never()).writeTrace(execution, retryResult, supersededTrace);
        verify(artifactWriter).writeTrace(execution, retryResult, finalTrace);
    }

    @Test
    void artifactPersistenceFailureRecordsExactlyOneErrorResult() {
        PlaywrightCaseRunner.Result outcome = new PlaywrightCaseRunner.Result(
                true, null, new byte[] { 1 }, false, false, null, null, null, List.of(), List.of());
        prepareRun(caseResult);
        when(runner.run(any(), any(), any(), any(), any(), any())).thenReturn(outcome);
        doThrow(new IllegalStateException("artifact unavailable"))
                .when(artifactWriter).writeScreenshot(any(), any(), any(), any(byte[].class));

        service.run(execution.getId());

        assertEquals(ExecutionStatus.ERROR, caseResult.getStatus());
        assertEquals(1, execution.getCompletedCases());
        assertEquals(1, execution.getErrorCases());
        assertEquals(0, execution.getPassedCases());
        assertEquals("Execution infrastructure error", caseResult.getErrorMessage());
    }

    @Test
    void traceCleanupFailureIsSurfacedAndDoesNotDoubleFinalize() {
        Path trace = Path.of("locked-trace.zip");
        EvidenceFileCleaner failingCleaner = mock(EvidenceFileCleaner.class);
        service = new ExecutionRunService(executions, results, runner, artifactWriter,
                stepResults, queueGuard, variableSnapshots, variableCrypto, stepSnapshots, failingCleaner,
                transactions);
        PlaywrightCaseRunner.Result outcome = new PlaywrightCaseRunner.Result(
                false, "Assertion failed", null, true, false, "ASSERTION_FAILURE", 1, trace,
                List.of(), List.of());
        prepareRun(caseResult);
        when(runner.run(any(), any(), any(), any(), any(), any())).thenReturn(outcome);
        doThrow(new IllegalStateException("cleanup denied")).when(failingCleaner).delete(trace);

        service.run(execution.getId());

        verify(failingCleaner, atLeastOnce()).delete(trace);
        assertEquals(ExecutionStatus.ERROR, caseResult.getStatus());
        assertEquals(1, execution.getCompletedCases());
        assertEquals(1, execution.getErrorCases());
    }

    @Test
    void retriesPreserveOriginalCaseStartTime() {
        TestCaseResultEntity result = retryResult(1);
        Instant firstAttempt = Instant.parse("2026-08-23T10:00:00Z");

        result.start(firstAttempt);
        result.start(firstAttempt.plusSeconds(30));

        assertEquals(firstAttempt, result.getStartedAt());
        assertEquals(2, result.getAttemptCount());
    }

    private void prepareRun(TestCaseResultEntity result) {
        when(executions.findById(execution.getId())).thenReturn(Optional.of(execution));
        when(results.findByExecutionIdOrderByTestCase_NameAsc(execution.getId())).thenReturn(List.of(result));
        when(results.findById(result.getId())).thenReturn(Optional.of(result));
        when(variableSnapshots.findByExecutionIdOrderByKeyAsc(execution.getId())).thenReturn(List.of());
        when(stepSnapshots.findByCaseResultIdOrderByPositionAsc(result.getId())).thenReturn(List.of());
        when(queueGuard.lockGuard()).thenReturn(Optional.empty());
    }

    private TestCaseResultEntity retryResult(int retries) {
        Instant now = Instant.now();
        TestCaseEntity testCase = new TestCaseEntity(execution.getSuite(), "Retry case", null, "READY", "HIGH",
                null, retries, false, execution.getRequestedBy(), now);
        return new TestCaseResultEntity(execution, testCase);
    }
}
