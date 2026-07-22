package com.megumi.testops.auth.api;

import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.megumi.testops.auth.service.AdminUserService;
import com.megumi.testops.auth.service.AuthService;

@RestController
@RequestMapping("/api/v1/admin/users")
@PreAuthorize("hasAuthority('ROLE_ADMIN')")
public class AdminUserController {
    private final AdminUserService users;
    private final AuthService auth;
    public AdminUserController(AdminUserService users, AuthService auth) { this.users = users; this.auth = auth; }

    @GetMapping public List<AdminUserDtos.UserResponse> list(@RequestParam(required = false) String query) { return users.list(query); }
    @PatchMapping("/{id}/platform-role") public AdminUserDtos.UserResponse role(@PathVariable UUID id, @Valid @RequestBody AdminUserDtos.RoleRequest request) { return users.role(id, request.platformRole()); }
    @PatchMapping("/{id}/status") public AdminUserDtos.UserResponse status(@PathVariable UUID id, @Valid @RequestBody AdminUserDtos.StatusRequest request) { return users.status(id, request.status()); }
    @org.springframework.web.bind.annotation.PostMapping("/{id}/sessions/revoke-all") public org.springframework.http.ResponseEntity<Void> revoke(@PathVariable UUID id) { auth.revokeAllSessions(id, null, null); return org.springframework.http.ResponseEntity.noContent().build(); }
}
