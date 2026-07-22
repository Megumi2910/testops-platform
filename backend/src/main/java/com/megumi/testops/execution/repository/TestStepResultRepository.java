package com.megumi.testops.execution.repository;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import com.megumi.testops.execution.domain.TestStepResultEntity;

public interface TestStepResultRepository extends JpaRepository<TestStepResultEntity, UUID> { List<TestStepResultEntity> findByCaseResultIdOrderByPositionAsc(UUID caseResultId); }
