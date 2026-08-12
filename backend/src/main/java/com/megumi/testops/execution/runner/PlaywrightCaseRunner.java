package com.megumi.testops.execution.runner;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.Map;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;

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
        try (BrowserContext context = chromium.newContext(contextOptions(definitions)); Page page = context.newPage()) {
            context.setDefaultTimeout(properties.execution().defaultStepTimeout().toMillis());
            AtomicReference<NavigationViolation> navigationViolation = new AtomicReference<>();
            monitorNavigation(page, targetOrigin, navigationViolation);
            page.onPopup(popup -> {
                monitorNavigation(popup, targetOrigin, navigationViolation);
                if (!isBlankPage(popup.url())) {
                    try { targetGuard.resolve(targetOrigin, popup.url()); }
                    catch (RuntimeException ex) { navigationViolation.compareAndSet(null, new NavigationViolation()); try { popup.close(); } catch (Exception ignored) { } }
                }
            });
            Path trace = Files.createTempFile("testops-trace-", ".zip"); context.tracing().start(new Tracing.StartOptions().setScreenshots(true).setSnapshots(true));
            long deadline = System.nanoTime() + properties.execution().maxDuration().toNanos();
            int failedStepPosition = -1;
            try { for (StepDefinition step : definitions) { failedStepPosition = step.position(); if (System.nanoTime() > deadline) throw new TimeoutError("Execution duration exceeded"); long started = System.nanoTime(); boolean stepUsesSecret = referencesSecret(step, secretKeys); secretUsed[0] |= stepUsesSecret; try { execute(page, step, targetOrigin, variables, screenshots, secretUsed[0]); assertNavigationAllowed(navigationViolation); outcomes.add(new StepOutcome(step.position(), step.action(), "PASSED", (System.nanoTime() - started) / 1_000_000, null)); } catch (Throwable stepError) { outcomes.add(new StepOutcome(step.position(), step.action(), "FAILED", (System.nanoTime() - started) / 1_000_000, sanitizeMessage(stepError))); if (stepError instanceof RuntimeException runtime) throw runtime; if (stepError instanceof Error error) throw error; throw new RuntimeException(stepError); } } return new Result(true, null, null, secretUsed[0], false, null, null, trace, outcomes, screenshots); }
            catch (Throwable ex) { byte[] screenshot = secretUsed[0] ? null : page.screenshot(new Page.ScreenshotOptions().setFullPage(true)); String failureCategory = category(ex); boolean infrastructure = infrastructureFailure(ex, failureCategory); return new Result(false, sanitizeMessage(ex), screenshot, secretUsed[0], infrastructure, failureCategory, failedStepPosition < 0 ? null : failedStepPosition, trace, outcomes, screenshots); }
            finally { try { context.tracing().stop(new Tracing.StopOptions().setPath(trace)); } catch (Exception ignored) { } if (secretUsed[0]) { try { Files.deleteIfExists(trace); } catch (Exception ignored) { } } }
        } catch (Exception ex) { String failureCategory = category(ex); return new Result(false, sanitizeMessage(ex), null, secretUsed[0], true, "UNKNOWN".equals(failureCategory) ? "WORKER_INFRASTRUCTURE" : failureCategory, null, null); }
    }

    private void execute(Page page, StepDefinition step, String origin, Map<String, String> variables, List<CapturedScreenshot> screenshots, boolean suppressEvidence) {
        StepDefinition resolved = interpolateStep(step, variables);
        String action = resolved.action().toUpperCase(Locale.ROOT); Locator locator = locator(page, resolved);
        int timeout = resolved.timeoutMs() == null ? (int) properties.execution().defaultStepTimeout().toMillis() : resolved.timeoutMs();
        switch (action) {
            case "NAVIGATE" -> page.navigate(targetGuard.resolve(origin, resolved.inputValue()), new Page.NavigateOptions().setTimeout(timeout));
            case "CLICK" -> locator.click(new Locator.ClickOptions().setTimeout(timeout));
            case "FILL" -> locator.fill(resolved.inputValue(), new Locator.FillOptions().setTimeout(timeout));
            case "CLEAR" -> locator.fill("", new Locator.FillOptions().setTimeout(timeout));
            case "SELECT_OPTION" -> locator.selectOption(resolved.inputValue(), new Locator.SelectOptionOptions().setTimeout(timeout));
            case "CHECK" -> locator.check(new Locator.CheckOptions().setTimeout(timeout));
            case "UNCHECK" -> locator.uncheck(new Locator.UncheckOptions().setTimeout(timeout));
            case "PRESS" -> locator.press(resolved.inputValue(), new Locator.PressOptions().setTimeout(timeout));
            case "HOVER" -> locator.hover(new Locator.HoverOptions().setTimeout(timeout));
            case "WAIT" -> page.waitForTimeout(parseWaitMillis(resolved.inputValue(), timeout));
            case "WAIT_VISIBLE" -> locator.waitFor(new Locator.WaitForOptions().setState(WaitForSelectorState.VISIBLE).setTimeout(timeout));
            case "WAIT_HIDDEN" -> locator.waitFor(new Locator.WaitForOptions().setState(WaitForSelectorState.HIDDEN).setTimeout(timeout));
            case "ASSERT_TEXT_EQUALS" -> PlaywrightAssertions.assertThat(locator).hasText(resolved.expectedValue(), new com.microsoft.playwright.assertions.LocatorAssertions.HasTextOptions().setTimeout(timeout));
            case "ASSERT_TEXT_CONTAINS" -> PlaywrightAssertions.assertThat(locator).containsText(resolved.expectedValue(), new com.microsoft.playwright.assertions.LocatorAssertions.ContainsTextOptions().setTimeout(timeout));
            case "ASSERT_VISIBLE" -> PlaywrightAssertions.assertThat(locator).isVisible(new com.microsoft.playwright.assertions.LocatorAssertions.IsVisibleOptions().setTimeout(timeout));
            case "ASSERT_HIDDEN" -> PlaywrightAssertions.assertThat(locator).isHidden(new com.microsoft.playwright.assertions.LocatorAssertions.IsHiddenOptions().setTimeout(timeout));
            case "ASSERT_VALUE" -> PlaywrightAssertions.assertThat(locator).hasValue(resolved.expectedValue(), new com.microsoft.playwright.assertions.LocatorAssertions.HasValueOptions().setTimeout(timeout));
            case "ASSERT_CHECKED" -> PlaywrightAssertions.assertThat(locator).isChecked(new com.microsoft.playwright.assertions.LocatorAssertions.IsCheckedOptions().setTimeout(timeout));
            case "ASSERT_ENABLED" -> PlaywrightAssertions.assertThat(locator).isEnabled(new com.microsoft.playwright.assertions.LocatorAssertions.IsEnabledOptions().setTimeout(timeout));
            case "ASSERT_DISABLED" -> PlaywrightAssertions.assertThat(locator).isDisabled(new com.microsoft.playwright.assertions.LocatorAssertions.IsDisabledOptions().setTimeout(timeout));
            case "ASSERT_ATTRIBUTE" -> PlaywrightAssertions.assertThat(locator).hasAttribute(resolved.inputValue(), resolved.expectedValue(), new com.microsoft.playwright.assertions.LocatorAssertions.HasAttributeOptions().setTimeout(timeout));
            case "ASSERT_COUNT" -> PlaywrightAssertions.assertThat(locator).hasCount(parseExpectedCount(resolved.expectedValue()), new com.microsoft.playwright.assertions.LocatorAssertions.HasCountOptions().setTimeout(timeout));
            case "ASSERT_URL_CONTAINS" -> PlaywrightAssertions.assertThat(page).hasURL(java.util.regex.Pattern.compile(".*" + java.util.regex.Pattern.quote(resolved.expectedValue()) + ".*"), new com.microsoft.playwright.assertions.PageAssertions.HasURLOptions().setTimeout(timeout));
            case "ASSERT_URL_EQUALS" -> PlaywrightAssertions.assertThat(page).hasURL(targetGuard.resolve(origin, resolved.expectedValue()), new com.microsoft.playwright.assertions.PageAssertions.HasURLOptions().setTimeout(timeout));
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

    static StepDefinition interpolateStep(StepDefinition step, Map<String, String> variables) {
        return new StepDefinition(step.position(), step.action(), step.locatorType(), interpolate(step.locatorValue(), variables),
                step.locatorRole(), step.locatorIndex(), interpolate(step.inputValue(), variables), interpolate(step.expectedValue(), variables), step.timeoutMs(),
                step.viewportWidth(), step.viewportHeight(), step.locale(), step.timezoneId());
    }

    private static boolean referencesSecret(String value, Set<String> secretKeys) {
        if (value == null) return false;
        java.util.regex.Matcher matcher = java.util.regex.Pattern.compile("\\$\\{([A-Za-z][A-Za-z0-9_]{1,63})}").matcher(value);
        while (matcher.find()) if (secretKeys.contains(matcher.group(1).toUpperCase(Locale.ROOT))) return true;
        return false;
    }

    private Locator locator(Page page, StepDefinition step) {
        if (step.locatorType() == null || step.locatorValue() == null) return page.locator("body");
        String value = step.locatorValue(); Locator resolved = switch (step.locatorType().toUpperCase(Locale.ROOT)) {
            case "CSS" -> page.locator(value); case "XPATH" -> page.locator("xpath=" + value); case "TEXT" -> page.getByText(value); case "TEXT_EXACT" -> page.getByText(value, new Page.GetByTextOptions().setExact(true)); case "LABEL" -> page.getByLabel(value); case "PLACEHOLDER" -> page.getByPlaceholder(value); case "TEST_ID" -> page.getByTestId(value); case "ALT_TEXT" -> page.getByAltText(value); case "TITLE" -> page.getByTitle(value); case "ROLE" -> role(page, step.locatorRole(), value); default -> throw new IllegalArgumentException("Unsupported locator type");
        }; return step.locatorIndex() == null ? resolved : resolved.nth(step.locatorIndex());
    }

    static Browser.NewContextOptions contextOptions(List<StepDefinition> definitions) {
        Browser.NewContextOptions options = new Browser.NewContextOptions();
        if (definitions == null || definitions.isEmpty()) return options;
        StepDefinition first = definitions.stream().min(java.util.Comparator.comparingInt(StepDefinition::position)).orElseThrow();
        if (first.viewportWidth() != null || first.viewportHeight() != null) {
            if (first.viewportWidth() == null || first.viewportHeight() == null) throw new IllegalArgumentException("Viewport width and height must be provided together");
            options.setViewportSize(first.viewportWidth(), first.viewportHeight());
        }
        if (first.locale() != null && !first.locale().isBlank()) options.setLocale(first.locale());
        if (first.timezoneId() != null && !first.timezoneId().isBlank()) options.setTimezoneId(first.timezoneId());
        return options;
    }

    public record StepDefinition(int position, String action, String locatorType, String locatorValue, String locatorRole,
            Integer locatorIndex, String inputValue, String expectedValue, Integer timeoutMs,
            Integer viewportWidth, Integer viewportHeight, String locale, String timezoneId) {
        public StepDefinition(int position, String action, String locatorType, String locatorValue, String locatorRole,
                String inputValue, String expectedValue, Integer timeoutMs) {
            this(position, action, locatorType, locatorValue, locatorRole, null, inputValue, expectedValue, timeoutMs, null, null, null, null);
        }
        public StepDefinition(int position, String action, String locatorType, String locatorValue, String locatorRole,
                Integer locatorIndex, String inputValue, String expectedValue, Integer timeoutMs) {
            this(position, action, locatorType, locatorValue, locatorRole, locatorIndex, inputValue, expectedValue, timeoutMs, null, null, null, null);
        }
        public static StepDefinition from(ExecutionStepSnapshotEntity snapshot) {
            return new StepDefinition(snapshot.getPosition(), snapshot.getAction(), snapshot.getLocatorType(), snapshot.getLocatorValue(),
                    snapshot.getLocatorRole(), snapshot.getLocatorIndex(), snapshot.getInputValue(), snapshot.getExpectedValue(), snapshot.getTimeoutMs(),
                    snapshot.getViewportWidth(), snapshot.getViewportHeight(), snapshot.getLocale(), snapshot.getTimezoneId());
        }
    }
    private static Locator role(Page page, String role, String name) { AriaRole aria = switch (role == null ? "" : role.toUpperCase(Locale.ROOT)) { case "BUTTON" -> AriaRole.BUTTON; case "LINK" -> AriaRole.LINK; case "CHECKBOX" -> AriaRole.CHECKBOX; case "COMBOBOX" -> AriaRole.COMBOBOX; case "HEADING" -> AriaRole.HEADING; case "TEXTBOX" -> AriaRole.TEXTBOX; default -> throw new IllegalArgumentException("Unsupported ARIA role"); }; return page.getByRole(aria, new Page.GetByRoleOptions().setName(name)); }
    private static String interpolate(String value, Map<String, String> variables) { if (value == null) return ""; java.util.regex.Matcher matcher = java.util.regex.Pattern.compile("\\$\\{([A-Za-z][A-Za-z0-9_]{1,63})}").matcher(value); StringBuffer output = new StringBuffer(); while (matcher.find()) { String replacement = variables.get(matcher.group(1).toUpperCase(Locale.ROOT)); if (replacement == null) throw new IllegalArgumentException("Variable is unavailable or secret values are not allowed in this action"); matcher.appendReplacement(output, java.util.regex.Matcher.quoteReplacement(replacement)); } matcher.appendTail(output); return output.toString(); }
    private static int parseWaitMillis(String value, int fallback) { try { int millis = Integer.parseInt(value == null || value.isBlank() ? String.valueOf(fallback) : value.trim()); return Math.max(0, Math.min(millis, 120_000)); } catch (NumberFormatException ex) { throw new IllegalArgumentException("WAIT requires milliseconds"); } }
    private static int parseExpectedCount(String value) { try { int count = Integer.parseInt(value == null ? "" : value.trim()); if (count < 0) throw new NumberFormatException(); return count; } catch (NumberFormatException ex) { throw new IllegalArgumentException("ASSERT_COUNT requires a non-negative integer"); } }
    static String sanitizeMessage(Throwable ex) {
        String value = ex.getMessage();
        if (value == null || value.isBlank()) return ex.getClass().getSimpleName();
        var structured = java.util.regex.Pattern.compile("(?i)message\\s*=\\s*['\\\"]([^'\\\"]*)['\\\"]").matcher(value);
        if (structured.find()) value = structured.group(1);
        else {
            int message = indexOfIgnoreCase(value, "message=");
            if (message >= 0) value = value.substring(message + "message=".length()).trim();
        }
        int name = indexOfIgnoreCase(value, " name=");
        if (name >= 0) value = value.substring(0, name);
        int stack = indexOfIgnoreCase(value, " stack=");
        if (stack >= 0) value = value.substring(0, stack);
        int callLog = indexOfIgnoreCase(value, "call log:");
        if (callLog >= 0) value = value.substring(0, callLog);
        value = value.replaceAll("\\s+", " ").trim();
        value = value.replaceAll("(?i)(password|token|secret)=\\S+", "$1=[REDACTED]");
        return value.length() > 500 ? value.substring(0, 497) + "..." : value;
    }

    private static int indexOfIgnoreCase(String value, String search) {
        return value.toLowerCase(Locale.ROOT).indexOf(search.toLowerCase(Locale.ROOT));
    }
    static String category(Throwable ex) { if (ex instanceof NavigationViolation) return "BLOCKED_NAVIGATION"; if (ex instanceof AssertionError) return "ASSERTION_FAILURE"; if (ex instanceof IllegalArgumentException) return "INVALID_DEFINITION"; if (ex instanceof TimeoutError) return "WORKER_TIMEOUT"; String name = ex.getClass().getSimpleName().toLowerCase(Locale.ROOT); String message = ex.getMessage() == null ? "" : ex.getMessage().toLowerCase(Locale.ROOT); if (name.contains("timeout") || message.contains("timeout")) return "LOCATOR_TIMEOUT"; if (message.contains("err_connection") || message.contains("econnrefused") || message.contains("net::") || message.contains("connection refused")) return "TARGET_UNREACHABLE"; if (name.contains("browser") || message.contains("browser has been closed") || message.contains("target page, context or browser has been closed")) return "BROWSER_CRASH"; if (ex instanceof com.megumi.testops.shared.api.ApiException) return "TARGET_UNREACHABLE"; if (name.contains("playwright")) return "BROWSER_CRASH"; return "UNKNOWN"; }
    private static boolean infrastructureFailure(Throwable ex, String category) { return ex instanceof NavigationViolation || ex instanceof TimeoutError || "TARGET_UNREACHABLE".equals(category) || "BROWSER_CRASH".equals(category); }
    private void monitorNavigation(Page page, String origin, AtomicReference<NavigationViolation> violation) {
        page.onFrameNavigated(frame -> {
            if (frame.parentFrame() != null || isBlankPage(frame.url())) return;
            try { targetGuard.resolve(origin, frame.url()); }
            catch (RuntimeException ex) { violation.compareAndSet(null, new NavigationViolation()); }
        });
    }
    private static boolean isBlankPage(String url) { return url == null || url.isBlank() || "about:blank".equalsIgnoreCase(url); }
    private static void assertNavigationAllowed(AtomicReference<NavigationViolation> violation) { NavigationViolation failure = violation.get(); if (failure != null) throw failure; }
    private static final class TimeoutError extends RuntimeException { TimeoutError(String message) { super(message); } }
    static final class NavigationViolation extends RuntimeException { NavigationViolation() { super("Browser navigation left the approved project target"); } }
    public record Result(boolean passed, String errorMessage, byte[] screenshot, boolean secretBearing, boolean infrastructureError, String infrastructureCategory, Integer failedStepPosition, Path trace, List<StepOutcome> stepOutcomes, List<CapturedScreenshot> screenshots) {
        public Result(boolean passed, String errorMessage, byte[] screenshot, boolean secretBearing, boolean infrastructureError, String infrastructureCategory, Integer failedStepPosition, Path trace) { this(passed, errorMessage, screenshot, secretBearing, infrastructureError, infrastructureCategory, failedStepPosition, trace, List.of(), List.of()); }
    }
    public record StepOutcome(int position, String action, String status, Long durationMs, String errorMessage) { }
    public record CapturedScreenshot(int stepPosition, byte[] bytes) { }
}
