package com.megumi.testops.auth.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import com.megumi.testops.auth.repository.UserRepository;
import com.megumi.testops.auth.service.OriginGuard;
import com.megumi.testops.auth.service.RefreshCookieFactory;

@Configuration
@EnableMethodSecurity
public class SecurityConfiguration {

    @Bean
    OriginGuard originGuard(AuthProperties properties) {
        return new OriginGuard(properties);
    }

    @Bean
    RefreshCookieFactory refreshCookieFactory(AuthProperties properties) {
        return new RefreshCookieFactory(properties.cookie());
    }

    @Bean
    @ConditionalOnMissingBean
    PasswordEncoder disabledAuthPasswordEncoder() {
        return new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder();
    }

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, AuthProperties properties,
            org.springframework.beans.factory.ObjectProvider<JwtDecoder> jwtDecoder,
            org.springframework.beans.factory.ObjectProvider<ClientRegistrationRepository> registrations,
            org.springframework.beans.factory.ObjectProvider<org.springframework.security.web.authentication.AuthenticationSuccessHandler> oauthSuccessHandler,
            org.springframework.beans.factory.ObjectProvider<org.springframework.security.web.authentication.AuthenticationFailureHandler> oauthFailureHandler,
            org.springframework.beans.factory.ObjectProvider<UserRepository> users) throws Exception {
        http.csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(
                        properties.enabled() && !properties.google().enabled()
                                ? SessionCreationPolicy.STATELESS : SessionCreationPolicy.IF_REQUIRED))
                .authorizeHttpRequests(auth -> {
                    auth.requestMatchers("/actuator/health", "/api/v1/auth/providers", "/api/v1/auth/register",
                            "/api/v1/auth/email/**", "/api/v1/auth/login", "/api/v1/auth/refresh",
                            "/api/v1/auth/logout", "/api/v1/auth/password/reset/**", "/oauth2/**",
                            "/login/oauth2/**").permitAll();
                    auth.requestMatchers("/api/v1/projects/**", "/api/v1/executions/**", "/api/v1/dashboard/**",
                            "/api/v1/admin/**", "/api/v1/platform/options").hasAuthority("EMAIL_VERIFIED");
                    if (properties.enabled()) auth.anyRequest().authenticated();
                    else auth.anyRequest().permitAll();
                });
        if (!properties.enabled()) {
            // Authentication is intentionally disabled for the local Milestone 1 profile.
        } else {
            http.oauth2ResourceServer(oauth -> oauth.jwt(jwt -> jwt.decoder(jwtDecoder.getIfAvailable())
                    .jwtAuthenticationConverter(new TestOpsJwtAuthenticationConverter())));
            users.ifAvailable(repository -> http.addFilterAfter(new TokenVersionFilter(repository), BearerTokenAuthenticationFilter.class));
            if (registrations.getIfAvailable() != null) {
                http.oauth2Login(oauth -> oauth.successHandler(oauthSuccessHandler.getIfAvailable())
                        .failureHandler(oauthFailureHandler.getIfAvailable()));
            }
        }
        return http.build();
    }
}
