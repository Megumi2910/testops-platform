package com.megumi.testops.dashboard.api;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.megumi.testops.dashboard.service.DashboardService;

@RestController
@RequestMapping("/api/v1/dashboard")
public class DashboardController {
    private final DashboardService service;
    public DashboardController(DashboardService service) { this.service = service; }
    @GetMapping("/summary") public DashboardDtos.Summary summary(@AuthenticationPrincipal Jwt jwt, @RequestParam(required = false) UUID projectId, @RequestParam(required = false) UUID suiteId, @RequestParam(required = false) String browser, @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from, @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to) { Window window = window(from, to); return service.summary(jwt, projectId, suiteId, browser, window.from, window.to); }
    @GetMapping("/trends") public List<DashboardDtos.Trend> trends(@AuthenticationPrincipal Jwt jwt, @RequestParam(required = false) UUID projectId, @RequestParam(required = false) UUID suiteId, @RequestParam(required = false) String browser, @RequestParam(required = false) Instant from, @RequestParam(required = false) Instant to) { Window window = window(from, to); return service.trends(jwt, projectId, suiteId, browser, window.from, window.to); }
    @GetMapping("/recent-failures") public List<DashboardDtos.RecentFailure> recent(@AuthenticationPrincipal Jwt jwt, @RequestParam(required = false) UUID projectId, @RequestParam(required = false) UUID suiteId, @RequestParam(required = false) String browser, @RequestParam(required = false) Instant from, @RequestParam(required = false) Instant to) { Window window = window(from, to); return service.recentFailures(jwt, projectId, suiteId, browser, window.from, window.to); }
    @GetMapping("/infrastructure-errors") public List<DashboardDtos.InfrastructureError> infrastructure(@AuthenticationPrincipal Jwt jwt, @RequestParam(required = false) UUID projectId, @RequestParam(required = false) UUID suiteId, @RequestParam(required = false) String browser, @RequestParam(required = false) Instant from, @RequestParam(required = false) Instant to) { Window window = window(from, to); return service.infrastructureErrors(jwt, projectId, suiteId, browser, window.from, window.to); }
    private static Window window(Instant from, Instant to) { Instant end = to == null ? Instant.now() : to; Instant start = from == null ? end.minus(java.time.Duration.ofDays(30)) : from; if (end.isBefore(start) || java.time.Duration.between(start, end).toDays() > 366) throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, "Date range must be between 0 and 366 days"); return new Window(start, end); }
    private record Window(Instant from, Instant to) { }
}
