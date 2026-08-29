package com.megumi.testops;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.nio.file.Path;
import java.time.Duration;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.megumi.testops.config.PlatformProperties;
import com.megumi.testops.project.repository.ProjectRepository;
import com.megumi.testops.project.repository.TargetOriginRepository;
import com.megumi.testops.project.service.ProjectTargetPolicy;
import com.megumi.testops.project.service.TargetOriginNormalizer;
import com.megumi.testops.project.service.TargetOriginRegistry;
import com.megumi.testops.shared.api.ApiException;

class ProjectTargetPolicyTest {
    private final PlatformProperties properties = new PlatformProperties(
            new PlatformProperties.Execution(1, 10, Duration.ofSeconds(1), Duration.ofSeconds(5), Duration.ofMinutes(1), Duration.ofMinutes(5), Duration.ofSeconds(10), "chromium", true),
            new PlatformProperties.Artifact(Path.of("artifacts"), 0), new PlatformProperties.Target(List.of("https://shop.example.test", "http://localhost:8080"), false, "host.docker.internal"));

    @Test void acceptsConfiguredOriginAndNormalizesTrailingSlash() { assertEquals("https://shop.example.test", policy().validate("https://SHOP.example.test/")); }
    @Test void canonicalizesDefaultPortsAndRejectsCredentialsAndUnsafeLiteralAddresses() { ProjectTargetPolicy policy = policy(); assertEquals("https://shop.example.test", policy.normalize("https://SHOP.example.test:443/")); assertThrows(ApiException.class, () -> policy.validate("https://user:pass@shop.example.test")); assertThrows(ApiException.class, () -> policy.validate("http://127.0.0.1")); }
    @Test void rejectsOriginOutsideAllowlist() { assertThrows(ApiException.class, () -> policy().validate("https://other.example.test")); }

    private ProjectTargetPolicy policy() {
        TargetOriginRepository origins = org.mockito.Mockito.mock(TargetOriginRepository.class);
        ProjectRepository projects = org.mockito.Mockito.mock(ProjectRepository.class);
        TargetOriginNormalizer normalizer = new TargetOriginNormalizer(properties);
        return new ProjectTargetPolicy(normalizer, new TargetOriginRegistry(properties, origins, projects, normalizer));
    }
}
