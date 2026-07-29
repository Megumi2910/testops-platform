package com.megumi.testops;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;

import org.junit.jupiter.api.Test;

import com.megumi.testops.auth.domain.UserEntity;
import com.megumi.testops.auth.service.PlatformPermissionService;

class PlatformPermissionServiceTest {
    private final PlatformPermissionService permissions = new PlatformPermissionService();

    @Test
    void activeVerifiedMembersCanCreateProjects() {
        UserEntity user = new UserEntity("verified@example.test", "Verified", "ACTIVE", true, Instant.now());

        assertTrue(permissions.canCreateProject(user));
        assertTrue(permissions.permissions(user).contains(PlatformPermissionService.PROJECT_CREATE));
    }

    @Test
    void unverifiedMembersCannotCreateProjects() {
        UserEntity user = new UserEntity("unverified@example.test", "Unverified", "ACTIVE", false, Instant.now());

        assertFalse(permissions.canCreateProject(user));
        assertFalse(permissions.permissions(user).contains(PlatformPermissionService.PROJECT_CREATE));
    }
}
