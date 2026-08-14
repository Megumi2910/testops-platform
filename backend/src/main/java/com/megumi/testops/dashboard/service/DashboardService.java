package com.megumi.testops.dashboard.service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.megumi.testops.auth.domain.UserEntity;
import com.megumi.testops.dashboard.api.DashboardDtos;
import com.megumi.testops.dashboard.repository.DashboardReadRepository;
import com.megumi.testops.project.service.ProjectAccessService;

@Service
public class DashboardService {
    private static final int RECENT_FAILURE_LIMIT = 50;

    private final DashboardReadRepository dashboard;
    private final ProjectAccessService access;
    public DashboardService(DashboardReadRepository dashboard, ProjectAccessService access) {
        this.dashboard = dashboard;
        this.access = access;
    }

    @Transactional(readOnly = true)
    public DashboardDtos.Summary summary(Jwt jwt, UUID projectId, UUID suiteId, String browser, Instant from, Instant to) {
        DashboardReadRepository.Totals totals = dashboard.totals(filter(jwt, projectId, suiteId, browser, from, to));
        long functional = totals.passedCases() + totals.failedCases();
        long allCompleted = functional + totals.errorCases();
        return new DashboardDtos.Summary(totals.totalExecutions(), totals.passedCases(), totals.failedCases(),
                totals.errorCases(), rate(totals.passedCases(), functional), rate(totals.errorCases(), allCompleted), from, to);
    }
    @Transactional(readOnly = true)
    public List<DashboardDtos.Trend> trends(Jwt jwt, UUID projectId, UUID suiteId, String browser, Instant from, Instant to) {
        return dashboard.trends(filter(jwt, projectId, suiteId, browser, from, to)).stream()
                .map(row -> new DashboardDtos.Trend(row.day(), row.passed(), row.failed(), row.errors())).toList();
    }

    @Transactional(readOnly = true)
    public List<DashboardDtos.RecentFailure> recentFailures(Jwt jwt, UUID projectId, UUID suiteId, String browser,
            Instant from, Instant to) {
        return dashboard.recentFailures(filter(jwt, projectId, suiteId, browser, from, to), RECENT_FAILURE_LIMIT).stream()
                .map(row -> new DashboardDtos.RecentFailure(row.executionId(), row.projectId(), row.caseId(),
                        row.caseName(), row.category(), row.message(), row.finishedAt()))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<DashboardDtos.InfrastructureError> infrastructureErrors(Jwt jwt, UUID projectId, UUID suiteId,
            String browser, Instant from, Instant to) {
        return dashboard.infrastructureErrors(filter(jwt, projectId, suiteId, browser, from, to)).stream()
                .map(row -> new DashboardDtos.InfrastructureError(row.category(), row.count())).toList();
    }

    private DashboardReadRepository.Filter filter(Jwt jwt, UUID projectId, UUID suiteId, String browser,
            Instant from, Instant to) {
        UserEntity user = access.user(jwt);
        return new DashboardReadRepository.Filter(user.getId(), access.globalAdmin(jwt), projectId, suiteId,
                browser, from, to);
    }

    private static double rate(long numerator, long denominator) { return denominator == 0 ? 0d : (double) numerator / denominator; }
}
