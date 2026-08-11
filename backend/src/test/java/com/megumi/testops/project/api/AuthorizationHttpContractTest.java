package com.megumi.testops.project.api;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import com.megumi.testops.project.service.DefinitionService;
import com.megumi.testops.project.service.ProjectService;
import com.megumi.testops.project.service.TargetCheckService;
import com.megumi.testops.shared.api.ApiException;
import com.megumi.testops.shared.api.ApiExceptionHandler;

class AuthorizationHttpContractTest {
    private final ProjectService projects = mock(ProjectService.class);
    private final TargetCheckService targetChecks = mock(TargetCheckService.class);
    private final DefinitionService definitions = mock(DefinitionService.class);
    private final MockMvc mvc = MockMvcBuilders
            .standaloneSetup(new ProjectController(projects, targetChecks), new DefinitionController(definitions))
            .setControllerAdvice(new ApiExceptionHandler())
            .setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver())
            .build();

    @Test
    void crossProjectCaseSubstitutionReturnsNonDisclosingNotFound() throws Exception {
        UUID projectId = UUID.randomUUID();
        UUID foreignSuiteId = UUID.randomUUID();
        UUID foreignCaseId = UUID.randomUUID();
        when(definitions.getCase(isNull(Jwt.class), eq(projectId), eq(foreignSuiteId), eq(foreignCaseId)))
                .thenThrow(new ApiException(HttpStatus.NOT_FOUND, "suite_not_found", "Suite was not found"));

        mvc.perform(get("/api/v1/projects/{projectId}/suites/{suiteId}/cases/{caseId}", projectId,
                        foreignSuiteId, foreignCaseId))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("suite_not_found"))
                .andExpect(jsonPath("$.detail").value("Suite was not found"));
    }

    @Test
    void finalManagerDemotionReturnsConflictProblem() throws Exception {
        UUID projectId = UUID.randomUUID();
        UUID managerId = UUID.randomUUID();
        when(projects.changeMember(isNull(Jwt.class), eq(projectId), eq(managerId),
                eq(new ProjectDtos.MemberRoleRequest("TEST_MANAGER", 0L))))
                .thenThrow(new ApiException(HttpStatus.CONFLICT, "final_project_manager",
                        "A project must always have a project manager"));

        mvc.perform(put("/api/v1/projects/{projectId}/members/{userId}", projectId, managerId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"role\":\"TEST_MANAGER\",\"projectVersion\":0}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("final_project_manager"))
                .andExpect(jsonPath("$.title").value("Conflict"));
    }

    @Test
    void finalManagerRemovalReturnsConflictProblem() throws Exception {
        UUID projectId = UUID.randomUUID();
        UUID managerId = UUID.randomUUID();
        org.mockito.Mockito.doThrow(new ApiException(HttpStatus.CONFLICT, "final_project_manager",
                        "A project must always have a project manager"))
                .when(projects).removeMember(isNull(Jwt.class), eq(projectId), eq(managerId), eq(0L));

        mvc.perform(delete("/api/v1/projects/{projectId}/members/{userId}", projectId, managerId)
                        .queryParam("projectVersion", "0"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("final_project_manager"));
    }
}
