package com.megumi.testops.execution.runner;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.megumi.testops.config.PlatformProperties;
import com.megumi.testops.execution.domain.ExecutionArtifactEntity;
import com.megumi.testops.execution.domain.ExecutionEntity;
import com.megumi.testops.execution.domain.TestCaseResultEntity;
import com.megumi.testops.execution.repository.ExecutionArtifactRepository;

class ArtifactWriterTest {
    @TempDir Path artifactRoot;

    @Test
    void removesDestinationWhenArtifactMetadataCannotBeSaved() throws Exception {
        ExecutionArtifactRepository artifacts = mock(ExecutionArtifactRepository.class);
        when(artifacts.save(any(ExecutionArtifactEntity.class))).thenThrow(new IllegalStateException("database down"));
        ArtifactWriter writer = new ArtifactWriter(properties(artifactRoot), artifacts, new EvidenceFileCleaner());
        ExecutionEntity execution = mock(ExecutionEntity.class);
        TestCaseResultEntity result = mock(TestCaseResultEntity.class);
        when(execution.getId()).thenReturn(UUID.randomUUID());
        when(result.getId()).thenReturn(UUID.randomUUID());

        assertThrows(IllegalStateException.class,
                () -> writer.writeScreenshot(execution, result, 1, new byte[] { 1, 2, 3 }));

        try (var files = Files.walk(artifactRoot)) {
            org.assertj.core.api.Assertions.assertThat(files.filter(Files::isRegularFile).toList()).isEmpty();
        }
    }

    @Test
    void removesDestinationWhenTheOwningTransactionRollsBackLater() throws Exception {
        ExecutionArtifactRepository artifacts = mock(ExecutionArtifactRepository.class);
        ArtifactWriter writer = new ArtifactWriter(properties(artifactRoot), artifacts, new EvidenceFileCleaner());
        ExecutionEntity execution = mock(ExecutionEntity.class);
        TestCaseResultEntity result = mock(TestCaseResultEntity.class);
        when(execution.getId()).thenReturn(UUID.randomUUID());
        when(result.getId()).thenReturn(UUID.randomUUID());

        TransactionSynchronizationManager.initSynchronization();
        try {
            writer.writeScreenshot(execution, result, 1, new byte[] { 1, 2, 3 });
            Path destination;
            try (var files = Files.walk(artifactRoot)) {
                destination = files.filter(Files::isRegularFile).findFirst().orElseThrow();
            }
            assertTrue(Files.exists(destination));

            for (var synchronization : TransactionSynchronizationManager.getSynchronizations()) {
                synchronization.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK);
            }

            assertFalse(Files.exists(destination));
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    private static PlatformProperties properties(Path root) {
        return new PlatformProperties(
                new PlatformProperties.Execution(1, 10, Duration.ofSeconds(1), Duration.ofSeconds(1),
                        Duration.ofMinutes(1), Duration.ofMinutes(5), Duration.ofSeconds(5), "chromium", true),
                new PlatformProperties.Artifact(root, 0),
                new PlatformProperties.Target(List.of("https://target.example.test"), false,
                        "host.docker.internal"));
    }
}
