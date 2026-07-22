package com.megumi.testops.config;

import java.nio.file.Path;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "testops.project")
public record ProjectProperties(boolean secretVariablesEnabled, Path variableKeyPath, int variableKeyVersion) {

    public ProjectProperties {
        if (variableKeyVersion < 1) {
            throw new IllegalArgumentException("project variable key version must be positive");
        }
        if (secretVariablesEnabled && (variableKeyPath == null || variableKeyPath.toString().isBlank())) {
            throw new IllegalArgumentException("PROJECT_VARIABLE_KEY_PATH is required when secret variables are enabled");
        }
    }
}
