package com.megumi.testops;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.nio.file.Path;
import java.time.Duration;
import java.util.List;

import com.megumi.testops.config.PlatformProperties;
import org.junit.jupiter.api.Test;

class PlatformPropertiesTest {

    private static PlatformProperties.Execution validExecution() {
        return new PlatformProperties.Execution(
                1,
                20,
                Duration.ofSeconds(2),
                Duration.ofSeconds(15),
                Duration.ofMinutes(2),
                Duration.ofMinutes(15),
                Duration.ofSeconds(15),
                "chromium", true);
    }

    @Test
    void acceptsMilestoneOneDefaults() {
        assertDoesNotThrow(() -> new PlatformProperties(
                validExecution(),
                new PlatformProperties.Artifact(Path.of("./artifacts")),
                new PlatformProperties.Target(List.of("https://staging-shop.example.com"))));
    }

    @Test
    void rejectsUnsupportedBrowser() {
        assertThrows(IllegalArgumentException.class, () -> new PlatformProperties.Execution(
                1, 20, Duration.ofSeconds(2), Duration.ofSeconds(15), Duration.ofMinutes(2),
                Duration.ofMinutes(15), Duration.ofSeconds(15), "firefox", true));
    }

    @Test
    void rejectsInvalidTargetOrigin() {
        assertThrows(IllegalArgumentException.class, () -> new PlatformProperties.Target(List.of("file:///secret")));
    }

    @Test
    void rejectsTargetOriginWithCredentialsOrPath() {
        assertThrows(IllegalArgumentException.class,
                () -> new PlatformProperties.Target(List.of("https://user:secret@example.com/shop")));
    }

    @Test
    void rejectsBlankArtifactDirectory() {
        assertThrows(IllegalArgumentException.class,
                () -> new PlatformProperties.Artifact(Path.of("")));
    }

    @Test
    void rejectsNonPositiveDuration() {
        assertThrows(IllegalArgumentException.class, () -> new PlatformProperties.Execution(
                1, 20, Duration.ZERO, Duration.ofSeconds(15), Duration.ofMinutes(2),
                Duration.ofMinutes(15), Duration.ofSeconds(15), "chromium", true));
    }

    @Test
    void rejectsNonPositiveQueueSettings() {
        assertThrows(IllegalArgumentException.class, () -> new PlatformProperties.Execution(
                0, 20, Duration.ofSeconds(2), Duration.ofSeconds(15), Duration.ofMinutes(2),
                Duration.ofMinutes(15), Duration.ofSeconds(15), "chromium", true));
    }
}
