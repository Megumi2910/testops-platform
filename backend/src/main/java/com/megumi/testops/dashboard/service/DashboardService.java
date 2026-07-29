package com.megumi.testops.dashboard.service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.function.Predicate;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.megumi.testops.auth.domain.UserEntity;
import com.megumi.testops.dashboard.api.DashboardDtos;
import com.megumi.testops.execution.domain.ExecutionEntity;
import com.megumi.testops.execution.domain.ExecutionStatus;
import com.megumi.testops.execution.domain.TestCaseResultEntity;
import com.megumi.testops.execution.repository.ExecutionRepository;
import com.megumi.testops.execution.repository.TestCaseResultRepository;
import com.megumi.testops.project.repository.ProjectMemberRepository;
import com.megumi.testops.project.service.ProjectAccessService;
import com.megumi.testops.shared.api.ApiException;

@Service
public class DashboardService {
    private final ExecutionRepository executions;
    private final TestCaseResultRepository results;
    private final ProjectMemberRepository members;
    private final ProjectAccessService access;
    public DashboardService(ExecutionRepository executions, TestCaseResultRepository results, ProjectMemberRepository members, ProjectAccessService access) { this.executions = executions; this.results = results; this.members = members; this.access = access; }

    @Transactional(readOnly = true)
    public DashboardDtos.Summary summary(Jwt jwt, UUID projectId, UUID suiteId, String browser, Instant from, Instant to) {
        List<ExecutionEntity> rows = filtered(jwt, projectId, suiteId, browser, from, to);
        long passed = 0, failed = 0, errors = 0;
        for (ExecutionEntity execution : rows) for (TestCaseResultEntity result : results.findByExecutionIdOrderByTestCase_NameAsc(execution.getId())) {
            if (result.getStatus() == ExecutionStatus.PASSED) passed++; else if (result.getStatus() == ExecutionStatus.FAILED) failed++; else if (result.getStatus() == ExecutionStatus.ERROR) errors++;
        }
        long denominator = passed + failed;
        return new DashboardDtos.Summary(rows.size(), passed, failed, errors, rate(passed, denominator), rate(errors, denominator + errors), from, to);
    }
    @Transactional(readOnly = true) public List<DashboardDtos.Trend> trends(Jwt jwt, UUID projectId, UUID suiteId, String browser, Instant from, Instant to) { return filtered(jwt, projectId, suiteId, browser, from, to).stream().collect(Collectors.groupingBy(e -> e.getCreatedAt().atZone(ZoneOffset.UTC).toLocalDate())).entrySet().stream().sorted(java.util.Map.Entry.comparingByKey()).map(entry -> { long p=0,f=0,x=0; for (ExecutionEntity e:entry.getValue()) { p+=e.getPassedCases(); f+=e.getFailedCases(); x+=e.getErrorCases(); } return new DashboardDtos.Trend(entry.getKey(),p,f,x); }).toList(); }
    @Transactional(readOnly = true) public List<DashboardDtos.RecentFailure> recentFailures(Jwt jwt, UUID projectId, UUID suiteId, String browser, Instant from, Instant to) { return filtered(jwt, projectId, suiteId, browser, from, to).stream().flatMap(e -> results.findByExecutionIdOrderByTestCase_NameAsc(e.getId()).stream().filter(r -> r.getStatus() == ExecutionStatus.FAILED || r.getStatus() == ExecutionStatus.ERROR).map(r -> new DashboardDtos.RecentFailure(e.getId(), e.getProject().getId(), r.getTestCase().getId(), r.getCaseNameSnapshot(), r.getErrorCategory(), r.getErrorMessage(), r.getFinishedAt()))).sorted(java.util.Comparator.comparing(DashboardDtos.RecentFailure::finishedAt, java.util.Comparator.nullsLast(java.util.Comparator.reverseOrder()))).limit(50).toList(); }
    @Transactional(readOnly = true) public List<DashboardDtos.InfrastructureError> infrastructureErrors(Jwt jwt, UUID projectId, UUID suiteId, String browser, Instant from, Instant to) { return recentFailures(jwt, projectId, suiteId, browser, from, to).stream().filter(f -> f.category() != null).collect(Collectors.groupingBy(f -> f.category(), Collectors.counting())).entrySet().stream().map(e -> new DashboardDtos.InfrastructureError(e.getKey(), e.getValue())).sorted(java.util.Comparator.comparingLong(DashboardDtos.InfrastructureError::count).reversed()).toList(); }

    private List<ExecutionEntity> filtered(Jwt jwt, UUID projectId, UUID suiteId, String browser, Instant from, Instant to) {
        UserEntity user = access.user(jwt); Set<UUID> accessible = access.globalAdmin(jwt) ? null : members.findByUserId(user.getId()).stream().map(m -> m.getProject().getId()).collect(Collectors.toSet());
        Predicate<ExecutionEntity> predicate = e -> (accessible == null || accessible.contains(e.getProject().getId())) && (projectId == null || e.getProject().getId().equals(projectId)) && (suiteId == null || e.getSuite() != null && e.getSuite().getId().equals(suiteId)) && (browser == null || browser.isBlank() || browser.equalsIgnoreCase(e.getBrowser())) && (from == null || !e.getCreatedAt().isBefore(from)) && (to == null || e.getCreatedAt().isBefore(to));
        return executions.findAll().stream().filter(predicate).toList();
    }
    private static double rate(long numerator, long denominator) { return denominator == 0 ? 0d : (double) numerator / denominator; }
}
