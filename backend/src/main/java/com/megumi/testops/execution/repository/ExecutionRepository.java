package com.megumi.testops.execution.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import jakarta.persistence.LockModeType;
import com.megumi.testops.execution.domain.ExecutionEntity;
import com.megumi.testops.execution.domain.ExecutionStatus;

public interface ExecutionRepository extends JpaRepository<ExecutionEntity, UUID> {
    List<ExecutionEntity> findByProjectIdOrderByCreatedAtDesc(UUID projectId);
    Optional<ExecutionEntity> findByProjectIdAndId(UUID projectId, UUID id);
    Optional<ExecutionEntity> findByProjectIdAndIdempotencyKey(UUID projectId, UUID idempotencyKey);
    long countByStatusIn(java.util.Collection<ExecutionStatus> statuses);
    List<ExecutionEntity> findByStatusAndHeartbeatAtBefore(ExecutionStatus status, java.time.Instant cutoff);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select e from ExecutionEntity e where e.status = com.megumi.testops.execution.domain.ExecutionStatus.QUEUED order by e.createdAt asc")
    List<ExecutionEntity> claimQueued(org.springframework.data.domain.Pageable pageable);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select e from ExecutionEntity e where e.id = :id")
    Optional<ExecutionEntity> lockById(UUID id);
}
