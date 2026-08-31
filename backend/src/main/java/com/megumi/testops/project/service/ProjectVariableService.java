package com.megumi.testops.project.service;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.megumi.testops.config.ProjectProperties;
import com.megumi.testops.auth.domain.UserEntity;
import com.megumi.testops.project.api.ProjectDtos;
import com.megumi.testops.project.domain.ProjectEntity;
import com.megumi.testops.project.domain.ProjectVariableEntity;
import com.megumi.testops.project.repository.ProjectVariableRepository;
import com.megumi.testops.project.repository.TestStepRepository;
import com.megumi.testops.shared.api.ApiException;

@Service
public class ProjectVariableService {
    private final ProjectVariableRepository variables; private final TestStepRepository steps; private final ProjectAccessService access; private final ProjectVariableCrypto crypto; private final ProjectProperties properties;
    public ProjectVariableService(ProjectVariableRepository variables, TestStepRepository steps, ProjectAccessService access, ProjectVariableCrypto crypto, ProjectProperties properties) { this.variables = variables; this.steps = steps; this.access = access; this.crypto = crypto; this.properties = properties; }
    @Transactional(readOnly = true)
    public List<ProjectDtos.VariableResponse> list(Jwt jwt, UUID projectId) {
        UserEntity user = access.user(jwt); ProjectEntity project = access.project(projectId); access.requireProjectPermission(project, user, jwt, ProjectPermission.VARIABLE_VIEW);
        return variables.findByProjectIdOrderByKeyAsc(projectId).stream().map(this::response).toList();
    }
    @Transactional
    public ProjectDtos.VariableResponse create(Jwt jwt, UUID projectId, ProjectDtos.VariableRequest request) {
        UserEntity user = access.user(jwt); ProjectEntity project = access.project(projectId); access.requireProjectPermission(project, user, jwt, ProjectPermission.VARIABLE_MANAGE); ensureActive(project);
        requireVersion(project.getVersion(), request.projectVersion());
        String key = normalizeKey(request.key()); if (variables.countByProjectId(projectId) >= 100) throw error(HttpStatus.CONFLICT, "variable_limit", "A project can contain at most 100 variables"); if (variables.findByProjectIdAndKey(projectId, key).isPresent()) throw error(HttpStatus.CONFLICT, "variable_exists", "Variable key already exists");
        ProjectVariableEntity entity = build(project, key, request, Instant.now()); project.touch(Instant.now()); return response(variables.save(entity));
    }
    @Transactional
    public ProjectDtos.VariableResponse update(Jwt jwt, UUID projectId, String key, ProjectDtos.VariableRequest request) {
        UserEntity user = access.user(jwt); ProjectEntity project = access.project(projectId); access.requireProjectPermission(project, user, jwt, ProjectPermission.VARIABLE_MANAGE); ensureActive(project);
        ProjectVariableEntity entity = variables.findByProjectIdAndKey(projectId, normalizeKey(key)).orElseThrow(() -> error(HttpStatus.NOT_FOUND, "variable_not_found", "Variable was not found")); if (entity.isSecret() != request.secret()) throw error(HttpStatus.BAD_REQUEST, "variable_classification_immutable", "Variable secret classification cannot change");
        requireVersion(project.getVersion(), request.projectVersion()); requireVersion(entity.getVersion(), request.variableVersion());
        String value = requiredValue(request); if (entity.isSecret()) { ensureSecretVariablesEnabled(); ProjectVariableCrypto.Encrypted encrypted = crypto.encrypt(projectId.toString(), entity.getKey(), value, properties.variableKeyVersion()); entity.updateEncrypted(encrypted.ciphertext(), encrypted.nonce(), properties.variableKeyVersion(), Instant.now()); } else entity.updatePlain(value, Instant.now()); project.touch(Instant.now()); variables.saveAndFlush(entity);
        return response(entity);
    }
    @Transactional
    public void delete(Jwt jwt, UUID projectId, String key, Long projectVersion, Long variableVersion) {
        UserEntity user = access.user(jwt); ProjectEntity project = access.project(projectId); access.requireProjectPermission(project, user, jwt, ProjectPermission.VARIABLE_MANAGE); ensureActive(project); requireVersion(project.getVersion(), projectVersion);
        ProjectVariableEntity entity = variables.findByProjectIdAndKey(projectId, normalizeKey(key)).orElseThrow(() -> error(HttpStatus.NOT_FOUND, "variable_not_found", "Variable was not found")); requireVersion(entity.getVersion(), variableVersion);
        if (steps.countVariableReferences(projectId, "${" + entity.getKey() + "}") > 0) throw error(HttpStatus.CONFLICT, "variable_in_use", "Variable is referenced by one or more test steps. Remove those references before deleting it");
        variables.delete(entity); project.touch(Instant.now());
    }
    private ProjectVariableEntity build(ProjectEntity project, String key, ProjectDtos.VariableRequest request, Instant now) { String value = requiredValue(request); if (request.secret()) { ensureSecretVariablesEnabled(); ProjectVariableCrypto.Encrypted encrypted = crypto.encrypt(project.getId().toString(), key, value, properties.variableKeyVersion()); return ProjectVariableEntity.encrypted(project, key, encrypted.ciphertext(), encrypted.nonce(), properties.variableKeyVersion(), now); } return ProjectVariableEntity.plain(project, key, value, now); }
    private ProjectDtos.VariableResponse response(ProjectVariableEntity v) { return new ProjectDtos.VariableResponse(v.getKey(), v.isSecret(), v.isSecret() ? null : v.getPlaintextValue(), v.getVersion()); }
    private static String requiredValue(ProjectDtos.VariableRequest r) { if (r.value() == null) throw error(HttpStatus.BAD_REQUEST, "variable_value_required", "Variable value is required"); return r.value(); }
    private void ensureSecretVariablesEnabled() { if (!properties.secretVariablesEnabled()) throw error(HttpStatus.CONFLICT, "secret_variables_disabled", "Secret variables are disabled by configuration"); }
    private static void requireVersion(long current, Long expected) { if (expected != null && current != expected) throw error(HttpStatus.CONFLICT, "stale_version", "The resource changed; reload and try again"); }
    private static String normalizeKey(String key) { String normalized = key == null ? "" : key.trim().toUpperCase(Locale.ROOT); if (!normalized.matches("[A-Z][A-Z0-9_]{1,63}")) throw error(HttpStatus.BAD_REQUEST, "invalid_variable_key", "Variable keys must be uppercase snake case and 2 to 64 characters"); return normalized; }
    private static void ensureActive(ProjectEntity p) { if ("ARCHIVED".equals(p.getStatus())) throw error(HttpStatus.CONFLICT, "project_archived", "Archived projects are read-only"); }
    private static ApiException error(HttpStatus status, String code, String message) { return new ApiException(status, code, message); }
}
