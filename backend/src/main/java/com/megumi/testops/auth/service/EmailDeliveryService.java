package com.megumi.testops.auth.service;

import java.time.Instant;

import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;

import com.megumi.testops.auth.config.AuthProperties;

public class EmailDeliveryService {

    private final JavaMailSender mailSender;
    private final AuthProperties.Email properties;

    public EmailDeliveryService(JavaMailSender mailSender, AuthProperties.Email properties) {
        this.mailSender = mailSender;
        this.properties = properties;
    }

    public void sendVerificationCode(String email, String displayName, String otp, Instant expiresAt) {
        if (!properties.enabled() || properties.mail().host() == null || properties.mail().host().isBlank()
                || properties.mail().fromAddress() == null || properties.mail().fromAddress().isBlank()) {
            throw new AuthException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,
                    "email_delivery_unavailable", "Email verification is not configured");
        }
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(properties.mail().fromAddress());
        message.setTo(email);
        message.setSubject("Verify your TestOps account");
        message.setText("Hello " + displayName + ",\n\nYour TestOps verification code is " + otp
                + ". It expires at " + expiresAt + " UTC.\n\nIf you did not request this, you can ignore this email.");
        mailSender.send(message);
    }
}
