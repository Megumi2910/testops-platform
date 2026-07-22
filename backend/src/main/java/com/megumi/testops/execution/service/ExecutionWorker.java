package com.megumi.testops.execution.service;

import java.util.UUID;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import com.megumi.testops.config.PlatformProperties;

@Component
public class ExecutionWorker {
    private final ExecutionClaimService claims;
    private final ExecutionRunService runner;
    private final PlatformProperties properties;
    public ExecutionWorker(ExecutionClaimService claims, ExecutionRunService runner, PlatformProperties properties) { this.claims = claims; this.runner = runner; this.properties = properties; }
    @Scheduled(fixedDelayString = "${testops.execution.claim-interval}")
    public void poll() { if (!properties.execution().workerEnabled()) return; claims.recoverStale(properties.execution().staleAfter()); UUID id = claims.claimNext(); if (id != null) runner.run(id); }
}
