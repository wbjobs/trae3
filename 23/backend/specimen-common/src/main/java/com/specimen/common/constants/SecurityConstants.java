package com.specimen.common.constants;

public class SecurityConstants {
    public static final String TOKEN_HEADER = "Authorization";
    public static final String TOKEN_PREFIX = "Bearer ";
    public static final String TENANT_HEADER = "X-Tenant-Id";
    public static final String USER_ID_HEADER = "X-User-Id";
    public static final String USERNAME_HEADER = "X-Username";
    public static final Long DEFAULT_TENANT_ID = 1L;
    public static final String SECRET = "specimen-platform-secret-key-2024-abcdefghijklmnop";
    public static final long EXPIRATION = 7 * 24 * 60 * 60 * 1000;
    public static final String[] WHITE_LIST = {
        "/auth/login",
        "/auth/register",
        "/storage/preview",
        "/storage/download",
        "/v3/api-docs/**",
        "/swagger-ui/**",
        "/doc.html",
        "/webjars/**",
        "/favicon.ico"
    };
}
