package com.megumi.testops.execution.domain;

import java.time.Instant;
import jakarta.persistence.*;

@Entity @Table(name = "test_execution_queue_guard")
public class ExecutionQueueGuardEntity {
    @Id private Boolean id;
    @Column(name = "active_count", nullable = false) private int activeCount;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    protected ExecutionQueueGuardEntity() { }
    public boolean full(int capacity) { return activeCount >= capacity; }
    public void acquire() { activeCount++; updatedAt = Instant.now(); }
    public void release() { activeCount = Math.max(0, activeCount - 1); updatedAt = Instant.now(); }
}
