package com.megumi.testops.project.repository;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import com.megumi.testops.project.domain.TestStepEntity;

public interface TestStepRepository extends JpaRepository<TestStepEntity, UUID> {
    List<TestStepEntity> findByTestCaseIdOrderByPositionAsc(UUID caseId);
    void deleteByTestCaseId(UUID caseId);

    @Query("""
            select count(step)
            from TestStepEntity step
            where step.testCase.suite.project.id = :projectId
              and (
                locate(upper(:reference), upper(coalesce(step.locatorValue, ''))) > 0
                or locate(upper(:reference), upper(coalesce(step.inputValue, ''))) > 0
                or locate(upper(:reference), upper(coalesce(step.expectedValue, ''))) > 0
              )
            """)
    long countVariableReferences(@Param("projectId") UUID projectId, @Param("reference") String reference);
}
