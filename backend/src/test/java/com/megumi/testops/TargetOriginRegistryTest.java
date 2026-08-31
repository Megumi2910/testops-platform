package com.megumi.testops;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.megumi.testops.auth.domain.UserEntity;
import com.megumi.testops.config.PlatformProperties;
import com.megumi.testops.project.domain.TargetOriginEntity;
import com.megumi.testops.project.repository.ProjectRepository;
import com.megumi.testops.project.repository.TargetOriginRepository;
import com.megumi.testops.project.service.TargetOriginNormalizer;
import com.megumi.testops.project.service.TargetOriginRegistry;
import com.megumi.testops.shared.api.ApiException;

class TargetOriginRegistryTest {
    private final PlatformProperties properties = new PlatformProperties(
            new PlatformProperties.Execution(1, 10, Duration.ofSeconds(1), Duration.ofSeconds(5), Duration.ofMinutes(1), Duration.ofMinutes(5), Duration.ofSeconds(10), "chromium", true),
            new PlatformProperties.Artifact(Path.of("artifacts"), 0), new PlatformProperties.Target(List.of("https://env.example.test"), false, "host.docker.internal"));
    private final TargetOriginRepository origins = mock(TargetOriginRepository.class);
    private final ProjectRepository projects = mock(ProjectRepository.class);
    private final TargetOriginNormalizer normalizer = new TargetOriginNormalizer(properties);
    private final TargetOriginRegistry registry = new TargetOriginRegistry(properties, origins, projects, normalizer);

    @Test
    void environmentOriginsRemainEnabledAndReadOnly() {
        when(projects.countByTargetOrigin("https://env.example.test")).thenReturn(2L);

        var option = registry.enabledOptions().getFirst();

        assertEquals("ENVIRONMENT", option.source());
        assertTrue(option.enabled());
        assertTrue(option.usable());
        assertEquals(2, option.usageCount());
    }

    @Test
    void rejectsCanonicalDuplicateOfEnvironmentOrigin() {
        ApiException error = assertThrows(ApiException.class,
                () -> registry.create(user(), "https://ENV.example.test:443/"));

        assertEquals("target_origin_exists", error.getCode());
    }

    @Test
    void disabledAdminOriginIsExcludedFromEnabledOptionsImmediately() {
        TargetOriginEntity origin = new TargetOriginEntity("https://staging.example.test", user(), Instant.now());
        when(origins.findById(origin.getId())).thenReturn(Optional.of(origin));
        when(origins.saveAndFlush(origin)).thenReturn(origin);
        when(origins.findAllByOrderByOriginAsc()).thenReturn(List.of(origin));

        registry.setEnabled(origin.getId(), false, origin.getVersion());

        assertFalse(registry.isEnabled("https://staging.example.test"));
        assertTrue(registry.enabledOptions().stream().noneMatch(item -> item.origin().equals("https://staging.example.test")));
    }

    @Test
    void staleEnableRequestIsRejectedBeforeMutation() {
        TargetOriginEntity origin = mock(TargetOriginEntity.class);
        UUID id = UUID.randomUUID();
        when(origin.getVersion()).thenReturn(2L);
        when(origins.findById(id)).thenReturn(Optional.of(origin));

        ApiException error = assertThrows(ApiException.class, () -> registry.setEnabled(id, false, 1L));

        assertEquals("stale_version", error.getCode());
    }

    private static UserEntity user() {
        return new UserEntity("admin@example.test", "Admin", "ACTIVE", true, Instant.now());
    }
}
