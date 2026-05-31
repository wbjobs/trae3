package com.ancient.platform.common.annotation;

import java.lang.annotation.*;
import java.util.concurrent.TimeUnit;

@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface DistributedLock {

    String lockName();

    String key() default "";

    long waitTime() default -1;

    long leaseTime() default -1;

    TimeUnit timeUnit() default TimeUnit.SECONDS;
}
