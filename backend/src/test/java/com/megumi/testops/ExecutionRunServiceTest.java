package com.megumi.testops;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

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
import com.megumi.testops.execution.runner.PlaywrightCaseRunner;
import com.megumi.testops.execution.service.ExecutionRunService;
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
        service = new ExecutionRunService(executions, results, runner, artifactWriter,
                stepResults, queueGuard, variableSnapshots, variableCrypto, stepSnapshots);
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
    void decryptsSecretSnapshotInsideWorkerBeforeRunningCase() {
        var now = Instant.now();
        var secret = com.megumi.testops.project.domain.ProjectVariableEntity.encrypted(execution.getProject(), "PASSWORD", new byte[] { 9 }, new byte[] { 8 }, 1, now);
        var snapshot = ExecutionVariableSnapshotEntity.secret(execution, secret);
        PlaywrightCaseRunner.Result outcome = new PlaywrightCaseRunner.Result(true, null, null, true, false, null, null, null);
        when(executions.findById(execution.getId())).thenReturn(Optional.of(execution));
        when(results.findByExecutionIdOrderByTestCase_NameAsc(execution.getId())).thenReturn(List.of(caseResult));
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
    }
}
