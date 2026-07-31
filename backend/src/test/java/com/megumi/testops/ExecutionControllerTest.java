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

class ExecutionControllerTest {
    private final ExecutionService service = mock(ExecutionService.class);
    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new ExecutionController(service))
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
}
