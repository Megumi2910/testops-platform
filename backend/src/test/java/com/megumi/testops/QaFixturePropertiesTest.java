package com.megumi.testops;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.nio.file.Path;

import org.junit.jupiter.api.Test;

import com.megumi.testops.config.QaFixtureProperties;

class QaFixturePropertiesTest {

    @Test
    void disabledFixturesDoNotRequireLocalConfiguration() {
        assertDoesNotThrow(() -> new QaFixtureProperties(false, null, null));
    }

    @Test
    void enabledFixturesRequirePasswordPath() {
        assertThrows(IllegalArgumentException.class,
                () -> new QaFixtureProperties(true, null, "http://localhost:3001"));
    }

    @Test
    void enabledFixturesRequireTargetOrigin() {
        assertThrows(IllegalArgumentException.class,
                () -> new QaFixtureProperties(true, Path.of("qa-password"), " "));
    }

    @Test
    void enabledFixturesAcceptExplicitLocalInputs() {
        assertDoesNotThrow(() -> new QaFixtureProperties(true,
                Path.of("qa-password"), "http://localhost:3001"));
    }
}
