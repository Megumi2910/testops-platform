package com.megumi.testops.project.service;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.megumi.testops.auth.domain.UserEntity;
import com.megumi.testops.auth.repository.UserRepository;
import com.megumi.testops.project.api.ProjectDtos;
import com.megumi.testops.project.domain.ProjectAuditEventEntity;
import com.megumi.testops.project.domain.ProjectEntity;
import com.megumi.testops.project.domain.ProjectMemberEntity;
import com.megumi.testops.project.repository.ProjectAuditEventRepository;
import com.megumi.testops.project.repository.ProjectMemberRepository;
import com.megumi.testops.project.repository.ProjectRepository;
import com.megumi.testops.shared.api.ApiException;
import com.megumi.testops.shared.api.PageResponse;

@Service
public class ProjectService {
    private final ProjectRepository projects; private final ProjectMemberRepository members; private final ProjectAuditEventRepository audits;
    private final UserRepository users; private final ProjectAccessService access; private final ProjectTargetPolicy targets;
    public ProjectService(ProjectRepository projects, ProjectMemberRepository members, ProjectAuditEventRepository audits, UserRepository users, ProjectAccessService access, ProjectTargetPolicy targets) {
        this.projects = projects; this.members = members; this.audits = audits; this.users = users; this.access = access; this.targets = targets;
    }

    @Transactional(readOnly = true)
    public PageResponse<ProjectDtos.ProjectResponse> list(Jwt jwt, int page, int size, String query) {
        UserEntity user = access.user(jwt); PageRequest request = PageRequest.of(Math.max(0, page), Math.min(Math.max(1, size), 100), Sort.by("name").ascending());
        Page<ProjectEntity> result;
        if (access.globalAdmin(jwt)) result = query == null || query.isBlank() ? projects.findAll(request) : projects.findByNameContainingIgnoreCase(query.trim(), request);
        else {
            List<UUID> ids = members.findByUserId(user.getId()).stream().map(m -> m.getProject().getId()).toList();
            List<ProjectEntity> filtered = projects.findAllById(ids).stream().filter(p -> query == null || query.isBlank() || p.getName().toLowerCase(Locale.ROOT).contains(query.trim().toLowerCase(Locale.ROOT))).sorted(java.util.Comparator.comparing(ProjectEntity::getName)).toList();
            int from = Math.min(page * request.getPageSize(), filtered.size()); int to = Math.min(from + request.getPageSize(), filtered.size());
            return new PageResponse<>(filtered.subList(from, to).stream().map(p -> response(jwt, p)).toList(), page, request.getPageSize(), filtered.size(), (int) Math.ceil(filtered.size() / (double) request.getPageSize()));
        }
        return new PageResponse<>(result.getContent().stream().map(p -> response(jwt, p)).toList(), result.getNumber(), result.getSize(), result.getTotalElements(), result.getTotalPages());
    }

    @Transactional
    public ProjectDtos.ProjectResponse create(Jwt jwt, ProjectDtos.ProjectRequest request) {
        UserEntity user = access.user(jwt); if (!access.globalAdmin(jwt)) throw error(HttpStatus.FORBIDDEN, "global_role_required", "Only administrators can create projects");
        String name = request.name().trim(); if (projects.existsByNameIgnoreCase(name)) throw error(HttpStatus.CONFLICT, "project_name_taken", "Project name is already in use");
        Instant now = Instant.now(); ProjectEntity project = projects.save(new ProjectEntity(name, trim(request.description()), targets.validate(request.targetOrigin()), user, now));
        ProjectMemberEntity owner = new ProjectMemberEntity(project, user, "PROJECT_MANAGER", now); owner.assignBy(user); members.save(owner); audit(project, user, "PROJECT_CREATED"); return response(jwt, project);
    }

