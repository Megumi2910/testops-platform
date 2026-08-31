package com.megumi.testops.execution.runner;

import java.io.IOException;
import java.nio.channels.SeekableByteChannel;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;

import org.springframework.stereotype.Component;

/** Removes temporary or rolled-back evidence without hiding cleanup failures. */
@Component
public class EvidenceFileCleaner {
    public void delete(Path file) {
        if (file == null) return;
        try {
            Files.deleteIfExists(file);
            return;
        } catch (IOException firstFailure) {
            try {
                // If unlinking is temporarily unavailable, erase regular-file
                // contents before one final delete attempt. A remaining path is
                // still surfaced as a hard failure instead of being ignored.
                if (Files.isRegularFile(file)) {
                    try (SeekableByteChannel ignored = Files.newByteChannel(file,
                            StandardOpenOption.WRITE, StandardOpenOption.TRUNCATE_EXISTING)) {
                        // Opening with TRUNCATE_EXISTING is the sanitization step.
                    }
                }
                Files.deleteIfExists(file);
                if (Files.exists(file)) throw new IOException("Evidence path still exists after cleanup");
            } catch (IOException retryFailure) {
                firstFailure.addSuppressed(retryFailure);
                throw new IllegalStateException("Unable to remove temporary execution evidence", firstFailure);
            }
        }
    }
}
