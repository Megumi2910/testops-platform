package com.megumi.testops.auth.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.megumi.testops.auth.domain.OAuthAccountEntity;

public interface OAuthAccountRepository extends JpaRepository<OAuthAccountEntity, UUID> {

    Optional<OAuthAccountEntity> findByProviderAndProviderSubject(String provider, String providerSubject);

    boolean existsByUserIdAndProvider(UUID userId, String provider);

    Optional<OAuthAccountEntity> findByUserIdAndProvider(UUID userId, String provider);
}
