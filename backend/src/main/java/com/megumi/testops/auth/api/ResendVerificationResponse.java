package com.megumi.testops.auth.api;

import java.time.Instant;

public record ResendVerificationResponse(
        String message,
        Instant nextResendAt,
        long retryAfterSeconds) {
}
