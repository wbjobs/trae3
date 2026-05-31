package com.railway.auth.interceptor;

import com.railway.auth.annotation.RequireAuth;
import com.railway.auth.context.UserContext;
import com.railway.auth.util.JwtUtil;
import com.railway.common.constant.RedisConstants;
import com.railway.common.dto.Result;
import com.alibaba.fastjson2.JSON;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

import jakarta.annotation.Resource;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.lang.reflect.Method;

@Component
public class AuthInterceptor implements HandlerInterceptor {

    private static final Logger log = LoggerFactory.getLogger(AuthInterceptor.class);

    private static final String AUTHORIZATION_HEADER = "Authorization";
    private static final String TOKEN_PREFIX = "Bearer ";

    @Resource
    private JwtUtil jwtUtil;

    @Resource
    private RedisTemplate<String, Object> redisTemplate;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler)
            throws Exception {

        if (!(handler instanceof HandlerMethod)) {
            return true;
        }

        HandlerMethod handlerMethod = (HandlerMethod) handler;
        Method method = handlerMethod.getMethod();
        Class<?> clazz = handlerMethod.getBeanType();

        RequireAuth methodAuth = method.getAnnotation(RequireAuth.class);
        RequireAuth classAuth = clazz.getAnnotation(RequireAuth.class);

        if (methodAuth != null && !methodAuth.required()) {
            return true;
        }

        if (methodAuth == null && classAuth != null && !classAuth.required()) {
            return true;
        }

        if (methodAuth == null && classAuth == null) {
            return true;
        }

        String token = extractToken(request);
        if (token == null || token.isEmpty()) {
            writeErrorResponse(response, 401, "Authorization token is required");
            return false;
        }

        if (!jwtUtil.validateToken(token)) {
            writeErrorResponse(response, 401, "Invalid or expired token");
            return false;
        }

        String username = jwtUtil.getUsernameFromToken(token);
        String tokenKey = RedisConstants.KEY_PREFIX_AUTH_TOKEN + username;
        Object storedToken = redisTemplate.opsForValue().get(tokenKey);
        if (storedToken == null || !token.equals(storedToken.toString())) {
            writeErrorResponse(response, 401, "Token has been revoked");
            return false;
        }

        String role = jwtUtil.getRoleFromToken(token);

        if (methodAuth != null && methodAuth.roles().length > 0) {
            boolean hasRole = false;
            for (String requiredRole : methodAuth.roles()) {
                if (requiredRole.equals(role)) {
                    hasRole = true;
                    break;
                }
            }
            if (!hasRole) {
                writeErrorResponse(response, 403, "Insufficient permissions");
                return false;
            }
        }

        UserContext.setUsername(username);
        UserContext.setRole(role);
        UserContext.setToken(token);

        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response,
                                Object handler, Exception ex) {
        UserContext.clear();
    }

    private String extractToken(HttpServletRequest request) {
        String bearerToken = request.getHeader(AUTHORIZATION_HEADER);
        if (bearerToken != null && bearerToken.startsWith(TOKEN_PREFIX)) {
            return bearerToken.substring(TOKEN_PREFIX.length());
        }

        String token = request.getParameter("token");
        if (token != null && !token.isEmpty()) {
            return token;
        }

        return null;
    }

    private void writeErrorResponse(HttpServletResponse response, int code, String message)
            throws IOException {
        response.setStatus(HttpServletResponse.SC_OK);
        response.setContentType("application/json;charset=UTF-8");

        Result<?> result = Result.error(code, message);
        response.getWriter().write(JSON.toJSONString(result));
    }
}
