package com.megumi.testops.auth.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.security.web.authentication.AuthenticationFailureHandler;

import com.megumi.testops.auth.service.AuthService;
import com.megumi.testops.auth.service.AuthException;
import com.megumi.testops.auth.service.GoogleLinkIntentSession;
import com.megumi.testops.auth.service.RefreshCookieFactory;
import java.util.UUID;

@Configuration
@ConditionalOnProperty(prefix = "testops.auth.google", name = "enabled", havingValue = "true")
public class OAuthLoginConfiguration {

    @Bean
    AuthenticationSuccessHandler oauthAuthenticationSuccessHandler(AuthService authService,
            AuthProperties properties, RefreshCookieFactory refreshCookies) {
        return (request, response, authentication) -> {
            Object linkUser = GoogleLinkIntentSession.consumeUser(request);
            try {
                OAuth2AuthenticationToken token = (OAuth2AuthenticationToken) authentication;
                OAuth2User principal = token.getPrincipal();
                String origin = properties.frontendOrigin();
                if (!Boolean.TRUE.equals(principal.getAttributes().get("email_verified"))) {
                    response.sendRedirect(origin + "/auth/oauth/callback?oauth_error=email_unverified");
                    return;
                }
                String subject = String.valueOf(principal.getAttributes().get("sub"));
                String email = String.valueOf(principal.getAttributes().get("email"));
                if ("null".equals(subject) || subject.isBlank() || "null".equals(email) || email.isBlank()) {
                    throw new AuthException(org.springframework.http.HttpStatus.BAD_REQUEST,
                            "oauth_sign_in_failed", "Google sign-in could not be completed");
                }
                String name = (String) principal.getAttributes().getOrDefault("name", email);
                String picture = (String) principal.getAttributes().get("picture");
                AuthService.SessionResult session;
                if (linkUser != null) {
                    session = authService.linkGoogle(UUID.fromString(String.valueOf(linkUser)), subject, email, name, picture,
                            request.getHeader("User-Agent"), request.getRemoteAddr());
                } else {
                    session = authService.oauthLogin("GOOGLE", subject, email, name, picture,
                            request.getHeader("User-Agent"), request.getRemoteAddr());
                }
                response.addHeader("Set-Cookie", refreshCookies.create(session.refreshToken()).toString());
                response.sendRedirect(origin + "/auth/oauth/callback");
            } catch (com.megumi.testops.auth.service.AuthException exception) {
                response.sendRedirect(properties.frontendOrigin() + "/auth/oauth/callback?oauth_error=oauth_sign_in_failed");
            }
        };
    }

    @Bean
    AuthenticationFailureHandler oauthAuthenticationFailureHandler(AuthProperties properties) {
        return (request, response, exception) -> {
            GoogleLinkIntentSession.clear(request);
            response.sendRedirect(properties.frontendOrigin() + "/auth/oauth/callback?oauth_error=oauth_sign_in_failed");
        };
    }
}
