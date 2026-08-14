package com.megumi.testops;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import com.megumi.testops.auth.domain.UserEntity;
import com.megumi.testops.execution.api.ExecutionController;
import com.megumi.testops.execution.service.ExecutionService;
import com.megumi.testops.execution.domain.ExecutionEntity;
import com.megumi.testops.project.domain.ProjectEntity;
import com.megumi.testops.project.domain.TestSuiteEntity;
import com.megumi.testops.shared.api.ApiException;
import com.megumi.testops.shared.api.ApiExceptionHandler;

class ExecutionControllerTest {
    private final ExecutionService service = mock(ExecutionService.class);
    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new ExecutionController(service))
            .setControllerAdvice(new ApiExceptionHandler())
            .setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver())
            .build();

    @Test
    void queuesCaseWithAcceptedStatusLocationAndMinimalResponse() throws Exception {
        Instant now = Instant.now();
        UserEntity user = new UserEntity("queue@example.test", "Queue user", "ACTIVE", true, now);
        ProjectEntity project = new ProjectEntity("Queue project", null, "https://target.example.test", user, now);
        TestSuiteEntity suite = new TestSuiteEntity(project, "Smoke suite", null, user, now);
        UUID key = UUID.randomUUID();
        ExecutionEntity execution = new ExecutionEntity(project, suite, user, 1, key, now);

        when(service.queueSuite(isNull(Jwt.class), eq(project.getId()), eq(suite.getId()), eq(key)))
                .thenReturn(execution);

        mvc.perform(post("/api/v1/projects/{projectId}/suites/{suiteId}/executions", project.getId(), suite.getId())
                        .header("Idempotency-Key", key.toString()))
                .andExpect(status().isAccepted())
                .andExpect(header().string("Location", "/api/v1/projects/" + project.getId() + "/executions/" + execution.getId()))
                .andExpect(jsonPath("$.executionId").value(execution.getId().toString()))
                .andExpect(jsonPath("$.status").value("QUEUED"));
    }

    @Test
    void returnsStructuredNotFoundForCrossProjectExecutionCancellation() throws Exception {
        UUID projectId = UUID.randomUUID();
        UUID foreignExecutionId = UUID.randomUUID();
        when(service.cancel(isNull(Jwt.class), eq(projectId), eq(foreignExecutionId)))
                .thenThrow(new ApiException(HttpStatus.NOT_FOUND, "execution_not_found", "Execution was not found"));

        mvc.perform(post("/api/v1/projects/{projectId}/executions/{executionId}/cancel", projectId,
                        foreignExecutionId)
                        .header("X-Correlation-Id", "qa-cross-project-cancel"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("execution_not_found"))
                .andExpect(jsonPath("$.correlationId").value("qa-cross-project-cancel"))
                .andExpect(jsonPath("$.instance").value(
                        "/api/v1/projects/" + projectId + "/executions/" + foreignExecutionId + "/cancel"));
    }

    @Test
    void returnsStructuredForbiddenWhenCancellationOwnershipFails() throws Exception {
        UUID projectId = UUID.randomUUID();
        UUID executionId = UUID.randomUUID();
        when(service.cancel(isNull(Jwt.class), eq(projectId), eq(executionId)))
                .thenThrow(new ApiException(HttpStatus.FORBIDDEN, "cancel_denied",
                        "Only the requester or a project manager can cancel an execution"));

        mvc.perform(post("/api/v1/projects/{projectId}/executions/{executionId}/cancel", projectId, executionId))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("cancel_denied"))
                .andExpect(jsonPath("$.title").value("Forbidden"));
    }
}
