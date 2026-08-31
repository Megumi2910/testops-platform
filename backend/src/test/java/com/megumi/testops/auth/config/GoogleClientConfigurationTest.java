package com.megumi.testops.auth.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;

class GoogleClientConfigurationTest {

    @Test
    void realGoogleUsesTheCurrentOidcDiscoveryEndpoints() {
        ClientRegistration registration = registration("", "");

        assertEquals("https://accounts.google.com/o/oauth2/v2/auth",
                registration.getProviderDetails().getAuthorizationUri());
        assertEquals("https://oauth2.googleapis.com/token", registration.getProviderDetails().getTokenUri());
        assertEquals("https://openidconnect.googleapis.com/v1/userinfo",
                registration.getProviderDetails().getUserInfoEndpoint().getUri());
        assertEquals("https://www.googleapis.com/oauth2/v3/certs", registration.getProviderDetails().getJwkSetUri());
    }

    @Test
    void deterministicProviderKeepsItsSeparateBrowserAndContainerEndpoints() {
        ClientRegistration registration = registration("http://oauth-provider:9090", "http://localhost:9090");

        assertEquals("http://localhost:9090/o/oauth2/v2/auth",
                registration.getProviderDetails().getAuthorizationUri());
        assertEquals("http://oauth-provider:9090/token", registration.getProviderDetails().getTokenUri());
        assertEquals("http://oauth-provider:9090/userinfo",
                registration.getProviderDetails().getUserInfoEndpoint().getUri());
        assertEquals("http://oauth-provider:9090/certs", registration.getProviderDetails().getJwkSetUri());
    }

    private static ClientRegistration registration(String providerBaseUri, String publicBaseUri) {
        AuthProperties properties = mock(AuthProperties.class);
        when(properties.google()).thenReturn(new AuthProperties.Google(true, "client-id", "client-secret",
                "http://localhost:3000/login/oauth2/code/google"));
        ClientRegistrationRepository registrations = new GoogleClientConfiguration().googleClientRegistration(
                properties, providerBaseUri, publicBaseUri, "openid,profile,email");
        return registrations.findByRegistrationId("google");
    }
}
