package com.ancient.platform.common.ratelimit.annotation;

import java.lang.annotation.*;
import java.util.concurrent.TimeUnit;

@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface RateLimit {

    String key() default "";

    int limit() default 100;

    int window() default 1;

    TimeUnit timeUnit() default TimeUnit.MINUTES;
}
