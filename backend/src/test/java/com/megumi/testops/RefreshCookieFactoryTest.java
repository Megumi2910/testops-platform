package com.megumi.testops;

import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;

import org.junit.jupiter.api.Test;

import com.megumi.testops.auth.config.AuthProperties;
import com.megumi.testops.auth.service.RefreshCookieFactory;

class RefreshCookieFactoryTest {

    @Test
    void createsHttpOnlyCookieAndClearsItWithSameContract() {
        AuthProperties.Cookie properties = new AuthProperties.Cookie("testops_refresh", true, "Lax",
                "/api/v1/auth", Duration.ofDays(14));
        RefreshCookieFactory factory = new RefreshCookieFactory(properties);

        String created = factory.create("opaque-token").toString();
        String cleared = factory.clear().toString();

        assertTrue(created.contains("testops_refresh=opaque-token"));
        assertTrue(created.contains("HttpOnly"));
        assertTrue(created.contains("Secure"));
        assertTrue(created.contains("Path=/api/v1/auth"));
        assertTrue(cleared.contains("testops_refresh="));
        assertTrue(cleared.contains("Max-Age=0"));
    }
}
