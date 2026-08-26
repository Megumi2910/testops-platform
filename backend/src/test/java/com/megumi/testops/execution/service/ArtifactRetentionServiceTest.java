package com.megumi.testops.execution.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.megumi.testops.config.PlatformProperties;
import com.megumi.testops.execution.domain.ExecutionArtifactEntity;
import com.megumi.testops.execution.repository.ExecutionArtifactRepository;
import com.megumi.testops.execution.runner.ArtifactWriter;

class ArtifactRetentionServiceTest {
    @TempDir Path root;

    @Test
    void purgesExpiredFilesAndMarksMetadata() throws Exception {
        ExecutionArtifactRepository artifacts = mock(ExecutionArtifactRepository.class);
        ArtifactWriter writer = mock(ArtifactWriter.class);
        Path file = Files.write(root.resolve("old.zip"), new byte[] { 1, 2, 3 });
        ExecutionArtifactEntity artifact = new ExecutionArtifactEntity(null, null, "TRACE", "old.zip",
                "application/zip", 3, "hash", false, Instant.now().minus(Duration.ofDays(3)));
        when(artifacts.findByCreatedAtBeforeAndPurgedAtIsNull(any(Instant.class))).thenReturn(List.of(artifact));
        when(writer.resolve("old.zip")).thenReturn(file);

        new ArtifactRetentionService(properties(2), artifacts, writer).purgeExpired();

        assertEquals(false, Files.exists(file));
        assertNotNull(artifact.getPurgedAt());
        assertEquals("RETENTION_POLICY", artifact.getPurgeReason());
        verify(artifacts).save(artifact);
    }

    @Test
    void recordsPurgeWhenDeletionNeedsAFileRetry() throws Exception {
        ExecutionArtifactRepository artifacts = mock(ExecutionArtifactRepository.class);
        ArtifactWriter writer = mock(ArtifactWriter.class);
        ExecutionArtifactEntity artifact = new ExecutionArtifactEntity(null, null, "TRACE", "missing.zip",
                "application/zip", 0, "hash", false, Instant.now().minus(Duration.ofDays(3)));
        when(artifacts.findByCreatedAtBeforeAndPurgedAtIsNull(any(Instant.class))).thenReturn(List.of(artifact));
        when(writer.resolve("missing.zip")).thenReturn(root.resolve("missing.zip"));

        new ArtifactRetentionService(properties(2), artifacts, writer).purgeExpired();

        assertNotNull(artifact.getPurgedAt());
        verify(artifacts).save(artifact);
    }

    private PlatformProperties properties(int retentionDays) {
        return new PlatformProperties(
                new PlatformProperties.Execution(1, 10, Duration.ofSeconds(1), Duration.ofSeconds(1), Duration.ofMinutes(1),
                        Duration.ofMinutes(5), Duration.ofSeconds(5), "chromium", true),
                new PlatformProperties.Artifact(root, retentionDays),
                new PlatformProperties.Target(List.of("https://target.example.test"), false, "host.docker.internal"));
    }
}
