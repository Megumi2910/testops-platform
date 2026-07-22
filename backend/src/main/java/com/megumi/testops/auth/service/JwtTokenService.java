package com.megumi.testops.auth.service;

import java.time.Clock;
import java.time.Instant;

import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwsHeader;

import com.megumi.testops.auth.config.AuthProperties;
import com.megumi.testops.auth.domain.UserEntity;

public class JwtTokenService {

    private final JwtEncoder encoder;
    private final AuthProperties.Jwt properties;
    private final Clock clock;

    public JwtTokenService(JwtEncoder encoder, AuthProperties.Jwt properties, Clock clock) {
        this.encoder = encoder;
        this.properties = properties;
        this.clock = clock;
    }

    public TokenIssue issue(UserEntity user) {
        Instant issuedAt = Instant.now(clock);
        Instant expiresAt = issuedAt.plus(properties.accessTtl());
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(properties.issuer())
                .audience(java.util.List.of(properties.audience()))
                .subject(user.getId().toString())
                .id(java.util.UUID.randomUUID().toString())
                .issuedAt(issuedAt)
                .expiresAt(expiresAt)
                .claim("roles", java.util.Set.of(user.getPlatformRole().name()))
                .claim("token_version", user.getTokenVersion())
                .build();
        String token = encoder.encode(JwtEncoderParameters.from(
                JwsHeader.with(org.springframework.security.oauth2.jose.jws.SignatureAlgorithm.RS256)
                        .keyId(properties.keyId()).build(), claims)).getTokenValue();
        return new TokenIssue(token, properties.accessTtl().toSeconds());
    }

    public record TokenIssue(String token, long expiresInSeconds) { }
}
