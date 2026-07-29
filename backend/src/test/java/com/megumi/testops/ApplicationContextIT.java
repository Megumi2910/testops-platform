package com.megumi.testops;

import javax.sql.DataSource;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.boot.health.actuate.endpoint.HealthEndpoint;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.megumi.testops.auth.domain.UserEntity;
import com.megumi.testops.auth.repository.UserRepository;
import com.megumi.testops.execution.domain.ExecutionEntity;
import com.megumi.testops.execution.repository.ExecutionRepository;
import com.megumi.testops.project.domain.ProjectEntity;
import com.megumi.testops.project.domain.ProjectMemberEntity;
import com.megumi.testops.project.domain.TestCaseEntity;
import com.megumi.testops.project.domain.TestSuiteEntity;
import com.megumi.testops.project.repository.ProjectMemberRepository;
import com.megumi.testops.project.repository.ProjectOnboardingRepository;
import com.megumi.testops.project.repository.ProjectRepository;
import com.megumi.testops.project.repository.TestCaseRepository;
import com.megumi.testops.project.repository.TestSuiteRepository;

import java.time.Instant;

@Testcontainers
@SpringBootTest
@ActiveProfiles("test")
class ApplicationContextIT {

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:18.4-alpine3.24");

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("DB_URL", POSTGRES::getJdbcUrl);
        registry.add("DB_USERNAME", POSTGRES::getUsername);
        registry.add("DB_PASSWORD", POSTGRES::getPassword);
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
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

    @Test
    void startsWithPostgresFlywayAndHealthyActuator() throws Exception {
        org.junit.jupiter.api.Assertions.assertEquals(
                org.springframework.boot.health.contributor.Status.UP,
                healthEndpoint.health().getStatus());

        Integer probeRows = jdbcTemplate.queryForObject(
                "select count(*) from backbone_test_probe", Integer.class);
        org.junit.jupiter.api.Assertions.assertEquals(1, probeRows);
        org.junit.jupiter.api.Assertions.assertNotNull(flyway.info().current());
        // Flyway preserves the migration's zero-padded identifier (V016), so
        // compare the semantic version number instead of its display format.
        org.junit.jupiter.api.Assertions.assertEquals(
                16,
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
}
