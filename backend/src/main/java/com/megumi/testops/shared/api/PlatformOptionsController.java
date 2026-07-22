package com.megumi.testops.shared.api;

import java.util.List;
import java.util.Set;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.megumi.testops.config.PlatformProperties;
import com.megumi.testops.config.ProjectProperties;

@RestController
@RequestMapping("/api/v1/platform")
public class PlatformOptionsController {
    private final PlatformProperties platform;
    private final ProjectProperties project;
    public PlatformOptionsController(PlatformProperties platform, ProjectProperties project) { this.platform = platform; this.project = project; }

    @GetMapping("/options")
    public Options options() {
        return new Options(platform.target().allowedOrigins(), project.secretVariablesEnabled(), platform.execution().workerEnabled(),
                Set.of("NAVIGATE", "CLICK", "FILL", "CLEAR", "SELECT_OPTION", "CHECK", "UNCHECK", "WAIT", "WAIT_VISIBLE", "WAIT_HIDDEN", "ASSERT_TEXT_EQUALS", "ASSERT_TEXT_CONTAINS", "ASSERT_VISIBLE", "ASSERT_HIDDEN", "ASSERT_URL_CONTAINS", "TAKE_SCREENSHOT"),
                Set.of("ROLE", "LABEL", "TEST_ID", "TEXT", "PLACEHOLDER", "ALT_TEXT", "TITLE", "CSS", "XPATH"));
    }

    public record Options(List<String> targetAllowedOrigins, boolean secretVariablesEnabled, boolean executionWorkerEnabled,
            Set<String> supportedStepActions, Set<String> supportedLocatorTypes) { }
}
