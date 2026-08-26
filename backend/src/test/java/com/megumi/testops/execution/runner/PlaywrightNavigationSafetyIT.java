package com.megumi.testops.execution.runner;

import static org.junit.jupiter.api.Assertions.assertThrows;

import java.nio.file.Path;
import java.time.Duration;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.megumi.testops.config.PlatformProperties;
import com.megumi.testops.project.service.ProjectTargetPolicy;
import com.megumi.testops.shared.api.ApiException;

/** Runner guard contract: cross-origin navigation is rejected before the browser sends it. */
class PlaywrightNavigationSafetyIT {
    @Test
    void crossOriginNavigationIsRejectedBeforeSend() {
        PlatformProperties properties = new PlatformProperties(
                new PlatformProperties.Execution(1, 10, Duration.ofSeconds(1), Duration.ofSeconds(1), Duration.ofMinutes(1), Duration.ofMinutes(5), Duration.ofSeconds(5), "chromium", true),
                new PlatformProperties.Artifact(Path.of("target/artifacts"), 0),
                new PlatformProperties.Target(List.of("https://target.example.test"), false, "host.docker.internal"));
        ExecutionTargetGuard guard = new ExecutionTargetGuard(properties, new ProjectTargetPolicy(properties));

        assertThrows(ApiException.class, () -> guard.resolve("https://target.example.test", "https://evil.example.test/submit"));
    }
}
