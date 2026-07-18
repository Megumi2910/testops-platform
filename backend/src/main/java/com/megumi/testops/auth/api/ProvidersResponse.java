package com.megumi.testops.auth.api;

public record ProvidersResponse(boolean enabled, boolean registrationEnabled,
        boolean emailVerificationEnabled, boolean googleEnabled) {
}
