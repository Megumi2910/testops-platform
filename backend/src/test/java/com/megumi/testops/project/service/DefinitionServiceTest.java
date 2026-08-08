package com.megumi.testops.project.service;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

import com.megumi.testops.project.api.ProjectDtos;
import com.megumi.testops.shared.api.ApiException;

class DefinitionServiceTest {
    @Test
    void acceptsExtendedInteractionAndAssertionActions() {
        assertDoesNotThrow(() -> DefinitionService.validateStep(step("PRESS", "ROLE", "Search", "BUTTON", "Enter", null)));
        assertDoesNotThrow(() -> DefinitionService.validateStep(step("HOVER", "TEXT", "Account", null, null, null)));
        assertDoesNotThrow(() -> DefinitionService.validateStep(step("ASSERT_VALUE", "LABEL", "Email", null, null, "person@example.test")));
        assertDoesNotThrow(() -> DefinitionService.validateStep(step("ASSERT_ATTRIBUTE", "TEXT", "Cart", null, "aria-label", "Open cart")));
        assertDoesNotThrow(() -> DefinitionService.validateStep(step("ASSERT_COUNT", "CSS", ".product-card", null, null, "3")));
        assertDoesNotThrow(() -> DefinitionService.validateStep(step("ASSERT_URL_EQUALS", null, null, null, null, "/checkout")));
    }

    @Test
    void rejectsInvalidCountAndIncompleteAttributeAssertions() {
        ApiException invalidCount = assertThrows(ApiException.class,
                () -> DefinitionService.validateStep(step("ASSERT_COUNT", "TEXT", "Product", null, null, "many")));
        assertEquals("invalid_expected_count", invalidCount.getCode());

        ApiException missingAttributeName = assertThrows(ApiException.class,
                () -> DefinitionService.validateStep(step("ASSERT_ATTRIBUTE", "TEXT", "Cart", null, "", "Open cart")));
        assertEquals("attribute_name_required", missingAttributeName.getCode());
    }

    private static ProjectDtos.StepRequest step(String action, String locatorType, String locatorValue, String role,
            String inputValue, String expectedValue) {
        return new ProjectDtos.StepRequest(0, action, locatorType, locatorValue, role, inputValue, expectedValue, 5000);
    }
}
