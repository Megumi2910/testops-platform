package com.megumi.testops.auth.api;

import java.util.Set;
import java.util.UUID;

public record UserSummaryResponse(UUID id, String email, String displayName,
        boolean emailVerified, Set<String> roles) {
}
