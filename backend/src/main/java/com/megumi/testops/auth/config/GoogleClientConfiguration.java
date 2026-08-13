package com.megumi.testops.auth.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.oauth2.core.ClientAuthenticationMethod;
import java.util.Arrays;

@Configuration
@ConditionalOnProperty(prefix = "testops.auth.google", name = "enabled", havingValue = "true")
public class GoogleClientConfiguration {

    @Bean
    ClientRegistrationRepository googleClientRegistration(AuthProperties properties,
            @Value("${testops.auth.google.provider-base-uri:}") String providerBaseUri,
            @Value("${testops.auth.google.public-base-uri:}") String publicBaseUri,
            @Value("${testops.auth.google.scopes:openid,profile,email}") String scopes) {
        String base = providerBaseUri == null || providerBaseUri.isBlank()
                ? "https://accounts.google.com"
                : providerBaseUri.replaceAll("/+$", "");
        String authorizationBase = publicBaseUri == null || publicBaseUri.isBlank()
                ? base
                : publicBaseUri.replaceAll("/+$", "");
        ClientRegistration registration = ClientRegistration.withRegistrationId("google")
                .clientId(properties.google().clientId())
                .clientSecret(properties.google().clientSecret())
                .clientAuthenticationMethod(ClientAuthenticationMethod.CLIENT_SECRET_BASIC)
                .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                .redirectUri(properties.google().redirectUri())
                .scope(Arrays.stream(scopes.split(","))
                        .map(String::trim)
                        .filter(value -> !value.isBlank())
                        .toArray(String[]::new))
                .authorizationUri(authorizationBase + "/o/oauth2/v2/auth")
                .tokenUri(base + "/token")
                .userInfoUri(base + "/userinfo")
                .userNameAttributeName("sub")
                .jwkSetUri(base + "/certs")
                .clientName("Google")
                .build();
        return new InMemoryClientRegistrationRepository(registration);
    }
}
