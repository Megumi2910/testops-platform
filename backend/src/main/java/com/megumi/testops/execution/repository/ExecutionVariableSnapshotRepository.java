package com.megumi.testops.execution.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.megumi.testops.execution.domain.ExecutionVariableSnapshotEntity;

public interface ExecutionVariableSnapshotRepository extends JpaRepository<ExecutionVariableSnapshotEntity, UUID> {
    List<ExecutionVariableSnapshotEntity> findByExecutionIdOrderByKeyAsc(UUID executionId);
}
