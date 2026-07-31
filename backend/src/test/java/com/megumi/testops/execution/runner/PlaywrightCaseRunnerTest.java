package com.megumi.testops.execution.runner;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

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
}
