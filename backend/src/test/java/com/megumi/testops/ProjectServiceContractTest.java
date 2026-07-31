package com.megumi.testops;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.oauth2.jwt.Jwt;

import com.megumi.testops.auth.domain.UserEntity;
import com.megumi.testops.auth.repository.UserRepository;
import com.megumi.testops.auth.service.PlatformPermissionService;
import com.megumi.testops.project.api.ProjectDtos;
import com.megumi.testops.project.domain.ProjectEntity;
import com.megumi.testops.project.domain.ProjectMemberEntity;
import com.megumi.testops.project.repository.ProjectAuditEventRepository;
import com.megumi.testops.project.repository.ProjectMemberRepository;
import com.megumi.testops.project.repository.ProjectOnboardingRepository;
import com.megumi.testops.project.repository.ProjectRepository;
import com.megumi.testops.project.service.ProjectAccessService;
import com.megumi.testops.project.service.ProjectService;
import com.megumi.testops.project.service.ProjectTargetPolicy;

class ProjectServiceContractTest {
    private final ProjectRepository projects = mock(ProjectRepository.class);
    private final ProjectMemberRepository members = mock(ProjectMemberRepository.class);
    private final ProjectAuditEventRepository audits = mock(ProjectAuditEventRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final ProjectAccessService access = mock(ProjectAccessService.class);
    private final ProjectTargetPolicy targets = mock(ProjectTargetPolicy.class);
    private final PlatformPermissionService platformPermissions = mock(PlatformPermissionService.class);
    private final ProjectOnboardingRepository onboarding = mock(ProjectOnboardingRepository.class);
    private final ProjectService service = new ProjectService(projects, members, audits, users, access, targets,
            platformPermissions, onboarding);
    private UserEntity user;
    private ProjectEntity project;
    private ProjectMemberEntity membership;
    private Jwt jwt;

    @BeforeEach
    void setUp() {
        Instant now = Instant.now();
        user = mock(UserEntity.class);
        when(user.getId()).thenReturn(UUID.randomUUID());
        project = new ProjectEntity("Contract project", null, "https://target.example.test", user, now);
        membership = new ProjectMemberEntity(project, user, "TESTER", now);
        jwt = Jwt.withTokenValue("test-token").header("alg", "none").subject(user.getId().toString()).build();
        when(access.user(jwt)).thenReturn(user);
        when(access.globalAdmin(jwt)).thenReturn(false);
        when(access.project(project.getId())).thenReturn(project);
        when(access.membership(project, user)).thenReturn(membership);
        when(members.findByProjectIdAndUserId(project.getId(), user.getId())).thenReturn(Optional.of(membership));
    }

    @Test
    void projectResponseExposesOnboardingCountsAndTargetHealth() {
        ProjectDtos.ProjectOnboardingResponse counts = new ProjectDtos.ProjectOnboardingResponse(2, 5, 3, 7);
        when(onboarding.findByProjectIds(List.of(project.getId()))).thenReturn(Map.of(project.getId(), counts));

        ProjectDtos.ProjectResponse response = service.get(jwt, project.getId());

        assertEquals(2, response.onboarding().suiteCount());
        assertEquals(5, response.onboarding().caseCount());
        assertEquals(3, response.onboarding().readyCaseCount());
        assertEquals(7, response.onboarding().executionCount());
        assertEquals("NOT_CHECKED", response.targetHealth().status());
    }

    @Test
    void projectListLoadsOnboardingCountsInOneBatchForPage() {
        when(members.findProjectsForUser(eq(user.getId()), eq(""), any(PageRequest.class)))
                .thenReturn(new PageImpl<>(List.of(project), PageRequest.of(0, 25), 1));
        when(members.findByUserIdAndProjectIdIn(user.getId(), List.of(project.getId())))
                .thenReturn(List.of(membership));
        ProjectDtos.ProjectOnboardingResponse counts = new ProjectDtos.ProjectOnboardingResponse(1, 2, 1, 1);
        when(onboarding.findByProjectIds(List.of(project.getId()))).thenReturn(Map.of(project.getId(), counts));

        var page = service.list(jwt, 0, 25, null);

        assertEquals(1, page.content().size());
        assertEquals(1, page.content().getFirst().onboarding().suiteCount());
        verify(onboarding).findByProjectIds(List.of(project.getId()));
    }
}
