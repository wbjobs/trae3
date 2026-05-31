package com.research.sample.auth.context;

import com.alibaba.ttl.TransmittableThreadLocal;

public class TenantContext {

    private static final TransmittableThreadLocal<Long> TENANT_ID_HOLDER = new TransmittableThreadLocal<>();
    private static final TransmittableThreadLocal<Long> USER_ID_HOLDER = new TransmittableThreadLocal<>();
    private static final TransmittableThreadLocal<String> ROLE_HOLDER = new TransmittableThreadLocal<>();

    private TenantContext() {
    }

    public static void setTenantId(Long tenantId) {
        TENANT_ID_HOLDER.set(tenantId);
    }

    public static Long getTenantId() {
        return TENANT_ID_HOLDER.get();
    }

    public static Long getCurrentTenantId() {
        return TENANT_ID_HOLDER.get();
    }

    public static void setUserId(Long userId) {
        USER_ID_HOLDER.set(userId);
    }

    public static Long getUserId() {
        return USER_ID_HOLDER.get();
    }

    public static void setRole(String role) {
        ROLE_HOLDER.set(role);
    }

    public static String getRole() {
        return ROLE_HOLDER.get();
    }

    public static void clear() {
        TENANT_ID_HOLDER.remove();
        USER_ID_HOLDER.remove();
        ROLE_HOLDER.remove();
    }
}
