package com.megumi.testops.execution.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import com.megumi.testops.execution.domain.ExecutionArtifactEntity;

public interface ExecutionArtifactRepository extends JpaRepository<ExecutionArtifactEntity, UUID> { List<ExecutionArtifactEntity> findByExecutionIdOrderByCreatedAtAsc(UUID executionId); Optional<ExecutionArtifactEntity> findByExecutionIdAndId(UUID executionId, UUID id); List<ExecutionArtifactEntity> findByCreatedAtBeforeAndPurgedAtIsNull(java.time.Instant cutoff); }
