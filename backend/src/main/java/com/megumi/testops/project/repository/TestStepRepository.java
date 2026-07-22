package com.megumi.testops.project.repository;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import com.megumi.testops.project.domain.TestStepEntity;

public interface TestStepRepository extends JpaRepository<TestStepEntity, UUID> {
    List<TestStepEntity> findByTestCaseIdOrderByPositionAsc(UUID caseId);
    void deleteByTestCaseId(UUID caseId);
}
