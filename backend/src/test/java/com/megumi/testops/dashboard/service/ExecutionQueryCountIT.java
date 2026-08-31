package com.megumi.testops.dashboard.service;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;

import com.megumi.testops.auth.domain.UserEntity;
import com.megumi.testops.dashboard.repository.DashboardReadRepository;
import com.megumi.testops.project.service.ProjectAccessService;

/** Query-budget regression: each dashboard panel owns one bounded read. */
class ExecutionQueryCountIT {
    @Test
    void dashboardPanelsUseIndependentBoundedReads() {
        DashboardReadRepository dashboard = mock(DashboardReadRepository.class);
        ProjectAccessService access = mock(ProjectAccessService.class);
        DashboardService service = new DashboardService(dashboard, access);
        UUID userId = UUID.randomUUID();
        Jwt jwt = Jwt.withTokenValue("test").header("alg", "none").subject(userId.toString()).build();
        UserEntity user = mock(UserEntity.class);
        when(user.getId()).thenReturn(userId);
        when(access.user(jwt)).thenReturn(user);
        when(access.globalAdmin(jwt)).thenReturn(false);
        var from = Instant.parse("2026-08-01T00:00:00Z");
        var to = Instant.parse("2026-08-02T00:00:00Z");
        when(dashboard.totals(org.mockito.ArgumentMatchers.any())).thenReturn(new DashboardReadRepository.Totals(0, 0, 0, 0));
        when(dashboard.trends(org.mockito.ArgumentMatchers.any())).thenReturn(java.util.List.of());
        when(dashboard.recentFailures(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.eq(50))).thenReturn(java.util.List.of());
        when(dashboard.infrastructureErrors(org.mockito.ArgumentMatchers.any())).thenReturn(java.util.List.of());

        service.summary(jwt, null, null, null, from, to);
        service.trends(jwt, null, null, null, from, to);
        service.recentFailures(jwt, null, null, null, from, to);
        service.infrastructureErrors(jwt, null, null, null, from, to);

        var calls = inOrder(dashboard);
        calls.verify(dashboard).totals(org.mockito.ArgumentMatchers.any());
        calls.verify(dashboard).trends(org.mockito.ArgumentMatchers.any());
        calls.verify(dashboard).recentFailures(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.eq(50));
        calls.verify(dashboard).infrastructureErrors(org.mockito.ArgumentMatchers.any());
        verifyNoMoreInteractions(dashboard);
    }
}
