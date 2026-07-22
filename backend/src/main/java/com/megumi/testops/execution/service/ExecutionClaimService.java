package com.megumi.testops.execution.service;

import java.time.Instant;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.megumi.testops.execution.domain.ExecutionEntity;
import com.megumi.testops.execution.repository.ExecutionRepository;
import com.megumi.testops.execution.repository.TestCaseResultRepository;
import com.megumi.testops.execution.domain.ExecutionStatus;

@Service
public class ExecutionClaimService {
    private final ExecutionRepository executions;
    private final TestCaseResultRepository results;
    public ExecutionClaimService(ExecutionRepository executions, TestCaseResultRepository results) { this.executions = executions; this.results = results; }
    @Transactional
    public UUID claimNext() { var queued = executions.claimQueued(PageRequest.of(0, 1)); if (queued.isEmpty()) return null; ExecutionEntity execution = queued.getFirst(); execution.start(Instant.now()); executions.save(execution); return execution.getId(); }
    @Transactional
    public ExecutionEntity heartbeat(UUID id) { var execution = executions.lockById(id).orElseThrow(); execution.heartbeat(Instant.now()); return execution; }
    @Transactional
    public void recoverStale(java.time.Duration staleAfter) { Instant cutoff = Instant.now().minus(staleAfter); for (ExecutionEntity execution : executions.findByStatusAndHeartbeatAtBefore(ExecutionStatus.RUNNING, cutoff)) { execution.finish(ExecutionStatus.ERROR, Instant.now(), "Worker heartbeat expired"); results.findByExecutionIdOrderByTestCase_NameAsc(execution.getId()).forEach(result -> { if (result.getStatus() == ExecutionStatus.RUNNING) result.finish(ExecutionStatus.ERROR, Instant.now(), "Worker heartbeat expired"); }); executions.save(execution); } }
}
