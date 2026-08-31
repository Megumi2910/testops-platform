package com.megumi.testops;

import javax.sql.DataSource;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.boot.health.actuate.endpoint.HealthEndpoint;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;

import com.megumi.testops.auth.domain.UserEntity;
import com.megumi.testops.auth.repository.UserRepository;
import com.megumi.testops.dashboard.repository.DashboardReadRepository;
import com.megumi.testops.execution.domain.ExecutionEntity;
import com.megumi.testops.execution.domain.ExecutionStatus;
import com.megumi.testops.execution.domain.TestCaseResultEntity;
import com.megumi.testops.execution.repository.ExecutionRepository;
import com.megumi.testops.execution.repository.TestCaseResultRepository;
import com.megumi.testops.project.domain.ProjectEntity;
import com.megumi.testops.project.domain.ProjectMemberEntity;
import com.megumi.testops.project.domain.TestCaseEntity;
import com.megumi.testops.project.domain.TestSuiteEntity;
import com.megumi.testops.project.api.ProjectDtos;
import com.megumi.testops.project.repository.ProjectMemberRepository;
import com.megumi.testops.project.repository.ProjectOnboardingRepository;
import com.megumi.testops.project.repository.ProjectRepository;
import com.megumi.testops.project.repository.TestCaseRepository;
import com.megumi.testops.project.repository.TestSuiteRepository;
import com.megumi.testops.project.service.ProjectService;
import com.megumi.testops.shared.api.ApiException;

import java.time.Instant;

@SpringBootTest
@ActiveProfiles("test")
class ApplicationContextIT {
    private static final String EXTERNAL_DATABASE_URL = System.getenv("TEST_DATABASE_URL");
    private static final PostgreSQLContainer<?> POSTGRES = externalDatabaseConfigured()
            ? null
            : new PostgreSQLContainer<>("postgres:18.4-alpine3.24");