    @Transactional(readOnly = true)
    public ProjectDtos.ProjectResponse get(Jwt jwt, UUID id) { UserEntity user = access.user(jwt); ProjectEntity project = access.project(id); if (!access.globalAdmin(jwt)) access.membership(project, user); return response(jwt, project); }
    @Transactional
    public ProjectDtos.ProjectResponse update(Jwt jwt, UUID id, ProjectDtos.ProjectRequest request) {
        UserEntity user = access.user(jwt); ProjectEntity project = access.project(id); access.requireProjectRole(project, user, jwt, java.util.Set.of("PROJECT_MANAGER")); requireVersion(project.getVersion(), request.projectVersion());
        String name = request.name().trim(); if (!name.equalsIgnoreCase(project.getName()) && projects.existsByNameIgnoreCase(name)) throw error(HttpStatus.CONFLICT, "project_name_taken", "Project name is already in use");
        if ("ARCHIVED".equals(project.getStatus())) throw error(HttpStatus.CONFLICT, "project_archived", "Archived projects are read-only");
        project.update(name, trim(request.description()), targets.validate(request.targetOrigin()), Instant.now()); audit(project, user, "PROJECT_UPDATED"); return response(jwt, project);
    }
    @Transactional
    public ProjectDtos.ProjectResponse setArchived(Jwt jwt, UUID id, boolean archived) {
        UserEntity user = access.user(jwt); ProjectEntity project = access.project(id); access.requireProjectRole(project, user, jwt, java.util.Set.of("PROJECT_MANAGER")); if (archived) project.archive(Instant.now()); else project.restore(Instant.now()); audit(project, user, archived ? "PROJECT_ARCHIVED" : "PROJECT_RESTORED"); return response(jwt, project);
    }
    @Transactional(readOnly = true)
    public List<ProjectDtos.MemberResponse> members(Jwt jwt, UUID id) { UserEntity user = access.user(jwt); ProjectEntity project = access.project(id); if (!access.globalAdmin(jwt)) access.membership(project, user); return members.findByProjectIdOrderByCreatedAtAsc(id).stream().map(ProjectService::memberResponse).toList(); }
    @Transactional
    public ProjectDtos.MemberResponse addMember(Jwt jwt, UUID id, ProjectDtos.MemberRequest request) {
        UserEntity actor = access.user(jwt); ProjectEntity project = access.project(id); access.requireProjectRole(project, actor, jwt, java.util.Set.of("PROJECT_MANAGER")); ensureActive(project); requireVersion(project.getVersion(), request.projectVersion());
        UserEntity user = users.findByEmail(request.email().trim().toLowerCase(Locale.ROOT)).orElseThrow(() -> error(HttpStatus.NOT_FOUND, "user_not_found", "User was not found")); String role = role(request.role());
        if (members.existsByProjectIdAndUserId(id, user.getId())) throw error(HttpStatus.CONFLICT, "member_exists", "User is already a project member");
        ProjectMemberEntity member = new ProjectMemberEntity(project, user, role, Instant.now()); member.assignBy(actor); members.save(member); project.touch(Instant.now()); audit(project, actor, "MEMBER_ADDED"); return memberResponse(member);
    }
    @Transactional
    public ProjectDtos.MemberResponse changeMember(Jwt jwt, UUID id, UUID userId, ProjectDtos.MemberRoleRequest request) {
        UserEntity actor = access.user(jwt); ProjectEntity project = access.project(id); access.requireProjectRole(project, actor, jwt, java.util.Set.of("PROJECT_MANAGER")); ensureActive(project); requireVersion(project.getVersion(), request.projectVersion());
        ProjectMemberEntity member = members.findByProjectIdAndUserId(id, userId).orElseThrow(() -> error(HttpStatus.NOT_FOUND, "member_not_found", "Member was not found")); String role = role(request.role());
        if ("PROJECT_MANAGER".equals(member.getRole()) && !"PROJECT_MANAGER".equals(role) && members.countByProjectIdAndRole(id, "PROJECT_MANAGER") <= 1) throw error(HttpStatus.CONFLICT, "final_project_manager", "A project must always have a project manager");
        member.changeRole(role, Instant.now()); project.touch(Instant.now()); audit(project, actor, "MEMBER_ROLE_CHANGED"); return memberResponse(member);
    }
    @Transactional
    public void removeMember(Jwt jwt, UUID id, UUID userId, Long projectVersion) {
        UserEntity actor = access.user(jwt); ProjectEntity project = access.project(id); access.requireProjectRole(project, actor, jwt, java.util.Set.of("PROJECT_MANAGER")); ensureActive(project); requireVersion(project.getVersion(), projectVersion);
        ProjectMemberEntity member = members.findByProjectIdAndUserId(id, userId).orElseThrow(() -> error(HttpStatus.NOT_FOUND, "member_not_found", "Member was not found")); if ("PROJECT_MANAGER".equals(member.getRole()) && members.countByProjectIdAndRole(id, "PROJECT_MANAGER") <= 1) throw error(HttpStatus.CONFLICT, "final_project_manager", "A project must always have a project manager"); members.delete(member); project.touch(Instant.now()); audit(project, actor, "MEMBER_REMOVED");
    }
    private void audit(ProjectEntity project, UserEntity user, String event) { audits.save(new ProjectAuditEventEntity(project, user, event, "{}", Instant.now())); }
    private ProjectDtos.ProjectResponse response(Jwt jwt, ProjectEntity p) {
        UserEntity user = access.user(jwt);
        String role = access.globalAdmin(jwt) ? "ADMIN" : members.findByProjectIdAndUserId(p.getId(), user.getId()).map(ProjectMemberEntity::getRole).orElse(null);
        java.util.Set<String> permissions = permissionSet(role, access.globalAdmin(jwt));
        return new ProjectDtos.ProjectResponse(p.getId(), p.getName(), p.getDescription(), p.getTargetOrigin(), p.getStatus(), p.getVersion(), p.getCreatedAt(), p.getUpdatedAt(), role, permissions);
    }
    private static java.util.Set<String> permissionSet(String role, boolean admin) {
        if (admin) return java.util.Arrays.stream(ProjectPermission.values()).map(Enum::name).collect(java.util.stream.Collectors.toUnmodifiableSet());
        java.util.EnumSet<ProjectPermission> set = java.util.EnumSet.noneOf(ProjectPermission.class);
        if (role == null) return java.util.Set.of();
        set.add(ProjectPermission.PROJECT_VIEW); set.add(ProjectPermission.DEFINITION_VIEW); set.add(ProjectPermission.EXECUTION_VIEW); set.add(ProjectPermission.ARTIFACT_VIEW);
        if ("PROJECT_MANAGER".equals(role)) set.addAll(java.util.EnumSet.of(ProjectPermission.PROJECT_UPDATE, ProjectPermission.PROJECT_ARCHIVE, ProjectPermission.MEMBER_MANAGE, ProjectPermission.VARIABLE_VIEW, ProjectPermission.VARIABLE_MANAGE, ProjectPermission.DEFINITION_MANAGE, ProjectPermission.EXECUTION_START, ProjectPermission.EXECUTION_CANCEL_OWN, ProjectPermission.EXECUTION_CANCEL_ANY));
        if ("TEST_MANAGER".equals(role)) set.addAll(java.util.EnumSet.of(ProjectPermission.DEFINITION_MANAGE, ProjectPermission.EXECUTION_START, ProjectPermission.EXECUTION_CANCEL_OWN));
        if ("TESTER".equals(role)) set.addAll(java.util.EnumSet.of(ProjectPermission.EXECUTION_START, ProjectPermission.EXECUTION_CANCEL_OWN));
        return set.stream().map(Enum::name).collect(java.util.stream.Collectors.toUnmodifiableSet());
    }
    private static ProjectDtos.MemberResponse memberResponse(ProjectMemberEntity m) { return new ProjectDtos.MemberResponse(m.getUser().getId(), m.getUser().getEmail(), m.getUser().getDisplayName(), m.getRole(), m.getVersion(), m.getAssignedBy() == null ? null : m.getAssignedBy().getId()); }
    private static void requireVersion(long current, Long expected) { if (expected != null && current != expected) throw error(HttpStatus.CONFLICT, "stale_version", "The resource changed; reload and try again"); }
    private static String role(String value) { String role = value == null ? "" : value.trim().toUpperCase(Locale.ROOT); if (!java.util.Set.of("PROJECT_MANAGER", "TEST_MANAGER", "TESTER", "VIEWER").contains(role)) throw error(HttpStatus.BAD_REQUEST, "invalid_project_role", "Role must be PROJECT_MANAGER, TEST_MANAGER, TESTER, or VIEWER"); return role; }
    private static void ensureActive(ProjectEntity p) { if ("ARCHIVED".equals(p.getStatus())) throw error(HttpStatus.CONFLICT, "project_archived", "Archived projects are read-only"); }
    private static String trim(String value) { return value == null ? null : value.trim(); }
    private static ApiException error(HttpStatus status, String code, String message) { return new ApiException(status, code, message); }
}
