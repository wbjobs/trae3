package com.specimen.common.utils;

import com.specimen.common.constants.SecurityConstants;
import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;

public class JwtUtil {
    private static final SecretKey SECRET_KEY = Keys.hmacShaKeyFor(
        SecurityConstants.SECRET.getBytes(StandardCharsets.UTF_8));

    public static String generateToken(Long userId, String username, Long tenantId) {
        Map<String, Object> claims = new HashMap<>();
        claims.put("userId", userId);
        claims.put("username", username);
        claims.put("tenantId", tenantId);
        return Jwts.builder()
                .claims(claims)
                .subject(username)
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + SecurityConstants.EXPIRATION))
                .signWith(SECRET_KEY)
                .compact();
    }

    public static Claims parseToken(String token) {
        try {
            return Jwts.parser()
                    .verifyWith(SECRET_KEY)
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();
        } catch (ExpiredJwtException e) {
            throw new RuntimeException("Token已过期");
        } catch (JwtException e) {
            throw new RuntimeException("Token无效");
        }
    }

    public static Long getUserId(String token) {
        Claims claims = parseToken(token);
        return claims.get("userId", Long.class);
    }

    public static String getUsername(String token) {
        Claims claims = parseToken(token);
        return claims.getSubject();
    }

    public static Long getTenantId(String token) {
        Claims claims = parseToken(token);
        return claims.get("tenantId", Long.class);
    }

    public static boolean validateToken(String token) {
        try {
            parseToken(token);
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
