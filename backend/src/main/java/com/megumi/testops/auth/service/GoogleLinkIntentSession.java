package com.megumi.testops.auth.service;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;

public final class GoogleLinkIntentSession {
    public static final String USER_ATTRIBUTE = "TESTOPS_GOOGLE_LINK_USER";

    private GoogleLinkIntentSession() {
    }

    public static void setUser(HttpServletRequest request, String userId) {
        request.getSession(true).setAttribute(USER_ATTRIBUTE, userId);
    }

    public static Object consumeUser(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session == null) return null;
        Object user = session.getAttribute(USER_ATTRIBUTE);
        session.removeAttribute(USER_ATTRIBUTE);
        return user;
    }

    public static void clear(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session != null) session.removeAttribute(USER_ATTRIBUTE);
    }
}
