package com.megumi.testops.project.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import com.megumi.testops.project.domain.TestSuiteEntity;

public interface TestSuiteRepository extends JpaRepository<TestSuiteEntity, UUID> {
    List<TestSuiteEntity> findByProjectIdAndStatusNotOrderByNameAsc(UUID projectId, String status);
    List<TestSuiteEntity> findByProjectIdAndStatusOrderByNameAsc(UUID projectId, String status);
    List<TestSuiteEntity> findByProjectIdOrderByNameAsc(UUID projectId);
    Optional<TestSuiteEntity> findByIdAndProjectId(UUID id, UUID projectId);
    boolean existsByProjectIdAndNameIgnoreCase(UUID projectId, String name);
    boolean existsByProjectIdAndNameIgnoreCaseAndStatusNot(UUID projectId, String name, String status);
}
