package com.megumi.testops.execution.runner;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class EvidenceFileCleanerTest {
    @TempDir Path temporaryDirectory;
    private final EvidenceFileCleaner cleaner = new EvidenceFileCleaner();

    @Test
    void deletesTemporaryEvidence() throws Exception {
        Path trace = Files.write(temporaryDirectory.resolve("trace.zip"), new byte[] { 1, 2, 3 });

        cleaner.delete(trace);

        assertFalse(Files.exists(trace));
    }

    @Test
    void surfacesCleanupFailureInsteadOfIgnoringIt() throws Exception {
        Path nonEmptyDirectory = Files.createDirectory(temporaryDirectory.resolve("trace.zip"));
        Files.write(nonEmptyDirectory.resolve("payload"), new byte[] { 1 });

        assertThrows(IllegalStateException.class, () -> cleaner.delete(nonEmptyDirectory));
    }
}
