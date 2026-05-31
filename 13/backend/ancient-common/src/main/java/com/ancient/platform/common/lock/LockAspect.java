package com.ancient.platform.common.lock;

import cn.hutool.core.util.StrUtil;
import com.ancient.platform.common.annotation.DistributedLock;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.DefaultParameterNameDiscoverer;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.expression.EvaluationContext;
import org.springframework.expression.Expression;
import org.springframework.expression.ExpressionParser;
import org.springframework.expression.spel.standard.SpelExpressionParser;
import org.springframework.expression.spel.support.StandardEvaluationContext;
import org.springframework.stereotype.Component;

import java.lang.reflect.Method;
import java.util.concurrent.TimeUnit;

@Slf4j
@Aspect
@Component
@Order(Ordered.LOWEST_PRECEDENCE - 1)
@RequiredArgsConstructor
public class LockAspect {

    private final RedissonClient redissonClient;

    @Value("${distributed-lock.lease-time:30}")
    private long defaultLeaseTime;

    @Value("${distributed-lock.wait-time:5}")
    private long defaultWaitTime;

    private final ExpressionParser parser = new SpelExpressionParser();

    private final DefaultParameterNameDiscoverer parameterNameDiscoverer = new DefaultParameterNameDiscoverer();

    @Around("@annotation(distributedLock)")
    public Object around(ProceedingJoinPoint joinPoint, DistributedLock distributedLock) throws Throwable {
        String lockName = distributedLock.lockName();
        String keyExpression = distributedLock.key();
        long waitTime = distributedLock.waitTime() > 0 ? distributedLock.waitTime() : defaultWaitTime;
        long leaseTime = distributedLock.leaseTime() > 0 ? distributedLock.leaseTime() : defaultLeaseTime;
        TimeUnit timeUnit = distributedLock.timeUnit();

        String lockKey = buildLockKey(lockName, keyExpression, joinPoint);

        RLock lock = redissonClient.getLock(lockKey);
        boolean acquired = false;
        try {
            acquired = lock.tryLock(waitTime, leaseTime, timeUnit);
            if (!acquired) {
                throw new RuntimeException("获取分布式锁超时，请稍后重试");
            }
            log.debug("获取分布式锁成功: {}", lockKey);
            return joinPoint.proceed();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("获取分布式锁被中断", e);
        } finally {
            if (acquired && lock.isHeldByCurrentThread()) {
                lock.unlock();
                log.debug("释放分布式锁成功: {}", lockKey);
            }
        }
    }

    private String buildLockKey(String lockName, String keyExpression, ProceedingJoinPoint joinPoint) {
        if (StrUtil.isBlank(keyExpression)) {
            return lockName;
        }

        MethodSignature signature = (MethodSignature) joinPoint.getSignature();
        Method method = signature.getMethod();
        Object[] args = joinPoint.getArgs();
        String[] paramNames = parameterNameDiscoverer.getParameterNames(method);

        if (paramNames == null || paramNames.length == 0) {
            return lockName + ":" + keyExpression;
        }

        EvaluationContext context = new StandardEvaluationContext();
        for (int i = 0; i < paramNames.length; i++) {
            context.setVariable(paramNames[i], args[i]);
        }

        try {
            Expression expression = parser.parseExpression(keyExpression);
            Object value = expression.getValue(context);
            if (value != null) {
                return lockName + ":" + value;
            }
        } catch (Exception e) {
            log.warn("解析锁key表达式失败: {}, 使用默认key", keyExpression, e);
        }

        return lockName;
    }
}
