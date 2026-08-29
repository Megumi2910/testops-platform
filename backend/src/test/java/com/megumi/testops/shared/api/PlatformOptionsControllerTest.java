package com.megumi.testops.shared.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

import java.nio.file.Path;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;

import com.megumi.testops.auth.service.AuthService;
import com.megumi.testops.auth.service.PlatformPermissionService;
import com.megumi.testops.config.PlatformProperties;
import com.megumi.testops.config.ProjectProperties;
import com.megumi.testops.project.service.ProjectTargetPolicy;
import com.megumi.testops.project.service.TargetOriginRegistry;

class PlatformOptionsControllerTest {
    @Test
    void descriptorsExposeTheAuthoritativeBuilderVocabularyAndRequirements() {
        PlatformProperties properties = new PlatformProperties(
                new PlatformProperties.Execution(1, 10, java.time.Duration.ofSeconds(1), java.time.Duration.ofSeconds(1),
                        java.time.Duration.ofMinutes(1), java.time.Duration.ofMinutes(5), java.time.Duration.ofSeconds(5), "chromium", true),
                new PlatformProperties.Artifact(Path.of("target/artifacts"), 0),
                new PlatformProperties.Target(List.of("https://target.example.test"), false, "host.docker.internal"));
        ProjectTargetPolicy policy = mock(ProjectTargetPolicy.class);
        TargetOriginRegistry origins = mock(TargetOriginRegistry.class);
        org.mockito.Mockito.when(policy.isConfigured()).thenReturn(true);
        org.mockito.Mockito.when(origins.enabledOptions()).thenReturn(List.of());
        PlatformOptionsController controller = new PlatformOptionsController(properties,
                new ProjectProperties(false, null, 1), mock(ObjectProvider.class), null,
                new PlatformPermissionService(), policy, origins);

        PlatformOptionsController.Options options = controller.options(null);

        assertTrue(options.targetConfigured());
        assertFalse(options.projectCreationEnabled());
        assertFalse(options.reportingAvailable());
        assertTrue(options.supportedStepActions().containsAll(List.of("NAVIGATE", "WAIT", "ASSERT_COUNT", "TAKE_SCREENSHOT")));
        assertTrue(options.supportedLocatorTypes().containsAll(List.of("ROLE", "LABEL", "TEXT_EXACT")));
        var wait = options.stepActions().stream().filter(action -> action.action().equals("WAIT")).findFirst().orElseThrow();
        assertEquals("OPTIONAL", wait.inputRequirement());
        var count = options.stepActions().stream().filter(action -> action.action().equals("ASSERT_COUNT")).findFirst().orElseThrow();
        assertEquals("REQUIRED", count.expectedRequirement());
    }
}
