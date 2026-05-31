package com.ancient.platform.common.context;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.util.List;

/**
 * 用户上下文工具类
 *
 * @author ancient-platform
 * @since 1.0.0
 */
public class UserContextHolder {

    private static final ThreadLocal<UserContext> USER_CONTEXT = new ThreadLocal<>();

    public static void setContext(UserContext context) {
        USER_CONTEXT.set(context);
    }

    public static UserContext getContext() {
        return USER_CONTEXT.get();
    }

    public static Long getUserId() {
        UserContext context = USER_CONTEXT.get();
        return context != null ? context.getUserId() : null;
    }

    public static String getUsername() {
        UserContext context = USER_CONTEXT.get();
        return context != null ? context.getUsername() : null;
    }

    public static String getNickname() {
        UserContext context = USER_CONTEXT.get();
        return context != null ? context.getNickname() : null;
    }

    public static List<String> getRoles() {
        UserContext context = USER_CONTEXT.get();
        return context != null ? context.getRoles() : null;
    }

    public static List<String> getPermissions() {
        UserContext context = USER_CONTEXT.get();
        return context != null ? context.getPermissions() : null;
    }

    public static void clear() {
        USER_CONTEXT.remove();
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class UserContext implements Serializable {

        private static final long serialVersionUID = 1L;

        private Long userId;

        private String username;

        private String nickname;

        private String avatar;

        private List<String> roles;

        private List<String> permissions;
    }
}
