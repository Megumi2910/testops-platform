package com.megumi.testops;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;

import com.megumi.testops.auth.api.AuthController;
import com.megumi.testops.auth.api.AuthResponse;
import com.megumi.testops.auth.config.AuthProperties;
import com.megumi.testops.auth.service.AuthService;
import com.megumi.testops.auth.service.OriginGuard;
import com.megumi.testops.auth.service.RefreshCookieFactory;

class AuthControllerTest {

    @Test
    void returnsNoContentForAnAnonymousRefreshWithoutCallingTheSessionService() {
        @SuppressWarnings("unchecked")
        ObjectProvider<AuthService> services = mock(ObjectProvider.class);
        AuthProperties properties = mock(AuthProperties.class);
        OriginGuard origins = mock(OriginGuard.class);
        RefreshCookieFactory cookies = mock(RefreshCookieFactory.class);
        AuthController controller = new AuthController(services, properties, origins, cookies);
        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpServletResponse response = mock(HttpServletResponse.class);

        var result = controller.refresh(request, response);

        assertEquals(HttpStatus.NO_CONTENT, result.getStatusCode());
        assertNull(result.getBody());
        verify(origins).requireSameOrigin(request);
        verifyNoInteractions(services, cookies, response);
    }
}
