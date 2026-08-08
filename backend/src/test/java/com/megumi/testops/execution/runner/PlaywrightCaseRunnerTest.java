package com.megumi.testops.execution.runner;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Set;

import com.megumi.testops.auth.domain.UserEntity;
import com.megumi.testops.project.domain.ProjectEntity;
import com.megumi.testops.project.domain.TestCaseEntity;
import com.megumi.testops.project.domain.TestStepEntity;
import com.megumi.testops.project.domain.TestSuiteEntity;

import org.junit.jupiter.api.Test;

class PlaywrightCaseRunnerTest {
    @Test
    void sanitizesCredentialLikeValuesFromFailureMessages() {
        String message = PlaywrightCaseRunner.sanitizeMessage(
                new IllegalStateException("login failed password=super-secret token=abc123 secret=hidden"));

        assertEquals("login failed password=[REDACTED] token=[REDACTED] secret=[REDACTED]", message);
        assertFalse(message.contains("super-secret"));
        assertFalse(message.contains("abc123"));
        assertFalse(message.contains("hidden"));
    }

    @Test
    void detectsSecretReferencesOnlyForConfiguredSecretKeys() {
        var now = java.time.Instant.now();
        var user = new UserEntity("runner@example.test", "Runner", "ACTIVE", true, now);
        var project = new ProjectEntity("Project", null, "https://target.example.test", user, now);
        var suite = new TestSuiteEntity(project, "Suite", null, user, now);
        var testCase = new TestCaseEntity(suite, "Case", null, "READY", "HIGH", null, 0, false, user, now);
        var secretStep = new TestStepEntity(testCase, 1, "FILL", "LABEL", "Password", null, "${PASSWORD}", null, null, now);
        var ordinaryStep = new TestStepEntity(testCase, 2, "FILL", "LABEL", "Search", null, "${SEARCH_TERM}", null, null, now);

        assertTrue(PlaywrightCaseRunner.referencesSecret(secretStep, Set.of("PASSWORD")));
        assertFalse(PlaywrightCaseRunner.referencesSecret(ordinaryStep, Set.of("PASSWORD")));
    }
}
