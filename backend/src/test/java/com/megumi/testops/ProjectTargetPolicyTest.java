package com.megumi.testops;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.nio.file.Path;
import java.time.Duration;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.megumi.testops.config.PlatformProperties;
import com.megumi.testops.project.service.ProjectTargetPolicy;
import com.megumi.testops.shared.api.ApiException;

class ProjectTargetPolicyTest {
    private final PlatformProperties properties = new PlatformProperties(
            new PlatformProperties.Execution(1, 10, Duration.ofSeconds(1), Duration.ofSeconds(5), Duration.ofMinutes(1), Duration.ofMinutes(5), Duration.ofSeconds(10), "chromium"),
            new PlatformProperties.Artifact(Path.of("artifacts")), new PlatformProperties.Target(List.of("https://shop.example.test", "http://localhost:8080")));

    @Test void acceptsConfiguredOriginAndNormalizesTrailingSlash() { assertEquals("https://shop.example.test", new ProjectTargetPolicy(properties).validate("https://SHOP.example.test/")); }
    @Test void rejectsCredentialsAndUnsafeLiteralAddresses() { ProjectTargetPolicy policy = new ProjectTargetPolicy(properties); assertThrows(ApiException.class, () -> policy.validate("https://user:pass@shop.example.test")); assertThrows(ApiException.class, () -> policy.validate("http://127.0.0.1")); }
    @Test void rejectsOriginOutsideAllowlist() { assertThrows(ApiException.class, () -> new ProjectTargetPolicy(properties).validate("https://other.example.test")); }
}
