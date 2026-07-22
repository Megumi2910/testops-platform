package com.megumi.testops.execution.repository;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import com.megumi.testops.execution.domain.TestCaseResultEntity;

public interface TestCaseResultRepository extends JpaRepository<TestCaseResultEntity, UUID> { List<TestCaseResultEntity> findByExecutionIdOrderByTestCase_NameAsc(UUID executionId); }
