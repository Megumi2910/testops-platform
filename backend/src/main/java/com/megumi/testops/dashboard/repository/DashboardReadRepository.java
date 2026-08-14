package com.megumi.testops.dashboard.repository;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Repository;

import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;

@Repository
public class DashboardReadRepository {
    private static final String EXECUTION_SCOPE = """
            from test_executions e
            where e.created_at >= :from and e.created_at < :to
              and (:globalAdmin = true or exists (
                  select 1 from project_members m
                  where m.project_id = e.project_id and m.user_id = :userId
              ))
            """;

    private final EntityManager entityManager;

    public DashboardReadRepository(EntityManager entityManager) {
        this.entityManager = entityManager;
    }

    public Totals totals(Filter filter) {
        Object[] row = (Object[]) scopedQuery("""
                select count(e.id),
                       coalesce(sum(e.passed_cases), 0),
                       coalesce(sum(e.failed_cases), 0),
                       coalesce(sum(e.error_cases), 0)
                """, filter, "").getSingleResult();
        return new Totals(number(row[0]), number(row[1]), number(row[2]), number(row[3]));
    }

    public List<TrendRow> trends(Filter filter) {
        @SuppressWarnings("unchecked")
        List<Object[]> rows = scopedQuery("""
                select cast(e.created_at at time zone 'UTC' as date),
                       coalesce(sum(e.passed_cases), 0),
                       coalesce(sum(e.failed_cases), 0),
                       coalesce(sum(e.error_cases), 0)
                """, filter, """
                group by cast(e.created_at at time zone 'UTC' as date)
                order by cast(e.created_at at time zone 'UTC' as date)
                """).getResultList();
        return rows.stream().map(row -> new TrendRow(date(row[0]), number(row[1]), number(row[2]), number(row[3]))).toList();
    }

    public List<RecentFailureRow> recentFailures(Filter filter, int limit) {
        String select = """
                select e.id, e.project_id, r.case_id, r.case_name_snapshot,
                       r.error_category, r.error_message, r.finished_at
                """;
        String suffix = """
                and r.status in ('FAILED', 'ERROR')
                order by r.finished_at desc nulls last, r.id
                """;
        Query query = scopedResultQuery(select, filter, suffix);
        query.setMaxResults(limit);
        @SuppressWarnings("unchecked")
        List<Object[]> rows = query.getResultList();
        return rows.stream().map(row -> new RecentFailureRow(
                uuid(row[0]), uuid(row[1]), uuid(row[2]), (String) row[3], (String) row[4], (String) row[5], instant(row[6]))).toList();
    }

    public List<InfrastructureErrorRow> infrastructureErrors(Filter filter) {
        @SuppressWarnings("unchecked")
        List<Object[]> rows = scopedResultQuery("""
                select r.error_category, count(r.id)
                """, filter, """
                and r.status = 'ERROR'
                and nullif(trim(r.error_category), '') is not null
                group by r.error_category
                order by count(r.id) desc, r.error_category
                """).getResultList();
        return rows.stream().map(row -> new InfrastructureErrorRow((String) row[0], number(row[1]))).toList();
    }

    private Query scopedResultQuery(String select, Filter filter, String suffix) {
        String resultScope = EXECUTION_SCOPE.replace("from test_executions e", "from test_case_results r join test_executions e on e.id = r.execution_id");
        return bind(entityManager.createNativeQuery(select + resultScope + filters(filter) + suffix), filter);
    }

    private Query scopedQuery(String select, Filter filter, String suffix) {
        return bind(entityManager.createNativeQuery(select + EXECUTION_SCOPE + filters(filter) + suffix), filter);
    }

    private static String filters(Filter filter) {
        StringBuilder sql = new StringBuilder();
        if (filter.projectId() != null) sql.append(" and e.project_id = :projectId\n");
        if (filter.suiteId() != null) sql.append(" and e.suite_id = :suiteId\n");
        if (filter.browser() != null) sql.append(" and lower(e.browser) = lower(:browser)\n");
        return sql.toString();
    }

    private static Query bind(Query query, Filter filter) {
        query.setParameter("from", filter.from());
        query.setParameter("to", filter.to());
        query.setParameter("globalAdmin", filter.globalAdmin());
        query.setParameter("userId", filter.userId());
        if (filter.projectId() != null) query.setParameter("projectId", filter.projectId());
        if (filter.suiteId() != null) query.setParameter("suiteId", filter.suiteId());
        if (filter.browser() != null) query.setParameter("browser", filter.browser());
        return query;
    }

    private static long number(Object value) {
        return value == null ? 0L : ((Number) value).longValue();
    }

    private static UUID uuid(Object value) {
        return value instanceof UUID uuid ? uuid : UUID.fromString(value.toString());
    }

    private static LocalDate date(Object value) {
        return value instanceof LocalDate localDate ? localDate : ((Date) value).toLocalDate();
    }

    private static Instant instant(Object value) {
        if (value == null) return null;
        if (value instanceof Instant result) return result;
        if (value instanceof OffsetDateTime result) return result.toInstant();
        return ((Timestamp) value).toInstant();
    }

    public record Filter(UUID userId, boolean globalAdmin, UUID projectId, UUID suiteId, String browser,
            Instant from, Instant to) {
        public Filter {
            browser = browser == null || browser.isBlank() ? null : browser.trim();
        }
    }

    public record Totals(long totalExecutions, long passedCases, long failedCases, long errorCases) { }
    public record TrendRow(LocalDate day, long passed, long failed, long errors) { }
    public record RecentFailureRow(UUID executionId, UUID projectId, UUID caseId, String caseName,
            String category, String message, Instant finishedAt) { }
    public record InfrastructureErrorRow(String category, long count) { }
}
