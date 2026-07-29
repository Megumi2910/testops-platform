package com.megumi.testops;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.nio.file.Path;
import java.time.Duration;
import java.util.List;

import com.megumi.testops.config.PlatformProperties;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

class PlatformPropertiesTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withUserConfiguration(BindingConfiguration.class);

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
                new PlatformProperties.Artifact(Path.of("./artifacts"), 0),
                new PlatformProperties.Target(List.of("https://staging-shop.example.com"), false, "host.docker.internal")));
    }

    @Test
    void rejectsUnsupportedBrowser() {
        assertThrows(IllegalArgumentException.class, () -> new PlatformProperties.Execution(
                1, 20, Duration.ofSeconds(2), Duration.ofSeconds(15), Duration.ofMinutes(2),
                Duration.ofMinutes(15), Duration.ofSeconds(15), "firefox", true));
    }

    @Test
    void rejectsInvalidTargetOrigin() {
        assertThrows(IllegalArgumentException.class, () -> new PlatformProperties.Target(List.of("file:///secret"), false, "host.docker.internal"));
    }

    @Test
    void rejectsTargetOriginWithCredentialsOrPath() {
        assertThrows(IllegalArgumentException.class,
                () -> new PlatformProperties.Target(List.of("https://user:secret@example.com/shop"), false, "host.docker.internal"));
    }

    @Test
    void rejectsBlankArtifactDirectory() {
        assertThrows(IllegalArgumentException.class,
                () -> new PlatformProperties.Artifact(Path.of(""), 0));
    }

    @Test
    void rejectsNegativeArtifactRetention() {
        assertThrows(IllegalArgumentException.class,
                () -> new PlatformProperties.Artifact(Path.of("./artifacts"), -1));
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

    @Test
    void bindsArtifactWithDefaultRetentionWhenRetentionIsOmitted() {
        contextRunner.withPropertyValues(
                "testops.execution.worker-count=1",
                "testops.execution.queue-capacity=20",
                "testops.execution.claim-interval=2s",
                "testops.execution.heartbeat-interval=15s",
                "testops.execution.stale-after=2m",
                "testops.execution.max-duration=15m",
                "testops.execution.default-step-timeout=15s",
                "testops.execution.browser=chromium",
                "testops.execution.worker-enabled=true",
                "testops.artifact.directory=./artifacts",
                "testops.target.allowed-origins[0]=https://staging-shop.example.com")
                .run(context -> {
                    PlatformProperties properties = context.getBean(PlatformProperties.class);
                    assertDoesNotThrow(() -> properties.artifact());
                    org.junit.jupiter.api.Assertions.assertEquals(0, properties.artifact().retentionDays());
                });
    }

    @Test
    void bindsExplicitArtifactRetention() {
        contextRunner.withPropertyValues(
                "testops.execution.worker-count=1",
                "testops.execution.queue-capacity=20",
                "testops.execution.claim-interval=2s",
                "testops.execution.heartbeat-interval=15s",
                "testops.execution.stale-after=2m",
                "testops.execution.max-duration=15m",
                "testops.execution.default-step-timeout=15s",
                "testops.execution.browser=chromium",
                "testops.execution.worker-enabled=true",
                "testops.artifact.directory=./artifacts",
                "testops.artifact.retention-days=7",
                "testops.target.allowed-origins[0]=https://staging-shop.example.com")
                .run(context -> org.junit.jupiter.api.Assertions.assertEquals(7,
                        context.getBean(PlatformProperties.class).artifact().retentionDays()));
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(PlatformProperties.class)
    static class BindingConfiguration { }
}
