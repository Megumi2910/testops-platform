package com.megumi.testops;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

import com.megumi.testops.execution.runner.ExecutionTargetGuard;
import com.megumi.testops.shared.api.ApiException;

class ExecutionTargetGuardTest {
    private final ExecutionTargetGuard guard = new ExecutionTargetGuard();

    @Test
    void resolvesRelativePathOnSameOrigin() {
        assertEquals("https://8.8.8.8/checkout", guard.resolve("https://8.8.8.8", "/checkout"));
    }

    @Test
    void rejectsCrossOriginAndPrivateNavigation() {
        assertThrows(ApiException.class, () -> guard.resolve("https://8.8.8.8", "https://8.8.4.4"));
        assertThrows(ApiException.class, () -> guard.resolve("https://8.8.8.8", "http://127.0.0.1/admin"));
    }
}
