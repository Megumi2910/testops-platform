package com.megumi.testops.auth.service;

import java.time.Instant;

import jakarta.mail.MessagingException;

import org.springframework.boot.mail.autoconfigure.MailProperties;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;

import com.megumi.testops.auth.config.AuthProperties;

public class EmailDeliveryService {

    private final JavaMailSender mailSender;
    private final MailProperties mailProperties;
    private final AuthProperties.Email properties;

    public EmailDeliveryService(JavaMailSender mailSender, MailProperties mailProperties, AuthProperties.Email properties) {
        this.mailSender = mailSender;
        this.mailProperties = mailProperties;
        this.properties = properties;
    }

    public void sendVerificationCode(String email, String displayName, String otp, Instant expiresAt) {
        if (!properties.enabled() || mailProperties.getHost() == null || mailProperties.getHost().isBlank()
                || properties.fromAddress() == null || properties.fromAddress().isBlank()) {
            throw new AuthException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,
                    "email_delivery_unavailable", "Email verification is not configured");
        }
        try {
            var message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, false, java.nio.charset.StandardCharsets.UTF_8.name());
            helper.setFrom(properties.fromAddress(), properties.fromName());
            helper.setTo(email);
            helper.setSubject("Verify your TestOps account");
            helper.setText("Hello " + displayName + ",\n\nYour TestOps verification code is " + otp
                    + ". It expires at " + expiresAt + " UTC.\n\nIf you did not request this, you can ignore this email.");
            mailSender.send(message);
        } catch (MessagingException | org.springframework.mail.MailException | java.io.UnsupportedEncodingException exception) {
            throw new AuthException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,
                    "email_delivery_unavailable", "Email verification is temporarily unavailable");
        }
    }
}
