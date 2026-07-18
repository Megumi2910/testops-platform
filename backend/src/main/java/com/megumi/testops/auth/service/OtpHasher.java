package com.megumi.testops.auth.service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

public final class OtpHasher {

    private final byte[] pepper;

    public OtpHasher(Path pepperPath) {
        try {
            this.pepper = Files.readAllBytes(pepperPath);
        } catch (IOException exception) {
            throw new IllegalStateException("Unable to read email OTP pepper file", exception);
        }
        if (pepper.length < 32) {
            throw new IllegalStateException("Email OTP pepper must contain at least 32 bytes");
        }
    }

    public String hash(String email, String otp) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(pepper, "HmacSHA256"));
            byte[] digest = mac.doFinal((email + ":" + otp).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException | java.security.InvalidKeyException exception) {
            throw new IllegalStateException("Unable to hash OTP", exception);
        }
    }

    public boolean matches(String email, String otp, String expectedHash) {
        return MessageDigest.isEqual(hash(email, otp).getBytes(StandardCharsets.US_ASCII),
                expectedHash.getBytes(StandardCharsets.US_ASCII));
    }
}
