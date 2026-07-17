package com.megumi.testops.config;

import java.net.URI;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Objects;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "testops")
public record PlatformProperties(Execution execution, Artifact artifact, Target target) {

    public PlatformProperties {
        Objects.requireNonNull(execution, "execution properties are required");
        Objects.requireNonNull(artifact, "artifact properties are required");
        Objects.requireNonNull(target, "target properties are required");
    }

    public record Execution(
            int workerCount,
            int queueCapacity,
            Duration claimInterval,
            Duration heartbeatInterval,
            Duration staleAfter,
            Duration maxDuration,
            Duration defaultStepTimeout,
            String browser) {

        public Execution {
            if (workerCount < 1) {
                throw new IllegalArgumentException("worker-count must be at least 1");
            }
            if (queueCapacity < 1) {
                throw new IllegalArgumentException("queue-capacity must be at least 1");
            }
            requirePositive(claimInterval, "claim-interval");
            requirePositive(heartbeatInterval, "heartbeat-interval");
            requirePositive(staleAfter, "stale-after");
            requirePositive(maxDuration, "max-duration");
            requirePositive(defaultStepTimeout, "default-step-timeout");
            if (!"chromium".equals(browser)) {
                throw new IllegalArgumentException("browser must be chromium in Milestone 1");
            }
        }

        private static void requirePositive(Duration value, String name) {
            if (value == null || value.isZero() || value.isNegative()) {
                throw new IllegalArgumentException(name + " must be positive");
            }
        }
    }

    public record Artifact(Path directory) {
        public Artifact {
            Objects.requireNonNull(directory, "artifact directory is required");
            if (directory.toString().isBlank()) {
                throw new IllegalArgumentException("artifact directory must not be blank");
            }
        }
    }

    public record Target(List<String> allowedOrigins) {
        public Target {
            allowedOrigins = allowedOrigins == null ? List.of() : List.copyOf(allowedOrigins);
            allowedOrigins.forEach(Target::validateOrigin);
        }

        private static void validateOrigin(String origin) {
            if (origin == null || origin.isBlank()) {
                throw new IllegalArgumentException("target origins cannot be blank");
            }
            URI uri;
            try {
                uri = URI.create(origin.trim());
            } catch (IllegalArgumentException exception) {
                throw new IllegalArgumentException("target origin is not a valid URI: " + origin, exception);
            }
            if (!("https".equalsIgnoreCase(uri.getScheme()) || "http".equalsIgnoreCase(uri.getScheme()))
                    || uri.getHost() == null
                    || uri.getUserInfo() != null
                    || uri.getQuery() != null
                    || uri.getFragment() != null
                    || (uri.getPath() != null && !uri.getPath().isEmpty() && !"/".equals(uri.getPath()))) {
                throw new IllegalArgumentException("target origin must be an HTTP(S) origin: " + origin);
            }
        }
    }
}
