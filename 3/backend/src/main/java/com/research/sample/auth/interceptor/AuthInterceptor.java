package com.research.sample.auth.interceptor;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.research.sample.auth.context.TenantContext;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.util.Map;

@Component
public class AuthInterceptor implements HandlerInterceptor {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        String userIdHeader = request.getHeader("X-User-Id");

        if (userIdHeader == null || userIdHeader.isBlank()) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.setCharacterEncoding("UTF-8");
            objectMapper.writeValue(response.getWriter(), Map.of("code", 401, "message", "未登录或登录已过期"));
            return false;
        }

        String tenantIdHeader = request.getHeader("X-Tenant-Id");
        if (tenantIdHeader == null || tenantIdHeader.isBlank()) {
            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.setCharacterEncoding("UTF-8");
            objectMapper.writeValue(response.getWriter(), Map.of("code", 403, "message", "租户信息缺失"));
            return false;
        }

        try {
            TenantContext.setUserId(Long.parseLong(userIdHeader));
            TenantContext.setTenantId(Long.parseLong(tenantIdHeader));
        } catch (NumberFormatException e) {
            response.setStatus(HttpServletResponse.SC_BAD_REQUEST);
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.setCharacterEncoding("UTF-8");
            objectMapper.writeValue(response.getWriter(), Map.of("code", 400, "message", "请求头格式错误"));
            return false;
        }

        String roleHeader = request.getHeader("X-Role");
        if (roleHeader != null && !roleHeader.isBlank()) {
            TenantContext.setRole(roleHeader);
        }

        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        TenantContext.clear();
    }
}
