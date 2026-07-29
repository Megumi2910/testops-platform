package com.megumi.testops.auth.service;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.megumi.testops.auth.api.AdminUserDtos;
import com.megumi.testops.auth.domain.PlatformRole;
import com.megumi.testops.auth.domain.UserEntity;
import com.megumi.testops.auth.repository.UserRepository;
import com.megumi.testops.shared.api.ApiException;
import com.megumi.testops.shared.api.PageResponse;

@Service
@ConditionalOnBean(AuthService.class)
public class AdminUserService {
    private final UserRepository users;
    private final AuthService auth;
    private final Clock clock;

    public AdminUserService(UserRepository users, AuthService auth, Clock clock) { this.users = users; this.auth = auth; this.clock = clock; }

    @Transactional(readOnly = true)
    public PageResponse<AdminUserDtos.UserResponse> list(String query, int page, int size) {
        int boundedSize = Math.min(Math.max(size, 1), 100); int boundedPage = Math.max(page, 0);
        org.springframework.data.domain.PageRequest request = org.springframework.data.domain.PageRequest.of(boundedPage, boundedSize, org.springframework.data.domain.Sort.by("email"));
        org.springframework.data.domain.Page<UserEntity> result = query == null || query.isBlank()
                ? users.findAll(request)
                : users.findByEmailContainingIgnoreCaseOrDisplayNameContainingIgnoreCase(query.trim(), query.trim(), request);
        return new PageResponse<>(result.getContent().stream().map(AdminUserService::response).toList(), result.getNumber(), result.getSize(), result.getTotalElements(), result.getTotalPages());
    }

    @Transactional
    public AdminUserDtos.UserResponse role(UUID id, String value) {
        UserEntity user = find(id); PlatformRole role;
        try { role = PlatformRole.valueOf(value == null ? "" : value.trim().toUpperCase(Locale.ROOT)); } catch (IllegalArgumentException ex) { throw error(HttpStatus.BAD_REQUEST, "invalid_platform_role", "Platform role must be ADMIN or MEMBER"); }
        if (user.getPlatformRole() == PlatformRole.ADMIN && role != PlatformRole.ADMIN && users.countByPlatformRole(PlatformRole.ADMIN) <= 1) throw error(HttpStatus.CONFLICT, "final_admin", "The final administrator cannot be demoted");
        user.setPlatformRole(role);
        user.incrementTokenVersion(Instant.now(clock));
        auth.revokeAllSessions(id, null, null);
        return response(user);
    }

    @Transactional
    public AdminUserDtos.UserResponse status(UUID id, String value) {
        UserEntity user = find(id); String status = value == null ? "" : value.trim().toUpperCase(Locale.ROOT);
        if (!java.util.Set.of("ACTIVE", "LOCKED", "DISABLED").contains(status)) throw error(HttpStatus.BAD_REQUEST, "invalid_account_status", "Status must be ACTIVE, LOCKED, or DISABLED");
        if (user.getPlatformRole() == PlatformRole.ADMIN && !"ACTIVE".equals(status) && users.countByPlatformRole(PlatformRole.ADMIN) <= 1) throw error(HttpStatus.CONFLICT, "final_admin", "The final administrator cannot be disabled");
        user.setStatus(status, Instant.now(clock)); if (!"ACTIVE".equals(status)) auth.revokeAllSessions(id, null, null); return response(user);
    }

    private UserEntity find(UUID id) { return users.findById(id).orElseThrow(() -> error(HttpStatus.NOT_FOUND, "user_not_found", "User was not found")); }
    private static AdminUserDtos.UserResponse response(UserEntity u) { return new AdminUserDtos.UserResponse(u.getId(), u.getEmail(), u.getDisplayName(), u.getStatus(), u.getPlatformRole().name(), u.isEmailVerified(), u.getCreatedAt(), u.getLastLoginAt()); }
    private static ApiException error(HttpStatus status, String code, String message) { return new ApiException(status, code, message); }
}
