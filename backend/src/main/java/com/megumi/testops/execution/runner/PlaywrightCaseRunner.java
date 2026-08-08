package com.megumi.testops.execution.runner;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.Map;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import org.springframework.stereotype.Component;

import com.megumi.testops.config.PlatformProperties;
import com.megumi.testops.execution.domain.ExecutionStepSnapshotEntity;
import com.microsoft.playwright.*;
import com.microsoft.playwright.assertions.PlaywrightAssertions;
import com.microsoft.playwright.options.AriaRole;
import com.microsoft.playwright.options.WaitForSelectorState;

@Component
public class PlaywrightCaseRunner {
    private final ExecutionTargetGuard targetGuard;
    private final PlatformProperties properties;
    private final ArtifactWriter artifacts;
    private final ManagedChromium chromium;

    public PlaywrightCaseRunner(ExecutionTargetGuard targetGuard, PlatformProperties properties, ArtifactWriter artifacts, ManagedChromium chromium) { this.targetGuard = targetGuard; this.properties = properties; this.artifacts = artifacts; this.chromium = chromium; }

    public Result run(List<StepDefinition> definitions, String targetOrigin, String executionId, String caseResultId, Map<String, String> variables, Set<String> secretKeys) {
        List<StepOutcome> outcomes = new ArrayList<>(); List<CapturedScreenshot> screenshots = new ArrayList<>();
        boolean[] secretUsed = { false };
        try (BrowserContext context = chromium.newContext(); Page page = context.newPage()) {
            context.setDefaultTimeout(properties.execution().defaultStepTimeout().toMillis());
            Path trace = Files.createTempFile("testops-trace-", ".zip"); context.tracing().start(new Tracing.StartOptions().setScreenshots(true).setSnapshots(true));
            long deadline = System.nanoTime() + properties.execution().maxDuration().toNanos();
            int failedStepPosition = -1;
            try { for (StepDefinition step : definitions) { failedStepPosition = step.position(); if (System.nanoTime() > deadline) throw new TimeoutError("Execution duration exceeded"); long started = System.nanoTime(); boolean stepUsesSecret = referencesSecret(step, secretKeys); secretUsed[0] |= stepUsesSecret; try { execute(page, step, targetOrigin, variables, screenshots, secretUsed[0]); outcomes.add(new StepOutcome(step.position(), step.action(), "PASSED", (System.nanoTime() - started) / 1_000_000, null)); } catch (Throwable stepError) { outcomes.add(new StepOutcome(step.position(), step.action(), "FAILED", (System.nanoTime() - started) / 1_000_000, sanitizeMessage(stepError))); if (stepError instanceof RuntimeException runtime) throw runtime; if (stepError instanceof Error error) throw error; throw new RuntimeException(stepError); } } return new Result(true, null, null, secretUsed[0], false, null, null, trace, outcomes, screenshots); }
            catch (Throwable ex) { byte[] screenshot = secretUsed[0] ? null : page.screenshot(new Page.ScreenshotOptions().setFullPage(true)); boolean infrastructure = ex instanceof com.microsoft.playwright.PlaywrightException || ex instanceof com.megumi.testops.shared.api.ApiException || ex instanceof TimeoutError; return new Result(false, sanitizeMessage(ex), screenshot, secretUsed[0], infrastructure, infrastructure ? category(ex) : null, failedStepPosition < 0 ? null : failedStepPosition, trace, outcomes, screenshots); }
            finally { try { context.tracing().stop(new Tracing.StopOptions().setPath(trace)); } catch (Exception ignored) { } if (secretUsed[0]) { try { Files.deleteIfExists(trace); } catch (Exception ignored) { } } }
        } catch (Exception ex) { return new Result(false, sanitizeMessage(ex), null, secretUsed[0], true, category(ex), null, null); }
    }

