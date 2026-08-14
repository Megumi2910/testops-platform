package com.megumi.testops.project.repository;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import com.megumi.testops.project.api.ProjectDtos;

@Repository
public class ProjectOnboardingRepository {
    private static final String COUNTS_SQL = """
            select p.id,
                   (select count(*) from test_suites s where s.project_id = p.id) as suite_count,
                   (select count(*)
                      from test_cases c
                      join test_suites s on s.id = c.suite_id
                     where s.project_id = p.id) as case_count,
                   (select count(*)
                      from test_cases c
                      join test_suites s on s.id = c.suite_id
                     where s.project_id = p.id and c.status = 'READY') as ready_case_count,
                   (select count(*) from test_executions e where e.project_id = p.id) as execution_count
              from projects p
             where p.id in (:projectIds)
            """;

    private final NamedParameterJdbcTemplate jdbc;

    public ProjectOnboardingRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Map<UUID, ProjectDtos.ProjectOnboardingResponse> findByProjectIds(Collection<UUID> projectIds) {
        if (projectIds.isEmpty()) {
            return Map.of();
        }
        Map<UUID, ProjectDtos.ProjectOnboardingResponse> counts = new LinkedHashMap<>();
        jdbc.query(COUNTS_SQL, new MapSqlParameterSource("projectIds", projectIds), resultSet -> {
            UUID projectId = resultSet.getObject("id", UUID.class);
            counts.put(projectId, new ProjectDtos.ProjectOnboardingResponse(
                    resultSet.getLong("suite_count"),
                    resultSet.getLong("case_count"),
                    resultSet.getLong("ready_case_count"),
                    resultSet.getLong("execution_count")));
        });
        return Map.copyOf(counts);
    }
}
