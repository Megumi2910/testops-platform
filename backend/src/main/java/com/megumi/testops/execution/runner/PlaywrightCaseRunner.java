package com.megumi.testops.execution.runner;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.Map;

import org.springframework.stereotype.Component;

import com.megumi.testops.config.PlatformProperties;
import com.megumi.testops.project.domain.TestCaseEntity;
import com.megumi.testops.project.domain.TestStepEntity;
import com.megumi.testops.project.repository.TestStepRepository;
import com.microsoft.playwright.*;
import com.microsoft.playwright.assertions.PlaywrightAssertions;
import com.microsoft.playwright.options.AriaRole;
import com.microsoft.playwright.options.WaitForSelectorState;

@Component
public class PlaywrightCaseRunner {
    private final TestStepRepository steps;
    private final ExecutionTargetGuard targetGuard;
    private final PlatformProperties properties;
    private final ArtifactWriter artifacts;
    private volatile Playwright playwright;
    private volatile Browser browser;

    public PlaywrightCaseRunner(TestStepRepository steps, ExecutionTargetGuard targetGuard, PlatformProperties properties, ArtifactWriter artifacts) { this.steps = steps; this.targetGuard = targetGuard; this.properties = properties; this.artifacts = artifacts; }

    public Result run(TestCaseEntity testCase, String targetOrigin, String executionId, String caseResultId, Map<String, String> variables) {
        ensureBrowser(); boolean secret = steps.findByTestCaseIdOrderByPositionAsc(testCase.getId()).stream().anyMatch(s -> s.getInputValue() != null && s.getInputValue().contains("${"));
        try (BrowserContext context = browser.newContext(); Page page = context.newPage()) {
            context.setDefaultTimeout(properties.execution().defaultStepTimeout().toMillis());
            Path trace = null; if (!secret) { trace = Files.createTempFile("testops-trace-", ".zip"); context.tracing().start(new Tracing.StartOptions().setScreenshots(true).setSnapshots(true)); }
            long deadline = System.nanoTime() + properties.execution().maxDuration().toNanos();
            try { for (TestStepEntity step : steps.findByTestCaseIdOrderByPositionAsc(testCase.getId())) { if (System.nanoTime() > deadline) throw new TimeoutError("Execution duration exceeded"); execute(page, step, targetOrigin, variables); } return new Result(true, null, null, secret, false, trace); }
            catch (Throwable ex) { byte[] screenshot = secret ? null : page.screenshot(new Page.ScreenshotOptions().setFullPage(true)); return new Result(false, safeMessage(ex), screenshot, secret, ex instanceof com.microsoft.playwright.PlaywrightException || ex instanceof com.megumi.testops.shared.api.ApiException || ex instanceof TimeoutError, trace); }
            finally { if (trace != null) { try { context.tracing().stop(new Tracing.StopOptions().setPath(trace)); } catch (Exception ignored) { } } }
        } catch (Exception ex) { return new Result(false, safeMessage(ex), null, secret, true, null); }
    }

