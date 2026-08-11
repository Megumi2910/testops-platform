package com.megumi.testops.project.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
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
import com.megumi.testops.shared.api.ApiException;

class ProjectMembershipSecurityTest {
    private final ProjectRepository projects = mock(ProjectRepository.class);
    private final ProjectMemberRepository members = mock(ProjectMemberRepository.class);
    private final ProjectAuditEventRepository audits = mock(ProjectAuditEventRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final ProjectAccessService access = mock(ProjectAccessService.class);
    private final ProjectTargetPolicy targets = mock(ProjectTargetPolicy.class);
    private final PlatformPermissionService platformPermissions = mock(PlatformPermissionService.class);
    private final ProjectOnboardingRepository onboarding = mock(ProjectOnboardingRepository.class);
    private final UserEntity actor = mock(UserEntity.class);
    private final UUID actorId = UUID.randomUUID();
    private final Jwt jwt = Jwt.withTokenValue("membership-test").header("alg", "none")
            .subject(actorId.toString()).build();
    private ProjectEntity project;
    private ProjectService service;

    @BeforeEach
    void setUp() {
        when(actor.getId()).thenReturn(actorId);
        project = new ProjectEntity("Membership project", null, "https://target.example.test", actor, Instant.now());
        when(access.user(jwt)).thenReturn(actor);
        when(access.project(project.getId())).thenReturn(project);
        doNothing().when(access).requireProjectRole(eq(project), eq(actor), eq(jwt), any());
        service = new ProjectService(projects, members, audits, users, access, targets, platformPermissions,
                onboarding);
    }

    @Test
    void cannotDemoteTheFinalProjectManager() {
        ProjectMemberEntity manager = new ProjectMemberEntity(project, actor, "PROJECT_MANAGER", Instant.now());
        when(members.findByProjectIdAndUserId(project.getId(), actorId)).thenReturn(Optional.of(manager));
        when(members.countByProjectIdAndRole(project.getId(), "PROJECT_MANAGER")).thenReturn(1L);

        ApiException failure = assertThrows(ApiException.class,
                () -> service.changeMember(jwt, project.getId(), actorId,
                        new ProjectDtos.MemberRoleRequest("TEST_MANAGER", project.getVersion())));

        assertEquals("final_project_manager", failure.getCode());
        assertEquals(409, failure.getStatus().value());
        assertEquals("PROJECT_MANAGER", manager.getRole());
        verify(audits, never()).save(any());
    }

    @Test
    void cannotRemoveTheFinalProjectManager() {
        ProjectMemberEntity manager = new ProjectMemberEntity(project, actor, "PROJECT_MANAGER", Instant.now());
        when(members.findByProjectIdAndUserId(project.getId(), actorId)).thenReturn(Optional.of(manager));
        when(members.countByProjectIdAndRole(project.getId(), "PROJECT_MANAGER")).thenReturn(1L);

        ApiException failure = assertThrows(ApiException.class,
                () -> service.removeMember(jwt, project.getId(), actorId, project.getVersion()));

        assertEquals("final_project_manager", failure.getCode());
        assertEquals(409, failure.getStatus().value());
        verify(members, never()).delete(any());
        verify(audits, never()).save(any());
    }

    @Test
    void projectScopedLookupHidesForeignMemberIdentifiers() {
        UUID foreignUserId = UUID.randomUUID();
        when(members.findByProjectIdAndUserId(project.getId(), foreignUserId)).thenReturn(Optional.empty());

        ApiException failure = assertThrows(ApiException.class,
                () -> service.removeMember(jwt, project.getId(), foreignUserId, project.getVersion()));

        assertEquals("member_not_found", failure.getCode());
        assertEquals(404, failure.getStatus().value());
        verify(members, never()).delete(any());
        verify(audits, never()).save(any());
    }
}