    private void execute(Page page, StepDefinition step, String origin, Map<String, String> variables, List<CapturedScreenshot> screenshots, boolean suppressEvidence) {
        String action = step.action().toUpperCase(Locale.ROOT); Locator locator = locator(page, step);
        int timeout = step.timeoutMs() == null ? (int) properties.execution().defaultStepTimeout().toMillis() : step.timeoutMs();
        switch (action) {
            case "NAVIGATE" -> page.navigate(targetGuard.resolve(origin, interpolate(step.inputValue(), variables)), new Page.NavigateOptions().setTimeout(timeout));
            case "CLICK" -> locator.click(new Locator.ClickOptions().setTimeout(timeout));
            case "FILL" -> locator.fill(interpolate(step.inputValue(), variables), new Locator.FillOptions().setTimeout(timeout));
            case "CLEAR" -> locator.fill("", new Locator.FillOptions().setTimeout(timeout));
            case "SELECT_OPTION" -> locator.selectOption(interpolate(step.inputValue(), variables), new Locator.SelectOptionOptions().setTimeout(timeout));
            case "CHECK" -> locator.check(new Locator.CheckOptions().setTimeout(timeout));
            case "UNCHECK" -> locator.uncheck(new Locator.UncheckOptions().setTimeout(timeout));
            case "WAIT" -> page.waitForTimeout(parseWaitMillis(step.inputValue(), timeout));
            case "WAIT_VISIBLE" -> locator.waitFor(new Locator.WaitForOptions().setState(WaitForSelectorState.VISIBLE).setTimeout(timeout));
            case "WAIT_HIDDEN" -> locator.waitFor(new Locator.WaitForOptions().setState(WaitForSelectorState.HIDDEN).setTimeout(timeout));
            case "ASSERT_TEXT_EQUALS" -> PlaywrightAssertions.assertThat(locator).hasText(step.expectedValue(), new com.microsoft.playwright.assertions.LocatorAssertions.HasTextOptions().setTimeout(timeout));
            case "ASSERT_TEXT_CONTAINS" -> PlaywrightAssertions.assertThat(locator).containsText(step.expectedValue(), new com.microsoft.playwright.assertions.LocatorAssertions.ContainsTextOptions().setTimeout(timeout));
            case "ASSERT_VISIBLE" -> PlaywrightAssertions.assertThat(locator).isVisible(new com.microsoft.playwright.assertions.LocatorAssertions.IsVisibleOptions().setTimeout(timeout));
            case "ASSERT_HIDDEN" -> PlaywrightAssertions.assertThat(locator).isHidden(new com.microsoft.playwright.assertions.LocatorAssertions.IsHiddenOptions().setTimeout(timeout));
            case "ASSERT_URL_CONTAINS" -> PlaywrightAssertions.assertThat(page).hasURL(java.util.regex.Pattern.compile(".*" + java.util.regex.Pattern.quote(step.expectedValue()) + ".*"));
            case "TAKE_SCREENSHOT" -> { if (!suppressEvidence) screenshots.add(new CapturedScreenshot(step.position(), page.screenshot(new Page.ScreenshotOptions().setFullPage(true)))); }
            default -> throw new IllegalArgumentException("Unsupported action " + action);
        }
    }

    static boolean referencesSecret(StepDefinition step, Set<String> secretKeys) {
        if (secretKeys.isEmpty()) return false;
        return referencesSecret(step.inputValue(), secretKeys)
                || referencesSecret(step.expectedValue(), secretKeys)
                || referencesSecret(step.locatorValue(), secretKeys);
    }

    private static boolean referencesSecret(String value, Set<String> secretKeys) {
        if (value == null) return false;
        java.util.regex.Matcher matcher = java.util.regex.Pattern.compile("\\$\\{([A-Za-z][A-Za-z0-9_]{1,63})}").matcher(value);
        while (matcher.find()) if (secretKeys.contains(matcher.group(1).toUpperCase(Locale.ROOT))) return true;
        return false;
    }

    private Locator locator(Page page, StepDefinition step) {
        if (step.locatorType() == null || step.locatorValue() == null) return page.locator("body");
        String value = step.locatorValue(); return switch (step.locatorType().toUpperCase(Locale.ROOT)) {
            case "CSS" -> page.locator(value); case "XPATH" -> page.locator("xpath=" + value); case "TEXT" -> page.getByText(value); case "LABEL" -> page.getByLabel(value); case "PLACEHOLDER" -> page.getByPlaceholder(value); case "TEST_ID" -> page.getByTestId(value); case "ALT_TEXT" -> page.getByAltText(value); case "TITLE" -> page.getByTitle(value); case "ROLE" -> role(page, step.locatorRole(), value); default -> throw new IllegalArgumentException("Unsupported locator type");
        };
    }

