package com.megumi.testops;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.DriverManager;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationVersion;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;

class MigrationUpgradeIT {

    @Test
    void upgradesPreReportingSchemaThroughCurrentReleaseMigrations() throws Exception {
        PostgreSQLContainer<?> postgres = null;
        String jdbcUrl = System.getenv("TEST_DATABASE_URL");
        String username = System.getenv("TEST_DATABASE_USERNAME");
        String password = System.getenv("TEST_DATABASE_PASSWORD");
        if (jdbcUrl == null || jdbcUrl.isBlank()) {
            postgres = new PostgreSQLContainer<>("postgres:18.4-alpine3.24");
            postgres.start();
            jdbcUrl = postgres.getJdbcUrl();
            username = postgres.getUsername();
            password = postgres.getPassword();
        }

        try {
            Flyway preReporting = flyway(jdbcUrl, username, password, MigrationVersion.fromVersion("14"));
            preReporting.migrate();
            assertThat(preReporting.info().current().getVersion().getVersion()).isEqualTo("014");

            Flyway releaseCandidate = flyway(jdbcUrl, username, password, null);
            releaseCandidate.migrate();

            assertThat(releaseCandidate.info().current().getVersion().getVersion()).isEqualTo("021");
            try (var connection = DriverManager.getConnection(
                    jdbcUrl,
                    username,
                    password);
                    var statement = connection.prepareStatement("""
                            select count(*)
                            from information_schema.columns
                            where table_schema = 'public'
                              and table_name = 'projects'
                              and column_name in (
                                'target_check_status',
                                'target_check_http_status',
                                'target_checked_at',
                                'target_check_reason'
                              )
                            """);
                    var result = statement.executeQuery()) {
                assertThat(result.next()).isTrue();
                assertThat(result.getInt(1)).isEqualTo(4);
            }
            try (var connection = DriverManager.getConnection(jdbcUrl, username, password);
                    var statement = connection.prepareStatement("""
                            select count(*)
                            from pg_indexes
                            where schemaname = 'public'
                              and indexname in ('ux_test_suites_active_project_name', 'ux_test_cases_active_suite_name')
                            """);
                    var result = statement.executeQuery()) {
                assertThat(result.next()).isTrue();
                assertThat(result.getInt(1)).isEqualTo(2);
            }
        } finally {
            if (postgres != null) {
                postgres.stop();
            }
        }
    }

    private static Flyway flyway(
            String jdbcUrl,
            String username,
            String password,
            MigrationVersion target) {
        var configuration = Flyway.configure()
                .dataSource(jdbcUrl, username, password)
                .locations("classpath:db/migration");
        if (target != null) {
            configuration.target(target);
        }
        return configuration.load();
    }
}
