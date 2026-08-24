package com.megumi.testops.auth.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.megumi.testops.auth.domain.PlatformRole;
import com.megumi.testops.auth.domain.UserEntity;
import com.megumi.testops.auth.repository.UserRepository;
import com.megumi.testops.shared.api.ApiException;

class AdminUserServiceTest {
    private final UserRepository users = mock(UserRepository.class);
    private final AuthService auth = mock(AuthService.class);
    private final Clock clock = Clock.fixed(Instant.parse("2026-08-09T12:00:00Z"), ZoneOffset.UTC);
    private final AdminUserService service = new AdminUserService(users, auth, clock);

    @Test
    void rejectsDemotingTheLastActiveAdministrator() {
        UserEntity admin = admin("ACTIVE");
        when(users.findById(admin.getId())).thenReturn(Optional.of(admin));
        when(users.findByPlatformRoleForUpdate(PlatformRole.ADMIN)).thenReturn(List.of(admin));

        ApiException failure = assertThrows(ApiException.class,
                () -> service.role(admin.getId(), "MEMBER"));

        assertEquals("final_active_admin", failure.getCode());
        verify(admin, never()).setPlatformRole(PlatformRole.MEMBER);
    }

    @Test
    void allowsDisablingAnAdministratorWhenAnotherActiveAdministratorRemains() {
        UserEntity changed = admin("ACTIVE");
        UserEntity remaining = admin("ACTIVE");
        when(users.findById(changed.getId())).thenReturn(Optional.of(changed));
        when(users.findByPlatformRoleForUpdate(PlatformRole.ADMIN)).thenReturn(List.of(changed, remaining));

        service.status(changed.getId(), "DISABLED");

        verify(changed).setStatus("DISABLED", Instant.now(clock));
        verify(auth).revokeAllSessions(changed.getId(), null, null);
    }

    @Test
    void reactivationAlsoRevokesSessionsAndOldBearerVersion() {
        UserEntity changed = admin("LOCKED");
        when(users.findById(changed.getId())).thenReturn(Optional.of(changed));

        service.status(changed.getId(), "ACTIVE");

        verify(changed).setStatus("ACTIVE", Instant.now(clock));
        verify(auth).revokeAllSessions(changed.getId(), null, null);
    }

    @Test
    void unchangedStatusDoesNotCreateAnotherRevocation() {
        UserEntity unchanged = admin("ACTIVE");
        when(users.findById(unchanged.getId())).thenReturn(Optional.of(unchanged));

        service.status(unchanged.getId(), "ACTIVE");

        verify(unchanged).setStatus("ACTIVE", Instant.now(clock));
        verify(auth, never()).revokeAllSessions(unchanged.getId(), null, null);
    }

    private static UserEntity admin(String status) {
        UserEntity user = mock(UserEntity.class);
        when(user.getId()).thenReturn(UUID.randomUUID());
        when(user.getPlatformRole()).thenReturn(PlatformRole.ADMIN);
        when(user.getStatus()).thenReturn(status);
        return user;
    }
}
