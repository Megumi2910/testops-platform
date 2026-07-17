package com.megumi.testops;

import javax.sql.DataSource;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.boot.health.actuate.endpoint.HealthEndpoint;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers
@SpringBootTest
@ActiveProfiles("test")
class ApplicationContextIT {

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17.10-alpine3.23");

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

    @Test
    void startsWithPostgresFlywayAndHealthyActuator() throws Exception {
        org.junit.jupiter.api.Assertions.assertEquals(
                org.springframework.boot.health.contributor.Status.UP,
                healthEndpoint.health().getStatus());

        Integer probeRows = jdbcTemplate.queryForObject(
                "select count(*) from backbone_test_probe", Integer.class);
        org.junit.jupiter.api.Assertions.assertEquals(1, probeRows);
        org.junit.jupiter.api.Assertions.assertNotNull(flyway.info().current());
        try (var connection = dataSource.getConnection()) {
            org.junit.jupiter.api.Assertions.assertTrue(connection.isValid(2));
        }
    }
}
