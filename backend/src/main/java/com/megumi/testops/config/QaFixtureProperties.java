package com.megumi.testops.config;

import java.nio.file.Path;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("testops.qa-fixtures")
public record QaFixtureProperties(boolean enabled, Path passwordPath, String targetOrigin) {
    public QaFixtureProperties {
        if (enabled && passwordPath == null) {
            throw new IllegalArgumentException("QA fixture password path is required");
        }
        if (enabled && (targetOrigin == null || targetOrigin.isBlank())) {
            throw new IllegalArgumentException("QA fixture target origin is required");
        }
    }
}
