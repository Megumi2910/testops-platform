package com.megumi.testops;

import static org.junit.jupiter.api.Assertions.assertEquals;
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
import com.megumi.testops.execution.domain.TestCaseResultEntity;
import com.megumi.testops.execution.domain.TestStepResultEntity;
import com.megumi.testops.execution.repository.ExecutionArtifactRepository;
import com.megumi.testops.execution.repository.ExecutionQueueGuardRepository;
import com.megumi.testops.execution.repository.ExecutionRepository;
import com.megumi.testops.execution.repository.TestCaseResultRepository;
import com.megumi.testops.execution.repository.TestStepResultRepository;
import com.megumi.testops.execution.runner.ArtifactWriter;
import com.megumi.testops.execution.runner.PlaywrightCaseRunner;
import com.megumi.testops.execution.service.ExecutionRunService;
import com.megumi.testops.project.domain.ProjectEntity;
import com.megumi.testops.project.domain.TestCaseEntity;
import com.megumi.testops.project.domain.TestSuiteEntity;
import com.megumi.testops.project.repository.ProjectVariableRepository;
import com.megumi.testops.project.repository.TestStepRepository;

class ExecutionRunServiceTest {
    private final ExecutionRepository executions = mock(ExecutionRepository.class);
    private final TestCaseResultRepository results = mock(TestCaseResultRepository.class);
    private final PlaywrightCaseRunner runner = mock(PlaywrightCaseRunner.class);
    private final ArtifactWriter artifactWriter = mock(ArtifactWriter.class);
    private final ProjectVariableRepository variables = mock(ProjectVariableRepository.class);
    private final TestStepRepository stepDefinitions = mock(TestStepRepository.class);
    private final TestStepResultRepository stepResults = mock(TestStepResultRepository.class);
    private final ExecutionQueueGuardRepository queueGuard = mock(ExecutionQueueGuardRepository.class);
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
        service = new ExecutionRunService(executions, results, runner, artifactWriter, variables, stepDefinitions,
                stepResults, queueGuard);
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
        when(variables.findByProjectIdOrderByKeyAsc(execution.getProject().getId())).thenReturn(List.of());
        when(runner.run(any(), any(), any(), any(), any())).thenReturn(outcome);
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
}
