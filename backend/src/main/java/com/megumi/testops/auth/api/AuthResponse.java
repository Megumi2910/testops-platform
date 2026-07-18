package com.megumi.testops.auth.api;

public record AuthResponse(String accessToken, long expiresInSeconds, UserSummaryResponse user) {
}
