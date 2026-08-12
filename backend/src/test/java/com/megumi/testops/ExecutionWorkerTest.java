package com.megumi.testops;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.megumi.testops.config.PlatformProperties;
import com.megumi.testops.execution.service.ExecutionClaimService;
import com.megumi.testops.execution.service.ExecutionRunService;
import com.megumi.testops.execution.service.ExecutionWorker;

class ExecutionWorkerTest {
    private final ExecutionClaimService claims = mock(ExecutionClaimService.class);
    private final ExecutionRunService runner = mock(ExecutionRunService.class);

    @Test
    void disabledWorkerDoesNotClaimOrRecoverRuns() {
        ExecutionWorker worker = new ExecutionWorker(claims, runner, properties(false));

        worker.poll();

        verify(claims, never()).recoverStale(org.mockito.ArgumentMatchers.any());
        verify(claims, never()).claimNext();
        verify(runner, never()).run(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void enabledWorkerRecoversClaimsAndRunsOneExecution() {
        UUID executionId = UUID.randomUUID();
        when(claims.claimNext()).thenReturn(executionId);
        ExecutionWorker worker = new ExecutionWorker(claims, runner, properties(true));

        worker.poll();

        verify(claims).recoverStale(Duration.ofMinutes(1));
        verify(claims).claimNext();
        verify(runner).run(executionId);
    }

    @Test
    void enabledWorkerStopsAfterRecoveringAnEmptyQueue() {
        when(claims.claimNext()).thenReturn(null);
        ExecutionWorker worker = new ExecutionWorker(claims, runner, properties(true));

        worker.poll();

        verify(claims).recoverStale(Duration.ofMinutes(1));
        verify(claims).claimNext();
        verify(runner, never()).run(org.mockito.ArgumentMatchers.any());
    }

    private static PlatformProperties properties(boolean enabled) {
        return new PlatformProperties(
                new PlatformProperties.Execution(1, 2, Duration.ofSeconds(1), Duration.ofSeconds(5),
                        Duration.ofMinutes(1), Duration.ofMinutes(5), Duration.ofSeconds(10), "chromium", enabled),
                new PlatformProperties.Artifact(Path.of("artifacts"), 0),
                new PlatformProperties.Target(List.of("https://target.example.test"), false, "host.docker.internal"));
    }
}
