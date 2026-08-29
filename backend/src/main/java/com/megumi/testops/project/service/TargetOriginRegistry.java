package com.megumi.testops.project.service;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.megumi.testops.auth.domain.UserEntity;
import com.megumi.testops.config.PlatformProperties;
import com.megumi.testops.project.domain.TargetOriginEntity;
import com.megumi.testops.project.repository.ProjectRepository;
import com.megumi.testops.project.repository.TargetOriginRepository;
import com.megumi.testops.shared.api.ApiException;

@Service
public class TargetOriginRegistry {
    public static final String ENVIRONMENT = "ENVIRONMENT";
    public static final String ADMIN = "ADMIN";

    private final PlatformProperties properties;
    private final TargetOriginRepository origins;
    private final ProjectRepository projects;
    private final TargetOriginNormalizer normalizer;

    public TargetOriginRegistry(PlatformProperties properties, TargetOriginRepository origins, ProjectRepository projects,
            TargetOriginNormalizer normalizer) {
        this.properties = properties;
        this.origins = origins;
        this.projects = projects;
        this.normalizer = normalizer;
    }

    public boolean isConfigured() {
        return environmentOrigins().values().stream().anyMatch(OriginView::usable) || origins.existsByEnabledTrue();
    }

    public boolean isEnabled(String origin) {
        OriginView environment = environmentOrigins().get(origin);
        return environment != null && environment.usable()
                || origins.findByOrigin(origin).map(TargetOriginEntity::isEnabled).orElse(false);
    }

    public List<OriginView> enabledOptions() {
        Map<String, OriginView> values = new LinkedHashMap<>(environmentOrigins());
        origins.findAllByOrderByOriginAsc().stream().filter(TargetOriginEntity::isEnabled)
                .forEach(origin -> values.putIfAbsent(origin.getOrigin(), view(origin, ADMIN)));
        return List.copyOf(values.values());
    }

    public List<OriginView> allOptions() {
        Map<String, OriginView> values = new LinkedHashMap<>(environmentOrigins());
        origins.findAllByOrderByOriginAsc().forEach(origin -> values.putIfAbsent(origin.getOrigin(), view(origin, ADMIN)));
        return List.copyOf(values.values());
    }

    @Transactional
    public OriginView create(UserEntity actor, String submittedOrigin) {
        String origin = normalizer.normalize(submittedOrigin);
        if (environmentOrigins().containsKey(origin) || origins.existsByOrigin(origin)) {
            throw error(HttpStatus.CONFLICT, "target_origin_exists", "This target origin is already registered");
        }
        try {
            TargetOriginEntity saved = origins.saveAndFlush(new TargetOriginEntity(origin, actor, Instant.now()));
            return view(saved, ADMIN);
        } catch (DataIntegrityViolationException ex) {
            throw error(HttpStatus.CONFLICT, "target_origin_exists", "This target origin is already registered");
        }
    }

    @Transactional
    public OriginView setEnabled(UUID id, boolean enabled, long version) {
        TargetOriginEntity origin = origins.findById(id).orElseThrow(() -> error(HttpStatus.NOT_FOUND, "target_origin_not_found", "Target origin was not found"));
        if (origin.getVersion() != version) {
            throw error(HttpStatus.CONFLICT, "stale_version", "The target origin changed; reload and try again");
        }
        origin.setEnabled(enabled, Instant.now());
        return view(origins.saveAndFlush(origin), ADMIN);
    }

    private Map<String, OriginView> environmentOrigins() {
        Map<String, OriginView> values = new LinkedHashMap<>();
        for (String configured : properties.target().allowedOrigins()) {
            String canonical = normalizer.normalizeConfigured(configured);
            boolean usable = true;
            String blockedReason = null;
            try {
                normalizer.normalize(configured);
            } catch (ApiException ex) {
                usable = false;
                blockedReason = ex.getCode();
            }
            values.putIfAbsent(canonical, new OriginView(null, canonical, ENVIRONMENT, true, usable, blockedReason,
                    projects.countByTargetOrigin(canonical), null, null, null));
        }
        return values;
    }

    private OriginView view(TargetOriginEntity origin, String source) {
        boolean usable = origin.isEnabled();
        String blockedReason = usable ? null : "target_origin_disabled";
        return new OriginView(origin.getId(), origin.getOrigin(), source, origin.isEnabled(), usable, blockedReason,
                projects.countByTargetOrigin(origin.getOrigin()), origin.getVersion(), origin.getCreatedAt(), origin.getUpdatedAt());
    }

    private static ApiException error(HttpStatus status, String code, String message) {
        return new ApiException(status, code, message);
    }

    public record OriginView(UUID id, String origin, String source, boolean enabled, boolean usable, String blockedReason,
            long usageCount, Long version, Instant createdAt, Instant updatedAt) { }
}
