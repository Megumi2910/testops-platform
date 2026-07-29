package com.megumi.testops.shared.api;

import java.util.List;
import java.util.Set;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import com.megumi.testops.auth.service.PlatformPermissionService;
import com.megumi.testops.auth.service.AuthService;
import org.springframework.beans.factory.ObjectProvider;
import com.megumi.testops.auth.domain.UserEntity;
import com.megumi.testops.auth.repository.UserRepository;
import java.util.UUID;

import com.megumi.testops.config.PlatformProperties;
import com.megumi.testops.config.ProjectProperties;
import com.megumi.testops.project.service.ProjectTargetPolicy;

@RestController
@RequestMapping("/api/v1/platform")
public class PlatformOptionsController {
    private final PlatformProperties platform;
    private final ProjectProperties project;
    private final ObjectProvider<AuthService> auth;
    private final UserRepository users;
    private final PlatformPermissionService permissions;
    private final ProjectTargetPolicy targetPolicy;
    public PlatformOptionsController(PlatformProperties platform, ProjectProperties project, ObjectProvider<AuthService> auth, UserRepository users, PlatformPermissionService permissions, ProjectTargetPolicy targetPolicy) { this.platform = platform; this.project = project; this.auth = auth; this.users = users; this.permissions = permissions; this.targetPolicy = targetPolicy; }

    @GetMapping("/options")
    public Options options(@AuthenticationPrincipal Jwt jwt) {
        boolean targetConfigured = !platform.target().allowedOrigins().isEmpty();
        UserEntity user = jwt == null || auth.getIfAvailable() == null ? null : currentUser(jwt);
        boolean projectCreationEnabled = targetConfigured && permissions.canCreateProject(user);
        boolean reportingAvailable = user != null;
        List<TargetOriginOption> origins = platform.target().allowedOrigins().stream().map(origin -> describeOrigin(origin)).toList();
        List<ActionDefinition> actions = List.of(
                action("NAVIGATE", "Navigate", "NOT_APPLICABLE", "REQUIRED", "NOT_APPLICABLE", "Path such as / or /checkout"),
                action("CLICK", "Click", "REQUIRED", "NOT_APPLICABLE", "NOT_APPLICABLE", "Button or link to activate"),
                action("FILL", "Fill", "REQUIRED", "REQUIRED", "NOT_APPLICABLE", "Email field and text to enter"),
                action("CLEAR", "Clear", "REQUIRED", "NOT_APPLICABLE", "NOT_APPLICABLE", "Field to clear"),
                action("SELECT_OPTION", "Select option", "REQUIRED", "REQUIRED", "NOT_APPLICABLE", "Select control and option value"),
                action("CHECK", "Check", "REQUIRED", "NOT_APPLICABLE", "NOT_APPLICABLE", "Checkbox to enable"),
                action("UNCHECK", "Uncheck", "REQUIRED", "NOT_APPLICABLE", "NOT_APPLICABLE", "Checkbox to disable"),
                action("WAIT", "Wait", "NOT_APPLICABLE", "OPTIONAL", "NOT_APPLICABLE", "Milliseconds to wait"),
                action("WAIT_VISIBLE", "Wait until visible", "REQUIRED", "NOT_APPLICABLE", "NOT_APPLICABLE", "Control that must appear"),
                action("WAIT_HIDDEN", "Wait until hidden", "REQUIRED", "NOT_APPLICABLE", "NOT_APPLICABLE", "Control that must disappear"),
                action("ASSERT_VISIBLE", "Assert visible", "REQUIRED", "NOT_APPLICABLE", "NOT_APPLICABLE", "Visible text or control"),
                action("ASSERT_HIDDEN", "Assert hidden", "REQUIRED", "NOT_APPLICABLE", "NOT_APPLICABLE", "Hidden text or control"),
                action("ASSERT_TEXT_EQUALS", "Assert exact text", "REQUIRED", "NOT_APPLICABLE", "REQUIRED", "Expected text"),
                action("ASSERT_TEXT_CONTAINS", "Assert text contains", "REQUIRED", "NOT_APPLICABLE", "REQUIRED", "Expected fragment"),
                action("ASSERT_URL_CONTAINS", "Assert URL contains", "NOT_APPLICABLE", "NOT_APPLICABLE", "REQUIRED", "Expected URL fragment"),
                action("TAKE_SCREENSHOT", "Take screenshot", "NOT_APPLICABLE", "NOT_APPLICABLE", "NOT_APPLICABLE", "Captures the current page"));
        return new Options(platform.target().allowedOrigins(), origins, targetConfigured, platform.target().localDevelopmentEnabled(), projectCreationEnabled, reportingAvailable, project.secretVariablesEnabled(), platform.execution().workerEnabled(),
                Set.of("NAVIGATE", "CLICK", "FILL", "CLEAR", "SELECT_OPTION", "CHECK", "UNCHECK", "WAIT", "WAIT_VISIBLE", "WAIT_HIDDEN", "ASSERT_TEXT_EQUALS", "ASSERT_TEXT_CONTAINS", "ASSERT_VISIBLE", "ASSERT_HIDDEN", "ASSERT_URL_CONTAINS", "TAKE_SCREENSHOT"),
                Set.of("ROLE", "LABEL", "TEST_ID", "TEXT", "PLACEHOLDER", "ALT_TEXT", "TITLE", "CSS", "XPATH"),
                Set.of("BUTTON", "LINK", "CHECKBOX", "COMBOBOX", "HEADING", "TEXTBOX"), actions);
    }

    private TargetOriginOption describeOrigin(String origin) {
        boolean local = origin != null && origin.toLowerCase(java.util.Locale.ROOT).startsWith("http://localhost:");
        try {
            targetPolicy.validate(origin);
            return new TargetOriginOption(origin, local ? "LOCAL_DEVELOPMENT" : "EXTERNAL", true, null);
        } catch (com.megumi.testops.shared.api.ApiException ex) {
            return new TargetOriginOption(origin, local ? "LOCAL_DEVELOPMENT" : "EXTERNAL", false, ex.getCode());
        }
    }

    private static ActionDefinition action(String action, String label, String locator, String input, String expected, String help) {
        return new ActionDefinition(action, label, !"NOT_APPLICABLE".equals(locator), !"NOT_APPLICABLE".equals(input), !"NOT_APPLICABLE".equals(expected), false, help, locator, input, expected, true);
    }

    private UserEntity currentUser(Jwt jwt) {
        try { return users.findById(UUID.fromString(jwt.getSubject())).orElse(null); } catch (IllegalArgumentException ex) { return null; }
    }

    public record Options(List<String> targetAllowedOrigins, List<TargetOriginOption> targetOrigins, boolean targetConfigured, boolean localDevelopmentEnabled, boolean projectCreationEnabled, boolean reportingAvailable,
            boolean secretVariablesEnabled, boolean executionWorkerEnabled,
            Set<String> supportedStepActions, Set<String> supportedLocatorTypes, Set<String> supportedLocatorRoles,
            List<ActionDefinition> stepActions) { }
    public record TargetOriginOption(String origin, String type, boolean usable, String blockedReason) { }
    public record ActionDefinition(String action, String label, boolean locator, boolean input, boolean expected, boolean role, String help,
            String locatorRequirement, String inputRequirement, String expectedRequirement, boolean timeout) { }
}
