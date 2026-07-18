package com.megumi.testops.auth.config;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.GeneralSecurityException;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.time.Clock;
import java.util.Base64;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;

import com.megumi.testops.auth.repository.AuthAuditEventRepository;
import com.megumi.testops.auth.repository.EmailVerificationChallengeRepository;
import com.megumi.testops.auth.repository.RefreshTokenRepository;
import com.megumi.testops.auth.repository.RoleRepository;
import com.megumi.testops.auth.repository.UserRepository;
import com.megumi.testops.auth.service.AuditService;
import com.megumi.testops.auth.service.AuthService;
import com.megumi.testops.auth.service.EmailDeliveryService;
import com.megumi.testops.auth.service.JwtTokenService;
import com.megumi.testops.auth.service.OtpHasher;
import com.megumi.testops.auth.service.RefreshTokenService;

import com.nimbusds.jose.jwk.RSAKey;

@Configuration
@ConditionalOnProperty(prefix = "testops.auth", name = "enabled", havingValue = "true")
public class AuthRuntimeConfiguration {

    @Bean
    Clock authClock() { return Clock.systemUTC(); }

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    RSAKey rsaKey(AuthProperties properties) {
        try {
            RSAPrivateKey privateKey = (RSAPrivateKey) readPrivateKey(properties.jwt().privateKeyPath());
            RSAPublicKey publicKey = (RSAPublicKey) readPublicKey(properties.jwt().publicKeyPath());
            return new RSAKey.Builder(publicKey).privateKey(privateKey).keyID(properties.jwt().keyId()).build();
        } catch (IOException | GeneralSecurityException exception) {
            throw new IllegalStateException("Unable to load JWT RSA key material", exception);
        }
    }

    @Bean
    JwtEncoder jwtEncoder(RSAKey key) { return new NimbusJwtEncoder(new com.nimbusds.jose.jwk.source.ImmutableJWKSet<>(new com.nimbusds.jose.jwk.JWKSet(key))); }

    @Bean
    JwtDecoder jwtDecoder(RSAKey key, AuthProperties properties) throws com.nimbusds.jose.JOSEException {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withPublicKey(key.toRSAPublicKey()).build();
        decoder.setJwtValidator(org.springframework.security.oauth2.jwt.JwtValidators.createDefaultWithIssuer(properties.jwt().issuer()));
        return decoder;
    }

    @Bean
    OtpHasher otpHasher(AuthProperties properties) { return new OtpHasher(properties.email().otpPepperPath()); }

    @Bean
    EmailDeliveryService emailDeliveryService(JavaMailSender sender, AuthProperties properties) {
        return new EmailDeliveryService(sender, properties.email());
    }

    @Bean
    AuditService auditService(AuthAuditEventRepository repository, Clock clock) { return new AuditService(repository, clock); }

    @Bean
    JwtTokenService jwtTokenService(JwtEncoder encoder, AuthProperties properties, Clock clock) {
        return new JwtTokenService(encoder, properties.jwt(), clock);
    }

    @Bean
    RefreshTokenService refreshTokenService(RefreshTokenRepository repository, AuthProperties properties, Clock clock) {
        return new RefreshTokenService(repository, properties.cookie(), clock);
    }

    @Bean
    AuthService authService(UserRepository users, RoleRepository roles, EmailVerificationChallengeRepository challenges,
            com.megumi.testops.auth.repository.OAuthAccountRepository oauthAccounts,
            PasswordEncoder passwordEncoder, OtpHasher otpHasher, EmailDeliveryService emailDelivery,
            JwtTokenService jwtTokens, RefreshTokenService refreshTokens, AuditService audit,
            AuthProperties properties, Clock clock) {
        return new AuthService(users, roles, challenges, oauthAccounts, passwordEncoder, otpHasher, emailDelivery,
                jwtTokens, refreshTokens, audit, properties, clock);
    }

    private static PrivateKey readPrivateKey(java.nio.file.Path path) throws IOException, GeneralSecurityException {
        byte[] bytes = decodePem(path, "PRIVATE KEY");
        return KeyFactory.getInstance("RSA").generatePrivate(new PKCS8EncodedKeySpec(bytes));
    }

    private static PublicKey readPublicKey(java.nio.file.Path path) throws IOException, GeneralSecurityException {
        byte[] bytes = decodePem(path, "PUBLIC KEY");
        return KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(bytes));
    }

    private static byte[] decodePem(java.nio.file.Path path, String type) throws IOException {
        String pem = Files.readString(path, StandardCharsets.US_ASCII)
                .replace("-----BEGIN " + type + "-----", "")
                .replace("-----END " + type + "-----", "")
                .replaceAll("\\s", "");
        return Base64.getDecoder().decode(pem);
    }
}
