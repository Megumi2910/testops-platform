package com.megumi.testops.execution.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.megumi.testops.execution.domain.ExecutionStepSnapshotEntity;

public interface ExecutionStepSnapshotRepository extends JpaRepository<ExecutionStepSnapshotEntity, UUID> {
    List<ExecutionStepSnapshotEntity> findByCaseResultIdOrderByPositionAsc(UUID caseResultId);
}
