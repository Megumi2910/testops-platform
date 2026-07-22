package com.megumi.testops.execution.repository;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import jakarta.persistence.LockModeType;
import com.megumi.testops.execution.domain.ExecutionQueueGuardEntity;

public interface ExecutionQueueGuardRepository extends JpaRepository<ExecutionQueueGuardEntity, Boolean> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select g from ExecutionQueueGuardEntity g where g.id = true")
    Optional<ExecutionQueueGuardEntity> lockGuard();
}
