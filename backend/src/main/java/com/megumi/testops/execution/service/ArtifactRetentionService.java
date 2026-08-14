package com.megumi.testops.execution.service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.megumi.testops.config.PlatformProperties;
import com.megumi.testops.execution.domain.ExecutionArtifactEntity;
import com.megumi.testops.execution.repository.ExecutionArtifactRepository;
import com.megumi.testops.execution.runner.ArtifactWriter;

@Service
public class ArtifactRetentionService {
    private final PlatformProperties properties;
    private final ExecutionArtifactRepository artifacts;
    private final ArtifactWriter writer;
    public ArtifactRetentionService(PlatformProperties properties, ExecutionArtifactRepository artifacts, ArtifactWriter writer) { this.properties = properties; this.artifacts = artifacts; this.writer = writer; }

    @Scheduled(cron = "0 15 2 * * *")
    @Transactional
    public void purgeExpired() {
        int days = properties.artifact().retentionDays();
        if (days == 0) return;
        Instant cutoff = Instant.now().minus(java.time.Duration.ofDays(days));
        for (ExecutionArtifactEntity artifact : artifacts.findByCreatedAtBeforeAndPurgedAtIsNull(cutoff)) {
            try { Files.deleteIfExists(writer.resolve(artifact.getRelativePath())); } catch (RuntimeException | java.io.IOException ignored) { }
            artifact.markPurged(Instant.now(), "RETENTION_POLICY");
            artifacts.save(artifact);
        }
    }
}