    private void execute(Page page, TestStepEntity step, String origin, Map<String, String> variables) {
        String action = step.getAction().toUpperCase(Locale.ROOT); Locator locator = locator(page, step);
        int timeout = step.getTimeoutMs() == null ? (int) properties.execution().defaultStepTimeout().toMillis() : step.getTimeoutMs();
        switch (action) {
            case "NAVIGATE" -> page.navigate(targetGuard.resolve(origin, interpolate(step.getInputValue(), variables)), new Page.NavigateOptions().setTimeout(timeout));
            case "CLICK" -> locator.click(new Locator.ClickOptions().setTimeout(timeout));
            case "FILL" -> locator.fill(interpolate(step.getInputValue(), variables), new Locator.FillOptions().setTimeout(timeout));
            case "CLEAR" -> locator.fill("", new Locator.FillOptions().setTimeout(timeout));
            case "SELECT_OPTION" -> locator.selectOption(interpolate(step.getInputValue(), variables), new Locator.SelectOptionOptions().setTimeout(timeout));
            case "CHECK" -> locator.check(new Locator.CheckOptions().setTimeout(timeout));
            case "UNCHECK" -> locator.uncheck(new Locator.UncheckOptions().setTimeout(timeout));
            case "WAIT_VISIBLE" -> locator.waitFor(new Locator.WaitForOptions().setState(WaitForSelectorState.VISIBLE).setTimeout(timeout));
            case "WAIT_HIDDEN" -> locator.waitFor(new Locator.WaitForOptions().setState(WaitForSelectorState.HIDDEN).setTimeout(timeout));
            case "ASSERT_TEXT_EQUALS" -> PlaywrightAssertions.assertThat(locator).hasText(step.getExpectedValue(), new com.microsoft.playwright.assertions.LocatorAssertions.HasTextOptions().setTimeout(timeout));
            case "ASSERT_TEXT_CONTAINS" -> PlaywrightAssertions.assertThat(locator).containsText(step.getExpectedValue(), new com.microsoft.playwright.assertions.LocatorAssertions.ContainsTextOptions().setTimeout(timeout));
            case "ASSERT_VISIBLE" -> PlaywrightAssertions.assertThat(locator).isVisible(new com.microsoft.playwright.assertions.LocatorAssertions.IsVisibleOptions().setTimeout(timeout));
            case "ASSERT_HIDDEN" -> PlaywrightAssertions.assertThat(locator).isHidden(new com.microsoft.playwright.assertions.LocatorAssertions.IsHiddenOptions().setTimeout(timeout));
            case "ASSERT_URL_CONTAINS" -> PlaywrightAssertions.assertThat(page).hasURL(java.util.regex.Pattern.compile(".*" + java.util.regex.Pattern.quote(step.getExpectedValue()) + ".*"));
            case "TAKE_SCREENSHOT" -> page.screenshot();
            default -> throw new IllegalArgumentException("Unsupported action " + action);
        }
    }

    private Locator locator(Page page, TestStepEntity step) {
        if (step.getLocatorType() == null || step.getLocatorValue() == null) return page.locator("body");
        String value = step.getLocatorValue(); return switch (step.getLocatorType().toUpperCase(Locale.ROOT)) {
            case "CSS" -> page.locator(value); case "XPATH" -> page.locator("xpath=" + value); case "TEXT" -> page.getByText(value); case "LABEL" -> page.getByLabel(value); case "PLACEHOLDER" -> page.getByPlaceholder(value); case "TEST_ID" -> page.getByTestId(value); case "ALT_TEXT" -> page.getByAltText(value); case "TITLE" -> page.getByTitle(value); case "ROLE" -> role(page, step.getLocatorRole(), value); default -> throw new IllegalArgumentException("Unsupported locator type");
        };
    }
    private static Locator role(Page page, String role, String name) { AriaRole aria = switch (role == null ? "" : role.toUpperCase(Locale.ROOT)) { case "BUTTON" -> AriaRole.BUTTON; case "LINK" -> AriaRole.LINK; case "CHECKBOX" -> AriaRole.CHECKBOX; case "COMBOBOX" -> AriaRole.COMBOBOX; case "HEADING" -> AriaRole.HEADING; case "TEXTBOX" -> AriaRole.TEXTBOX; default -> throw new IllegalArgumentException("Unsupported ARIA role"); }; return page.getByRole(aria, new Page.GetByRoleOptions().setName(name)); }
    private void ensureBrowser() { if (browser != null) return; synchronized (this) { if (browser == null) { playwright = Playwright.create(); browser = playwright.chromium().launch(new BrowserType.LaunchOptions().setHeadless(true)); } } }
    private static String interpolate(String value, Map<String, String> variables) { if (value == null) return ""; java.util.regex.Matcher matcher = java.util.regex.Pattern.compile("\\$\\{([A-Za-z][A-Za-z0-9_]{1,63})}").matcher(value); StringBuffer output = new StringBuffer(); while (matcher.find()) { String replacement = variables.get(matcher.group(1).toUpperCase(Locale.ROOT)); if (replacement == null) throw new IllegalArgumentException("Variable is unavailable or secret values are not allowed in this action"); matcher.appendReplacement(output, java.util.regex.Matcher.quoteReplacement(replacement)); } matcher.appendTail(output); return output.toString(); }
    private static String safeMessage(Throwable ex) { String value = ex.getMessage(); return value == null ? ex.getClass().getSimpleName() : value.replaceAll("(?i)(password|token|secret)=\\S+", "$1=[REDACTED]"); }
    private static final class TimeoutError extends RuntimeException { TimeoutError(String message) { super(message); } }
    public record Result(boolean passed, String errorMessage, byte[] screenshot, boolean secretBearing, boolean infrastructureError, Path trace) { }
}
