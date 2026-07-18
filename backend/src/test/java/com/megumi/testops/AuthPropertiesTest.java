package com.megumi.testops;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.nio.file.Path;
import java.time.Duration;

import org.junit.jupiter.api.Test;

import com.megumi.testops.auth.config.AuthProperties;

class AuthPropertiesTest {

    private static AuthProperties valid(boolean enabled) {
        return new AuthProperties(enabled, true,
                new AuthProperties.Jwt(Path.of("private.pem"), Path.of("public.pem"), "issuer", "audience", "kid",
                        Duration.ofMinutes(10), Duration.ofSeconds(30)),
                new AuthProperties.Cookie("refresh", false, "Lax", "/api/v1/auth", Duration.ofDays(14)),
                new AuthProperties.Email(false, Path.of("pepper"), Duration.ofMinutes(10), Duration.ofMinutes(1), 5, 5,
                        new AuthProperties.Mail("", 587, "", "", "", "TestOps", true, true,
                                Duration.ofSeconds(5), Duration.ofSeconds(5), Duration.ofSeconds(5))),
                new AuthProperties.Google(false, "", "", "http://localhost:3000/login/oauth2/code/google"),
                new AuthProperties.Bootstrap(null, null, null),
                new AuthProperties.Limits(5, Duration.ofMinutes(15), 30, 5, Duration.ofHours(1), 30,
                        Duration.ofMinutes(1), 5, Duration.ofMinutes(15)));
    }

    @Test
    void acceptsDisabledDefaults() {
        assertDoesNotThrow(() -> valid(false));
    }

    @Test
    void rejectsRegistrationWithoutEmailDelivery() {
        assertThrows(IllegalArgumentException.class, () -> valid(true));
    }

    @Test
    void rejectsNonFiveOtpAttempts() {
        assertThrows(IllegalArgumentException.class, () -> new AuthProperties.Email(false, Path.of("pepper"),
                Duration.ofMinutes(10), Duration.ofMinutes(1), 4, 5,
                new AuthProperties.Mail("", 587, "", "", "", "TestOps", true, true,
                        Duration.ofSeconds(5), Duration.ofSeconds(5), Duration.ofSeconds(5))));
    }
}
