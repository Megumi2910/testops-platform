package com.megumi.testops.project.service;

import java.util.Set;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.megumi.testops.auth.domain.UserEntity;
import com.megumi.testops.auth.repository.UserRepository;
import com.megumi.testops.project.domain.ProjectEntity;
import com.megumi.testops.project.domain.ProjectMemberEntity;
import com.megumi.testops.project.repository.ProjectMemberRepository;
import com.megumi.testops.project.repository.ProjectRepository;
import com.megumi.testops.shared.api.ApiException;

@Service
public class ProjectAccessService {
    private final UserRepository users;
    private final ProjectRepository projects;
    private final ProjectMemberRepository members;
    public ProjectAccessService(UserRepository users, ProjectRepository projects, ProjectMemberRepository members) { this.users = users; this.projects = projects; this.members = members; }

    @Transactional(readOnly = true)
    public UserEntity user(Jwt jwt) {
        if (jwt == null || jwt.getSubject() == null) throw error(HttpStatus.UNAUTHORIZED, "authentication_required", "Authentication is required");
        try { return users.findById(UUID.fromString(jwt.getSubject())).orElseThrow(() -> error(HttpStatus.UNAUTHORIZED, "user_not_found", "User was not found")); }
        catch (IllegalArgumentException ex) { throw error(HttpStatus.UNAUTHORIZED, "invalid_subject", "Authentication subject is invalid"); }
    }
    @Transactional(readOnly = true)
    public ProjectEntity project(UUID id) { return projects.findById(id).orElseThrow(() -> error(HttpStatus.NOT_FOUND, "project_not_found", "Project was not found")); }
    @Transactional(readOnly = true)
    public ProjectMemberEntity membership(ProjectEntity project, UserEntity user) {
        return members.findByProjectIdAndUserId(project.getId(), user.getId()).orElseThrow(() -> error(HttpStatus.FORBIDDEN, "project_access_denied", "You do not have access to this project"));
    }
    public boolean globalAdmin(Jwt jwt) { return jwt != null && hasRole(jwt, "ADMIN"); }
    public boolean globalManager(Jwt jwt) { return globalAdmin(jwt); }
    public boolean canView(ProjectEntity project, UserEntity user, Jwt jwt) {
        return globalAdmin(jwt) || members.findByProjectIdAndUserId(project.getId(), user.getId()).isPresent();
    }
    public void requireProjectRole(ProjectEntity project, UserEntity user, Jwt jwt, Set<String> roles) {
        if (globalAdmin(jwt)) return;
        if (!roles.contains(membership(project, user).getRole())) throw error(HttpStatus.FORBIDDEN, "project_role_required", "Your project role does not allow this operation");
    }
    private static boolean hasRole(Jwt jwt, String role) { Object claim = jwt.getClaim("roles"); return claim instanceof java.util.Collection<?> c && c.contains(role); }
    private static ApiException error(HttpStatus status, String code, String message) { return new ApiException(status, code, message); }
}
