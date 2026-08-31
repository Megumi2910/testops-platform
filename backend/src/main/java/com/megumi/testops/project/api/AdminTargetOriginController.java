package com.megumi.testops.project.api;

import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.megumi.testops.auth.domain.UserEntity;
import com.megumi.testops.auth.repository.UserRepository;
import com.megumi.testops.project.service.TargetOriginRegistry;
import com.megumi.testops.shared.api.ApiException;

@RestController
@RequestMapping("/api/v1/admin/target-origins")
@PreAuthorize("hasAuthority('ROLE_ADMIN')")
@ConditionalOnProperty(prefix = "testops.auth", name = "enabled", havingValue = "true")
public class AdminTargetOriginController {
    private final TargetOriginRegistry registry;
    private final UserRepository users;

    public AdminTargetOriginController(TargetOriginRegistry registry, UserRepository users) {
        this.registry = registry;
        this.users = users;
    }

    @GetMapping
    public List<TargetOriginDtos.Response> list() {
        return registry.allOptions().stream().map(AdminTargetOriginController::response).toList();
    }

    @PostMapping
    public TargetOriginDtos.Response create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody TargetOriginDtos.CreateRequest request) {
        return response(registry.create(currentUser(jwt), request.origin()));
    }

    @PatchMapping("/{id}")
    public TargetOriginDtos.Response update(@PathVariable UUID id, @Valid @RequestBody TargetOriginDtos.UpdateRequest request) {
        return response(registry.setEnabled(id, request.enabled(), request.version()));
    }

    private UserEntity currentUser(Jwt jwt) {
        return users.findById(UUID.fromString(jwt.getSubject()))
                .orElseThrow(() -> new ApiException(org.springframework.http.HttpStatus.UNAUTHORIZED, "session_invalid", "Session is no longer valid"));
    }

    private static TargetOriginDtos.Response response(TargetOriginRegistry.OriginView value) {
        return new TargetOriginDtos.Response(value.id(), value.origin(), value.source(), value.enabled(), value.usable(),
                value.blockedReason(), value.usageCount(), value.version(), value.createdAt(), value.updatedAt());
    }
}
