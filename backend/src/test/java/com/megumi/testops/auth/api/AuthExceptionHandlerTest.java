package com.megumi.testops.auth.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Set;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;

import com.megumi.testops.auth.service.AuthException;
import com.megumi.testops.shared.api.ApiProblem;

class AuthExceptionHandlerTest {
    private final AuthExceptionHandler handler = new AuthExceptionHandler();

    @Test
    void fieldAddressableFailureEmitsOneViolation() {
        MockHttpServletRequest request = request();

        ResponseEntity<ApiProblem> response = handler.auth(
                new AuthException(HttpStatus.BAD_REQUEST, "verification_invalid",
                        "Verification code is invalid or expired", "otp"),
                request);

        ApiProblem body = response.getBody();
        assertNotNull(body);
        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertEquals("verification_invalid", body.code());
        assertEquals("qa-auth-error", body.correlationId());
        assertEquals(1, body.errors().size());
        assertEquals("otp", body.errors().get(0).path());
        assertEquals("verification_invalid", body.errors().get(0).code());
        assertEquals("Verification code is invalid or expired", body.errors().get(0).message());
    }

    @Test
    void legacyFailureConstructorKeepsErrorsEmpty() {
        ResponseEntity<ApiProblem> response = handler.auth(
                new AuthException(HttpStatus.UNAUTHORIZED, "login_invalid", "Email or password is incorrect"),
                request());

        ApiProblem body = response.getBody();
        assertNotNull(body);
        assertTrue(body.errors().isEmpty());
    }

    @Test
    void passwordSetupOtpMustContainExactlySixDigits() {
        try (ValidatorFactory factory = Validation.buildDefaultValidatorFactory()) {
            Set<ConstraintViolation<PasswordSetupRequest>> violations = factory.getValidator()
                    .validate(new PasswordSetupRequest("12345", "correct-horse-battery-staple"));

            assertEquals(1, violations.size());
            assertEquals("otp", violations.iterator().next().getPropertyPath().toString());
        }
    }

    private static MockHttpServletRequest request() {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/auth/email/verify");
        request.addHeader("X-Correlation-Id", "qa-auth-error");
        return request;
    }
}