    static {
        if (POSTGRES != null) POSTGRES.start();
    }

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("DB_URL", ApplicationContextIT::databaseUrl);
        registry.add("DB_USERNAME", ApplicationContextIT::databaseUsername);
        registry.add("DB_PASSWORD", ApplicationContextIT::databasePassword);
        registry.add("spring.datasource.url", ApplicationContextIT::databaseUrl);
        registry.add("spring.datasource.username", ApplicationContextIT::databaseUsername);
        registry.add("spring.datasource.password", ApplicationContextIT::databasePassword);
    }

    @AfterAll
    static void stopManagedDatabase() {
        if (POSTGRES != null) POSTGRES.stop();
    }

    @Autowired
    private HealthEndpoint healthEndpoint;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private Flyway flyway;

    @Autowired
    private DataSource dataSource;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ProjectRepository projectRepository;

    @Autowired
    private ProjectMemberRepository projectMemberRepository;

    @Autowired
    private ProjectOnboardingRepository projectOnboardingRepository;

    @Autowired
    private TestSuiteRepository testSuiteRepository;

    @Autowired
    private TestCaseRepository testCaseRepository;

    @Autowired
    private ExecutionRepository executionRepository;

    @Autowired
    private TestCaseResultRepository testCaseResultRepository;

    @Autowired
    private DashboardReadRepository dashboardReadRepository;

    @Autowired
    private ProjectService projectService;

    @Test
    void startsWithPostgresFlywayAndHealthyActuator() throws Exception {
        org.junit.jupiter.api.Assertions.assertEquals(
                org.springframework.boot.health.contributor.Status.UP,
                healthEndpoint.health().getStatus());

        Integer probeRows = jdbcTemplate.queryForObject(
                "select count(*) from backbone_test_probe", Integer.class);
        org.junit.jupiter.api.Assertions.assertEquals(1, probeRows);
        org.junit.jupiter.api.Assertions.assertNotNull(flyway.info().current());
        // Flyway preserves the migration's zero-padded identifier (V020), so
        // compare the semantic version number instead of its display format.
        org.junit.jupiter.api.Assertions.assertEquals(
                24,
                Integer.parseInt(flyway.info().current().getVersion().getVersion()));
        Integer targetHealthColumns = jdbcTemplate.queryForObject("""
                select count(*)
                  from information_schema.columns
                 where table_schema = 'public'
                   and table_name = 'projects'
                   and column_name in (
                       'target_check_status',
                       'target_checked_at',
                       'target_check_http_status',
                       'target_check_reason'
                   )
                """, Integer.class);
        org.junit.jupiter.api.Assertions.assertEquals(4, targetHealthColumns);
        try (var connection = dataSource.getConnection()) {
            org.junit.jupiter.api.Assertions.assertTrue(connection.isValid(2));
        }
    }

    @Test
    void memberProjectListingUsesProjectNameOrdering() {
        Instant now = Instant.now();
        UserEntity user = userRepository.save(new UserEntity("member-list@example.test", "Member list", "ACTIVE", true, now));
        ProjectEntity beta = projectRepository.save(new ProjectEntity("Beta", null, "https://beta.example.test", user, now));
        ProjectEntity alpha = projectRepository.save(new ProjectEntity("Alpha", null, "https://alpha.example.test", user, now));
        projectMemberRepository.save(new ProjectMemberEntity(beta, user, "PROJECT_MANAGER", now));
        projectMemberRepository.save(new ProjectMemberEntity(alpha, user, "TESTER", now));

        var page = projectMemberRepository.findProjectsForUser(user.getId(), "", PageRequest.of(0, 25, Sort.unsorted()));

        org.junit.jupiter.api.Assertions.assertEquals(java.util.List.of("Alpha", "Beta"), page.getContent().stream().map(ProjectEntity::getName).toList());
    }

    @Test
    void onboardingCountsIncludeArchivedDefinitionsAndExecutionHistory() {
        Instant now = Instant.now();
        UserEntity user = userRepository.save(new UserEntity(
                "onboarding-counts@example.test", "Onboarding counts", "ACTIVE", true, now));
        ProjectEntity project = projectRepository.save(new ProjectEntity(
                "Onboarding aggregate", null, "https://onboarding.example.test", user, now));
        TestSuiteEntity activeSuite = testSuiteRepository.save(
                new TestSuiteEntity(project, "Active suite", null, user, now));
        TestSuiteEntity archivedSuite = new TestSuiteEntity(project, "Archived suite", null, user, now);
        archivedSuite.archive(now);
        testSuiteRepository.save(archivedSuite);
        testCaseRepository.save(new TestCaseEntity(
                activeSuite, "Draft case", null, "DRAFT", "MEDIUM", null, 0, false, user, now));
        testCaseRepository.save(new TestCaseEntity(
                archivedSuite, "Ready case", null, "READY", "HIGH", null, 0, false, user, now));
        executionRepository.save(new ExecutionEntity(
                project, activeSuite, user, 1, java.util.UUID.randomUUID(), now));

        var counts = projectOnboardingRepository.findByProjectIds(java.util.List.of(project.getId()))
                .get(project.getId());

        org.junit.jupiter.api.Assertions.assertNotNull(counts);
        org.junit.jupiter.api.Assertions.assertEquals(2, counts.suiteCount());
        org.junit.jupiter.api.Assertions.assertEquals(2, counts.caseCount());
        org.junit.jupiter.api.Assertions.assertEquals(1, counts.readyCaseCount());
        org.junit.jupiter.api.Assertions.assertEquals(1, counts.executionCount());
    }

    @Test
    void targetHealthPersistsAndResetsWhenTargetChanges() {
        Instant now = Instant.now();
        UserEntity user = userRepository.save(new UserEntity(
                "target-health@example.test", "Target health", "ACTIVE", true, now));
        ProjectEntity project = new ProjectEntity(
                "Target health reset", null, "https://first.example.test", user, now);
        project.recordTargetCheck("REACHABLE", 200, null, now);
        project = projectRepository.saveAndFlush(project);

        ProjectEntity persisted = projectRepository.findById(project.getId()).orElseThrow();
        org.junit.jupiter.api.Assertions.assertEquals("REACHABLE", persisted.getTargetCheckStatus());
        org.junit.jupiter.api.Assertions.assertEquals(200, persisted.getTargetCheckHttpStatus());

        persisted.update(persisted.getName(), persisted.getDescription(), "https://second.example.test", now.plusSeconds(1));
        projectRepository.saveAndFlush(persisted);
        ProjectEntity reset = projectRepository.findById(project.getId()).orElseThrow();

        org.junit.jupiter.api.Assertions.assertEquals("NOT_CHECKED", reset.getTargetCheckStatus());
        org.junit.jupiter.api.Assertions.assertNull(reset.getTargetCheckHttpStatus());
        org.junit.jupiter.api.Assertions.assertNull(reset.getTargetCheckedAt());
        org.junit.jupiter.api.Assertions.assertNull(reset.getTargetCheckReason());
    }

    @Test
    void archivedDefinitionsRetainHistoryAndAllowActiveNameReuse() {
        Instant now = Instant.now();
        UserEntity user = userRepository.save(new UserEntity(
                "definition-trash@example.test", "Definition trash", "ACTIVE", true, now));
        ProjectEntity project = projectRepository.save(new ProjectEntity(
                "Definition trash project", null, "https://trash.example.test", user, now));
        TestSuiteEntity archivedSuite = new TestSuiteEntity(project, "Reusable suite", null, user, now);
        archivedSuite.archive(user, now);
        archivedSuite = testSuiteRepository.saveAndFlush(archivedSuite);
        TestSuiteEntity activeSuite = testSuiteRepository.saveAndFlush(
                new TestSuiteEntity(project, "Reusable suite", null, user, now));
        TestCaseEntity archivedCase = new TestCaseEntity(activeSuite, "Reusable case", null, "DRAFT", "MEDIUM",
                null, 0, true, user, now);
        archivedCase.archive(user, now);
        archivedCase = testCaseRepository.saveAndFlush(archivedCase);
        testCaseRepository.saveAndFlush(new TestCaseEntity(activeSuite, "Reusable case", null, "DRAFT", "MEDIUM",
                null, 0, true, user, now));
        ExecutionEntity execution = executionRepository.saveAndFlush(new ExecutionEntity(
                project, archivedSuite, user, 1, java.util.UUID.randomUUID(), now));

        TestSuiteEntity storedSuite = testSuiteRepository.findById(archivedSuite.getId()).orElseThrow();
        TestCaseEntity storedCase = testCaseRepository.findById(archivedCase.getId()).orElseThrow();
        org.junit.jupiter.api.Assertions.assertEquals("ARCHIVED", storedSuite.getStatus());
        org.junit.jupiter.api.Assertions.assertEquals(user.getId(), storedSuite.getArchivedBy().getId());
        org.junit.jupiter.api.Assertions.assertNotNull(storedSuite.getArchivedAt());
        org.junit.jupiter.api.Assertions.assertEquals("ARCHIVED", storedCase.getStatus());
        org.junit.jupiter.api.Assertions.assertEquals(user.getId(), storedCase.getArchivedBy().getId());
        org.junit.jupiter.api.Assertions.assertTrue(executionRepository.findById(execution.getId()).isPresent());
    }

    @Test
    void dashboardAggregatesStayTenantScopedBoundedAndCoverTheFullWindow() {
        Instant from = Instant.parse("2026-01-01T00:00:00Z");
        Instant inside = Instant.parse("2026-01-01T12:00:00Z");
        Instant to = Instant.parse("2026-01-02T00:00:00Z");
        UserEntity member = userRepository.save(new UserEntity(
                "dashboard-member@example.test", "Dashboard member", "ACTIVE", true, from));
        UserEntity outsider = userRepository.save(new UserEntity(
                "dashboard-outsider@example.test", "Dashboard outsider", "ACTIVE", true, from));
        ProjectEntity visibleProject = projectRepository.save(new ProjectEntity(
                "Dashboard visible", null, "https://dashboard-visible.example.test", member, from));
        ProjectEntity hiddenProject = projectRepository.save(new ProjectEntity(
                "Dashboard hidden", null, "https://dashboard-hidden.example.test", outsider, from));
        projectMemberRepository.save(new ProjectMemberEntity(visibleProject, member, "VIEWER", from));
        projectMemberRepository.save(new ProjectMemberEntity(hiddenProject, outsider, "PROJECT_MANAGER", from));
        TestSuiteEntity visibleSuite = testSuiteRepository.save(new TestSuiteEntity(
                visibleProject, "Visible suite", null, member, from));
        TestSuiteEntity hiddenSuite = testSuiteRepository.save(new TestSuiteEntity(
                hiddenProject, "Hidden suite", null, outsider, from));
        TestCaseEntity visibleCase = testCaseRepository.save(new TestCaseEntity(
                visibleSuite, "Visible case", null, "READY", "MEDIUM", null, 0, false, member, from));
        TestCaseEntity hiddenCase = testCaseRepository.save(new TestCaseEntity(
                hiddenSuite, "Hidden case", null, "READY", "MEDIUM", null, 0, false, outsider, from));

        persistResult(visibleProject, visibleSuite, visibleCase, member, from,
                ExecutionStatus.PASSED, null);
        for (int index = 0; index < 55; index++) {
            persistResult(visibleProject, visibleSuite, visibleCase, member, inside.plusSeconds(index),
                    ExecutionStatus.ERROR, "TARGET_UNREACHABLE");
        }
        persistResult(hiddenProject, hiddenSuite, hiddenCase, outsider, inside,
                ExecutionStatus.ERROR, "HIDDEN_PROJECT_ERROR");
        persistResult(visibleProject, visibleSuite, visibleCase, member, to,
                ExecutionStatus.ERROR, "END_BOUNDARY_ERROR");

        DashboardReadRepository.Filter filter = new DashboardReadRepository.Filter(
                member.getId(), false, null, null, null, from, to);
        DashboardReadRepository.Totals totals = dashboardReadRepository.totals(filter);
        var trends = dashboardReadRepository.trends(filter);
        var recent = dashboardReadRepository.recentFailures(filter, 50);
        var infrastructure = dashboardReadRepository.infrastructureErrors(filter);

        org.junit.jupiter.api.Assertions.assertEquals(56, totals.totalExecutions());
        org.junit.jupiter.api.Assertions.assertEquals(1, totals.passedCases());
        org.junit.jupiter.api.Assertions.assertEquals(0, totals.failedCases());
        org.junit.jupiter.api.Assertions.assertEquals(55, totals.errorCases());
        org.junit.jupiter.api.Assertions.assertEquals(1, trends.size());
        org.junit.jupiter.api.Assertions.assertEquals(java.time.LocalDate.of(2026, 1, 1), trends.getFirst().day());
        org.junit.jupiter.api.Assertions.assertEquals(55, trends.getFirst().errors());
        org.junit.jupiter.api.Assertions.assertEquals(50, recent.size());
        org.junit.jupiter.api.Assertions.assertTrue(recent.stream()
                .allMatch(row -> row.projectId().equals(visibleProject.getId())));
        org.junit.jupiter.api.Assertions.assertEquals(
                java.util.List.of(new DashboardReadRepository.InfrastructureErrorRow("TARGET_UNREACHABLE", 55)),
                infrastructure);
    }

    @Test
    void membershipTransitionsPreserveManagerVersionAndArchiveInvariants() {
        Instant now = Instant.now();
        UserEntity owner = userRepository.save(new UserEntity(
                "membership-owner@example.test", "Membership owner", "ACTIVE", true, now));
        UserEntity secondManager = userRepository.save(new UserEntity(
                "membership-second@example.test", "Membership second", "ACTIVE", true, now));
        ProjectEntity project = projectRepository.saveAndFlush(new ProjectEntity(
                "Membership integration", null, "https://membership.example.test", owner, now));
        projectMemberRepository.saveAndFlush(new ProjectMemberEntity(project, owner, "PROJECT_MANAGER", now));
        projectMemberRepository.saveAndFlush(new ProjectMemberEntity(project, secondManager, "PROJECT_MANAGER", now));
        Jwt ownerJwt = Jwt.withTokenValue("membership-integration").header("alg", "none")
                .subject(owner.getId().toString()).build();

        ProjectDtos.MemberResponse demoted = projectService.changeMember(ownerJwt, project.getId(),
                secondManager.getId(), new ProjectDtos.MemberRoleRequest("TEST_MANAGER", project.getVersion()));

        org.junit.jupiter.api.Assertions.assertEquals("TEST_MANAGER", demoted.role());
        org.junit.jupiter.api.Assertions.assertEquals(1,
                projectMemberRepository.countByProjectIdAndRole(project.getId(), "PROJECT_MANAGER"));
        ProjectEntity afterDemotion = projectRepository.findById(project.getId()).orElseThrow();
        ApiException finalManager = org.junit.jupiter.api.Assertions.assertThrows(ApiException.class,
                () -> projectService.changeMember(ownerJwt, project.getId(), owner.getId(),
                        new ProjectDtos.MemberRoleRequest("VIEWER", afterDemotion.getVersion())));
        org.junit.jupiter.api.Assertions.assertEquals("final_project_manager", finalManager.getCode());
        org.junit.jupiter.api.Assertions.assertEquals("PROJECT_MANAGER",
                projectMemberRepository.findByProjectIdAndUserId(project.getId(), owner.getId()).orElseThrow().getRole());

        ApiException stale = org.junit.jupiter.api.Assertions.assertThrows(ApiException.class,
                () -> projectService.removeMember(ownerJwt, project.getId(), secondManager.getId(), -1L));
        org.junit.jupiter.api.Assertions.assertEquals("stale_version", stale.getCode());
        org.junit.jupiter.api.Assertions.assertTrue(
                projectMemberRepository.existsByProjectIdAndUserId(project.getId(), secondManager.getId()));

        ProjectEntity archived = projectRepository.findById(project.getId()).orElseThrow();
        archived.archive(Instant.now());
        projectRepository.saveAndFlush(archived);
        ApiException readOnly = org.junit.jupiter.api.Assertions.assertThrows(ApiException.class,
                () -> projectService.removeMember(ownerJwt, project.getId(), secondManager.getId(),
                        archived.getVersion()));
        org.junit.jupiter.api.Assertions.assertEquals("project_archived", readOnly.getCode());
        org.junit.jupiter.api.Assertions.assertTrue(
                projectMemberRepository.existsByProjectIdAndUserId(project.getId(), secondManager.getId()));
    }

    private void persistResult(ProjectEntity project, TestSuiteEntity suite, TestCaseEntity testCase, UserEntity requester,
            Instant createdAt, ExecutionStatus status, String category) {
        ExecutionEntity execution = new ExecutionEntity(
                project, suite, requester, 1, java.util.UUID.randomUUID(), createdAt);
        execution.record(status);
        execution.finish(status, createdAt.plusSeconds(1), category);
        execution = executionRepository.save(execution);
        TestCaseResultEntity result = new TestCaseResultEntity(execution, testCase);
        result.start(createdAt);
        if (category != null) result.setFailure(1, category);
        result.finish(status, createdAt.plusSeconds(1), category);
        testCaseResultRepository.save(result);
    }

    private static boolean externalDatabaseConfigured() {
        return EXTERNAL_DATABASE_URL != null && !EXTERNAL_DATABASE_URL.isBlank();
    }

    private static String databaseUrl() {
        return externalDatabaseConfigured() ? EXTERNAL_DATABASE_URL : POSTGRES.getJdbcUrl();
    }

    private static String databaseUsername() {
        return externalDatabaseConfigured() ? System.getenv("TEST_DATABASE_USERNAME") : POSTGRES.getUsername();
    }

    private static String databasePassword() {
        return externalDatabaseConfigured() ? System.getenv("TEST_DATABASE_PASSWORD") : POSTGRES.getPassword();
    }
}
