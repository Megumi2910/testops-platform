package com.megumi.testops.auth.api;

import java.util.Set;
import java.util.UUID;

public record UserSummaryResponse(UUID id, String email, String displayName,
        String avatarUrl, boolean emailVerified, String status, String platformRole, Set<String> loginMethods) {
}
