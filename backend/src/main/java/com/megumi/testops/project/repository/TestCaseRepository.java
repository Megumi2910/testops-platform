package com.megumi.testops.project.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import com.megumi.testops.project.domain.TestCaseEntity;

public interface TestCaseRepository extends JpaRepository<TestCaseEntity, UUID> {
    List<TestCaseEntity> findBySuiteIdAndStatusNotOrderByNameAsc(UUID suiteId, String status);
    List<TestCaseEntity> findBySuiteIdAndStatusOrderByNameAsc(UUID suiteId, String status);
    List<TestCaseEntity> findBySuiteIdOrderByNameAsc(UUID suiteId);
    Optional<TestCaseEntity> findByIdAndSuiteId(UUID id, UUID suiteId);
    boolean existsBySuiteIdAndNameIgnoreCase(UUID suiteId, String name);
    boolean existsBySuiteIdAndNameIgnoreCaseAndStatusNot(UUID suiteId, String name, String status);
}
