package com.specimen.common.interceptor;

import com.specimen.common.annotation.TenantIgnore;
import com.specimen.common.constants.SecurityConstants;
import com.specimen.common.context.TenantContext;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
public class TenantInterceptor implements HandlerInterceptor {
    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (handler instanceof HandlerMethod handlerMethod) {
            TenantIgnore tenantIgnore = handlerMethod.getMethodAnnotation(TenantIgnore.class);
            if (tenantIgnore != null) {
                return true;
            }
            Class<?> beanType = handlerMethod.getBeanType();
            if (beanType.isAnnotationPresent(TenantIgnore.class)) {
                return true;
            }
        }

        String tenantIdStr = request.getHeader(SecurityConstants.TENANT_HEADER);
        String userIdStr = request.getHeader(SecurityConstants.USER_ID_HEADER);
        String username = request.getHeader(SecurityConstants.USERNAME_HEADER);

        if (tenantIdStr != null && !tenantIdStr.isEmpty()) {
            TenantContext.setTenantId(Long.parseLong(tenantIdStr));
        }
        if (userIdStr != null && !userIdStr.isEmpty()) {
            TenantContext.setUserId(Long.parseLong(userIdStr));
        }
        if (username != null && !username.isEmpty()) {
            TenantContext.setUsername(username);
        }

        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response,
                                Object handler, Exception ex) {
        TenantContext.clear();
    }
}
