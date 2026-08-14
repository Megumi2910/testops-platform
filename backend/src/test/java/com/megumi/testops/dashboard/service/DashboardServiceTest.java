package com.megumi.testops.dashboard.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;

import com.megumi.testops.auth.domain.UserEntity;
import com.megumi.testops.dashboard.api.DashboardDtos;
import com.megumi.testops.dashboard.repository.DashboardReadRepository;
import com.megumi.testops.project.service.ProjectAccessService;

class DashboardServiceTest {
    private static final Instant FROM = Instant.parse("2026-08-01T00:00:00Z");
    private static final Instant TO = Instant.parse("2026-08-11T00:00:00Z");
    private static final UUID USER_ID = UUID.fromString("10000000-0000-0000-0000-000000000001");

    private final DashboardReadRepository dashboard = mock(DashboardReadRepository.class);
    private final ProjectAccessService access = mock(ProjectAccessService.class);
    private final DashboardService service = new DashboardService(dashboard, access);
    private final Jwt jwt = Jwt.withTokenValue("token").header("alg", "none").subject(USER_ID.toString()).build();

    @Test
    void summaryUsesOneScopedAggregateAndCalculatesRates() {
        UUID projectId = UUID.randomUUID();
        UUID suiteId = UUID.randomUUID();
        DashboardReadRepository.Filter filter = filter(projectId, suiteId, "chromium", false);
        authenticated(false);
        when(dashboard.totals(filter)).thenReturn(new DashboardReadRepository.Totals(12, 8, 2, 2));

        DashboardDtos.Summary response = service.summary(jwt, projectId, suiteId, " chromium ", FROM, TO);

        assertEquals(12, response.totalExecutions());
        assertEquals(0.8d, response.functionalPassRate());
        assertEquals(1d / 6d, response.infrastructureErrorRate());
        verify(dashboard).totals(filter);
    }

    @Test
    void trendsComeFromDatabaseAggregatesInUtcOrder() {
        DashboardReadRepository.Filter filter = filter(null, null, null, true);
        authenticated(true);
        when(dashboard.trends(filter)).thenReturn(List.of(
                new DashboardReadRepository.TrendRow(LocalDate.of(2026, 8, 9), 3, 1, 0),
                new DashboardReadRepository.TrendRow(LocalDate.of(2026, 8, 10), 5, 0, 1)));

        List<DashboardDtos.Trend> response = service.trends(jwt, null, null, " ", FROM, TO);

        assertEquals(List.of(LocalDate.of(2026, 8, 9), LocalDate.of(2026, 8, 10)),
                response.stream().map(DashboardDtos.Trend::day).toList());
        verify(dashboard).trends(filter);
    }

    @Test
    void recentFailuresHaveAnExplicitBoundedQueryLimit() {
        DashboardReadRepository.Filter filter = filter(null, null, null, false);
        authenticated(false);
        when(dashboard.recentFailures(filter, 50)).thenReturn(List.of());

        assertEquals(List.of(), service.recentFailures(jwt, null, null, null, FROM, TO));

        verify(dashboard).recentFailures(filter, 50);
    }

    @Test
    void infrastructureCategoriesUseTheirOwnFullWindowAggregate() {
        DashboardReadRepository.Filter filter = filter(null, null, null, false);
        authenticated(false);
        when(dashboard.infrastructureErrors(filter)).thenReturn(List.of(
                new DashboardReadRepository.InfrastructureErrorRow("TARGET_UNREACHABLE", 74),
                new DashboardReadRepository.InfrastructureErrorRow("BROWSER_CRASH", 3)));

        List<DashboardDtos.InfrastructureError> response = service.infrastructureErrors(
                jwt, null, null, null, FROM, TO);

        assertEquals(74, response.getFirst().count());
        assertEquals("TARGET_UNREACHABLE", response.getFirst().category());
        verify(dashboard).infrastructureErrors(filter);
    }

    private void authenticated(boolean globalAdmin) {
        UserEntity user = mock(UserEntity.class);
        when(user.getId()).thenReturn(USER_ID);
        when(access.user(jwt)).thenReturn(user);
        when(access.globalAdmin(jwt)).thenReturn(globalAdmin);
    }

    private static DashboardReadRepository.Filter filter(UUID projectId, UUID suiteId, String browser,
            boolean globalAdmin) {
        return new DashboardReadRepository.Filter(USER_ID, globalAdmin, projectId, suiteId, browser, FROM, TO);
    }
}
