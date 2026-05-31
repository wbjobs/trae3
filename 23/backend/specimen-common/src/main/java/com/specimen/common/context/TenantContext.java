package com.specimen.common.context;

import com.alibaba.ttl.TransmittableThreadLocal;

public class TenantContext {
    private static final ThreadLocal<Long> TENANT_ID = new TransmittableThreadLocal<>();
    private static final ThreadLocal<Long> USER_ID = new TransmittableThreadLocal<>();
    private static final ThreadLocal<String> USERNAME = new TransmittableThreadLocal<>();

    public static void setTenantId(Long tenantId) {
        TENANT_ID.set(tenantId);
    }

    public static Long getTenantId() {
        return TENANT_ID.get();
    }

    public static void setUserId(Long userId) {
        USER_ID.set(userId);
    }

    public static Long getUserId() {
        return USER_ID.get();
    }

    public static void setUsername(String username) {
        USERNAME.set(username);
    }

    public static String getUsername() {
        return USERNAME.get();
    }

    public static void clear() {
        TENANT_ID.remove();
        USER_ID.remove();
        USERNAME.remove();
    }
}
