package com.megumi.testops.auth.config;

import java.util.Set;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2AuthorizationException;
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
    private static final Logger log = LoggerFactory.getLogger(OAuthLoginConfiguration.class);
    private static final Set<String> SAFE_PROVIDER_FAILURE_CODES = Set.of(
            "access_denied", "invalid_client", "invalid_grant", "invalid_id_token", "invalid_request",
            "invalid_scope", "invalid_token_response", "invalid_user_info_response", "server_error",
            "temporarily_unavailable", "unauthorized_client", "unsupported_grant_type");

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
                response.sendRedirect(properties.frontendOrigin() + "/auth/oauth/callback?oauth_error="
                        + callbackReason(exception));
            }
        };
    }

    @Bean
    AuthenticationFailureHandler oauthAuthenticationFailureHandler(AuthProperties properties) {
        return (request, response, exception) -> {
            GoogleLinkIntentSession.clear(request);
            log.warn("Google OAuth callback failed: code={}", failureLogCode(exception));
            response.sendRedirect(properties.frontendOrigin() + "/auth/oauth/callback?oauth_error=oauth_sign_in_failed");
        };
    }

    static String callbackReason(AuthException exception) {
        return switch (exception.getCode()) {
            case "account_link_required" -> "account_link_required";
            case "account_unavailable" -> "account_unavailable";
            case "email_unverified" -> "email_unverified";
            default -> "oauth_sign_in_failed";
        };
    }

    static String failureLogCode(AuthenticationException exception) {
        Throwable current = exception;
        for (int depth = 0; current != null && depth < 8; depth++, current = current.getCause()) {
            String code = switch (current) {
                case OAuth2AuthenticationException oauth -> oauth.getError().getErrorCode();
                case OAuth2AuthorizationException oauth -> oauth.getError().getErrorCode();
                default -> null;
            };
            if (SAFE_PROVIDER_FAILURE_CODES.contains(code)) return code;
        }
        return "provider_or_protocol_failure";
    }
}
