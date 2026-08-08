package com.megumi.testops.execution.runner;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Set;


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
        var secretStep = new PlaywrightCaseRunner.StepDefinition(1, "FILL", "LABEL", "Password", null, "${PASSWORD}", null, null);
        var ordinaryStep = new PlaywrightCaseRunner.StepDefinition(2, "FILL", "LABEL", "Search", null, "${SEARCH_TERM}", null, null);

        assertTrue(PlaywrightCaseRunner.referencesSecret(secretStep, Set.of("PASSWORD")));
        assertFalse(PlaywrightCaseRunner.referencesSecret(ordinaryStep, Set.of("PASSWORD")));
    }
}
