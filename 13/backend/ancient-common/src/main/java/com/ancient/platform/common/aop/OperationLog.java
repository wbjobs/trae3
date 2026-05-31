package com.ancient.platform.common.aop;

import java.lang.annotation.*;

/**
 * 操作日志注解
 *
 * @author ancient-platform
 * @since 1.0.0
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface OperationLog {

    String value() default "";

    String module() default "";

    String description() default "";

    OperateType type() default OperateType.OTHER;

    enum OperateType {
        SELECT,
        INSERT,
        UPDATE,
        DELETE,
        EXPORT,
        IMPORT,
        UPLOAD,
        DOWNLOAD,
        LOGIN,
        LOGOUT,
        OTHER
    }
}
