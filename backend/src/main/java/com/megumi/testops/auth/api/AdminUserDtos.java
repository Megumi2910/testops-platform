package com.megumi.testops.auth.api;

import java.time.Instant;
import java.util.UUID;

public final class AdminUserDtos {
    private AdminUserDtos() { }
    public record UserResponse(UUID id, String email, String displayName, String status, String platformRole,
            boolean emailVerified, Instant createdAt, Instant lastLoginAt) { }
    public record RoleRequest(String platformRole) { }
    public record StatusRequest(String status) { }
}