    public record StepDefinition(int position, String action, String locatorType, String locatorValue, String locatorRole,
            String inputValue, String expectedValue, Integer timeoutMs) {
        public static StepDefinition from(ExecutionStepSnapshotEntity snapshot) {
            return new StepDefinition(snapshot.getPosition(), snapshot.getAction(), snapshot.getLocatorType(), snapshot.getLocatorValue(),
                    snapshot.getLocatorRole(), snapshot.getInputValue(), snapshot.getExpectedValue(), snapshot.getTimeoutMs());
        }
    }
    private static Locator role(Page page, String role, String name) { AriaRole aria = switch (role == null ? "" : role.toUpperCase(Locale.ROOT)) { case "BUTTON" -> AriaRole.BUTTON; case "LINK" -> AriaRole.LINK; case "CHECKBOX" -> AriaRole.CHECKBOX; case "COMBOBOX" -> AriaRole.COMBOBOX; case "HEADING" -> AriaRole.HEADING; case "TEXTBOX" -> AriaRole.TEXTBOX; default -> throw new IllegalArgumentException("Unsupported ARIA role"); }; return page.getByRole(aria, new Page.GetByRoleOptions().setName(name)); }
    private static String interpolate(String value, Map<String, String> variables) { if (value == null) return ""; java.util.regex.Matcher matcher = java.util.regex.Pattern.compile("\\$\\{([A-Za-z][A-Za-z0-9_]{1,63})}").matcher(value); StringBuffer output = new StringBuffer(); while (matcher.find()) { String replacement = variables.get(matcher.group(1).toUpperCase(Locale.ROOT)); if (replacement == null) throw new IllegalArgumentException("Variable is unavailable or secret values are not allowed in this action"); matcher.appendReplacement(output, java.util.regex.Matcher.quoteReplacement(replacement)); } matcher.appendTail(output); return output.toString(); }
    private static int parseWaitMillis(String value, int fallback) { try { int millis = Integer.parseInt(value == null || value.isBlank() ? String.valueOf(fallback) : value.trim()); return Math.max(0, Math.min(millis, 120_000)); } catch (NumberFormatException ex) { throw new IllegalArgumentException("WAIT requires milliseconds"); } }
    static String sanitizeMessage(Throwable ex) { String value = ex.getMessage(); return value == null ? ex.getClass().getSimpleName() : value.replaceAll("(?i)(password|token|secret)=\\S+", "$1=[REDACTED]"); }
    private static String category(Throwable ex) { String name = ex.getClass().getSimpleName().toLowerCase(Locale.ROOT); if (name.contains("timeout")) return "WORKER_TIMEOUT"; if (name.contains("connect") || name.contains("network")) return "NETWORK"; if (name.contains("dns") || name.contains("host")) return "DNS_POLICY"; if (name.contains("browser")) return "BROWSER_STARTUP"; if (name.contains("playwright")) return "BROWSER_CRASH"; if (name.contains("api")) return "TARGET_UNREACHABLE"; return "UNKNOWN"; }
    private static final class TimeoutError extends RuntimeException { TimeoutError(String message) { super(message); } }
    public record Result(boolean passed, String errorMessage, byte[] screenshot, boolean secretBearing, boolean infrastructureError, String infrastructureCategory, Integer failedStepPosition, Path trace, List<StepOutcome> stepOutcomes, List<CapturedScreenshot> screenshots) {
        public Result(boolean passed, String errorMessage, byte[] screenshot, boolean secretBearing, boolean infrastructureError, String infrastructureCategory, Integer failedStepPosition, Path trace) { this(passed, errorMessage, screenshot, secretBearing, infrastructureError, infrastructureCategory, failedStepPosition, trace, List.of(), List.of()); }
    }
    public record StepOutcome(int position, String action, String status, Long durationMs, String errorMessage) { }
    public record CapturedScreenshot(int stepPosition, byte[] bytes) { }
}
