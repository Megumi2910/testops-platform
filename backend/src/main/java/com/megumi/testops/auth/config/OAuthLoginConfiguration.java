package com.megumi.testops.auth.config;

import java.net.URI;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;

import com.megumi.testops.auth.service.AuthService;
import com.megumi.testops.auth.service.OAuthLoginCodeStore;

@Configuration
@ConditionalOnProperty(prefix = "testops.auth.google", name = "enabled", havingValue = "true")
public class OAuthLoginConfiguration {

    @Bean
    OAuthLoginCodeStore oauthLoginCodeStore(java.time.Clock clock) { return new OAuthLoginCodeStore(clock); }

    @Bean
    AuthenticationSuccessHandler oauthAuthenticationSuccessHandler(AuthService authService,
            OAuthLoginCodeStore codeStore, AuthProperties properties) {
        return (request, response, authentication) -> {
            OAuth2AuthenticationToken token = (OAuth2AuthenticationToken) authentication;
            OAuth2User principal = token.getPrincipal();
            String origin = URI.create(properties.google().redirectUri()).getScheme() + "://"
                    + URI.create(properties.google().redirectUri()).getRawAuthority();
            if (!Boolean.TRUE.equals(principal.getAttributes().get("email_verified"))) {
                response.sendRedirect(origin + "/login?oauth_error=email_unverified");
                return;
            }
            String subject = String.valueOf(principal.getAttributes().get("sub"));
            String email = String.valueOf(principal.getAttributes().get("email"));
            String name = (String) principal.getAttributes().getOrDefault("name", email);
            String picture = (String) principal.getAttributes().get("picture");
            AuthService.SessionResult session = authService.oauthLogin("GOOGLE", subject, email, name, picture,
                    request.getHeader("User-Agent"), request.getRemoteAddr());
            response.sendRedirect(origin + "/auth/oauth/callback?code=" + codeStore.put(session));
        };
    }
}
