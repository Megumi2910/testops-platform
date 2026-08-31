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

            Flyway preEvidencePolicy = flyway(jdbcUrl, username, password, MigrationVersion.fromVersion("22"));
            preEvidencePolicy.migrate();
            assertThat(preEvidencePolicy.info().current().getVersion().getVersion()).isEqualTo("022");
            insertLegacySecretEvidence(jdbcUrl, username, password);

            Flyway releaseCandidate = flyway(jdbcUrl, username, password, null);
            releaseCandidate.migrate();

            assertThat(releaseCandidate.info().current().getVersion().getVersion()).isEqualTo("024");
            try (var connection = DriverManager.getConnection(jdbcUrl, username, password);
                    var statement = connection.prepareStatement("""
                            select count(*)
                            from information_schema.columns
                            where table_schema = 'public'
                              and table_name = 'target_origins'
                              and column_name in ('origin', 'enabled', 'created_by', 'created_at', 'updated_at', 'version')
                            """);
                    var result = statement.executeQuery()) {
                assertThat(result.next()).isTrue();
                assertThat(result.getInt(1)).isEqualTo(6);
            }
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
            try (var connection = DriverManager.getConnection(jdbcUrl, username, password);
                    var statement = connection.prepareStatement("""
                            select case_result.evidence_suppressed,
                                   case_result.evidence_suppression_reason,
                                   case_result.error_message as case_error_message,
                                   step_result.error_message as step_error_message,
                                   artifact.secret_suppressed
                            from test_case_results case_result
                            join test_step_results step_result on step_result.case_result_id = case_result.id
                            join execution_artifacts artifact on artifact.case_result_id = case_result.id
                            where case_result.id = '00000000-0000-0000-0000-000000000006'
                            """);
                    var result = statement.executeQuery()) {
                assertThat(result.next()).isTrue();
                assertThat(result.getBoolean("evidence_suppressed")).isTrue();
                assertThat(result.getString("evidence_suppression_reason"))
                        .isEqualTo("LEGACY_SECRET_VARIABLE_REFERENCE");
                assertThat(result.getString("case_error_message")).doesNotContain("legacy-secret-value");
                assertThat(result.getString("step_error_message")).doesNotContain("legacy-secret-value");
                assertThat(result.getBoolean("secret_suppressed")).isTrue();
            }
            try (var connection = DriverManager.getConnection(jdbcUrl, username, password);
                    var statement = connection.prepareStatement("""
                            select count(*)
                            from information_schema.columns
                            where table_schema = 'public'
                              and table_name = 'test_case_results'
                              and column_name in ('evidence_suppressed', 'evidence_suppression_reason')
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

    private static void insertLegacySecretEvidence(String jdbcUrl, String username, String password) throws Exception {
        try (var connection = DriverManager.getConnection(jdbcUrl, username, password);
                var statement = connection.createStatement()) {
            statement.executeUpdate("""
                    insert into users (id, email, display_name, status, email_verified, token_version, updated_at, platform_role)
                    values ('00000000-0000-0000-0000-000000000001', 'legacy@testops.local', 'Legacy user',
                            'ACTIVE', true, 0, current_timestamp, 'MEMBER')
                    """);
            statement.executeUpdate("""
                    insert into projects (id, name, target_origin, status, created_by, created_at, updated_at)
                    values ('00000000-0000-0000-0000-000000000002', 'Legacy evidence project',
                            'https://target.example.test', 'ACTIVE',
                            '00000000-0000-0000-0000-000000000001', current_timestamp, current_timestamp)
                    """);
            statement.executeUpdate("""
                    insert into test_suites (id, project_id, name, status, created_by, created_at, updated_at)
                    values ('00000000-0000-0000-0000-000000000003',
                            '00000000-0000-0000-0000-000000000002', 'Legacy suite', 'ACTIVE',
                            '00000000-0000-0000-0000-000000000001', current_timestamp, current_timestamp)
                    """);
            statement.executeUpdate("""
                    insert into test_cases (id, suite_id, name, status, priority, retry_count, data_isolation,
                                            created_by, created_at, updated_at)
                    values ('00000000-0000-0000-0000-000000000004',
                            '00000000-0000-0000-0000-000000000003', 'Legacy secret case', 'READY', 'HIGH', 0, false,
                            '00000000-0000-0000-0000-000000000001', current_timestamp, current_timestamp)
                    """);
            statement.executeUpdate("""
                    insert into test_executions (id, project_id, suite_id, requested_by, status, total_cases,
                                                 completed_cases, failed_cases, idempotency_key, created_at)
                    values ('00000000-0000-0000-0000-000000000005',
                            '00000000-0000-0000-0000-000000000002',
                            '00000000-0000-0000-0000-000000000003',
                            '00000000-0000-0000-0000-000000000001', 'FAILED', 1, 1, 1,
                            '00000000-0000-0000-0000-00000000000b', current_timestamp)
                    """);
            statement.executeUpdate("""
                    insert into test_case_results (id, execution_id, case_id, status, attempt_count, error_message,
                                                   case_name_snapshot, retry_count_snapshot)
                    values ('00000000-0000-0000-0000-000000000006',
                            '00000000-0000-0000-0000-000000000005',
                            '00000000-0000-0000-0000-000000000004', 'FAILED', 1,
                            'Expected legacy-secret-value', 'Legacy secret case', 0)
                    """);
            statement.executeUpdate("""
                    insert into test_step_results (id, case_result_id, position, action, status, error_message)
                    values ('00000000-0000-0000-0000-000000000007',
                            '00000000-0000-0000-0000-000000000006', 1, 'FILL', 'FAILED',
                            'Locator contained legacy-secret-value')
                    """);
            statement.executeUpdate("""
                    insert into execution_variable_snapshots (id, execution_id, variable_key, value, secret,
                                                              ciphertext, nonce, key_version)
                    values ('00000000-0000-0000-0000-000000000008',
                            '00000000-0000-0000-0000-000000000005', 'PASSWORD', null, true,
                            decode('00', 'hex'), decode('01', 'hex'), 1)
                    """);
            statement.executeUpdate("""
                    insert into execution_step_snapshots (id, case_result_id, position, action, locator_type,
                                                          locator_value, input_value, timeout_ms)
                    values ('00000000-0000-0000-0000-000000000009',
                            '00000000-0000-0000-0000-000000000006', 1, 'FILL', 'CSS', '#password',
                            '${PASSWORD}', 5000)
                    """);
            statement.executeUpdate("""
                    insert into execution_artifacts (id, execution_id, case_result_id, type, relative_path,
                                                     content_type, byte_size, sha256, secret_suppressed, created_at)
                    values ('00000000-0000-0000-0000-00000000000a',
                            '00000000-0000-0000-0000-000000000005',
                            '00000000-0000-0000-0000-000000000006', 'SCREENSHOT',
                            'legacy/secret.png', 'image/png', 3,
                            '0000000000000000000000000000000000000000000000000000000000000000', false,
                            current_timestamp)
                    """);
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
