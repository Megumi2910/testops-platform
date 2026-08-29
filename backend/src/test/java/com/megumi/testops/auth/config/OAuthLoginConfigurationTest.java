package com.megumi.testops.auth.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.user.OAuth2User;

import com.megumi.testops.auth.service.AuthException;
import com.megumi.testops.auth.service.AuthService;
import com.megumi.testops.auth.service.GoogleLinkIntentSession;
import com.megumi.testops.auth.service.RefreshCookieFactory;

class OAuthLoginConfigurationTest {
    private static final UUID USER_ID = UUID.fromString("10000000-0000-0000-0000-000000000001");
    private static final String FRONTEND_ORIGIN = "http://localhost:3100";

    @Test
    void successfulLinkConsumesIntentBeforeIssuingTheProviderSession() throws Exception {
        AuthService authService = mock(AuthService.class);
        RefreshCookieFactory cookies = cookies();
        AuthService.SessionResult session = new AuthService.SessionResult(null, "opaque-refresh-value", Instant.now());
        when(authService.linkGoogle(eq(USER_ID), eq("google-subject"), eq("qa@example.test"),
                eq("QA User"), isNull(), any(), any())).thenReturn(session);
        MockHttpServletRequest request = requestWithLinkIntent();
        MockHttpServletResponse response = new MockHttpServletResponse();

        new OAuthLoginConfiguration().oauthAuthenticationSuccessHandler(authService, properties(), cookies)
                .onAuthenticationSuccess(request, response, authentication("google-subject", "qa@example.test"));

        assertNull(request.getSession(false).getAttribute(GoogleLinkIntentSession.USER_ATTRIBUTE));
        assertEquals(FRONTEND_ORIGIN + "/auth/oauth/callback", response.getRedirectedUrl());
        verify(authService).linkGoogle(eq(USER_ID), eq("google-subject"), eq("qa@example.test"),
                eq("QA User"), isNull(), any(), any());
    }

    @Test
    void failedLinkCannotLeaveAStaleIntentForTheNextSignIn() throws Exception {
        AuthService authService = mock(AuthService.class);
        when(authService.linkGoogle(eq(USER_ID), any(), any(), any(), any(), any(), any()))
                .thenThrow(new AuthException(org.springframework.http.HttpStatus.CONFLICT,
                        "email_mismatch", "Provider email mismatch"));
        MockHttpServletRequest request = requestWithLinkIntent();
        MockHttpServletResponse response = new MockHttpServletResponse();

        new OAuthLoginConfiguration().oauthAuthenticationSuccessHandler(authService, properties(), cookies())
                .onAuthenticationSuccess(request, response, authentication("other-subject", "other@example.test"));

        assertNull(request.getSession(false).getAttribute(GoogleLinkIntentSession.USER_ATTRIBUTE));
        assertEquals(FRONTEND_ORIGIN + "/auth/oauth/callback?oauth_error=oauth_sign_in_failed",
                response.getRedirectedUrl());
    }

    @Test
    void providerAuthenticationFailureClearsIntentAndUsesTheSafeCallbackUi() throws Exception {
        MockHttpServletRequest request = requestWithLinkIntent();
        MockHttpServletResponse response = new MockHttpServletResponse();

        new OAuthLoginConfiguration().oauthAuthenticationFailureHandler(properties())
                .onAuthenticationFailure(request, response,
                        new OAuth2AuthenticationException(new OAuth2Error("provider_failure"), "provider detail"));

        assertNull(request.getSession(false).getAttribute(GoogleLinkIntentSession.USER_ATTRIBUTE));
        assertEquals(FRONTEND_ORIGIN + "/auth/oauth/callback?oauth_error=oauth_sign_in_failed",
                response.getRedirectedUrl());
    }

    @Test
    void passwordAccountCollisionUsesTheActionableSafeCallbackReason() throws Exception {
        AuthService authService = mock(AuthService.class);
        when(authService.oauthLogin(eq("GOOGLE"), any(), any(), any(), any(), any(), any()))
                .thenThrow(new AuthException(org.springframework.http.HttpStatus.CONFLICT,
                        "account_link_required", "password account collision"));
        MockHttpServletResponse response = new MockHttpServletResponse();

        new OAuthLoginConfiguration().oauthAuthenticationSuccessHandler(authService, properties(), cookies())
                .onAuthenticationSuccess(new MockHttpServletRequest(), response,
                        authentication("google-subject", "qa@example.test"));

        assertEquals(FRONTEND_ORIGIN + "/auth/oauth/callback?oauth_error=account_link_required",
                response.getRedirectedUrl());
    }

    @Test
    void callbackReasonNeverPassesThroughUnexpectedServiceCodes() {
        assertEquals("account_unavailable", OAuthLoginConfiguration.callbackReason(
                new AuthException(org.springframework.http.HttpStatus.FORBIDDEN, "account_unavailable", "unavailable")));
        assertEquals("oauth_sign_in_failed", OAuthLoginConfiguration.callbackReason(
                new AuthException(org.springframework.http.HttpStatus.BAD_REQUEST, "provider_token_exposed", "sensitive")));
    }

    private static MockHttpServletRequest requestWithLinkIntent() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        GoogleLinkIntentSession.setUser(request, USER_ID.toString());
        return request;
    }

    private static OAuth2AuthenticationToken authentication(String subject, String email) {
        OAuth2User principal = mock(OAuth2User.class);
        when(principal.getAttributes()).thenReturn(Map.of(
                "sub", subject,
                "email", email,
                "email_verified", true,
                "name", "QA User"));
        return new OAuth2AuthenticationToken(principal, List.of(), "google");
    }

    private static AuthProperties properties() {
        AuthProperties properties = mock(AuthProperties.class);
        when(properties.frontendOrigin()).thenReturn(FRONTEND_ORIGIN);
        return properties;
    }

    private static RefreshCookieFactory cookies() {
        return new RefreshCookieFactory(new AuthProperties.Cookie(
                "testops_refresh", false, "Lax", "/api/v1/auth", Duration.ofDays(1)));
    }
}
