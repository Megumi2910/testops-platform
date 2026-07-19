package com.megumi.testops.auth.service;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.time.Clock;
import java.time.Instant;
import java.util.Locale;

import com.megumi.testops.auth.config.AuthProperties;
import com.megumi.testops.auth.domain.RoleEntity;
import com.megumi.testops.auth.domain.UserEntity;
import com.megumi.testops.auth.repository.RoleRepository;
import com.megumi.testops.auth.repository.UserRepository;

import jakarta.transaction.Transactional;

public final class BootstrapAdminService {

    private final UserRepository users;
    private final RoleRepository roles;
    private final org.springframework.security.crypto.password.PasswordEncoder passwordEncoder;
    private final AuthProperties.Bootstrap properties;
    private final Clock clock;

    public BootstrapAdminService(UserRepository users, RoleRepository roles,
            org.springframework.security.crypto.password.PasswordEncoder passwordEncoder,
            AuthProperties.Bootstrap properties, Clock clock) {
        this.users = users;
        this.roles = roles;
        this.passwordEncoder = passwordEncoder;
        this.properties = properties;
        this.clock = clock;
    }

    @Transactional
    public void initialize() {
        if (!properties.enabled()) return;
        String email = properties.email().trim().toLowerCase(Locale.ROOT);
        String password;
        try {
            password = Files.readString(properties.passwordPath(), StandardCharsets.UTF_8).trim();
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to read bootstrap admin password", exception);
        }
        if (password.length() < 12) throw new IllegalStateException("Bootstrap admin password is invalid");

        RoleEntity adminRole = roles.findByCode("ADMIN")
                .orElseThrow(() -> new IllegalStateException("ADMIN role is missing"));
        UserEntity existing = users.findByEmail(email).orElse(null);
        if (existing != null) {
            if (!existing.getRoles().contains(adminRole)) {
                throw new IllegalStateException("Bootstrap admin email belongs to a non-admin account");
            }
            return;
        }
        if (users.count() > 0) {
            throw new IllegalStateException("Bootstrap admin cannot create an account after users already exist");
        }
        Instant now = Instant.now(clock);
        UserEntity user = new UserEntity(email, passwordEncoder.encode(password), properties.displayName().trim(),
                "ACTIVE", true, now);
        user.addRole(adminRole);
        users.save(user);
    }
}
