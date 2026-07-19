package com.megumi.testops;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.nio.file.Path;
import java.time.Duration;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import com.megumi.testops.auth.config.AuthProperties;
import com.megumi.testops.auth.service.AuthException;
import com.megumi.testops.auth.service.OriginGuard;

class OriginGuardTest {

    private final OriginGuard guard = new OriginGuard(properties());

    @Test
    void acceptsMatchingOrigin() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("Origin", "http://localhost:3000");

        assertDoesNotThrow(() -> guard.requireSameOrigin(request));
    }

    @Test
    void rejectsMismatchedOrigin() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("Origin", "https://evil.example");

        assertThrows(AuthException.class, () -> guard.requireSameOrigin(request));
    }

    @Test
    void fallsBackToMatchingRefererWhenOriginIsAbsent() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("Referer", "http://localhost:3000/login");

        assertDoesNotThrow(() -> guard.requireSameOrigin(request));
    }

    private static AuthProperties properties() {
        return new AuthProperties(false, false,
                new AuthProperties.Jwt(Path.of("private.pem"), Path.of("public.pem"), "issuer", "audience", "kid",
                        Duration.ofMinutes(10), Duration.ofSeconds(30)),
                new AuthProperties.Cookie("refresh", false, "Lax", "/api/v1/auth", Duration.ofDays(14)),
                new AuthProperties.Email(false, Path.of("pepper"), Duration.ofMinutes(10), Duration.ofMinutes(1), 5, 5,
                        "", "TestOps"),
                new AuthProperties.Google(false, "", "", "http://localhost:3000/login/oauth2/code/google"),
                "http://localhost:3000",
                new AuthProperties.Bootstrap(false, null, null, Path.of("password")),
                new AuthProperties.Limits(5, Duration.ofMinutes(15), 30, 5, Duration.ofHours(1), 30,
                        Duration.ofMinutes(1), 5, Duration.ofHours(1)));
    }
}
