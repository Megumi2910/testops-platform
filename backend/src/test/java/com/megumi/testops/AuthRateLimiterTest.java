package com.megumi.testops;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.time.Duration;

import org.junit.jupiter.api.Test;

import com.megumi.testops.auth.config.AuthProperties;
import com.megumi.testops.auth.service.AuthRateLimiter;
import com.megumi.testops.auth.service.AuthException;

class AuthRateLimiterTest {

    @Test
    void enforcesBoundedAttemptLimit() {
        AuthProperties.Limits limits = new AuthProperties.Limits(5, Duration.ofMinutes(15), 30, 5,
                Duration.ofHours(1), 30, Duration.ofMinutes(1), 2, Duration.ofHours(1));
        AuthRateLimiter limiter = new AuthRateLimiter(limits);

        assertDoesNotThrow(() -> limiter.check("otp", "192.0.2.1", 2, Duration.ofHours(1)));
        assertDoesNotThrow(() -> limiter.check("otp", "192.0.2.1", 2, Duration.ofHours(1)));
        assertThrows(AuthException.class, () -> limiter.check("otp", "192.0.2.1", 2, Duration.ofHours(1)));
    }
}
