package com.megumi.testops.execution.runner;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Set;
import java.util.Map;

import com.microsoft.playwright.PlaywrightException;

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
    void stripsPlaywrightStackAndCallLogFromFailureMessages() {
        String message = PlaywrightCaseRunner.sanitizeMessage(new IllegalStateException(
                "Error { message='net::ERR_CONNECTION_REFUSED at http://localhost:3299/' name='Error' stack='Error: leaked stack' } Call log: - navigating to target"));

        assertEquals("net::ERR_CONNECTION_REFUSED at http://localhost:3299/", message);
        assertFalse(message.contains("leaked stack"));
        assertFalse(message.contains("Call log"));
    }

    @Test
    void stripsPlaywrightFieldsWhenRuntimeOmitsMessageMarker() {
        String message = PlaywrightCaseRunner.sanitizeMessage(new IllegalStateException(
                "net::ERR_CONNECTION_REFUSED at http://localhost:3299/ name='Error' stack='leaked' Call log: navigating"));
        assertEquals("net::ERR_CONNECTION_REFUSED at http://localhost:3299/", message);
        assertFalse(message.contains("name="));
        assertFalse(message.contains("stack="));
    }

    @Test
    void stripsBrowserLaunchLogsFromFailureMessages() {
        String message = PlaywrightCaseRunner.sanitizeMessage(new IllegalStateException(
                "Target page, context or browser has been closed Browser logs: <launching> /ms-playwright/chromium"));
        assertEquals("Target page, context or browser has been closed", message);
        assertFalse(message.contains("Browser logs"));
    }

    @Test
    void detectsSecretReferencesOnlyForConfiguredSecretKeys() {
        var secretStep = new PlaywrightCaseRunner.StepDefinition(1, "FILL", "LABEL", "Password", null, "${PASSWORD}", null, null);
        var ordinaryStep = new PlaywrightCaseRunner.StepDefinition(2, "FILL", "LABEL", "Search", null, "${SEARCH_TERM}", null, null);

        assertTrue(PlaywrightCaseRunner.referencesSecret(secretStep, Set.of("PASSWORD")));
        assertFalse(PlaywrightCaseRunner.referencesSecret(ordinaryStep, Set.of("PASSWORD")));
    }

    @Test
    void interpolatesLocatorInputAndExpectedFieldsTogether() {
        var step = new PlaywrightCaseRunner.StepDefinition(1, "ASSERT_TEXT_CONTAINS", "TEXT", "${LABEL}", null, "${INPUT}", "${EXPECTED}", 5000);

        var resolved = PlaywrightCaseRunner.interpolateStep(step, Map.of("LABEL", "Cart", "INPUT", "unused", "EXPECTED", "Products"));

        assertEquals("Cart", resolved.locatorValue());
        assertEquals("unused", resolved.inputValue());
        assertEquals("Products", resolved.expectedValue());
        assertEquals(null, resolved.locatorIndex());
    }

    @Test
    void preservesTheOptionalLocatorIndexWhenResolvingVariables() {
        var step = new PlaywrightCaseRunner.StepDefinition(1, "ASSERT_VISIBLE", "TEXT_EXACT", "Products", null, 2, null, null, 5000);

        var resolved = PlaywrightCaseRunner.interpolateStep(step, Map.of());

        assertEquals(2, resolved.locatorIndex());
    }

    @Test
    void buildsBrowserContextOptionsFromTheFirstStep() {
        var step = new PlaywrightCaseRunner.StepDefinition(0, "NAVIGATE", null, null, null, null, "/", null, 5000, 1280, 720, "en-US", "Asia/Ho_Chi_Minh");

        var options = PlaywrightCaseRunner.contextOptions(java.util.List.of(step));

        assertEquals("en-US", options.locale);
        assertEquals("Asia/Ho_Chi_Minh", options.timezoneId);
        assertEquals(1280, options.viewportSize.orElseThrow().width);
        assertEquals(720, options.viewportSize.orElseThrow().height);
    }

    @Test
    void classifiesFailuresWithoutCollapsingTestAndInfrastructureErrors() {
        assertEquals("ASSERTION_FAILURE", PlaywrightCaseRunner.category(new AssertionError("expected text")));
        assertEquals("INVALID_DEFINITION", PlaywrightCaseRunner.category(new IllegalArgumentException("unsupported action")));
        assertEquals("LOCATOR_TIMEOUT", PlaywrightCaseRunner.category(new RuntimeException("Timeout 5000ms exceeded")));
        assertEquals("TARGET_UNREACHABLE", PlaywrightCaseRunner.category(new RuntimeException("net::ERR_CONNECTION_REFUSED")));
        assertEquals("BLOCKED_NAVIGATION", PlaywrightCaseRunner.category(new PlaywrightCaseRunner.NavigationViolation()));
    }

    @Test
    void classifiesDirectAndWrappedPlaywrightShutdownsAsBrowserCrashes() {
        var direct = new PlaywrightException("Target page, context or browser has been closed");
        var wrapped = new IllegalStateException("runner stopped", direct);

        assertEquals("BROWSER_CRASH", PlaywrightCaseRunner.category(direct));
        assertEquals("BROWSER_CRASH", PlaywrightCaseRunner.category(wrapped));
    }
}
