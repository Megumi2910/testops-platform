package com.megumi.testops.project.api;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Set;
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
import com.megumi.testops.project.service.ProjectVariableService;
import com.megumi.testops.project.service.TargetCheckService;
import com.megumi.testops.shared.api.ApiException;
import com.megumi.testops.shared.api.ApiExceptionHandler;

class AuthorizationHttpContractTest {
    private final ProjectService projects = mock(ProjectService.class);
    private final TargetCheckService targetChecks = mock(TargetCheckService.class);
    private final DefinitionService definitions = mock(DefinitionService.class);
    private final ProjectVariableService variables = mock(ProjectVariableService.class);
    private final MockMvc mvc = MockMvcBuilders
            .standaloneSetup(new ProjectController(projects, targetChecks), new DefinitionController(definitions),
                    new ProjectVariableController(variables))
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

    @Test
    void addMemberReturnsCreatedResponse() throws Exception {
        UUID projectId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        ProjectDtos.MemberRequest request = new ProjectDtos.MemberRequest("member@example.test", "VIEWER", 4L);
        when(projects.addMember(isNull(Jwt.class), eq(projectId), eq(request)))
                .thenReturn(new ProjectDtos.MemberResponse(userId, "member@example.test", "Member", "VIEWER", 0L,
                        null, Set.of("PROJECT_VIEW", "DEFINITION_VIEW")));

        mvc.perform(post("/api/v1/projects/{projectId}/members", projectId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"member@example.test\",\"role\":\"VIEWER\",\"projectVersion\":4}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.userId").value(userId.toString()))
                .andExpect(jsonPath("$.role").value("VIEWER"))
                .andExpect(jsonPath("$.permissions.length()").value(2))
                .andExpect(jsonPath("$.permissions").isArray());
    }

    @Test
    void duplicateMemberReturnsConflictProblem() throws Exception {
        UUID projectId = UUID.randomUUID();
        ProjectDtos.MemberRequest request = new ProjectDtos.MemberRequest("member@example.test", "VIEWER", 4L);
        when(projects.addMember(isNull(Jwt.class), eq(projectId), eq(request)))
                .thenThrow(new ApiException(HttpStatus.CONFLICT, "member_exists", "User is already a project member"));

        mvc.perform(post("/api/v1/projects/{projectId}/members", projectId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"member@example.test\",\"role\":\"VIEWER\",\"projectVersion\":4}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("member_exists"))
                .andExpect(jsonPath("$.title").value("Conflict"));
    }

    @Test
    void changeMemberReturnsUpdatedRole() throws Exception {
        UUID projectId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        ProjectDtos.MemberRoleRequest request = new ProjectDtos.MemberRoleRequest("TEST_MANAGER", 4L);
        when(projects.changeMember(isNull(Jwt.class), eq(projectId), eq(userId), eq(request)))
                .thenReturn(new ProjectDtos.MemberResponse(userId, "member@example.test", "Member", "TEST_MANAGER", 1L,
                        null, Set.of("PROJECT_VIEW", "DEFINITION_MANAGE")));

        mvc.perform(put("/api/v1/projects/{projectId}/members/{userId}", projectId, userId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"role\":\"TEST_MANAGER\",\"projectVersion\":4}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("TEST_MANAGER"))
                .andExpect(jsonPath("$.version").value(1));
    }

    @Test
    void variableUpdateAcceptsBothOptimisticVersions() throws Exception {
        UUID projectId = UUID.randomUUID();
        ProjectDtos.VariableRequest request = new ProjectDtos.VariableRequest("BASE_URL", false,
                "https://example.test", 4L, 2L);
        when(variables.update(isNull(Jwt.class), eq(projectId), eq("BASE_URL"), eq(request)))
                .thenReturn(new ProjectDtos.VariableResponse("BASE_URL", false, "https://example.test", 3L));

        mvc.perform(put("/api/v1/projects/{projectId}/variables/{key}", projectId, "BASE_URL")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"key\":\"BASE_URL\",\"secret\":false,\"value\":\"https://example.test\",\"projectVersion\":4,\"variableVersion\":2}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.version").value(3));
    }

    @Test
    void referencedVariableDeletionReturnsGenericNonLeakingConflict() throws Exception {
        UUID projectId = UUID.randomUUID();
        org.mockito.Mockito.doThrow(new ApiException(HttpStatus.CONFLICT, "variable_in_use",
                        "Variable is referenced by one or more test steps. Remove those references before deleting it"))
                .when(variables).delete(isNull(Jwt.class), eq(projectId), eq("PASSWORD"), eq(4L), eq(2L));

        mvc.perform(delete("/api/v1/projects/{projectId}/variables/{key}", projectId, "PASSWORD")
                        .queryParam("projectVersion", "4")
                        .queryParam("variableVersion", "2"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("variable_in_use"))
                .andExpect(jsonPath("$.detail").value(
                        "Variable is referenced by one or more test steps. Remove those references before deleting it"))
                .andExpect(jsonPath("$.errors.length()").value(0));
    }

    @Test
    void removeMemberReturnsNoContent() throws Exception {
        UUID projectId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        org.mockito.Mockito.doNothing().when(projects).removeMember(isNull(Jwt.class), eq(projectId), eq(userId), eq(4L));

        mvc.perform(delete("/api/v1/projects/{projectId}/members/{userId}", projectId, userId)
                        .queryParam("projectVersion", "4"))
                .andExpect(status().isNoContent());
    }

    @Test
    void projectArchiveRequiresAnIfMatchVersion() throws Exception {
        UUID projectId = UUID.randomUUID();

        mvc.perform(post("/api/v1/projects/{projectId}/archive", projectId))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("request_binding_failed"))
                .andExpect(jsonPath("$.errors[0].path").value("If-Match"));
    }
}
